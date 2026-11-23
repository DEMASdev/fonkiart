// The Klarna offer (Andy said "build", 2026-11-22, to the offer as it was put to him: "when a piece is just over that line (say
// $3,000), the checkout says "Get $300 off and pay with Klarna." It shows only when the discount
// brings the price under the line, and never more off than a top amount you set in Admin.").
//  1. The rule (api/_lib/klarnaOffer.js, and the browser's copy src/lib/klarnaOffer.js, the same
//     code): over the line and within the most-off; exactly enough to reach the line, rounded UP to
//     the next $10, never more than the most-off; split across the pieces to the exact cent.
//  2. The server decides (api/_lib/cartCheckout.js 8.): from the shop's Settings and prices, never
//     from a browser, and only on a Klarna payment page; cards, Zelle and the rest pay the full
//     price. Paid there, each row turns Paid at its lower amount, its notes saying so, once.
// Stripe and the database are stand-ins: nothing real is called, no email is sent. Fake data only.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STORE_OPS } from "../api/_lib/storeOps.js";
import { CARD_NOTE } from "../api/_lib/cartCheckout.js";
import * as server from "../api/_lib/klarnaOffer.js";
import * as browser from "../src/lib/klarnaOffer.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let logs;
// Fake keys, built in pieces: no key-shaped text in the repo.
const SK = ["rk", "test", "FAKEKEYFORTESTS"].join("_");
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_");

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = SK;
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  logs = [];
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  Object.assign(console, realConsole);
});

// ── 1. the rule ─────────────────────────────────────────────────

const LINE = { klarnaMax: 2800, klarnaMostOff: 300 }; // Admin: Klarna's highest price $2,800, at most $300 off
const c = (dollars) => Math.round(dollars * 100);

test("the rule: offered only over the line and within the most-off; exactly enough to reach the line, rounded UP to the next $10, never more than the most-off", () => {
  for (const [total, off, why] of [
    [3000, 200, "the worked example: $3,000 with a $2,800 line"],
    [2801, 10, "$1 over: rounded UP to the next $10"],
    [3005, 210, "$205 over: $210"],
    [3099, 300, "$299 over: $300, the most-off"],
    [3100, 300, "$300 over: the most-off brings it exactly to the line"],
    [3100.01, 0, "a cent too far over: no offer"],
    [3500, 0, "far over: no offer"],
    [2800, 0, "at the line: Klarna takes it, no offer"],
    [2500, 0, "under the line: no offer"],
  ]) {
    assert.equal(server.klarnaOff(c(total), LINE), c(off), why);
    assert.equal(c(total) - server.klarnaOff(c(total), LINE) <= c(2800) || !server.klarnaOff(c(total), LINE), true, `${why}: an offer always lands at or under the line`);
  }
  assert.equal(server.offerLine(server.klarnaOff(c(3000), LINE)), "Get $200 off and pay with Klarna");
  assert.equal(server.offerDone(20000), "✓ $200 off for Klarna");
  assert.equal(server.offerWords(13300), " · $133 off for Klarna", "the row's words, as a coupon's");
  assert.equal(server.dollars(186667), "$1,866.67", "cents only when there are some");
  // A most-off that isn't a round $10: never more than it, still at or under the line.
  assert.equal(server.klarnaOff(c(3092), { klarnaMax: 2800, klarnaMostOff: 295 }), c(295));
});

test("no Admin numbers, or only one of them, or not numbers above zero: no offer at all", () => {
  for (const settings of [undefined, null, {}, { klarnaMax: 2800 }, { klarnaMostOff: 300 }, { klarnaMax: null, klarnaMostOff: null },
    { klarnaMax: "", klarnaMostOff: "" }, { klarnaMax: 0, klarnaMostOff: 300 }, { klarnaMax: 2800, klarnaMostOff: -300 },
    { klarnaMax: "abc", klarnaMostOff: 300 }, { klarnaMax: 2800, klarnaMostOff: Infinity }]) {
    assert.equal(server.klarnaOff(c(3000), settings), 0, JSON.stringify(settings));
    assert.equal(server.klarnaOffer([c(3000)], settings), null, JSON.stringify(settings));
  }
  assert.equal(server.klarnaOff(c(3000), { klarnaMax: "2800", klarnaMostOff: "300" }), c(200), "control: the database's numbers as text still count");
});

test("split across the pieces in proportion, adding up to the exact cent: whole dollars when it can be, a piece never left at $0", () => {
  assert.deepEqual(server.splitOff(20000, [200000, 100000]), [13300, 6700], "$2,000 + $1,000, $200 off: $133 + $67");
  assert.deepEqual(server.splitOff(20000, [200050, 100000]), [13334, 6666], "a piece with cents: split to the cent");
  assert.deepEqual(server.splitOff(30000, [100000, 100000, 100000]), [10000, 10000, 10000]);
  assert.deepEqual(server.splitOff(20000, [300000, 4500]), [19700, 300], "a small print beside a big piece");
  assert.equal(server.splitOff(900, [1, 999]), null, "a share that would leave a piece at $0: no offer");
  assert.equal(server.splitOff(1000, [500, 500]), null, "the whole order off: no offer");
  for (let n = 1; n <= 400; n++) {
    const amounts = [c(97 + (n * 37) % 2900), c(5 + (n * 13) % 400), ...(n % 3 ? [] : [c(45 + n)]), ...(n % 7 ? [] : [7 + n])];
    const total = amounts.reduce((a, b) => a + b, 0);
    for (const off of [1000, 2000, 7300, 29500, 1234]) {
      if (off >= total) continue;
      const split = server.splitOff(off, amounts);
      if (!split) continue;
      assert.equal(split.reduce((a, b) => a + b, 0), off, `${amounts} less ${off}: the shares add up exactly`);
      split.forEach((s, i) => assert.ok(s >= 0 && s < amounts[i] && Math.abs(s - off * amounts[i] / total) < (off % 100 || amounts.some(a => a % 100) ? 1 : 100), `${amounts} less ${off}: share ${i} in proportion`));
    }
  }
  assert.deepEqual(server.klarnaOffer([c(2000), c(1000)], LINE), { off: 20000, split: [13300, 6700] });
});

test("the browser's copy is the server's code, line for line, and gives the same answers", () => {
  const code = (p) => read(p).slice(read(p).indexOf("const TEN_DOLLARS"));
  const there = code("api/_lib/klarnaOffer.js"), here = code("src/lib/klarnaOffer.js");
  assert.ok(there.length > 1500, "the code was found");
  assert.equal(here, there, "change one, change both");
  assert.notEqual(here.replace("TEN_DOLLARS = 1000", "TEN_DOLLARS = 100"), there, "control: a changed copy is told apart");
  for (const settings of [LINE, { klarnaMax: 1999.99, klarnaMostOff: 250 }, { klarnaMax: "3000", klarnaMostOff: "500" }, {}]) {
    for (let total = c(1900); total <= c(3600); total += 1733) {
      assert.equal(browser.klarnaOff(total, settings), server.klarnaOff(total, settings));
      assert.deepEqual(browser.klarnaOffer([total - 4500, 4500], settings), server.klarnaOffer([total - 4500, 4500], settings));
    }
  }
});

// ── 2. the server, on stand-in Stripe ───────────────────────────

// Answers like Stripe: makes embedded payment pages (remembering their lines' total, ways and
// metadata), tells what it knows about one, closes an open one. Which ways are switched on: it
// won't say, so the server offers cards and Klarna, as it does then (stripe.js stripeWays).
// refuse(body): an error instead of a new page.
function fakeStripe({ refuse } = {}) {
  const sessions = new Map(), calls = [];
  let made = 0;
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? new URLSearchParams(init.body) : null;
    calls.push({ url: String(url), method: init.method, body });
    const path = String(url).replace("https://api.stripe.com/v1", "");
    const closing = /^\/checkout\/sessions\/([^/?]+)\/expire$/.exec(path);
    if (init.method === "POST" && closing) {
      const s = sessions.get(closing[1]);
      if (!s || s.status !== "open") return reply(400, { error: { code: "checkout_session_not_open", message: "Only open Checkout Sessions can be expired" } });
      s.status = "expired";
      return reply(200, { ...s });
    }
    if (init.method === "POST" && path === "/checkout/sessions") {
      const no = refuse?.(body);
      if (no) return reply(no.status, { error: { message: no.message, code: no.code } });
      const id = `cs_test_offer${String(++made).padStart(14, "0")}`;
      let total = 0;
      for (let i = 0; body.has(`line_items[${i}][quantity]`); i++) total += Number(body.get(`line_items[${i}][price_data][unit_amount]`));
      const metadata = {}, types = [];
      for (const [k, v] of body) {
        const m = /^metadata\[(.+)\]$/.exec(k); if (m) metadata[m[1]] = v;
        if (/^payment_method_types\[\d+\]$/.test(k)) types.push(v);
      }
      const s = { id, status: "open", payment_status: "unpaid", amount_total: total, currency: "usd", metadata, payment_method_types: types, client_secret: `${id}_secret_FAKE` };
      sessions.set(id, s);
      return reply(200, s);
    }
    const one = /^\/checkout\/sessions\/([^/?]+)$/.exec(path);
    if (init.method === "GET" && one) {
      const s = sessions.get(one[1]);
      return s ? reply(200, { ...s }) : reply(404, { error: { code: "resource_missing", message: "No such checkout.session" } });
    }
    throw new Error(`unexpected Stripe call: ${init.method} ${url}`);
  };
  const pages = () => calls.filter(x => x.method === "POST" && x.url.endsWith("/checkout/sessions")).map(x => x.body);
  const last = () => [...sessions.values()].at(-1);
  // Paid on the page, the way the buyer chose (its payment's method: Klarna by default).
  const pay = (id = last().id, over = {}) => Object.assign(sessions.get(id), { status: "complete", payment_status: "paid", payment_intent: { payment_method: { type: "klarna" } } }, over);
  return { calls, sessions, pages, last, pay };
}

// The shop's tables the way supabase-js reads and writes them (as tests/cart-card.test.js).
// failAt: { "Orders.update": 2 } makes that table's 2nd write of that kind fail.
function fakeDb(tables, { failAt = {} } = {}) {
  const writes = [], count = {};
  let nextId = 1000;
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const tests = [];
    let op = "select", payload = null, returning = false, single = false, lim = null;
    const q = {
      select: () => { if (op !== "select") returning = true; return q; },
      insert: (v) => { op = "insert"; payload = v; return q; },
      update: (v) => { op = "update"; payload = v; return q; },
      eq: (k, v) => { tests.push(r => String(r[k]) === String(v)); return q; },
      in: (k, list) => { tests.push(r => list.map(String).includes(String(r[k]))); return q; },
      not: (k, o, v) => { tests.push(r => (v === null ? r[k] != null : r[k] !== v)); return q; },
      order: () => q,
      limit: (n) => { lim = n; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        const kind = `${table}.${op}`;
        count[kind] = (count[kind] || 0) + 1;
        if (failAt[kind] === count[kind]) return { data: null, error: { message: "the database said no" } };
        let hit = rows.filter(r => tests.every(t => t(r)));
        if (op === "select") {
          hit = hit.slice(0, lim ?? undefined).map(r => ({ ...r }));
          return { data: single ? (hit[0] ?? null) : hit, error: null };
        }
        if (op === "update") {
          hit.forEach(r => Object.assign(r, payload));
          writes.push({ table, op, payload, ids: hit.map(r => r.id) });
          return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null };
        }
        const added = [].concat(payload).map(r => ({ id: nextId++, ...r }));
        rows.push(...added);
        writes.push({ table, op, payload });
        return { data: returning ? added.map(r => ({ id: r.id })) : null, error: null };
      }).then(ok, bad),
    };
    return q;
  };
  return { from, tables, writes };
}

const mailbox = () => { const sent = []; return { sender: "shop@example.com", sent, send: async (m) => { sent.push(m); } }; };
const art = (id, title, price) => ({ id, title, price, salePrice: null, image: `https://img.example.test/${id}.jpg`, isSold: false, category: "Ocean" });
// The shop: Klarna's highest price $2,800 and at most $300 off, unless said otherwise.
const shop = (settings = LINE) => fakeDb({
  Settings: [{ id: 1, couponDiscount: 15, ...settings }],
  Leads: [{ id: 7, email: "jane@example.com", coupon_code: "FK-1111-2222", coupon_used: false }],
  Orders: [],
  Clients: [],
  Artworks: [art("1", "Sunset Over the Keys", 3000), art("2", "Big Wave", 3500), art("3", "Small Wave", 2500), art("4", "Frida", 2000), art("5", "Mango", 1000)],
});
// The checkout's order as the browser sends it: a price of $1 a piece, which the server ignores.
const checkout = (titles, over = {}) => ({
  customer: { firstName: "Jane", lastName: "Smith", email: "jane@example.com", phone: "", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  orderRef: "FA-1752", couponCode: "", embedded: true, way: "klarna",
  items: titles.map(title => ({ title, amount: 1 })), total: titles.length,
  ...over,
});
const op = (name) => (db, body, mail = mailbox()) => STORE_OPS[name](db, { body }, mail);
const cartCard = op("cart-card"), cartPaid = op("cart-paid"), cartAgain = op("cart-again"), cartOther = op("cart-other");
const webhook = (db, id, mail = mailbox()) => STORE_OPS["stripe-event"](db, { body: { type: "checkout.session.completed", data: { object: { id } } } }, mail);
const kept = (out, over = {}) => ({ ref: out.ref, ids: out.ids, email: "jane@example.com", titles: out.lines.map(l => l.title), session: out.session, embedded: true, ...over });
const lineCents = (body) => { const out = []; for (let i = 0; body.has(`line_items[${i}][quantity]`); i++) out.push(Number(body.get(`line_items[${i}][price_data][unit_amount]`))); return out; };
const tagsOf = (body) => Object.fromEntries([...body].filter(([k]) => /^metadata\[/.test(k)).map(([k, v]) => [k.slice(9, -1), v]));
const typesOf = (body) => [...body].filter(([k]) => /^payment_method_types\[/.test(k)).map(([, v]) => v);

test("JUST OVER THE LINE: the Klarna page is the lower price, Klarna only; the rows keep the full price until paid; the checkout is told what is off", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const out = await cartCard(db, checkout(["Sunset Over the Keys"]));
  const [page] = stripe.pages();
  assert.deepEqual(lineCents(page), [280000], "$3,000 less $200: $2,800, the line");
  assert.deepEqual(typesOf(page), ["klarna"], "a Klarna page, never a card form");
  assert.deepEqual(tagsOf(page), { cart_ref: "FA-1752", order_ids: String(out.ids[0]), klarna_off: "20000", klarna_split: "20000" });
  assert.equal(page.get("payment_intent_data[description]"), "Fonkiart order FA-1752: Sunset Over the Keys · $200 off for Klarna", "what the shop sees in Stripe's list");
  assert.deepEqual(out.klarna, { off: 200, total: 2800, lines: [{ title: "Sunset Over the Keys", amount: 2800 }] });
  assert.deepEqual([out.total, out.lines], [3000, [{ title: "Sunset Over the Keys", amount: 3000 }]], "the order itself: the full price");
  const [row] = db.tables.Orders;
  assert.deepEqual([row.amount, row.status], [3000, "pending"], "unpaid, the row is the full price, so any other way pays that");
  assert.ok(row.notes.endsWith(CARD_NOTE) && !/Klarna/.test(row.notes), "no words of the offer before it is paid");
});

test("TOO FAR OVER, UNDER THE LINE, NO ADMIN NUMBERS: the Klarna page is the full price, and nothing is said", async () => {
  for (const [what, title, settings, cents] of [
    ["too far over", "Big Wave", LINE, 350000],
    ["under the line", "Small Wave", LINE, 250000],
    ["no Admin numbers", "Sunset Over the Keys", {}, 300000],
    ["only Klarna's highest price", "Sunset Over the Keys", { klarnaMax: 2800 }, 300000],
    ["only the most-off", "Sunset Over the Keys", { klarnaMostOff: 300 }, 300000],
  ]) {
    const stripe = fakeStripe();
    const out = await cartCard(shop(settings), checkout([title]));
    const [page] = stripe.pages();
    assert.deepEqual(lineCents(page), [cents], `${what}: the full price`);
    assert.deepEqual(typesOf(page), ["klarna"], `${what}: still Klarna's page`);
    assert.equal(tagsOf(page).klarna_off, undefined, `${what}: no offer on the page`);
    assert.equal(out.klarna, undefined, `${what}: nothing said`);
  }
});

test("COUPON PLUS OFFER: the coupon first, then the offer works from the coupon's total", async () => {
  const stripe = fakeStripe();
  const out = await cartCard(shop(), checkout(["Big Wave"], { couponCode: "FK-1111-2222" }));
  assert.equal(out.coupon, "FK-1111-2222", "the coupon counted");
  assert.deepEqual(out.lines, [{ title: "Big Wave", amount: 2975 }], "$3,500 less 15%: $2,975");
  assert.deepEqual(lineCents(stripe.pages()[0]), [279500], "$2,975 less $180 (175 rounded up to the next $10): $2,795");
  assert.deepEqual(out.klarna, { off: 180, total: 2795, lines: [{ title: "Big Wave", amount: 2795 }] });
  const stripe2 = fakeStripe();
  await cartCard(shop(), checkout(["Big Wave"]));
  assert.deepEqual(lineCents(stripe2.pages()[0]), [350000], "control: without the coupon, $3,500 is too far over");
});

test("TWO PIECES: the offer split across their amounts, so the cents add up exactly", async () => {
  const stripe = fakeStripe();
  const out = await cartCard(shop(), checkout(["Frida", "Mango"]));
  const [page] = stripe.pages();
  assert.deepEqual(lineCents(page), [186700, 93300], "$2,000 less $133, $1,000 less $67");
  assert.equal(stripe.last().amount_total, 280000, "$2,800 in all: $200 off exactly");
  assert.deepEqual(tagsOf(page).klarna_split, "13300,6700");
  assert.deepEqual(out.klarna, { off: 200, total: 2800, lines: [{ title: "Frida", amount: 1867 }, { title: "Mango", amount: 933 }] });
});

test("A BROWSER THAT SENDS ITS OWN DISCOUNT is ignored: the server works the offer out again, or there is none", async () => {
  const own = { klarna: { off: 2900, total: 100 }, klarnaOff: 2900, offer: { off: 290000, split: [290000] }, discount: 99, total: 1 };
  for (const [what, settings, way, cents, off] of [
    ["Klarna, the shop's offer", LINE, "klarna", 280000, 200],
    ["Klarna, no Admin numbers", {}, "klarna", 300000, undefined],
    ["a card", LINE, "card", 300000, undefined],
  ]) {
    const stripe = fakeStripe();
    const out = await cartCard(shop(settings), checkout(["Sunset Over the Keys"], { ...own, way }));
    assert.deepEqual(lineCents(stripe.pages()[0]), [cents], `${what}: the server's price`);
    assert.equal(out.klarna?.off, off, `${what}: only the server's offer is said`);
  }
});

test("CARDS, ZELLE AND THE REST pay the full price, whatever the Settings say", async () => {
  for (const way of ["card", undefined]) {
    const stripe = fakeStripe();
    const out = await cartCard(shop(), checkout(["Sunset Over the Keys"], { way }));
    const [page] = stripe.pages();
    assert.deepEqual(lineCents(page), [300000], `${way || "no way named"}: $3,000`);
    assert.equal(tagsOf(page).klarna_off, undefined);
    assert.equal(out.klarna, undefined);
  }
  // A Zelle order, from the checkout: the rows and the "order received" pair are the full price.
  const db = shop(), mail = mailbox();
  fakeStripe();
  await op("order")(db, { ...checkout(["Sunset Over the Keys"]), items: [{ title: "Sunset Over the Keys", amount: 3000 }], total: 3000 }, mail);
  assert.deepEqual(db.tables.Orders.map(r => r.amount), [3000]);
  // Opened with Klarna's offer, then paid with Zelle after all: the full price, the pair once.
  const db2 = shop(), mail2 = mailbox();
  fakeStripe();
  const saved = await cartCard(db2, checkout(["Sunset Over the Keys"]));
  assert.equal(saved.klarna.off, 200, "the Klarna page had the offer");
  await cartOther(db2, { ...kept(saved), method: "zelle" }, mail2);
  const [row] = db2.tables.Orders;
  assert.deepEqual([row.amount, row.status], [3000, "pending"], "Zelle: the full price");
  assert.ok(row.notes.endsWith(" · Paying by Zelle") && !/Klarna/.test(row.notes), row.notes);
  assert.equal(mail2.sent.length, 2, "the 'order received' pair, once");
  assert.ok(mail2.sent.every(m => m.htmlContent.includes("3,000")), "for $3,000");
});

test("PAID ON THE KLARNA PAGE: each row Paid at its own lower amount, its notes saying so as a coupon's do; the emails and the thank-you show what was paid; once", async () => {
  const stripe = fakeStripe();
  const db = shop(), mail = mailbox();
  const out = await cartCard(db, checkout(["Frida", "Mango"]));
  stripe.pay(out.session);
  const paid = await cartPaid(db, { ref: out.ref, session: out.session }, mail);
  assert.deepEqual([paid.paid, paid.total, paid.lines, paid.method], [true, 2800, [{ title: "Frida", amount: 1867 }, { title: "Mango", amount: 933 }], "klarna"]);
  const rows = db.tables.Orders;
  assert.deepEqual(rows.map(r => [r.amount, r.status, r.paid_method]), [[1867, "paid", "klarna"], [933, "paid", "klarna"]]);
  assert.match(rows[0].notes, /^Order Ref: FA-1752 · .* · \$133 off for Klarna · Paying by card$/, rows[0].notes);
  assert.match(rows[1].notes, / · \$67 off for Klarna · Paying by card$/, "each row its own share");
  assert.equal(mail.sent.length, 2, "one 'Paid' to the shop, one 'Payment received' to the buyer");
  assert.ok(mail.sent.every(m => /2,800/.test(m.subject + m.htmlContent) && !/3,000/.test(m.htmlContent)), "for $2,800, what was paid");
  assert.deepEqual(db.tables.Artworks.filter(a => a.isSold).map(a => a.title), ["Frida", "Mango"], "the pieces are SOLD");
  // Stripe's own message after: nothing again.
  const later = mailbox(), writes = db.writes.length;
  const again = await webhook(db, out.session, later);
  assert.deepEqual([again.paid, later.sent.length, db.writes.filter((w, n) => n >= writes && w.table === "Orders").length], [true, 0, 0]);
  assert.deepEqual(rows.map(r => r.amount), [1867, 933], "the amounts taken off once");
});

test("A WRONG AMOUNT is never taken as paid: the full price on an offer page, less than the offer, or an offer that doesn't add up", async () => {
  for (const [what, over] of [
    ["the full price, on a page made with the offer", { amount_total: 300000 }],
    ["$10 less than the page", { amount_total: 279000 }],
    ["an offer whose shares don't add up", (s) => ({ metadata: { ...s.metadata, klarna_split: "19000" } })],
  ]) {
    const stripe = fakeStripe();
    const db = shop(), mail = mailbox();
    const out = await cartCard(db, checkout(["Sunset Over the Keys"]));
    const page = stripe.sessions.get(out.session);
    stripe.pay(out.session, typeof over === "function" ? over(page) : over);
    const paid = await cartPaid(db, { ref: out.ref, session: out.session }, mail);
    assert.equal(paid.paid, false, what);
    assert.deepEqual([db.tables.Orders[0].status, db.tables.Orders[0].amount, mail.sent.length], ["pending", 3000, 0], `${what}: nothing written, nobody emailed`);
  }
});

test("BACK FROM KLARNA WITHOUT PAYING, then a card: the card page is the full price (the Klarna page vouches for the coupon's prices); Klarna again: the offer again", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout(["Big Wave"], { couponCode: "FK-1111-2222" }));
  assert.equal(first.klarna.total, 2795);
  const byCard = await cartAgain(db, kept(first, { way: "card" }));
  assert.equal(stripe.sessions.get(first.session).status, "expired", "the Klarna page closed first");
  assert.deepEqual(lineCents(stripe.pages()[1]), [297500], "the coupon's price, $2,975, in full");
  assert.deepEqual([byCard.klarna, tagsOf(stripe.pages()[1]).klarna_off], [undefined, undefined]);
  const byKlarna = await cartAgain(db, kept(byCard, { way: "klarna" }));
  assert.deepEqual(lineCents(stripe.pages()[2]), [279500], "Klarna again: $180 off again");
  assert.deepEqual(byKlarna.klarna, { off: 180, total: 2795, lines: [{ title: "Big Wave", amount: 2795 }] });
  stripe.pay(byKlarna.session);
  const paid = await cartPaid(db, { ref: first.ref, session: byKlarna.session });
  assert.deepEqual([paid.paid, db.tables.Orders[0].amount, db.tables.Orders.length], [true, 2795, 1], "paid at $2,795, still ONE order");
});

test("KLARNA REFUSED for its amount: the same calm line as before, no offer said, the row at the full price", async () => {
  fakeStripe({ refuse: () => ({ status: 400, code: "amount_too_large", message: "Amount is not within the range Klarna accepts" }) });
  const db = shop();
  const out = await cartCard(db, checkout(["Sunset Over the Keys"]));
  assert.deepEqual([out.refused, out.cardError, out.klarna], ["klarna", "Klarna isn't available for this amount. Please choose another way.", undefined]);
  assert.deepEqual(db.tables.Orders.map(r => r.amount), [3000]);
});

test("THE DATABASE REFUSES A LATER ROW: Stripe's message is answered 500 after the first row's emails; sent again, the rest turn Paid and nobody emails again", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const out = await cartCard(db, checkout(["Frida", "Mango"]));
  stripe.pay(out.session);
  const failing = fakeDb(db.tables, { failAt: { "Orders.update": 2 } }), mail = mailbox();
  await assert.rejects(webhook(failing, out.session, mail), (e) => e.status === 500, "Stripe is asked to send it again");
  assert.deepEqual(db.tables.Orders.map(r => [r.status, r.amount]), [["paid", 1867], ["pending", 1000]]);
  assert.equal(mail.sent.length, 2, "the first row moved: its emails went");
  const again = mailbox();
  const done = await webhook(db, out.session, again);
  assert.deepEqual([done.paid, again.sent.length], [true, 0], "the rest: Paid, and nobody emails again");
  assert.deepEqual(db.tables.Orders.map(r => [r.status, r.amount]), [["paid", 1867], ["paid", 933]], "each at its own lower amount");
});

test("Admin -> Settings -> Stripe: the two numbers, each with one plain sentence, empty by default; saved only once the database has them", () => {
  const form = read("src/admin/SettingsForm.jsx");
  const stripeBox = form.slice(form.indexOf('section === "stripe"'), form.indexOf('section === "social"'));
  assert.match(stripeBox, /<label>Klarna&apos;s highest price \(\$\)<\/label>/);
  assert.match(stripeBox, /<label>Most we&apos;ll take off so Klarna fits \(\$\)<\/label>/);
  assert.match(stripeBox, /value=\{s\.klarnaMax \?\? ""\}/, "empty unless set");
  assert.match(stripeBox, /value=\{s\.klarnaMostOff \?\? ""\}/);
  assert.match(stripeBox, /The highest price Klarna takes, as your Stripe settings show it\./);
  assert.match(stripeBox, /When a piece is just over that price, the checkout offers up to this much off to pay with Klarna\./);
  assert.match(form, /const klarnaReady = "klarnaMax" in data\.settings && "klarnaMostOff" in data\.settings;/);
  assert.doesNotMatch(read("src/constants.js"), /klarna/i, "not in the shop's defaults, so a save before the database has them sends neither");
  const sql = read("db/2026-11-22-klarna-offer.sql");
  assert.match(sql, /alter table public\."Settings" add column if not exists "klarnaMax" numeric;/);
  assert.match(sql, /alter table public\."Settings" add column if not exists "klarnaMostOff" numeric;/);
});
