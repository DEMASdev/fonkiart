// "Send a coupon" with how much off (Andy, 2026-11-22: "maybe we can discount $300 or something if we
// know the acquisition power of the person !!"): chosen in Admin -> Orders, saved on that buyer's own
// code, and given exactly that everywhere.
//  1. The list (couponStatus) and the sending (couponSend): the shop's own prices, never less than
//     their code already gives, saved BEFORE the email goes and put back when it doesn't, and nothing
//     chosen until db/2026-11-23-coupon-size.sql has run.
//  2. The code at the checkout: the server reads what it gives from its own row; a browser sends a
//     code and nothing else. The words are the same in the notes, the emails and the checkout.
//  3. Admin's two boxes (CouponAsk.jsx), the line once sent, Leads, and the welcome popup.
// The sums and the words themselves: tests/couponSize.test.js. The checkout: tests/checkout-flow.test.js.
// FAKE data only: every person, email and code here is made up; the database, Stripe and Brevo are
// stand-ins, and nothing is sent anywhere. Measured: every test here fails on 94ef250 but the ones
// named "control".
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import { STORE_OPS, opCoupon, opOrder, opWelcome, leadCoupon } from "../api/_lib/storeOps.js";
import { couponStatus, couponSend } from "../api/_lib/unfinishedCoupon.js";
import * as T from "../api/_lib/emails.js";
import { CARD_NOTE } from "../src/lib/orderRow.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const NOW = new Date("2026-11-23T21:20:00Z");
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
});
async function quiet(fn) {
  const keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try { return await fn(); } finally { Object.assign(console, keep); }
}

// ── stand-ins ───────────────────────────────────────────────────

// Leads' columns before the SQL of this change, and after it.
const BEFORE = ["id", "email", "source", "coupon_code", "coupon_used", "created_at", "cart", "cart_at"];
const AFTER = [...BEFORE, "coupon_size"];

// supabase-js as the shop uses it, with one thing the other tests' stand-ins leave out: a table knows
// its columns, so one it doesn't have is refused as PostgREST refuses it (named in a select: 42703; in
// a write: PGRST204). fail: { "Leads.update": (payload, n) => message or null }, n: how many there were.
function fakeDb(tables = {}, { leads = AFTER, fail = {} } = {}) {
  const writes = [], files = {}, seen = {};
  const columns = { Leads: leads };
  let bucket = false, nextId = 1000;
  const from = (table) => {
    let op = "select", payload = null, lim = null, single = false, cols = null, returning = null, sort = null;
    const tests = [];
    const b = {
      select(c = "*") { if (op === "select") cols = c; else returning = c; return b; },
      insert(v) { op = "insert"; payload = v; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { tests.push(r => String(r[k]) === String(v)); return b; },
      in(k, vs) { tests.push(r => vs.map(String).includes(String(r[k]))); return b; },
      not(k, o, v) { assert.equal(o, "is"); tests.push(r => (v === null ? r[k] != null : r[k] !== v)); return b; },
      order(k, { ascending = true } = {}) { sort = { k, ascending }; return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(ok, bad) { return Promise.resolve().then(run).then(ok, bad); },
    };
    function run() {
      const has = columns[table];
      const n = seen[`${table}.${op}`] = (seen[`${table}.${op}`] || 0) + 1;
      const no = fail[`${table}.${op}`]?.(payload, n);
      if (no) return { data: null, error: { message: no } };
      const rows = (tables[table] ||= []);
      const shown = (r) => (has ? Object.fromEntries(has.map(k => [k, r[k] ?? null])) : { ...r });
      if (op === "select") {
        const missing = has && cols !== "*" && cols.split(",").map(s => s.trim()).find(k => !has.includes(k));
        if (missing) return { data: null, error: { code: "42703", message: `column ${table}.${missing} does not exist` } };
        let hit = rows.filter(r => tests.every(t => t(r)));
        if (sort) hit = [...hit].sort((x, y) => (x[sort.k] - y[sort.k]) * (sort.ascending ? 1 : -1));
        const out = hit.slice(0, lim ?? undefined).map(shown);
        return { data: single ? out[0] ?? null : out, error: null };
      }
      const missing = has && [].concat(payload).flatMap(Object.keys).find(k => !has.includes(k));
      if (missing) return { data: null, error: { code: "PGRST204", message: `Could not find the '${missing}' column of '${table}' in the schema cache` } };
      if (op === "insert") {
        const added = [].concat(payload).map(r => ({ id: nextId++, ...r }));
        rows.push(...added);
        writes.push({ table, op, payload });
        return { data: returning ? added.map(r => ({ id: r.id })) : null, error: null };
      }
      const hit = rows.filter(r => tests.every(t => t(r)));
      hit.forEach(r => Object.assign(r, structuredClone(payload)));
      writes.push({ table, op, payload: structuredClone(payload), ids: hit.map(r => r.id) });
      return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null };
    }
    return b;
  };
  const storage = {
    async createBucket(name) { bucket = true; return { data: { name }, error: null }; },
    from(name) {
      return {
        async download(path) { const body = bucket ? files[`${name}/${path}`] : undefined; return body == null ? { data: null, error: { message: bucket ? "Object not found" : "Bucket not found" } } : { data: new Blob([body]), error: null }; },
        async upload(path, blob) { if (!bucket) return { data: null, error: { message: "Bucket not found" } }; files[`${name}/${path}`] = await blob.text(); return { data: { path }, error: null }; },
      };
    },
  };
  return { from, storage, tables, writes, note: () => (files["system/coupons-sent.json"] ? JSON.parse(files["system/coupons-sent.json"]) : null),
    lead: (email) => tables.Leads.find(l => l.email === email), leadWrites: () => writes.filter(w => w.table === "Leads") };
}
// mail.fail: the next email is refused, as Brevo can.
const mailbox = () => { const mail = { sender: "shop@fonkiart.com", sent: [], fail: null, send: async (m) => { if (mail.fail) throw new Error(mail.fail); mail.sent.push(m); } }; return mail; };

// The shop, and three buyers who didn't finish paying by card.
const ART = () => [
  { id: 1, title: "Miss Monroe manatee", image: "https://img.test/monroe.jpg", isSold: false, price: 950 },
  { id: 2, title: "Flamingo Party", image: "https://img.test/flamingo.jpg", isSold: false, price: 778, salePrice: null },
  { id: 3, title: "Madame Mango", image: "https://img.test/mango.jpg", isSold: false, price: "700", salePrice: "648" }, // on sale
  { id: 4, title: "Sea Turtle Print", image: "https://img.test/turtle.jpg", isSold: false, price: 350 },
  { id: 5, title: "Price on request", image: "https://img.test/ask.jpg", isSold: false, price: null },
  { id: 6, title: "Gone", image: "https://img.test/gone.jpg", isSold: true, price: 500 },
];
const row = (id, email, ref, title) => ({ id, client_email: email, ship_name: "Sara Test", item_title: title, amount: 1, status: "pending", created_at: "2026-11-22T15:00:00Z", notes: `Order Ref: ${ref} · Sara Test${CARD_NOTE}` });
const SARA = "sara.test@example.com", BO = "bo.test@example.com", CY = "cy.test@example.com";
const ORDERS = () => [
  row(71, SARA, "FA-1771", "Miss Monroe manatee"),
  row(72, BO, "FA-1772", "Miss Monroe manatee"), row(73, BO, "FA-1772", "Flamingo Party"), row(74, BO, "FA-1772", "Madame Mango"),
  row(75, SARA, "FA-1775", "Sea Turtle Print"), row(76, SARA, "FA-1775", "Sea Turtle Print"), row(77, SARA, "FA-1775", "Gone"),
  row(78, CY, "FA-1778", "Miss Monroe manatee"), row(79, CY, "FA-1778", "Price on request"),
];
const lead = (email, over = {}) => ({ id: 1, email, source: "welcome-popup", coupon_code: "FK-TEST-AAAA", coupon_used: false, created_at: "2026-11-01T00:00:00Z", ...over });
const shop = (leads = [], opts = {}, over = {}) => fakeDb({ Orders: ORDERS(), Artworks: ART(), Settings: [{ id: 1, couponDiscount: 15 }], Leads: leads, Clients: [], ...over }, opts);
const DOLLARS = { dollars: 300, of: 950 };

// ── 1. the list, and sending ────────────────────────────────────

test("the list: each checkout's pieces still for sale at the shop's own prices, what their code gives, how much the one sent was, and whether the amount can be chosen", async () => {
  const db = shop([lead(SARA, { coupon_size: [{ percent: 15 }, DOLLARS] }), lead(BO, { id: 2, coupon_code: "FK-TEST-BBBB", coupon_used: true, coupon_size: [{ percent: 40 }] })]);
  const { coupons, choose, percent } = await couponStatus(db, { ids: [71, 73, 75, 78] });
  assert.deepEqual([choose, percent], [true, 15]);
  assert.deepEqual(coupons[71], { ref: "FA-1771", sentAt: null, said: null, used: false, code: "FK-TEST-AAAA", sizes: [{ percent: 15 }, DOLLARS], pieces: [{ title: "Miss Monroe manatee", price: 950 }] });
  assert.deepEqual(coupons[73].pieces, [{ title: "Miss Monroe manatee", price: 950 }, { title: "Flamingo Party", price: 778 }, { title: "Madame Mango", price: 648 }], "the whole checkout, whichever of its rows; on sale: the sale price");
  assert.deepEqual([coupons[73].used, coupons[73].sizes], [true, [{ percent: 15 }]], "a used code gives nothing more");
  assert.deepEqual(coupons[75].pieces, [{ title: "Sea Turtle Print", price: 350 }, { title: "Sea Turtle Print", price: 350 }], "two copies are two; one sold since is left out");
  assert.deepEqual(coupons[78].pieces, [{ title: "Miss Monroe manatee", price: 950 }, { title: "Price on request", price: null }], "a piece with no price says so");
  assert.deepEqual([coupons[78].code, coupons[78].sizes], [null, [{ percent: 15 }]], "no code yet: the shop's %");
  await couponSend(db, { id: 71, dollars: 400 }, mailbox(), NOW);
  assert.deepEqual([(await couponStatus(db, { ids: [71] })).coupons[71].sentAt, (await couponStatus(db, { ids: [71] })).coupons[71].said], [NOW.toISOString(), "$400 off"]);
  assert.deepEqual((await couponStatus(db, { ids: [] })).coupons, {});
});

test("the list still answers when the database has no such column yet, and when the artworks can't be read (then only a % works)", async () => {
  for (const [leads, want] of [[[lead(SARA)], "rows"], [[], "none"]]) {
    assert.equal((await couponStatus(shop(leads, { leads: BEFORE }), { ids: [71] })).choose, false, `not yet (${want})`);
    assert.equal((await couponStatus(shop(leads), { ids: [71] })).choose, true, `run (${want})`);
  }
  const blind = shop([lead(SARA)], { fail: { "Artworks.select": () => "Artworks are down" } });
  const status = await quiet(() => couponStatus(blind, { ids: [71, 72] }));
  assert.deepEqual([status.coupons[71].pieces, status.coupons[72].pieces, status.choose], [[], [], true]);
});

test("$300 to someone new: saved on their own new code, then ONE email that says $300, and the checkout remembers when and how much", async () => {
  const db = shop();
  const mail = mailbox();
  const out = await couponSend(db, { id: 71, dollars: 300 }, mail, NOW);
  const l = db.lead(SARA);
  assert.deepEqual(l.coupon_size, [DOLLARS], "a new code: just this, made for these pieces");
  assert.match(l.coupon_code, /^FK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.deepEqual(out, { sent: true, ref: "FA-1771", sentAt: NOW.toISOString(), to: SARA, code: l.coupon_code, said: "$300 off", discount: 15, noted: true });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].subject, "Still thinking about Miss Monroe manatee? Here's $300 off — Fonkiart");
  const html = mail.sent[0].htmlContent;
  assert.match(html, /Here is \$300 off to bring it home:/);
  assert.match(html, />\$300 off your order</, "in the code's box");
  assert.ok(html.includes(l.coupon_code));
  assert.doesNotMatch(html, /15%|undefined/);
  assert.deepEqual(db.note(), { "FA-1771": { at: NOW.toISOString(), to: SARA, said: "$300 off" } });
  // Once per checkout, as ever; the answer says how much went.
  assert.deepEqual(await couponSend(db, { id: 71, dollars: 500 }, mail, NOW), { sent: false, why: "sent", ref: "FA-1771", sentAt: NOW.toISOString(), said: "$300 off" });
  assert.deepEqual([mail.sent.length, l.coupon_size], [1, [DOLLARS]], "and their code stays as it was");
});

test("a %, on three pieces: what is typed is stored even when it is the shop's own %, so a change in Settings never changes what the email promised", async () => {
  const db = shop();
  const mail = mailbox();
  assert.equal((await couponSend(db, { id: 73, percent: 15 }, mail, NOW)).said, "15% off");
  assert.deepEqual(db.lead(BO).coupon_size, [{ percent: 15 }]);
  db.tables.Settings[0].couponDiscount = 5;
  assert.deepEqual(await opCoupon(db, { code: db.lead(BO).coupon_code, email: BO }), { status: "valid", sizes: [{ percent: 15 }] });
  assert.equal(mail.sent[0].subject, "Still thinking about your 3 pieces? Here's 15% off — Fonkiart");
  assert.match(mail.sent[0].htmlContent, /Here is 15% off to bring them home:/);
});

test("a buyer who already had an unused code keeps what it gave: $300 is ADDED to their 15%; later, more is added again, the largest % kept", async () => {
  const db = shop([lead(SARA)]);
  const mail = mailbox();
  const out = await couponSend(db, { id: 71, dollars: 300 }, mail, NOW);
  assert.equal(out.code, "FK-TEST-AAAA", "their own code");
  assert.deepEqual(db.lead(SARA).coupon_size, [{ percent: 15 }, DOLLARS]);
  await couponSend(db, { id: 75, percent: 40 }, mail, NOW);
  assert.deepEqual(db.lead(SARA).coupon_size, [DOLLARS, { percent: 40 }]);
  assert.deepEqual(db.note()["FA-1775"].said, "40% off");
});

test("the server works it out from the shop's OWN prices: nothing a browser sends about them counts", async () => {
  const db = shop();
  await couponSend(db, { id: 73, dollars: 300, of: 5, total: 1, prices: [1], pieces: [{ title: "Miss Monroe manatee", price: 1 }], coupon_size: [{ percent: 99 }] }, mailbox(), NOW);
  assert.deepEqual(db.lead(BO).coupon_size, [{ dollars: 300, of: 2376 }]);
  // Two copies and one sold since: $300 of the two.
  const two = shop();
  await couponSend(two, { id: 77, dollars: 300 }, mailbox(), NOW);
  assert.deepEqual(two.lead(SARA).coupon_size, [{ dollars: 300, of: 700 }]);
});

test("never less than their code already gives on these pieces: nothing saved, nothing sent, and the answer says what it gives", async () => {
  for (const [size, body, now] of [
    [null, { percent: 10 }, "15% ($142 off)"],
    [null, { dollars: 141 }, "15% ($142 off)"],
    [[{ percent: 15 }, DOLLARS], { percent: 20 }, "$300 off"],
  ]) {
    const db = shop([lead(SARA, { coupon_size: size })]);
    const mail = mailbox();
    assert.deepEqual(await couponSend(db, { id: 71, ...body }, mail, NOW), { sent: false, why: "less", now, code: "FK-TEST-AAAA" }, JSON.stringify(body));
    assert.deepEqual([mail.sent.length, db.leadWrites(), db.note()], [0, [], null]);
  }
  // As much as it gives is fine; and someone with no code yet can be sent any amount.
  assert.equal((await couponSend(shop([lead(SARA)]), { id: 71, dollars: 142 }, mailbox(), NOW)).said, "$142 off");
  assert.equal((await couponSend(shop(), { id: 71, percent: 5 }, mailbox(), NOW)).said, "5% off");
});

test("what can't be chosen is refused before anything is made, saved or sent", async () => {
  for (const [id, body, words] of [
    [71, { percent: 20, dollars: 300 }, /Type a % or a \$ amount, not both/],
    ...[0, 100, -5, 12.5, "abc", "", true, {}, []].map(percent => [71, { percent }, /Type a number from 1 to 99\./]),
    ...[0, 950, 299.5, "abc", ""].map(dollars => [71, { dollars }, /Type a number from 1 to 949\./]),
    [78, { dollars: 300 }, /One of these pieces has no price, so type a % instead\./],
  ]) {
    const db = shop();
    const mail = mailbox();
    await assert.rejects(couponSend(db, { id, ...body }, mail, NOW), (e) => (e.status === 400 && words.test(e.message) && /Nothing was sent\./.test(e.message)) || assert.fail(`${JSON.stringify(body)}: ${e.status} ${e.message}`));
    assert.deepEqual([mail.sent.length, db.writes], [0, []], JSON.stringify(body));
  }
  // A piece with no price: a % still works.
  const db = shop();
  assert.equal((await couponSend(db, { id: 78, percent: 20 }, mailbox(), NOW)).said, "20% off");
  assert.deepEqual(db.lead(CY).coupon_size, [{ percent: 20 }]);
});

test("until the database change has run: an amount is refused plainly and nothing is sent; nothing chosen goes exactly as before", async () => {
  for (const leads of [[lead(SARA)], []]) {
    const db = shop(leads, { leads: BEFORE });
    const mail = mailbox();
    await assert.rejects(couponSend(db, { id: 71, dollars: 300 }, mail, NOW), (e) => e.status === 409 && /Choosing the amount waits for one database change, so nothing was sent\./.test(e.message));
    assert.deepEqual([mail.sent.length, db.leadWrites()], [0, []]);
    const out = await couponSend(db, { id: 71 }, mail, NOW);
    assert.deepEqual([out.sent, out.said, out.discount, mail.sent.length], [true, "15% off", 15, 1]);
    assert.equal(mail.sent[0].subject, "Still thinking about Miss Monroe manatee? Here's 15% off — Fonkiart");
    assert.ok(db.leadWrites().every(w => !JSON.stringify(w.payload).includes("coupon_size")), "the column is never named");
  }
});

test("an Admin tab open since before ({ id } alone): what their code gives, the shop's %, and nothing is stored; a code with its own size says that", async () => {
  const db = shop([lead(SARA)]);
  const mail = mailbox();
  const out = await couponSend(db, { id: 71 }, mail, NOW);
  assert.deepEqual([out.sent, out.said, out.discount, db.lead(SARA).coupon_size, db.leadWrites()], [true, "15% off", 15, undefined, []]);
  assert.match(mail.sent[0].htmlContent, />15% off your order</);
  const own = shop([lead(SARA, { coupon_size: [{ percent: 15 }, DOLLARS] })]);
  assert.equal((await couponSend(own, { id: 71 }, mail, NOW)).said, "$300 off");
  assert.equal((await couponSend(own, { id: 75 }, mail, NOW)).said, "$221 off", "on their other checkout, two prints at $350: its share, what that cart really gets");
  assert.deepEqual(own.leadWrites(), [], "nothing changed");
});

test("the size is saved BEFORE the email: if saving fails, or the code was used a moment ago, nothing is sent", async () => {
  const mail = mailbox();
  const broken = shop([lead(SARA)], { fail: { "Leads.update": () => "Leads can't be written" } });
  await assert.rejects(couponSend(broken, { id: 71, dollars: 300 }, mail, NOW), /couldn't save how much their coupon gives, so nothing was sent: Leads update: Leads can't be written/);
  assert.deepEqual([mail.sent.length, broken.note(), broken.lead(SARA).coupon_size], [0, null, undefined]);

  // Used between the read and the write: the write takes no row, so nothing goes.
  const used = shop([lead(SARA)]);
  const from = used.from;
  used.from = (t) => { const q = from(t); if (t === "Leads") { const update = q.update; q.update = (v) => { used.lead(SARA).coupon_used = true; return update(v); }; } return q; };
  await assert.rejects(couponSend(used, { id: 71, dollars: 300 }, mail, NOW), /couldn't save how much their coupon gives, so nothing was sent/);
  assert.deepEqual([mail.sent.length, used.note(), used.lead(SARA).coupon_size], [0, null, undefined]);

  // The order of things, when it works: their row first, then the email, then the note.
  const db = shop([lead(SARA)]);
  const order = [];
  const keepFrom = db.from;
  db.from = (t) => { const q = keepFrom(t); if (t === "Leads") { const update = q.update; q.update = (v) => { order.push("saved"); return update(v); }; } return q; };
  const upload = db.storage.from;
  db.storage.from = (n) => { const b = upload(n); return { ...b, upload: (...a) => { order.push("noted"); return b.upload(...a); } }; };
  await couponSend(db, { id: 71, dollars: 300 }, { send: async () => { order.push("sent"); } }, NOW);
  assert.deepEqual(order.filter((x, n) => x !== order[n - 1]), ["saved", "sent", "noted"]);
});

test("the email can't go: their code gives again exactly what it gave before, and nothing is noted", async () => {
  for (const [leads, was] of [[[], null], [[lead(SARA)], null], [[lead(SARA, { coupon_size: [{ percent: 25 }] })], [{ percent: 25 }]]]) {
    const db = shop(leads);
    const mail = mailbox();
    mail.fail = "Brevo is down";
    await assert.rejects(quiet(() => couponSend(db, { id: 71, dollars: 300 }, mail, NOW)), /Brevo is down/);
    assert.deepEqual(db.lead(SARA).coupon_size ?? null, was);
    assert.equal(db.note(), null);
    assert.ok(db.leadWrites().some(w => JSON.stringify(w.payload.coupon_size ?? "").includes("300")), "control: it had been saved");
    // The next try, with the email working, goes.
    mail.fail = null;
    assert.equal((await couponSend(db, { id: 71, dollars: 300 }, mail, NOW)).sent, true);
  }
  // It can't even be put back: the send still fails as a failed send.
  const stuck = shop([lead(SARA)], { fail: { "Leads.update": (p, n) => (n > 1 ? "Leads can't be written" : null) } });
  const mail = mailbox();
  mail.fail = "Brevo is down";
  await assert.rejects(quiet(() => couponSend(stuck, { id: 71, dollars: 300 }, mail, NOW)), /Brevo is down/);
});

test("control: every guard of the coupon still holds with an amount typed: paid, sold, used, no such order", async () => {
  const mail = mailbox();
  const db = shop([lead(SARA, { coupon_used: true })], {}, { Orders: [...ORDERS(), { ...row(80, SARA, "FA-1780", "Miss Monroe manatee"), status: "paid" }, row(81, SARA, "FA-1781", "Gone")] });
  await assert.rejects(couponSend(db, { id: 80, dollars: 300 }, mail, NOW), (e) => e.status === 409);
  await assert.rejects(couponSend(db, { id: 999, dollars: 300 }, mail, NOW), (e) => e.status === 404);
  assert.deepEqual(await couponSend(db, { id: 81, dollars: 300 }, mail, NOW), { sent: false, why: "sold" });
  assert.deepEqual(await couponSend(db, { id: 71, dollars: 300 }, mail, NOW), { sent: false, why: "used", code: "FK-TEST-AAAA" });
  assert.deepEqual([mail.sent.length, db.leadWrites()], [0, []]);
});

// ── 2. the code at the checkout ─────────────────────────────────

// Stripe, as much of it as saving a card order needs: each page made, its lines added up.
function fakeStripe() {
  process.env.STRIPE_SECRET_KEY = ["rk", "test", "FAKEKEYFORTESTS"].join("_");
  process.env.STRIPE_PUBLISHABLE_KEY = ["pk", "test", "FAKEPUBLISHABLE"].join("_");
  const pages = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = new URLSearchParams(init.body || "");
    if (init.method === "POST" && String(url).endsWith("/checkout/sessions")) {
      const id = `cs_test_size${String(pages.length + 1).padStart(14, "0")}`;
      let total = 0;
      const metadata = {};
      for (const [k, v] of body) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) metadata[m[1]] = v; }
      for (let n = 0; body.has(`line_items[${n}][quantity]`); n++) total += Number(body.get(`line_items[${n}][price_data][unit_amount]`));
      pages.push({ id, object: "checkout.session", status: "open", payment_status: "unpaid", amount_total: total, currency: "usd", metadata, client_secret: `${id}_secret_FAKE` });
      return { ok: true, status: 200, json: async () => pages.at(-1) };
    }
    const at = /\/checkout\/sessions\/([^/?]+)(\/expire)?/.exec(String(url));
    const one = at && pages.find(p => p.id === at[1]);
    if (!one) throw new Error(`unexpected call: ${init.method} ${url}`);
    if (at[2]) one.status = "expired";
    return { ok: true, status: 200, json: async () => ({ ...one }) };
  };
  return pages;
}
const buy = (titles, over = {}) => ({
  customer: { firstName: "Sara", lastName: "Test", email: SARA, phone: "", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  orderRef: "FA-1752", couponCode: "FK-TEST-AAAA", items: titles.map(title => ({ title, amount: 1 })), total: titles.length, embedded: true, ...over,
});
const card = (db, body, mail = mailbox()) => STORE_OPS["cart-card"](db, { body }, mail);
const saved = (db) => db.tables.Orders.filter(r => r.id >= 1000);
const THREE = ["Miss Monroe manatee", "Flamingo Party", "Madame Mango"];
const KEPT = { coupon_size: [{ percent: 15 }, DOLLARS] };

test("the coupon op says what THAT code gives, so the checkout shows what will be charged, and nothing else about the person", async () => {
  const db = shop([lead(SARA, KEPT), lead(BO, { id: 2, coupon_code: "FK-TEST-BBBB" }), lead(CY, { id: 3, coupon_code: "FK-TEST-CCCC", coupon_used: true, coupon_size: [DOLLARS] })]);
  assert.deepEqual(await opCoupon(db, { code: "fk-test-aaaa", email: SARA }), { status: "valid", sizes: [{ percent: 15 }, DOLLARS] });
  assert.deepEqual(await opCoupon(db, { code: "FK-TEST-BBBB", email: BO }), { status: "valid", sizes: [{ percent: 15 }] }, "no size of its own: the shop's %");
  assert.deepEqual(await opCoupon(db, { code: "FK-TEST-AAAA", email: BO }), { status: "wrong-email" }, "someone else's: nothing about it");
  assert.deepEqual(await opCoupon(db, { code: "FK-TEST-CCCC", email: CY }), { status: "used" });
  assert.deepEqual(await opCoupon(db, { code: "FK-NONE-NONE", email: CY }), { status: "invalid" });
});

test("by card: the order's rows, Stripe's total and the answer all take exactly what their code gives, the best of its sizes for THIS cart", async () => {
  for (const [titles, size, amounts, words] of [
    [["Miss Monroe manatee"], [DOLLARS], [650], "$300"],
    [THREE, [DOLLARS], [830, 680, 566], "$300"],
    [["Sea Turtle Print"], [DOLLARS], [239], "$111"],
    [["Miss Monroe manatee"], KEPT.coupon_size, [650], "$300"],
    [THREE, KEPT.coupon_size, [808, 661, 551], "15%"],
    [["Miss Monroe manatee"], [{ percent: 20 }], [760], "20%"],
    [THREE, [{ dollars: 1200, of: 2376 }], [470, 385, 321], "$1,200"],
  ]) {
    const pages = fakeStripe();
    const db = shop([lead(SARA, { coupon_size: size })]);
    const out = await card(db, buy(titles));
    const total = amounts.reduce((a, b) => a + b, 0);
    assert.deepEqual([out.lines.map(l => l.amount), out.total, out.coupon, out.couponWords], [amounts, total, "FK-TEST-AAAA", `${words} off`]);
    assert.equal(pages.at(-1).amount_total, total * 100, "what the card is charged");
    assert.deepEqual(saved(db).map(r => r.amount), amounts);
    assert.ok(saved(db).every(r => r.notes.endsWith(` · ${words} coupon applied${CARD_NOTE}`)), saved(db)[0].notes);
    assert.equal(db.lead(SARA).coupon_used, true, "used once");
  }
});

test("a bigger discount can't be forged: a browser sends a code and nothing it adds about the size counts", async () => {
  fakeStripe();
  const forged = { sizes: [{ percent: 99 }], size: { percent: 99 }, coupon_size: [{ percent: 99 }], discount: 99, percent: 99, dollars: 900, couponWords: "$900 off" };
  let db = shop([lead(SARA, { coupon_size: [DOLLARS] })]);
  let out = await card(db, buy(["Miss Monroe manatee"], forged));
  assert.deepEqual([out.total, out.couponWords], [650, "$300 off"], "its own row's $300");
  db = shop([lead(SARA)]);
  out = await card(db, buy(["Miss Monroe manatee"], { ...forged, customer: { ...buy([]).customer, ...forged } }));
  assert.deepEqual([out.total, out.couponWords], [808, "15% off"], "no size of its own: the shop's 15%");
  db = shop([lead(BO, { coupon_size: [DOLLARS] })]);
  out = await card(db, buy(["Miss Monroe manatee"], forged));
  assert.deepEqual([out.total, "couponWords" in out, db.lead(BO).coupon_used], [950, false, false], "someone else's code: the full price");
});

test("Zelle, Venmo, Cash App: the notes and both emails say what came off (the amounts are the browser's, as before)", async () => {
  for (const [titles, size, words] of [
    [["Miss Monroe manatee"], [DOLLARS], "$300"],
    [["Sea Turtle Print"], [DOLLARS], "$111"],
    [THREE, KEPT.coupon_size, "15%"],
    [["Miss Monroe manatee"], [{ percent: 20 }], "20%"],
    [["Miss Monroe manatee", "Price on request"], [DOLLARS], "$300"],
    [["Nothing by this name"], KEPT.coupon_size, "$300"],
  ]) {
    const db = shop([lead(SARA, { coupon_size: size })]);
    const mail = mailbox();
    const body = buy(titles, { items: titles.map(title => ({ title, amount: 77 })), total: 77 * titles.length, embedded: undefined });
    assert.deepEqual(await opOrder(db, body, mail), { ok: true, saved: true });
    assert.deepEqual(saved(db).map(r => r.amount), titles.map(() => 77));
    assert.ok(saved(db).every(r => r.notes.endsWith(` · ${words} coupon applied`)), saved(db)[0].notes);
    assert.equal(mail.sent.length, 2);
    for (const m of mail.sent) assert.ok(m.htmlContent.includes(`${words} coupon applied`), `${m.to}: ${words}`);
    assert.equal(db.lead(SARA).coupon_used, true);
  }
  // The artworks can't be read: the order still goes, in the code's own words.
  const db = shop([lead(SARA, { coupon_size: [DOLLARS] })], { fail: { "Artworks.select": () => "Artworks are down" } });
  await quiet(() => opOrder(db, buy(["Miss Monroe manatee"], { embedded: undefined }), mailbox()));
  assert.ok(saved(db)[0].notes.endsWith(" · $300 coupon applied"));
});

test("the buyer's own email and the shop's say \"✓ $300 coupon applied\"; with none, not a word about one", () => {
  const order = { firstName: "Sara", orderRef: "FA-1752", items: [{ title: "Miss Monroe manatee", amount: 650 }], total: 650, addr: "", sender: "shop@fonkiart.com", fullName: "Sara Test", email: SARA, phone: "" };
  assert.match(T.orderBuyer({ ...order, applied: "$300 coupon applied" }), />✓ \$300 coupon applied</);
  assert.match(T.orderStore({ ...order, applied: "$1,200 coupon applied" }), /\$650 \(\$1,200 coupon applied\)/);
  for (const html of [T.orderBuyer({ ...order, applied: "" }), T.orderStore({ ...order, applied: "" })]) assert.doesNotMatch(html, /coupon|undefined/);
});

test("paying another way after all, and coming back with new details: the $ words stay in the notes, and the emails say them", async () => {
  fakeStripe();
  const db = shop([lead(SARA, { coupon_size: [{ dollars: 1200, of: 2376 }] })]);
  const first = await card(db, buy(THREE));
  const kept = { ref: first.ref, ids: first.ids, email: SARA, titles: THREE, session: first.session, embedded: true };
  // A new address: the notes' end is the shop's own, so it is kept word for word.
  await STORE_OPS["cart-again"](db, { body: { ...kept, customer: { ...buy([]).customer, address: "9 Ocean Dr" } } }, mailbox());
  assert.deepEqual(saved(db).map(r => r.notes), THREE.map(() => `Order Ref: FA-1752 · Sara Test · 9 Ocean Dr, Miami, FL, 33101, USA · $1,200 coupon applied${CARD_NOTE}`));
  const again = { ...kept, session: undefined };
  const mail = mailbox();
  assert.deepEqual(await STORE_OPS["cart-other"](db, { body: { ...again, customer: { ...buy([]).customer, address: "9 Ocean Dr" }, method: "zelle" } }, mail), { ok: true, ref: "FA-1752" });
  assert.equal(mail.sent.length, 2);
  for (const m of mail.sent) assert.ok(m.htmlContent.includes("$1,200 coupon applied"), m.to);
  assert.deepEqual(saved(db).map(r => r.notes), THREE.map(() => "Order Ref: FA-1752 · Sara Test · 9 Ocean Dr, Miami, FL, 33101, USA · $1,200 coupon applied · Paying by Zelle"));
});

test("the welcome popup's answer: their own code back, with what it gives when that isn't the shop's %", async () => {
  assert.deepEqual(await opWelcome(shop([lead(SARA, KEPT)]), { email: SARA }, mailbox()), { returning: true, code: "FK-TEST-AAAA", used: false, sizes: [{ percent: 15 }, DOLLARS] });
  // Nothing more for anyone else: no size, none any more, or no real one.
  for (const over of [{}, { coupon_size: null }, { coupon_size: [] }, { coupon_size: "x" }]) assert.deepEqual(await opWelcome(shop([lead(SARA, over)]), { email: SARA }, mailbox()), { returning: true, code: "FK-TEST-AAAA", used: false });
  assert.deepEqual(await opWelcome(shop([lead(SARA, { ...KEPT, coupon_used: true })]), { email: SARA }, mailbox()), { returning: true, code: "FK-TEST-AAAA", used: true });
});

test("control: until the database change has run, the checkout, the card, Zelle and the popup work to the dollar as before", async () => {
  const before = (over = {}) => shop([lead(SARA, over)], { leads: BEFORE });
  assert.equal((await opCoupon(before(), { code: "FK-TEST-AAAA", email: SARA })).status, "valid");
  assert.deepEqual(await opWelcome(before(), { email: SARA }, mailbox()), { returning: true, code: "FK-TEST-AAAA", used: false });
  const c = await leadCoupon(before(), SARA, "welcome-popup");
  assert.deepEqual([c.code, c.used, c.made], ["FK-TEST-AAAA", false, false]);
  const pages = fakeStripe();
  let db = before();
  const out = await card(db, buy(THREE));
  assert.deepEqual([out.lines.map(l => l.amount), out.total, pages[0].amount_total], [[808, 661, 551], 2020, 202000]);
  assert.ok(saved(db).every(r => r.notes.endsWith(` · 15% coupon applied${CARD_NOTE}`)));
  db = before();
  await opOrder(db, buy(THREE, { embedded: undefined }), mailbox());
  assert.ok(saved(db).every(r => r.notes.endsWith(" · 15% coupon applied")));
  const fresh = shop([], { leads: BEFORE });
  const made = await leadCoupon(fresh, SARA, "welcome-popup");
  assert.deepEqual([made.made, fresh.lead(SARA).coupon_code], [true, made.code]);
});

test("control: an old code, with no size, gives exactly what the shop's % gave before, on every piece and every %", async () => {
  for (const percent of [5, 12.5, 15, 20, 33, 50]) {
    fakeStripe();
    const db = shop([lead(SARA)], {}, { Settings: [{ id: 1, couponDiscount: percent }] });
    const out = await card(db, buy([...THREE, "Sea Turtle Print"]));
    assert.deepEqual(out.lines.map(l => l.amount), [950, 778, 648, 350].map(p => Math.round(p * (1 - percent / 100))), `${percent}%`);
  }
});

// ── 3. Admin's boxes, the line once sent, Leads, the popup ──────

// A component drawn by itself: its state kept between draws, so a test can type and tap. Each import
// of the file becomes a read from the stand-ins given; one this test has no stand-in for fails loudly.
let drawing = null;
const React = {
  useState(init) {
    const d = drawing, n = d.at++;
    if (!(n in d.hooks)) d.hooks[n] = typeof init === "function" ? init() : init;
    return [d.hooks[n], (v) => { d.hooks[n] = typeof v === "function" ? v(d.hooks[n]) : v; d.draw(); }];
  },
  useEffect(fn) { const d = drawing, n = d.at++; if (!(n in d.hooks)) { d.hooks[n] = true; d.effects.push(fn); } },
};
const FRAGMENT = Symbol("Fragment");
const jsx = (type, props) => ({ type, props: props || {} });
globalThis.__couponSendTest = {};
let loads = 0; // each load is a module of its own, with its own stand-ins
async function component(file, given) {
  if (!existsSync(new URL(file, root))) return assert.fail(`${file} isn't there`);
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const key = `${file} ${++loads}`;
  const all = globalThis.__couponSendTest[key] = { react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: FRAGMENT }, "../lib/couponSize": await import(new URL("src/lib/couponSize.js", root).href).catch(() => ({})), ...given };
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in all)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__couponSendTest[${JSON.stringify(key)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
function draw(Component, props) {
  const d = { hooks: [], effects: [], at: 0, tree: null };
  const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n === "object"
    ? typeof n.type === "function" ? flat(n.type(n.props)) : n.type === FRAGMENT ? flat(n.props.children) : [{ type: n.type, props: n.props, children: flat(n.props.children) }]
    : [String(n)];
  d.draw = () => { const outer = drawing; drawing = d; d.at = 0; try { d.tree = { type: "#", props: {}, children: flat(Component(props)) }; } finally { drawing = outer; } };
  d.draw();
  for (const run of d.effects.splice(0)) run();
  const find = (want, n = d.tree) => typeof n === "string" ? [] : [...(want(n) ? [n] : []), ...n.children.flatMap(x => find(want, x))];
  const text = (n = d.tree) => typeof n === "string" ? n : n.children.map(x => text(x)).join("");
  return { find, text, one: (what, want) => { const hits = find(want); assert.equal(hits.length, 1, `one ${what}, found ${hits.length}: ${text()}`); return hits[0]; } };
}
const settle = async () => { for (let k = 0; k < 6; k++) await new Promise(r => setImmediate(r)); };

// The question, as Admin opens it: $950 piece, no code yet, the amount can be chosen, the shop's 15%.
const PIECE = [{ title: "Miss Monroe manatee", price: 950 }];
async function ask(over = {}) {
  const sent = [];
  const CouponAsk = await component("src/admin/CouponAsk.jsx", {});
  const screen = draw(CouponAsk, { to: SARA, coupon: { code: null, used: false, sizes: [{ percent: 15 }], pieces: PIECE }, shop: { choose: true, percent: 15 }, percent: 15, onSend: (c) => sent.push(c), onCancel() {}, ...over });
  const inputs = () => screen.find(n => n.type === "input");
  const label = (n) => screen.find(x => x.type === "label")[n];
  return {
    sent, screen, label,
    percent: () => inputs()[0].props, dollars: () => inputs()[1].props,
    type: (box, value) => inputs()[box === "%" ? 0 : 1].props.onChange({ target: { value } }),
    send: () => screen.one("Send button", n => n.type === "button" && screen.text(n) === "Send").props,
    line: () => screen.find(n => n.props.role === "status").map(n => screen.text(n)).join(""),
    becomes: () => screen.find(n => n.props.className === "o-coupon-becomes").map(n => screen.text(n)).join(""),
    on: () => [0, 1].map(n => /\bis-on\b/.test(label(n).props.className)),
  };
}

test("the question: two linked boxes; type in either and the other fills in for these pieces, with $950 → $650 beside them; the one typed LAST is what is sent", async () => {
  const a = await ask();
  assert.match(a.screen.text(), /^Email sara\.test@example\.com a coupon, with their pieces\?/);
  assert.deepEqual([a.percent().value, a.dollars().value, a.becomes(), a.on()], ["15", "142", "$950 → $808", [true, false]], "it opens at the shop's %");
  a.type("$", "300");
  assert.deepEqual([a.percent().value, a.dollars().value, a.becomes(), a.on(), a.line()], ["31.6", "300", "$950 → $650", [false, true], ""]);
  a.send().onClick();
  a.type("%", "20");
  assert.deepEqual([a.percent().value, a.dollars().value, a.becomes(), a.on()], ["20", "190", "$950 → $760", [true, false]]);
  a.send().onClick();
  a.type("$", "$1,2");
  assert.deepEqual([a.send().disabled, a.line(), a.percent().value], [true, "Type a number from 1 to 949.", ""], "typing on, not a number yet");
  a.type("$", "949");
  a.send().onClick();
  assert.deepEqual(a.sent, [{ dollars: 300 }, { percent: 20 }, { dollars: 949 }]);
  // Several pieces: their total.
  const b = await ask({ coupon: { code: null, used: false, sizes: [{ percent: 15 }], pieces: [...PIECE, { title: "Flamingo Party", price: 778 }, { title: "Madame Mango", price: 648 }] } });
  b.type("$", "300");
  assert.deepEqual([b.becomes(), b.percent().value], ["$2,376 → $2,076", "12.6"]);
  // As it opens and Send is tapped: the shop's %, said out loud, so the server stores it.
  const c = await ask();
  c.send().onClick();
  assert.deepEqual(c.sent, [{ percent: 15 }]);
});

test("the question: whole numbers only; anything else and Send is off, with one plain line that says why", async () => {
  const a = await ask();
  for (const [box, value, why] of [["%", "0", 99], ["%", "100", 99], ["%", "12.5", 99], ["%", "abc", 99], ["%", "", 99], ["$", "0", 949], ["$", "950", 949], ["$", "299.50", 949], ["$", "", 949]]) {
    a.type(box, value);
    assert.deepEqual([a.send().disabled, a.line(), a.becomes()], [true, `Type a number from 1 to ${why}.`, ""], `${box} ${value}`);
  }
  for (const [box, value] of [["%", "1"], ["%", "99"], ["$", "1"], ["$", "949"]]) {
    a.type(box, value);
    assert.deepEqual([a.send().disabled, a.line()], [false, ""], `${box} ${value}`);
  }
});

test("the question: it opens at what their own code gives, and never goes lower; someone with no code can be sent any amount", async () => {
  const has = (sizes, over = {}) => ({ code: "FK-TEST-AAAA", used: false, sizes, pieces: PIECE, ...over });
  const a = await ask({ coupon: has([{ percent: 15 }, DOLLARS]) });
  assert.deepEqual([a.dollars().value, a.percent().value, a.on()], ["300", "31.6", [false, true]], "its best on these pieces");
  a.type("%", "20");
  assert.deepEqual([a.send().disabled, a.line()], [true, "Their coupon already gives $300 off, so it can't be less."]);
  a.type("$", "300");
  assert.deepEqual([a.send().disabled, a.line()], [false, ""], "as much is fine");
  const b = await ask({ coupon: has([{ percent: 15 }]) });
  b.type("$", "141");
  assert.deepEqual([b.send().disabled, b.line()], [true, "Their coupon already gives 15% ($142 off), so it can't be less."]);
  const none = await ask();
  none.type("%", "5");
  assert.deepEqual([none.send().disabled, none.line()], [false, ""]);
  const used = await ask({ coupon: has([{ percent: 15 }], { code: null }) });
  used.type("%", "5");
  assert.equal(used.send().disabled, false);
});

test("the question: no price to go by, only the % works; a % in Settings that isn't whole goes as it is, but can't be typed", async () => {
  for (const pieces of [[...PIECE, { title: "Price on request", price: null }], []]) {
    const a = await ask({ coupon: { code: null, used: false, sizes: [{ percent: 15 }], pieces } });
    assert.deepEqual([a.percent().disabled, a.dollars().disabled, a.dollars().value, a.becomes(), a.line()], [false, true, "", "", "There's no price to go by here, so only the % works."]);
    a.type("%", "20");
    a.send().onClick();
    assert.deepEqual(a.sent, [{ percent: 20 }]);
  }
  // The server said nothing of this one: the % works, and it answers what is true when it is sent.
  const unknown = await ask({ coupon: undefined });
  assert.deepEqual([unknown.percent().value, unknown.dollars().disabled, unknown.send().disabled], ["15", true, false]);
  const half = await ask({ shop: { choose: true, percent: 12.5 }, coupon: { code: null, used: false, sizes: [{ percent: 12.5 }], pieces: PIECE } });
  assert.deepEqual([half.percent().value, half.line()], ["12.5", ""]);
  half.send().onClick();
  assert.deepEqual(half.sent, [{}], "what their code gives, the shop's 12.5%");
  half.type("%", "12.5");
  assert.equal(half.send().disabled, true);
});

test("the question, until the database change has run: both boxes off at the shop's %, one plain line, and Send goes as before; not known yet, Send waits", async () => {
  const a = await ask({ shop: { choose: false, percent: 20 } });
  assert.deepEqual([a.percent().disabled, a.dollars().disabled, a.percent().value, a.line()], [true, true, "20", "Choosing the amount waits for one database change. Until then it goes at 20%."]);
  a.send().onClick();
  assert.deepEqual(a.sent, [{}]);
  const waiting = await ask({ shop: null });
  assert.deepEqual([waiting.send().disabled, waiting.percent().disabled, waiting.percent().value], [true, true, "15"]);
  const failed = await ask({ shop: { failed: true }, coupon: undefined });
  assert.deepEqual([failed.percent().disabled, failed.send().disabled, failed.line()], [true, false, "The amount can't be chosen right now, so it goes at 15%."]);
  failed.send().onClick();
  assert.deepEqual(failed.sent, [{}]);
});

test("the boxes are made for a phone: numbers come up, each box is named, 44px tall and 17px text, money in the money font, no green", async () => {
  const a = await ask();
  for (const box of [a.percent(), a.dollars()]) assert.deepEqual([box.type, box.inputMode], ["text", "numeric"]);
  assert.deepEqual([0, 1].map(n => a.screen.text(a.label(n))), ["% off", "$off"], "what each box is, in its own words");
  const css = read("src/index.css");
  const rule = (sel) => css.split("\n").map(l => l.trim()).find(l => l.startsWith(`${sel} {`)) || "";
  assert.match(rule(".orders-tab .o-coupon-box"), /min-height:44px;.*font-size:17px;/);
  assert.match(rule(".orders-tab .o-coupon-box input"), /font-size:19px;/);
  // Seen in the first pictures: "1,200" was cut, a number stood far from its "$", and Send was lower
  // than Cancel. The number takes all the room its box has, next to its "$"; the two buttons are the
  // same height.
  assert.match(rule(".orders-tab .o-coupon-box"), /width:146px;/);
  assert.match(rule(".orders-tab .o-coupon-box input"), /flex:1 1 0;width:0;min-width:0;/);
  assert.doesNotMatch(rule(".orders-tab .o-coupon-box input"), /text-align/);
  assert.match(rule(".orders-tab .o-coupon-ask .mark-paid-ask"), /align-items:stretch;/);
  assert.match(rule(".orders-tab .o-coupon-line"), /font-size:16px;/);
  assert.match(rule(".orders-tab .o-coupon-becomes"), /font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;.*font-variant-numeric:lining-nums;/);
  const part = css.slice(css.indexOf('/* "Send a coupon": how much off'), css.indexOf('/* "🔗 Link"'));
  assert.ok(part.includes(".o-coupon-ask"), "the part is read");
  for (const px of part.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px[1]) >= 16, px[0]);
  assert.doesNotMatch(part + read("src/admin/CouponAsk.jsx"), /green|#2d6a4f|#e8f5ee|#a3d4b3|--ok|cream|beige|ivory|alert\(|confirm\(|prompt\(/i);
});

test("Admin -> Orders: what was chosen goes with the send; the row then says when and how much, and the note says the code and how much", () => {
  const tab = read("src/admin/OrdersTab.jsx");
  assert.match(tab, /const r = await adminAction\("coupon-send", \{ id: o\.id, \.\.\.choice \}\);/);
  assert.match(tab, /`✓ Coupon \$\{r\.code\} \(\$\{r\.said\}\) sent to \$\{r\.to\}\.`/);
  // "Coupon sent Nov 23 · $300 off" on one line; in the wide table's narrow column how much goes under
  // the date, with no dot left hanging at the end of the line (as the first pictures had it).
  assert.match(tab, /Coupon sent \{sentDay\(c\.sentAt\)\}\{c\.said && <> <span className="o-coupon-said">\{c\.said\}<\/span><\/>\}/);
  const part = (media) => read("src/index.css").split("\n}\n").map(p => p.slice(p.lastIndexOf("@media"))).find(p => p.startsWith(media) && p.includes(".orders-tab .orders-table")) || "";
  assert.ok(part("@media(max-width:1279px){").includes('.orders-tab .o-coupon-said::before { content:"· "; }'));
  assert.ok(part("@media(min-width:1280px){").includes(".orders-tab .o-coupon-said { display:block; }"));
  assert.equal(read("src/index.css").match(/o-coupon-said/g).length, 2, "and nowhere else");
  assert.match(tab, /const sentDay = \(iso\) => new Date\(iso\)\.toLocaleDateString\("en-US", \{ month:"short", day:"numeric" \}\);/, "\"Nov 23\"");
  assert.match(tab, /r\.why === "less"[\s\S]{0,120}Their coupon already gives \$\{r\.now\}, so it can't be less\. Nothing was sent\./);
  assert.match(tab, /<CouponAsk to=\{to\} coupon=\{c\} shop=\{couponShop\}/);
  assert.match(tab, /setCouponShop\(\{ choose: r\.choose === true, percent: r\.percent \}\)/);
});

test("Admin -> Leads: a code with a size of its own shows it after the code; every other row is as before", async () => {
  const rows = [
    { id: 1, email: SARA, coupon_code: "FK-TEST-AAAA", coupon_size: [DOLLARS], created_at: null },
    { id: 2, email: BO, coupon_code: "FK-TEST-BBBB", coupon_size: [{ percent: 20 }], coupon_used: true, created_at: null },
    { id: 3, email: CY, coupon_code: "FK-TEST-CCCC", coupon_size: [{ percent: 15 }, { dollars: 1200, of: 4000 }], created_at: null },
    { id: 4, email: "dee.test@example.com", coupon_code: "FK-TEST-DDDD", coupon_size: null, created_at: null },
    { id: 5, email: "eve.test@example.com", coupon_code: "FK-TEST-EEEE", created_at: null },
    { id: 6, email: "fay.test@example.com", coupon_code: null, coupon_size: [DOLLARS], created_at: null },
  ];
  const LeadsTab = await component("src/admin/LeadsTab.jsx", {
    "../lib/adminDb": { adminDb: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows }) }) }) } },
    "../utils/helpers": { generateCouponCode() {}, sendEmail() {} }, "../lib/adminEmails": { couponEmail() {} },
  });
  const screen = draw(LeadsTab, { discount: 15 });
  await settle();
  const codes = screen.find(n => n.props["data-label"] === "Coupon Code").map(n => screen.text(n));
  // A no-break space after the dot: it stays with the size, never alone at the end of a line.
  assert.deepEqual(codes, ["FK-TEST-AAAA ·\u00a0$300 off", "FK-TEST-BBBB ·\u00a020% off", "FK-TEST-CCCC ·\u00a015% off or $1,200 off", "FK-TEST-DDDD", "FK-TEST-EEEE", "—"]);
  assert.match(read("src/admin/LeadsTab.jsx"), /Generate a unique \{discount\}% off coupon code for any email\./, "+ Create Coupon stays as it is");
});

test("the welcome popup tells the truth to someone coming back for a code with a size of its own", async () => {
  const said = async (answer) => {
    const Welcome = await component("src/components/WelcomeModal.jsx", { "../lib/store": { storeCall: async () => answer }, "../lib/cartMemory": { remember() {} }, "./Pic": { default: () => null } });
    const screen = draw(Welcome, { onClose() {}, discount: 15, artworks: [] });
    screen.one("email box", n => n.type === "input").props.onChange({ target: { value: SARA } });
    await screen.one("button", n => n.type === "button" && screen.text(n) === "Get My Coupon →").props.onClick();
    await settle();
    return /One use only · (.+?) · tied to your email\./.exec(screen.text())?.[1];
  };
  const back = { returning: true, code: "FK-TEST-AAAA", used: false };
  assert.equal(await said({ ...back, sizes: [{ percent: 15 }, DOLLARS] }), "15% off or up to $300 off");
  assert.equal(await said({ ...back, sizes: [{ percent: 20 }] }), "20% off");
  for (const sizes of [undefined, null, [], "x", [{ percent: 400 }]]) assert.equal(await said({ ...back, sizes }), "15% off", `the shop's %: ${JSON.stringify(sizes)}`);
});
