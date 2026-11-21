// How a sale was paid, as STRIPE says it, kept on the order and said everywhere. Klarna is in the
// card form since 8d85f29, but every payment there was still kept as paid_method "card", so a
// Klarna sale said "Paid by card" on the paid invoice, in both emails and on the thank-you. Now
// the way is read from Stripe's own record of the payment, never from a browser: Klarna is kept as
// "klarna" and said "Klarna"; a card, any other way, or no answer at all stays "card", exactly as
// before. The exact-cents check is unchanged. Covered for invoices and the Cart, in every place a
// payment is recorded: back from paying (card-paid, cart-paid), a page found paid before
// (card-checkout's last), and Stripe's own message (stripe-event).
// Stripe is never called: fetch is a fake that answers like Stripe. Fake data only; no email is sent.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import { STORE_OPS } from "../api/_lib/storeOps.js";
import { validateChain, PAID_METHODS } from "../api/_lib/adminOps.js";
import { paidByLabel } from "../src/lib/invoiceView.js";
import { knownPaidMethod, markPaidChoices, paidPick } from "../src/lib/orderStatus.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
const SK = ["rk", "test", "FAKEKEYFORTESTS"].join("_"); // in pieces: no key-shaped text in the repo
const INVOICE_PAGE = "cs_test_paidmethodinvoice01";
const CART_PAGE = "cs_test_paidmethodcart0001";
const PAYMENT = "pi_paidmethod0000000001";
const ASKED_HOW = `GET /payment_intents/${PAYMENT}?expand%5B%5D=payment_method`;
const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let calls, logs;

// Answers like Stripe: a page's record (pages), and a payment with the payment method it used.
// way: that method's type; { status, code } for Stripe refusing; "unreachable" for no answer.
// Like Stripe, the method comes as a whole record only when asked for (expand[]=payment_method).
function fakeStripe({ pages = {}, way = "klarna" } = {}) {
  calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(`GET ${u.pathname.replace(/^\/v1/, "")}${u.search}`);
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
    const [, kind, id] = u.pathname.match(/^\/v1\/(checkout\/sessions|payment_intents)\/([^/]+)$/) || [];
    if (kind === "checkout/sessions" && pages[id]) return reply(200, { id, object: "checkout.session", ...pages[id] });
    if (kind !== "payment_intents" || id !== PAYMENT) return reply(404, { error: { code: "resource_missing", message: "No such thing" } });
    if (way === "unreachable") throw new TypeError("fetch failed");
    if (typeof way === "object") return reply(way.status, { error: { code: way.code, message: "Stripe says no" } });
    const method = { id: "pm_fakemethod0000001", object: "payment_method", type: way };
    return reply(200, { id, object: "payment_intent", status: "succeeded", payment_method: u.searchParams.getAll("expand[]").includes("payment_method") ? method : method.id });
  };
}
const askedHow = () => calls.filter(c => c.startsWith("GET /payment_intents/"));

// The tables (Orders, Artworks...), every write kept; select/update/eq/in/not/limit/maybeSingle.
function fakeDb(tables) {
  const writes = [];
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const tests = [];
    let payload = null, returning = false, single = false, lim = null;
    const q = {
      select: () => { if (payload) returning = true; return q; },
      update: (v) => { payload = v; return q; },
      eq: (k, v) => { tests.push(r => String(r[k]) === String(v)); return q; },
      in: (k, list) => { tests.push(r => list.map(String).includes(String(r[k]))); return q; },
      not: (k, o, v) => { tests.push(r => r[k] !== v); return q; },
      limit: (n) => { lim = n; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        const hit = rows.filter(r => tests.every(t => t(r)));
        if (!payload) {
          const out = hit.slice(0, lim ?? undefined).map(r => ({ ...r }));
          return { data: single ? (out[0] ?? null) : out, error: null };
        }
        hit.forEach(r => Object.assign(r, payload));
        writes.push({ table, payload, ids: hit.map(r => r.id) });
        return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null };
      }).then(ok, bad),
    };
    return q;
  };
  return { from, tables, writes };
}
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = SK;
  logs = [];
  console.log = console.warn = console.error = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
  delete process.env.STRIPE_SECRET_KEY;
});

const invoice = (over = {}) => ({
  id: 21, invoice_token: TOKEN, invoice_approved: true, status: "confirmed", item_title: "Frida the manatee",
  amount: 450, client_name: "Ana Lopez", client_email: "ana@example.com", payment_methods: "zelle,stripe",
  created_at: "2026-11-17T21:19:56.080514+00:00", paid_method: null, ...over,
});
const cartRows = (over = {}) => [
  { id: 41, status: "pending", item_title: "Frida the manatee", amount: 500, client_email: "jane@x.co", ship_name: "Jane Doe", paid_method: null, ...over },
  { id: 42, status: "pending", item_title: "Madame Mango", amount: 300, client_email: "jane@x.co", ship_name: "Jane Doe", paid_method: null, ...over },
];
// Stripe's record of a finished page, paid for its exact cents, with its payment's id.
const invoicePage = (over = {}) => ({ status: "complete", payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN }, payment_intent: PAYMENT, ...over });
const cartPage = (over = {}) => ({ status: "complete", payment_status: "paid", amount_total: 80000, currency: "usd", metadata: { order_ids: "41,42", cart_ref: "FA-1752" }, payment_intent: PAYMENT, ...over });
const message = (id) => ({ body: { type: "checkout.session.completed", data: { object: { id } } } });
const CART_VIEW = { ref: "FA-1752", lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800, name: "Jane" };

// Every place an invoice's payment is recorded, and what each answers once it is.
const INVOICE_WAYS = [
  ["back from paying (card-paid)", (db, mail) => STORE_OPS["card-paid"](db, { body: { token: TOKEN, session: INVOICE_PAGE } }, mail), { paid: true }],
  ["the page found paid before (card-checkout's last)", (db, mail) => STORE_OPS["card-checkout"](db, { body: { token: TOKEN, last: INVOICE_PAGE } }, mail), { paid: true }],
  ["Stripe's message (stripe-event)", (db, mail) => STORE_OPS["stripe-event"](db, message(INVOICE_PAGE), mail), { received: true, paid: true }],
];
const CART_WAYS = [
  ["back from paying (cart-paid)", (db, mail) => STORE_OPS["cart-paid"](db, { body: { ref: "FA-1752", session: CART_PAGE } }, mail)],
  ["Stripe's message (stripe-event)", (db, mail) => STORE_OPS["stripe-event"](db, message(CART_PAGE), mail)],
];
const payInvoice = async (run, { way = "klarna", page = invoicePage(), order = invoice() } = {}) => {
  fakeStripe({ pages: { [INVOICE_PAGE]: page }, way });
  const db = fakeDb({ Orders: [order] });
  const mail = mailbox();
  return { answer: await run(db, mail), row: db.tables.Orders[0], db, mail };
};
const payCart = async (run, { way = "klarna", page = cartPage(), rows = cartRows() } = {}) => {
  fakeStripe({ pages: { [CART_PAGE]: page }, way });
  const db = fakeDb({ Orders: rows });
  const mail = mailbox();
  return { answer: await run(db, mail), rows: db.tables.Orders, db, mail };
};

test("an invoice paid with Klarna is kept as Klarna and said as Klarna, in all three places a payment is recorded", async () => {
  for (const [label, run, answer] of INVOICE_WAYS) {
    const { answer: got, row, mail } = await payInvoice(run);
    assert.deepEqual(got, answer, label);
    assert.deepEqual([row.status, row.paid_method], ["paid", "klarna"], `${label}: Paid, kept as Klarna`);
    assert.deepEqual(askedHow(), [ASKED_HOW], `${label}: Stripe's own record of the payment, asked once, with its payment method`);
    const [shop, client] = mail.sent;
    assert.equal(mail.sent.length, 2, label);
    assert.equal(shop.subject, "Paid by Klarna ✓ — Frida the manatee · $450", label);
    assert.match(shop.htmlContent, /paid <strong>\$450<\/strong> with Klarna for <strong>Frida the manatee<\/strong>/, label);
    assert.match(shop.htmlContent, /<strong>Paid with:<\/strong> Klarna \(Stripe\)/, label);
    assert.doesNotMatch(shop.htmlContent, /by card|Card \(Stripe\)/, label);
    assert.equal(client.subject, "Payment received — Frida the manatee · Fonkiart", label);
    assert.match(client.htmlContent, /<strong>Paid with:<\/strong> Klarna</, label);
  }
});

test("an invoice paid by card stays \"card\", in the same words as before", async () => {
  for (const [label, run, answer] of INVOICE_WAYS) {
    const { answer: got, row, mail } = await payInvoice(run, { way: "card" });
    assert.deepEqual(got, answer, label);
    assert.deepEqual([row.status, row.paid_method], ["paid", "card"], label);
    const [shop, client] = mail.sent;
    assert.equal(shop.subject, "Paid by card ✓ — Frida the manatee · $450", label);
    assert.match(shop.htmlContent, /paid <strong>\$450<\/strong> by card for/, label);
    assert.match(shop.htmlContent, /<strong>Paid with:<\/strong> Card \(Stripe\)/, label);
    assert.match(client.htmlContent, /<strong>Paid with:<\/strong> Card</, label);
  }
});

test("a Cart order paid with Klarna: every piece kept as Klarna, both emails say so, and the thank-you is told", async () => {
  for (const [label, run] of CART_WAYS) {
    const { answer, rows, mail } = await payCart(run);
    assert.deepEqual(rows.map(r => [r.id, r.status, r.paid_method]), [[41, "paid", "klarna"], [42, "paid", "klarna"]], label);
    assert.deepEqual(askedHow(), [ASKED_HOW], `${label}: asked once`);
    assert.deepEqual(answer, label.includes("cart-paid") ? { paid: true, ...CART_VIEW, method: "klarna" } : { received: true, paid: true }, label);
    const [shop, buyer] = mail.sent;
    assert.equal(mail.sent.length, 2, label);
    assert.equal(shop.subject, "Paid by Klarna ✓ — FA-1752: 2 pieces · $800", label);
    assert.match(shop.htmlContent, /paid <strong>\$800<\/strong> with Klarna for order <strong>FA-1752<\/strong>/, label);
    assert.match(shop.htmlContent, /<strong>Paid with:<\/strong> Klarna \(Stripe\)/, label);
    assert.doesNotMatch(shop.htmlContent, /by card|Card \(Stripe\)/, label);
    assert.equal(buyer.to, "jane@x.co", label);
    assert.match(buyer.htmlContent, /<strong>Paid with:<\/strong> Klarna</, label);
  }
});

test("a Cart order paid by card stays \"card\": the same answer, word for word, as before", async () => {
  for (const [label, run] of CART_WAYS) {
    const { answer, rows, mail } = await payCart(run, { way: "card" });
    assert.deepEqual(rows.map(r => r.paid_method), ["card", "card"], label);
    assert.deepEqual(answer, label.includes("cart-paid") ? { paid: true, ...CART_VIEW } : { received: true, paid: true }, `${label}: no method in a card's answer`);
    assert.equal(mail.sent[0].subject, "Paid by card ✓ — FA-1752: 2 pieces · $800", label);
    assert.match(mail.sent[0].htmlContent, /by card for order/, label);
    assert.match(mail.sent[1].htmlContent, /<strong>Paid with:<\/strong> Card</, label);
  }
});

test("found paid already (Stripe's message came first): the thank-you still says Klarna, and Stripe is not asked again", async () => {
  const { answer, db, mail } = await payCart(CART_WAYS[0][1], { rows: cartRows({ status: "paid", paid_method: "klarna" }) });
  assert.deepEqual(answer, { paid: true, ...CART_VIEW, method: "klarna" });
  assert.deepEqual([askedHow(), db.writes.filter(w => w.table === "Orders"), mail.sent], [[], [], []]);
  const card = await payCart(CART_WAYS[0][1], { rows: cartRows({ status: "paid", paid_method: "card" }) });
  assert.deepEqual(card.answer, { paid: true, ...CART_VIEW }, "a card's: as before");
});

test("Stripe's message sent again: nothing is recorded, emailed or asked twice", async () => {
  fakeStripe({ pages: { [INVOICE_PAGE]: invoicePage() }, way: "klarna" });
  const db = fakeDb({ Orders: [invoice()] });
  const mail = mailbox();
  for (let i = 0; i < 2; i++) assert.deepEqual(await STORE_OPS["stripe-event"](db, message(INVOICE_PAGE), mail), { received: true, paid: true });
  assert.deepEqual([askedHow().length, db.writes.filter(w => w.table === "Orders").length, mail.sent.length], [1, 1, 2]);
  assert.equal(db.tables.Orders[0].paid_method, "klarna");
});

test("anything Stripe doesn't say is Klarna stays \"card\", and the order is Paid all the same", async () => {
  const cases = [
    ["another way to pay", { way: "affirm" }, 1],
    ["no payment on the page's record", { page: { payment_intent: null } }, 0],
    ["a payment id that isn't one", { page: { payment_intent: "pi_../../v1/charges" } }, 0],
    ["Stripe out of reach", { way: "unreachable" }, 1],
    ["Stripe refusing (a key that may not read payments)", { way: { status: 403, code: "secret_key_required" } }, 1],
    ["Stripe down", { way: { status: 500, code: "api_error" } }, 1],
  ];
  for (const [label, { way, page = {} }, asks] of cases) {
    const inv = await payInvoice(INVOICE_WAYS[0][1], { way, page: invoicePage(page) });
    assert.deepEqual([inv.answer, inv.row.status, inv.row.paid_method], [{ paid: true }, "paid", "card"], `invoice, ${label}`);
    assert.equal(askedHow().length, asks, `invoice, ${label}: asked ${asks}`);
    assert.equal(inv.mail.sent[0].subject, "Paid by card ✓ — Frida the manatee · $450", `invoice, ${label}`);
    const cart = await payCart(CART_WAYS[0][1], { way, page: cartPage(page) });
    assert.deepEqual([cart.answer, cart.rows.map(r => r.paid_method)], [{ paid: true, ...CART_VIEW }, ["card", "card"]], `cart, ${label}`);
  }
  assert.ok(logs.some(l => l.includes("recorded as a card")), "a failed question is in the log");
  // A record that already holds the payment and its method (asked for with it): read, not asked.
  const expanded = await payInvoice(INVOICE_WAYS[0][1], { page: invoicePage({ payment_intent: { id: PAYMENT, payment_method: { type: "klarna" } } }) });
  assert.deepEqual([expanded.row.paid_method, askedHow()], ["klarna", []]);
});

test("the exact-cents check is unchanged: a Klarna page a cent short, or not paid yet, records nothing and asks nothing more", async () => {
  for (const page of [{ amount_total: 44999 }, { payment_status: "unpaid" }, { currency: "eur" }]) {
    const label = JSON.stringify(page);
    const inv = await payInvoice(INVOICE_WAYS[0][1], { page: invoicePage(page) });
    assert.deepEqual([inv.answer, inv.row.status, inv.row.paid_method, inv.mail.sent.length, askedHow()], [{ paid: false }, "confirmed", null, 0, []], `invoice ${label}`);
    const hook = await payInvoice(INVOICE_WAYS[2][1], { page: invoicePage(page) });
    assert.deepEqual([hook.answer, hook.row.status, askedHow()], [{ received: true, ignored: "not paid" }, "confirmed", []], `message ${label}`);
    const cart = await payCart(CART_WAYS[0][1], { page: cartPage({ ...page, amount_total: page.amount_total ? 79999 : 80000 }) });
    assert.deepEqual([cart.answer.paid, cart.rows.map(r => r.status), cart.mail.sent.length, askedHow()], [false, ["pending", "pending"], 0, []], `cart ${label}`);
  }
});

test("the words around it: the paid invoice says \"Paid by Klarna\"; Admin keeps it and never offers it as a Mark-paid button", () => {
  assert.equal(paidByLabel("klarna"), "Klarna");
  assert.equal(paidByLabel("card"), "card", "a card: as before");
  assert.equal(knownPaidMethod({ paid_method: "klarna" }), "klarna");
  assert.equal(paidPick({ paid_method: "klarna" }, "paid"), "save-quietly", "Shipped -> Paid again: not asked twice, no second receipt");
  for (const ways of ["zelle,stripe", "stripe", null]) {
    assert.ok(!markPaidChoices(ways).some(([v]) => v === "klarna"), `Mark paid (${ways}): no Klarna button`);
  }
  assert.ok(PAID_METHODS.has("klarna"));
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "update", a: [{ status: "paid", paid_method: "klarna" }] }, { m: "eq", a: ["id", 21] }]), "Admin may save a Klarna order back");
  assert.throws(() => validateChain("Orders", [{ m: "update", a: [{ paid_method: "bitcoin" }] }, { m: "eq", a: ["id", 21] }]), "anything else is still refused");
});

// The thank-you (src/components/PaidThanks.jsx), compiled with the project's own Vite and drawn once
// by a stand-in for React (as tests/collectorsRoomBack.test.js does): what its "Paid by" line says.
const element = (type, props) => ({ type, props: props || {} });
globalThis.__paidMethodTest = {
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "./PayArt": { default: function PayArt() { return null; } },
  "../lib/invoiceView": { paidCongrats: () => ({ title: "Congratulations, you made it yours!", sub: "A one of a kind!" }) },
};
async function loadPaidThanks() {
  const file = "components/PaidThanks.jsx";
  const { code } = await transformWithOxc(read(`src/${file}`), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in globalThis.__paidMethodTest)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__paidMethodTest[${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  assert.doesNotMatch(body, /^\s*import[\s{]/m, `${file}: an import was left unread`);
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
const textOf = (n) => n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n)
  : Array.isArray(n) ? n.map(textOf).join("") : typeof n.type === "function" ? "" : textOf(n.props.children);
const findAll = (n, want, out = []) => {
  if (n == null || typeof n !== "object") return out;
  if (Array.isArray(n)) { for (const c of n) findAll(c, want, out); return out; }
  if (want(n)) out.push(n);
  findAll(n.props.children, want, out);
  return out;
};

test("the thank-you says \"Paid by Klarna ✓\" for a Klarna payment, and \"Paid by card ✓\" for a card, as before", async () => {
  const PaidThanks = await loadPaidThanks();
  const paidBy = (view) => findAll(PaidThanks({ view: { ...CART_VIEW, ...view }, artworks: [], action: null }), n => n.props.className === "pay-return-by").map(textOf);
  assert.deepEqual(paidBy({ method: "klarna" }), ["Paid by Klarna ✓"]);
  assert.deepEqual(paidBy({}), ["Paid by card ✓"]);
  assert.deepEqual(paidBy({ method: "zelle" }), ["Paid by card ✓"], "a word it doesn't know: as before");
});
