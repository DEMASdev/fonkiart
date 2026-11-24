// "Left in the cart" on Admin -> Orders (Andy, 2026-11-23, "all 8": nobody saw who left art in their
// cart), with "Send a coupon" on each person.
//  1. The list (cartsForAdmin): the morning email's own people (cartMemory.js cartsLeft), newest first,
//     with their coupon; a list that can't be read says so, never an empty one.
//  2. The sending (cartCouponSend): one person, one email, the shop's own prices, ONE in 30 days
//     whichever list it went from, and nothing to a cart that isn't there any more.
//  3. Admin's list itself (CartsLeft.jsx), run from the live file, and the morning email's way into it.
// How much off, and the email: couponMail.js, the same for both lists (tests/couponSend.test.js).
// FAKE data only: every person, email and code here is made up; the database and Brevo are stand-ins,
// and nothing is sent anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { transformWithOxc } from "vite";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
// Loaded when each test runs, so a shop without it fails each test by name, not the file.
const load = async (p) => { assert.ok(existsSync(new URL(p, root)), `${p} is there`); return import(new URL(p, root).href); };
const server = () => load("api/_lib/cartCoupon.js");
const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;
process.env.SUPABASE_SERVICE_ROLE_KEY = ["made", "up", "for", "tests"].join("-"); // the server's key: a coupon email's Unsubscribe link is sealed with it
const NOW = new Date("2026-11-23T21:20:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
async function quiet(fn) {
  const keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try { return await fn(); } finally { Object.assign(console, keep); }
}

// ── stand-ins ───────────────────────────────────────────────────

const LEADS = ["id", "email", "source", "coupon_code", "coupon_used", "created_at", "cart", "cart_at", "coupon_size"];
const without = (...gone) => LEADS.filter(c => !gone.includes(c));

// supabase-js as the shop uses it. A table knows its columns: one it doesn't have is refused as
// PostgREST refuses it. fail: { "Orders": "words" } refuses every read of that table.
function fakeDb(tables, { leads = LEADS, fail = {}, notes = {} } = {}) {
  const files = { ...notes }, writes = [], reads = [];
  let nextId = 1000;
  const from = (table) => {
    let op = "select", payload = null, lim = null, single = false, cols = "*", returning = null, sort = null;
    const tests = [], asked = [];
    const b = {
      select(c = "*") { if (op === "select") cols = c; else returning = c; return b; },
      insert(v) { op = "insert"; payload = v; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { asked.push(k); tests.push(r => String(r[k]) === String(v)); return b; },
      in(k, vs) { asked.push(k); tests.push(r => vs.map(String).includes(String(r[k]))); return b; },
      not(k, o, v) { assert.equal(o, "is"); asked.push(k); tests.push(r => (v === null ? r[k] != null : r[k] !== v)); return b; },
      order(k, { ascending = true } = {}) { sort = { k, way: ascending ? 1 : -1 }; return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(ok, bad) { return Promise.resolve().then(run).then(ok, bad); },
    };
    function run() {
      if (op === "select") reads.push(table);
      if (fail[table]) return { data: null, error: { message: fail[table] } };
      const has = table === "Leads" ? leads : null;
      const named = [...asked, ...(cols === "*" || op !== "select" ? [] : cols.split(",").map(s => s.trim())), ...[].concat(payload || []).flatMap(Object.keys)];
      const missing = has && named.find(k => !has.includes(k));
      if (missing) return { data: null, error: { code: "42703", message: `column ${table}.${missing} does not exist` } };
      const rows = (tables[table] ||= []);
      if (op === "insert") {
        const added = [].concat(payload).map(r => ({ id: nextId++, ...r }));
        rows.push(...added);
        writes.push({ table, op, payload: structuredClone(payload) });
        return { data: returning ? added.map(r => ({ id: r.id })) : null, error: null };
      }
      let hit = rows.filter(r => tests.every(t => t(r)));
      if (op === "update") {
        hit.forEach(r => Object.assign(r, structuredClone(payload)));
        writes.push({ table, op, payload: structuredClone(payload) });
        return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null };
      }
      if (sort) hit = [...hit].sort((x, y) => (String(x[sort.k] ?? "") < String(y[sort.k] ?? "") ? -1 : 1) * sort.way);
      const shown = (r) => (has ? Object.fromEntries(has.map(k => [k, r[k] ?? null])) : { ...r });
      const out = hit.slice(0, lim ?? undefined).map(shown);
      return { data: single ? out[0] ?? null : out, error: null };
    }
    return b;
  };
  const storage = {
    async createBucket() { return { data: {}, error: null }; },
    from: () => ({
      async list(dir) { return { data: Object.keys(files).filter(f => f.startsWith(`${dir}/`)).map(f => ({ name: f.slice(dir.length + 1) })), error: null }; },
      async download(path) {
        if (fail.notes) return { data: null, error: { message: fail.notes } };
        return files[path] == null ? { data: null, error: { message: "Object not found" } } : { data: new Blob([files[path]]), error: null };
      },
      async upload(path, blob) { if (fail.upload) return { data: null, error: { message: fail.upload } }; files[path] = await blob.text(); return { data: { path }, error: null }; },
    }),
  };
  return { from, storage, tables, writes, reads, fail, note: () => JSON.parse(files["coupons-sent.json"] || "null"),
    lead: (email) => tables.Leads.find(l => l.email === email), leadWrites: () => writes.filter(w => w.table === "Leads") };
}
const mailbox = () => { const mail = { sender: "shop@fonkiart.com", sent: [], fail: null, send: async (m) => { if (mail.fail) throw new Error(mail.fail); mail.sent.push(m); } }; return mail; };

const ART = () => [
  { id: 12, title: "Flamingo Party", price: 950, salePrice: null, image: "https://img.test/flamingo.jpg", isSold: false },
  { id: 13, title: "Mangrove Light", price: "1200", salePrice: "990", image: "https://img.test/mangrove.jpg", isSold: false }, // on sale
  { id: 14, title: "Sold Sunset", price: 700, image: "https://img.test/sunset.jpg", isSold: true },
  { id: 15, title: "Ask About Me", price: null, image: "https://img.test/ask.jpg", isSold: false },
];
// A saved cart holds what the browser had when it was saved: only its ids are believed.
const cart = (...ids) => ids.map(id => ({ id, title: "as it was saved", price: 1, image: "https://img.test/old.jpg" }));
const ANA = "ana.test@example.com", BO = "bo.test@example.com", CY = "cy.test@example.com";
const lead = (id, email, over = {}) => ({ id, email, source: "welcome-popup", coupon_code: null, coupon_used: false, created_at: ago(20 * DAY), cart: null, cart_at: null, coupon_size: null, ...over });
const PEOPLE = () => [
  lead(1, BO, { coupon_code: "FK-TEST-BBBB", coupon_used: true, cart: cart(12), cart_at: ago(3 * DAY) }),
  lead(2, ANA, { coupon_code: "FK-TEST-AAAA", cart: cart(12, 13, 14), cart_at: ago(2 * HOUR) }),
  lead(3, CY, { source: "buyer-cart", cart: cart(13, 15), cart_at: ago(10 * DAY) }),
  lead(4, "sold.test@example.com", { cart: cart(14), cart_at: ago(HOUR) }),                 // all sold
  lead(5, "bought.test@example.com", { cart: cart(12), cart_at: ago(5 * DAY) }),            // ordered since
  lead(6, "old.test@example.com", { cart: cart(12), cart_at: ago(31 * DAY) }),              // too long ago
  lead(7, "none.test@example.com", { coupon_code: "FK-TEST-GGGG" }),                        // no cart
];
const ORDERS = () => [{ id: 90, client_email: "Bought.Test@example.com", item_title: "Flamingo Party", status: "pending", created_at: ago(4 * DAY), notes: "Order Ref: FA-1700 · Bea Test", ship_name: "Bea Test" }];
const shop = (opts = {}, over = {}) => fakeDb({ Leads: PEOPLE(), Artworks: ART(), Orders: ORDERS(), Clients: [{ name: "Bo Test", email: "BO.test@example.com" }], Settings: [{ id: 1, couponDiscount: 15 }], ...over }, opts);
const sentNote = (over) => ({ notes: { "coupons-sent.json": JSON.stringify(over) } });

// ── 1. the list ─────────────────────────────────────────────────

test("the list: everyone with art left in their cart, the last saved first, with the shop's own pieces and prices, and their coupon", async () => {
  const { cartsForAdmin } = await server();
  const db = shop();
  const { carts, choose, percent } = await cartsForAdmin(db, NOW);
  assert.deepEqual([choose, percent], [true, 15]);
  assert.deepEqual(carts.map(c => c.email), [ANA, BO, CY], "not the sold one, the one who bought, the 31-day-old one, or the one with no cart");
  assert.deepEqual(carts[0], {
    email: ANA, name: "", at: ago(2 * HOUR), total: 1940,
    pieces: [{ id: 12, title: "Flamingo Party", price: 950, image: "https://img.test/flamingo.jpg" }, { id: 13, title: "Mangrove Light", price: 990, image: "https://img.test/mangrove.jpg" }],
    sentAt: null, said: null, used: false, code: "FK-TEST-AAAA", sizes: [{ percent: 15 }],
  }, "the shop's titles, pictures and sale price, never what was saved; the sold piece is out");
  assert.deepEqual([carts[1].name, carts[1].used, carts[1].code], ["Bo Test", true, "FK-TEST-BBBB"], "a code used already says so");
  assert.deepEqual([carts[2].code, carts[2].sizes, carts[2].pieces.map(p => p.price)], [null, [{ percent: 15 }], [990, null]], "no code yet: the shop's %; a piece with no price says so");
  assert.deepEqual(db.writes, [], "looking changes nothing");
});

test("the list: when the last one went and how much, from either list, for 30 days; a size of their own is what their code gives", async () => {
  const { cartsForAdmin } = await server();
  const db = shop(sentNote({ [`cart:${ANA}`]: { at: ago(DAY), to: ANA, said: "$300 off" }, "FA-1650": { at: ago(8 * DAY), to: BO.toUpperCase(), said: "20% off" }, [`cart:${CY}`]: { at: ago(31 * DAY), to: CY, said: "15% off" } }));
  db.lead(ANA).coupon_size = [{ percent: 15 }, { dollars: 300, of: 1940 }];
  const { carts } = await cartsForAdmin(db, NOW);
  assert.deepEqual(carts.map(c => [c.email, c.sentAt, c.said]), [[ANA, ago(DAY), "$300 off"], [BO, ago(8 * DAY), "20% off"], [CY, null, null]]);
  assert.deepEqual(carts[0].sizes, [{ percent: 15 }, { dollars: 300, of: 1940 }]);
});

test("the list: nobody, and before its database change: empty, with nothing more asked", async () => {
  const { cartsForAdmin } = await server();
  assert.deepEqual(await cartsForAdmin(shop({}, { Leads: [] }), NOW), { carts: [] });
  const before = shop({ leads: without("cart", "cart_at") });
  assert.deepEqual(await cartsForAdmin(before, NOW), { carts: [] });
  assert.deepEqual(before.reads, ["Leads"]);
  // The amount's own database change not run yet: the list is there, and no amount can be chosen.
  const { carts, choose } = await cartsForAdmin(shop({ leads: without("coupon_size") }), NOW);
  assert.deepEqual([carts.length, choose], [3, false]);
});

test("the list: one that can't be read says so, never 'nobody'; the morning email's own reading stays as it was", async () => {
  const { cartsForAdmin } = await server();
  const { cartsLeft } = await load("api/_lib/cartMemory.js");
  for (const table of ["Leads", "Orders", "Artworks"]) {
    await assert.rejects(cartsForAdmin(shop({ fail: { [table]: `${table} are down` } }), NOW), new RegExp(`${table} are down`), table);
    assert.deepEqual(await quiet(() => cartsLeft(shop({ fail: { [table]: `${table} are down` } }), { now: NOW })), [], `${table}: the email just has none`);
  }
  assert.equal((await cartsForAdmin(shop({ fail: { Clients: "Clients are down" } }), NOW).catch(() => ({ carts: [] }))).carts.length, 3, "a name is a nicety: still the whole list");
});

// ── 2. the sending ──────────────────────────────────────────────

test("$300 to someone who left two pieces: saved on their own code first, ONE email with exactly their pieces, and the list then says when and how much", async () => {
  const { cartsForAdmin, cartCouponSend } = await server();
  const { readSlot } = await load("api/_lib/emails.js");
  const db = shop();
  const mail = mailbox();
  const out = await cartCouponSend(db, { email: ` ${ANA.toUpperCase()} `, dollars: 300 }, mail, NOW);
  assert.deepEqual(out, { sent: true, sentAt: NOW.toISOString(), to: ANA, code: "FK-TEST-AAAA", said: "$300 off", discount: 15, noted: true });
  assert.deepEqual(db.lead(ANA).coupon_size, [{ percent: 15 }, { dollars: 300, of: 1940 }], "of the two pieces' own prices");
  assert.equal(mail.sent.length, 1);
  assert.deepEqual([mail.sent[0].to, mail.sent[0].subject], [ANA, "Still thinking about your 2 pieces? Here's $300 off — Fonkiart"]);
  assert.deepEqual(readSlot(mail.sent[0].htmlContent).titles, ["Flamingo Party", "Mangrove Light"], "exactly theirs, not the sold one");
  assert.ok(mail.sent[0].htmlContent.includes("FK-TEST-AAAA"));
  assert.deepEqual(db.note(), { [`cart:${ANA}`]: { at: NOW.toISOString(), to: ANA, said: "$300 off" } });
  const [ana] = (await cartsForAdmin(db, NOW)).carts;
  assert.deepEqual([ana.sentAt, ana.said], [NOW.toISOString(), "$300 off"]);
});

test("someone with no code yet gets their own, on the row they already have; nothing chosen goes at the shop's %", async () => {
  const { cartCouponSend } = await server();
  const db = shop();
  const mail = mailbox();
  const out = await cartCouponSend(db, { email: CY }, mail, NOW);
  assert.match(db.lead(CY).coupon_code, /^FK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.deepEqual([out.sent, out.code, out.said, db.lead(CY).coupon_size, db.tables.Leads.length], [true, db.lead(CY).coupon_code, "15% off", null, 7]);
  assert.match(mail.sent[0].htmlContent, /15% off your order/);
});

test("the prices and pieces are the shop's own: whatever else is sent with the tap doesn't count", async () => {
  const { cartCouponSend } = await server();
  const db = shop();
  await cartCouponSend(db, { email: ANA, dollars: 300, total: 9, of: 9, price: 1, pieces: [{ id: 99, title: "Something else", price: 5 }], name: "Someone Else", sizes: [{ percent: 99 }], now: 0 }, mailbox(), NOW);
  assert.deepEqual(db.lead(ANA).coupon_size, [{ percent: 15 }, { dollars: 300, of: 1940 }]);
  await assert.rejects(cartCouponSend(shop(), { email: ANA, dollars: 1940 }, mailbox(), NOW), (e) => e.status === 400 && /Type a number from 1 to 1,939\. Nothing was sent\./.test(e.message));
  await assert.rejects(cartCouponSend(shop(), { email: CY, dollars: 50 }, mailbox(), NOW), (e) => e.status === 400, "a piece with no price: only the % works");
});

test("ONE in 30 days, whichever list it went from; after that, again", async () => {
  const { cartCouponSend } = await server();
  for (const [what, notes] of [["this list", { [`cart:${ANA}`]: { at: ago(29 * DAY), to: ANA, said: "$300 off" } }], ["Didn't finish paying", { "FA-1650": { at: ago(29 * DAY), to: "Ana.Test@Example.com", said: "$300 off" } }]]) {
    const db = shop(sentNote(notes));
    const mail = mailbox();
    assert.deepEqual(await cartCouponSend(db, { email: ANA, dollars: 400 }, mail, NOW), { sent: false, why: "sent", sentAt: ago(29 * DAY), said: "$300 off" }, what);
    assert.deepEqual([mail.sent, db.writes], [[], []], `${what}: nothing sent, nothing changed`);
  }
  const later = shop(sentNote({ [`cart:${ANA}`]: { at: ago(31 * DAY), to: ANA, said: "$300 off" }, "FA-1650": { at: ago(40 * DAY), to: ANA, said: "15% off" }, "FA-1651": { at: ago(DAY), to: BO, said: "15% off" } }));
  assert.equal((await cartCouponSend(later, { email: ANA, dollars: 400 }, mailbox(), NOW)).sent, true);
  assert.deepEqual(Object.keys(later.note()).sort(), ["FA-1650", "FA-1651", `cart:${ANA}`].sort(), "the rest of the note is kept");
  // A note that is there but can't be read stops the send: never a second.
  const blind = shop({ fail: { notes: "Storage is down" } });
  const mail = mailbox();
  await assert.rejects(cartCouponSend(blind, { email: ANA, dollars: 300 }, mail, NOW), /couldn't check whether one already went, so nothing was sent/);
  assert.deepEqual([mail.sent, blind.writes], [[], []]);
});

test("the other list knows too: one sent from here shows in the same note, by the person's own email", async () => {
  const { cartCouponSend } = await server();
  const db = shop();
  await cartCouponSend(db, { email: ANA, percent: 20 }, mailbox(), NOW);
  assert.equal(db.note()[`cart:${ANA}`].to, ANA);
  assert.deepEqual(await cartCouponSend(db, { email: ANA, percent: 30 }, mailbox(), new Date(NOW.getTime() + DAY)), { sent: false, why: "sent", sentAt: NOW.toISOString(), said: "20% off" });
});

test("nothing to a cart that isn't there any more (bought, emptied, too old, all sold, never there), and no code is made for it", async () => {
  const { cartCouponSend } = await server();
  for (const email of ["bought.test@example.com", "none.test@example.com", "old.test@example.com", "sold.test@example.com", "nobody.test@example.com"]) {
    const db = shop();
    const mail = mailbox();
    assert.deepEqual(await cartCouponSend(db, { email, percent: 20 }, mail, NOW), { sent: false, why: "gone" }, email);
    assert.deepEqual([mail.sent, db.writes], [[], []], email);
  }
  for (const email of [undefined, "", "not an email", 5, { a: 1 }]) await assert.rejects(cartCouponSend(shop(), { email }, mailbox(), NOW), (e) => e.status === 400, String(email));
  await assert.rejects(cartCouponSend(shop({ fail: { Orders: "Orders are down" } }), { email: ANA }, mailbox(), NOW), /Orders are down/, "can't tell whether they bought it: nothing is sent");
});

test("their code already used, or giving more already: nothing is sent; an email that doesn't go puts their code back as it was", async () => {
  const { cartCouponSend } = await server();
  const db = shop();
  const mail = mailbox();
  assert.deepEqual(await cartCouponSend(db, { email: BO, percent: 20 }, mail, NOW), { sent: false, why: "used", code: "FK-TEST-BBBB" });
  db.lead(ANA).coupon_size = [{ dollars: 400, of: 1940 }];
  assert.deepEqual(await cartCouponSend(db, { email: ANA, dollars: 300 }, mail, NOW), { sent: false, why: "less", now: "$400 off", code: "FK-TEST-AAAA" });
  assert.deepEqual([mail.sent, db.writes], [[], []]);
  mail.fail = "Brevo is down";
  await assert.rejects(quiet(() => cartCouponSend(db, { email: ANA, dollars: 500 }, mail, NOW)), /Brevo is down/);
  assert.deepEqual([db.lead(ANA).coupon_size, db.note()], [[{ dollars: 400, of: 1940 }], null], "as it was, and not noted as sent");
  mail.fail = null;
  assert.equal((await cartCouponSend(db, { email: ANA, dollars: 500 }, mail, NOW)).sent, true, "and the next tap works");
  const stuck = shop({ fail: { upload: "Storage is full" } });
  assert.equal((await quiet(() => cartCouponSend(stuck, { email: ANA, percent: 20 }, mailbox(), NOW))).noted, false, "sent, but not noted: it says so");
});

test("nothing is automatic, and only the admin door calls it: one place on the server, one button in Admin", async () => {
  const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.jsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const files = [...walk("api"), ...walk("src")];
  assert.deepEqual(files.filter(f => /\bcartCouponSend\b/.test(read(f))), ["api/_lib/cartCoupon.js", "api/admin.js"]);
  assert.deepEqual(files.filter(f => /"cart-coupon-send"/.test(read(f))), ["api/admin.js", "src/admin/CartsLeft.jsx"]);
  assert.deepEqual(files.filter(f => /"carts-left"/.test(read(f))), ["api/admin.js", "src/admin/CartsLeft.jsx"]);
  const door = read("api/admin.js");
  const login = door.indexOf("Admin login required");
  for (const kind of ["carts-left", "cart-coupon-send"]) assert.ok(login > 0 && door.indexOf(`body.kind === "${kind}"`) > login, `${kind}: behind the admin login`);
  assert.equal((read("src/admin/CartsLeft.jsx").match(/adminAction\("cart-coupon-send"/g) || []).length, 1);
});

// ── 3. Admin's list, and the way into it ────────────────────────

// A component drawn by itself, its state kept between draws (as tests/couponSend.test.js draws Admin's
// boxes): each import of the file becomes a read from the stand-ins given, and one with none fails.
let drawing = null;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const React = {
  useState(init) {
    const d = drawing, n = d.at++;
    if (!(n in d.hooks)) d.hooks[n] = typeof init === "function" ? init() : init;
    return [d.hooks[n], (v) => { d.hooks[n] = typeof v === "function" ? v(d.hooks[n]) : v; d.draw(); }];
  },
  useEffect(fn, deps) { const d = drawing, n = d.at++; if (d.hooks[n] && same(d.hooks[n], deps)) return; d.hooks[n] = deps; d.effects.push(fn); },
  useRef(init) { const d = drawing, n = d.at++; return (d.hooks[n] ||= { current: init }); },
};
const FRAGMENT = Symbol("Fragment");
const jsx = (type, props) => ({ type, props: props || {} });
globalThis.__cartCouponTest = {};
let loads = 0;
async function component(file, given) {
  if (!existsSync(new URL(file, root))) return assert.fail(`${file} isn't there`);
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const key = `${file} ${++loads}`;
  const all = globalThis.__cartCouponTest[key] = { react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: FRAGMENT }, ...given };
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in all)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__cartCouponTest[${JSON.stringify(key)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
function draw(Component, props) {
  const d = { hooks: [], effects: [], at: 0, tree: null, drawn: 0 };
  const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n === "object"
    ? typeof n.type === "function" ? flat(n.type(n.props)) : n.type === FRAGMENT ? flat(n.props.children) : [{ type: n.type, props: n.props, children: flat(n.props.children) }]
    : [String(n)];
  d.draw = () => {
    const outer = drawing; drawing = d; d.at = 0;
    try { d.tree = { type: "#", props: {}, children: flat(Component(d.props)) }; } finally { drawing = outer; }
    for (const run of d.effects.splice(0)) run();
  };
  d.props = props;
  d.draw();
  const find = (want, n = d.tree) => typeof n === "string" ? [] : [...(want(n) ? [n] : []), ...n.children.flatMap(x => find(want, x))];
  const text = (n = d.tree) => typeof n === "string" ? n : n.children.map(x => text(x)).join(n.type === "li" || n.type === "div" || n.type === "#" ? " " : "");
  const words = (n) => text(n).replace(/\s+/g, " ").trim();
  return { find, text: words, give: (over) => { d.props = { ...d.props, ...over }; d.draw(); },
    buttons: (label, n = d.tree) => find(x => x.type === "button" && words(x) === label, n),
    people: () => find(n => n.type === "li" && n.props.className === "o-cart") };
}
const settle = async () => { for (let k = 0; k < 6; k++) await new Promise(r => setImmediate(r)); };

// The list as the server answers it (shape of cartsForAdmin), three people.
const PIECES = { flamingo: { id: 12, title: "Flamingo Party", price: 950, image: "https://img.test/flamingo.jpg" }, mangrove: { id: 13, title: "Mangrove Light", price: 990, image: "https://img.test/mangrove.jpg" }, ask: { id: 15, title: "Ask About Me", price: null, image: null } };
const CARTS = () => [
  { email: ANA, name: "", pieces: [PIECES.flamingo, PIECES.mangrove], total: 1940, at: new Date(Date.now() - 2 * HOUR - 1000).toISOString(), sentAt: null, said: null, used: false, code: "FK-TEST-AAAA", sizes: [{ percent: 15 }] },
  { email: BO, name: "Bo Test", pieces: [PIECES.flamingo], total: 950, at: new Date(Date.now() - 3 * DAY - 1000).toISOString(), sentAt: null, said: null, used: true, code: "FK-TEST-BBBB", sizes: [{ percent: 15 }] },
  { email: CY, name: "Cy Test", pieces: [PIECES.ask, PIECES.mangrove], total: 990, at: new Date(Date.now() - 10 * DAY - 1000).toISOString(), sentAt: "2026-11-20T16:00:00Z", said: "20% off", used: false, code: "FK-TEST-CCCC", sizes: [{ percent: 20 }] },
];
// wish: the list the morning email's link asked for. answers: by kind, what the server says.
async function list({ answers = {}, wish = null, props = {} } = {}) {
  const calls = [], done = [], asked = [];
  const CartsLeft = await component("src/admin/CartsLeft.jsx", {
    "../lib/adminDb": { adminAction: async (kind, body) => { calls.push([kind, body]); const a = answers[kind]; const v = typeof a === "function" ? a(body) : a; if (v instanceof Error) throw v; return v ?? { carts: CARTS(), choose: true, percent: 15 }; } },
    "../lib/adminLink": { wantsOpenList: (l) => l === wish, doneOpenList: () => done.push(1) },
    "../lib/agoWords": await load("src/lib/agoWords.js"),
    "./ArtThumb": { default: ({ art }) => jsx("thumb", { image: art.image }) },
    "./CouponAsk": { default: (p) => { asked.push(p); return jsx("ask", { ...p }); } },
  });
  const screen = draw(CartsLeft, { search: "", show: true, percent: 15, ...props });
  await settle();
  return { screen, calls, done, asked, ask: () => screen.find(n => n.type === "ask"), open: () => screen.find(n => n.type === "button" && n.props["aria-expanded"] !== undefined)[0].props.onClick() };
}

test("Admin: closed until tapped, with how many; open, each person with who, their pieces, how long ago, and the button", async () => {
  const l = await list();
  assert.deepEqual(l.calls, [["carts-left", undefined]]);
  assert.match(l.screen.text(), /^Left in the cart ?3/);
  assert.equal(l.screen.people().length, 0, "closed");
  l.open();
  const [ana, bo, cy] = l.screen.people();
  assert.equal(l.screen.text(ana).replace(/ ?@/, "@"), `${ANA} 2 hours ago Flamingo Party $950 Mangrove Light $990 Total $1,940 ✉ Send a coupon`);
  assert.match(l.screen.text(bo), /^Bo Test bo\.test ?@example\.com 3 days ago Flamingo Party \$950 Coupon already used$/, "one piece: no total");
  assert.match(l.screen.text(cy), /^Cy Test cy\.test ?@example\.com 10 days ago Ask About Me Mangrove Light \$990 Coupon sent Nov 20 · 20% off$/, "a piece with no price: no total; sent: a plain line");
  assert.equal(l.screen.buttons("✉ Send a coupon").length, 1);
  assert.deepEqual(l.screen.find(n => n.type === "button", cy), [], "sent: nothing to tap");
  assert.deepEqual(l.screen.find(n => n.type === "thumb", ana).map(n => n.props.image), [PIECES.flamingo.image, PIECES.mangrove.image]);
});

test("Admin: the tap asks first, with their pieces and the server's word on amounts; only Send sends, once, and the row then says so", async () => {
  let answer;
  const l = await list({ answers: { "cart-coupon-send": () => answer } });
  l.open();
  l.screen.buttons("✉ Send a coupon")[0].props.onClick();
  assert.equal(l.calls.length, 1, "asking sends nothing");
  const [ask] = l.ask();
  assert.deepEqual([ask.props.to, ask.props.coupon.pieces, ask.props.coupon.code, ask.props.shop.choose, ask.props.shop.percent, ask.props.percent], [ANA, CARTS()[0].pieces, "FK-TEST-AAAA", true, 15, 15]);
  ask.props.onCancel();
  assert.deepEqual([l.ask().length, l.calls.length], [0, 1], "Cancel: nothing");
  l.screen.buttons("✉ Send a coupon")[0].props.onClick();
  answer = { sent: true, sentAt: "2026-11-23T21:20:00Z", to: ANA, code: "FK-TEST-AAAA", said: "$300 off", noted: true };
  const { onSend } = l.ask()[0].props;
  const sending = [onSend({ dollars: 300 }), onSend({ dollars: 300 })];
  assert.equal(l.screen.buttons("Sending…")[0].props.disabled, true, "on its way: can't be tapped again");
  await Promise.all(sending);
  assert.deepEqual(l.calls.slice(1), [["cart-coupon-send", { email: ANA, dollars: 300 }]]);
  const row = l.screen.text(l.screen.people()[0]);
  assert.match(row, /Coupon sent Nov 23 · \$300 off ?✓ Coupon FK-TEST-AAAA \(\$300 off\) sent to ana\.test@example\.com\.$/);
  assert.deepEqual(l.screen.find(n => n.type === "button", l.screen.people()[0]), [], "never a second");
});

test("Admin: every other answer is said on that row, in plain words; nothing is claimed sent that wasn't", async () => {
  for (const [answer, words, keepsButton] of [
    [{ sent: true, sentAt: "2026-11-23T21:20:00Z", to: ANA, code: "FK-TEST-AAAA", said: "15% off", noted: false }, /Sent to ana\.test@example\.com, but the shop could not save that it was sent\. After a reload this row may show the button again: don't send a second one\./, false],
    [{ sent: false, why: "sent", sentAt: "2026-11-21T16:00:00Z", said: "20% off" }, /Coupon sent Nov 21 · 20% off ?A coupon already went to them on Nov 21, so nothing more was sent\./, false],
    [{ sent: false, why: "used", code: "FK-TEST-AAAA" }, /Coupon already used ?Their coupon FK-TEST-AAAA was already used, so nothing was sent\./, true],
    [{ sent: false, why: "less", now: "$400 off", code: "FK-TEST-AAAA" }, /Their coupon already gives \$400 off, so it can't be less\. Nothing was sent\./, true],
    [{ sent: false, why: "gone" }, /Their cart has changed since \(bought, emptied or sold\), so nothing was sent\./, true],
    [new Error("Choosing the amount waits for one database change, so nothing was sent."), /Could not send the coupon \(Choosing the amount waits for one database change, so nothing was sent\.\)\./, true],
  ]) {
    const l = await list({ answers: { "cart-coupon-send": answer } });
    l.open();
    l.screen.buttons("✉ Send a coupon")[0].props.onClick();
    await l.ask()[0].props.onSend({});
    assert.match(l.screen.text(l.screen.people()[0]), words);
    assert.equal(l.screen.find(n => n.type === "button", l.screen.people()[0]).length > 0, keepsButton, String(words));
    if (!keepsButton || answer.why === "used") continue;
    l.screen.buttons("✉ Send a coupon")[0].props.onClick();
    await l.ask()[0].props.onSend({});
    assert.equal(l.calls.filter(([k]) => k === "cart-coupon-send").length, 2, `answered, so it can be sent again: ${words}`);
  }
  // A code used already only explains; there is no question to send.
  const l = await list();
  l.open();
  l.screen.buttons("Coupon already used")[0].props.onClick();
  assert.match(l.screen.text(), /Their coupon FK-TEST-BBBB was already used, so there is nothing to send\. To send it, reset it under Leads first\./);
  assert.equal(l.ask().length, 0);
  l.screen.buttons("Close")[0].props.onClick();
  assert.doesNotMatch(l.screen.text(), /reset it under Leads/);
});

test("Admin: the search box, the filter, nobody, and a list that couldn't be loaded", async () => {
  const l = await list({ props: { search: "BO T" } });
  l.open();
  assert.deepEqual(l.screen.people().length, 1);
  l.screen.give({ search: "mangrove" });
  assert.equal(l.screen.people().length, 2, "by a piece");
  l.screen.give({ search: "nothing like it" });
  assert.equal(l.screen.text(), "");
  l.screen.give({ search: "", show: false });
  assert.equal(l.screen.text(), "", "filtered to another status");
  l.screen.give({ show: true });
  assert.equal(l.screen.people().length, 3);
  assert.equal((await list({ answers: { "carts-left": { carts: [] } } })).screen.text(), "", "nobody: not there at all");
  const down = await quiet(() => list({ answers: { "carts-left": new Error("Server error") } }));
  assert.equal(down.screen.text(), "Couldn't load who left art in their cart. Reload the page to try again.");
});

test("Admin: opened from the morning email's link, it is open once loaded, and only that list", async () => {
  const l = await list({ wish: "carts" });
  assert.equal(l.screen.people().length, 3, "open");
  assert.equal(l.done.length, 1, "once");
  l.screen.give({ show: false });
  l.screen.give({ show: true });
  assert.equal(l.done.length, 1, "...and not again");
  const other = await list({ wish: "unfinished" });
  assert.deepEqual([other.screen.people().length, other.done.length], [0, 0]);
});

test("the morning email leads to this list; the other list's link is as it was", async () => {
  const link = await load("src/lib/adminLink.js");
  const T = await load("api/_lib/emails.js");
  assert.equal(link.cartsLink("https://fonkiart.com"), "https://fonkiart.com/?admin=carts");
  assert.equal(link.unfinishedLink("https://fonkiart.com"), "https://fonkiart.com/?admin=unfinished");
  for (const [search, want] of [["?admin=carts", "carts"], ["?admin=unfinished", "unfinished"], ["?admin=orders", null], ["", null], ["?admin=toString", null]]) assert.equal(link.readAdminLink(search), want, search);
  assert.equal(link.withoutAdminLink("?admin=carts&utm_source=email"), "?utm_source=email");
  const html = T.reminderStore({ requests: [], orders: [], unfinished: [{ name: "Una Test", email: BO, pieces: [{ title: "Flamingo Party", amount: 950 }], total: 950 }], carts: [{ email: ANA, name: "", pieces: [PIECES.flamingo], total: 950, hours: 30 }] });
  const [unfinished, left] = [html.indexOf("Didn't finish paying"), html.indexOf("Left in the cart")];
  assert.ok(unfinished > 0 && left > unfinished);
  assert.ok(html.slice(unfinished, left).includes('href="https://fonkiart.com/?admin=unfinished"') && !html.slice(unfinished, left).includes("admin=carts"));
  assert.ok(html.slice(left).includes('href="https://fonkiart.com/?admin=carts"') && !html.slice(left).includes("admin=unfinished"));
});

test("how long ago, in words", async () => {
  const { agoWords } = await load("src/lib/agoWords.js");
  const now = Date.parse("2026-11-23T21:20:00Z");
  for (const [ms, want] of [[0, "just now"], [59_000, "just now"], [60_000, "1 minute ago"], [59 * 60_000, "59 minutes ago"], [HOUR, "1 hour ago"], [23.9 * HOUR, "23 hours ago"], [DAY, "1 day ago"], [29.9 * DAY, "29 days ago"], [-5000, "just now"]]) {
    assert.equal(agoWords(new Date(now - ms).toISOString(), now), want, `${ms}`);
  }
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(agoWords(bad, now), "");
});

test("what Andy ruled: no browser pop-up, no green, no sand or cream, nothing under 16px, money in the serif", () => {
  const file = read("src/admin/CartsLeft.jsx");
  assert.doesNotMatch(file, /window\.(confirm|alert|prompt)|\b(confirm|alert|prompt)\(/);
  assert.doesNotMatch(file, /green|cream|sand|beige|ivory|track-ok|mark-paid-yes|#[0-9a-f]{3,6}/i);
  const css = read("src/index.css").split("\n").filter(l => /\.o-cart[\w-]*/.test(l));
  assert.ok(css.length > 5, "its styles are there");
  for (const l of css) {
    for (const [, px] of l.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px) >= 16, l);
    assert.doesNotMatch(l, /green|cream|sand|beige|ivory|#f[0-9a-f]f[0-9a-f]e/i, l);
  }
  assert.match(file, /className="o-money"/);
  assert.match(read("src/admin/OrdersTab.jsx"), /<CartsLeft search=\{search\} show=\{!loading && \(statusFilter === "all" \|\| statusFilter === "pending"\)\} percent=\{data\?\.settings\?\.couponDiscount \?\? 15\} \/>/, "under \"Didn't finish paying\", with the same chips and search");
});
