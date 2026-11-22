// The ways to pay through Stripe, one per payment page (Andy, 2026-11-21: "also paying options look
// what strip offers .. klarma , Secure Link (https://link.com/) , bank transfer / ACH"): "card" is
// cards with Link, "klarna" is Klarna alone, "bank" is a US bank account (ACH) alone, and no way
// (or a word it doesn't know) is cards and Klarna, as before. A bank payment clears days later:
// "Payment processing" meanwhile, the piece held for the buyer, and Paid (with the paid emails)
// only once Stripe says paid, for the exact cents; if it fails, back to unpaid, the piece for sale
// again, one short email to the buyer. Klarna or a bank payment that Stripe refuses for a page: one
// calm line, and never a card form in its place.
// Stripe is never called: fetch is a fake that answers like Stripe. Fake data only; no email is
// sent. Imported whole (import * as), so a part missing before this change fails only its own test.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import * as storeOps from "../api/_lib/storeOps.js";
import * as cart from "../api/_lib/cartCheckout.js";
import * as stripeLib from "../api/_lib/stripe.js";
import * as adminOps from "../api/_lib/adminOps.js";
import * as orderStatus from "../src/lib/orderStatus.js";
import * as invoiceView from "../src/lib/invoiceView.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const op = (name) => storeOps.STORE_OPS[name];
const TOKEN = "85d82763-0000-4000-8000-0000000000bb";
const SK = ["rk", "test", "FAKEKEYFORTESTS"].join("_"); // in pieces: no key-shaped text in the repo
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_");
const PAGE = "cs_test_paymentwaysinvoice01";
const OLD_PAGE = "cs_test_paymentwaysinvoice00";
const CART_PAGE = "cs_test_paymentwayscart00001";
const PAYMENT = "pi_paymentways0000000001";
const OLD_PAYMENT = "pi_paymentways0000000000";
const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let calls, logs;

// Answers like Stripe. pages: its records of payment pages, by id; payments: { status, type } by
// payment id; refuse(form): what Stripe says to a new payment page, null for yes, or
// { status, code, param } for no. made: every new payment page asked for, as the form sent.
function fakeStripe({ pages = {}, payments = {}, refuse = () => null } = {}) {
  const made = [];
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/v1/, "");
    const method = init.method || "GET";
    calls.push(`${method} ${path}`);
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
    if (method === "POST" && path === "/checkout/sessions") {
      const form = new URLSearchParams(init.body);
      made.push(form);
      const no = refuse(form);
      if (no) return reply(no.status ?? 400, { error: { code: no.code, param: no.param, message: "Stripe says no" } });
      return reply(200, { id: `cs_test_paymentwaysmade${String(made.length).padStart(5, "0")}`, object: "checkout.session", client_secret: `fake-form-${made.length}` });
    }
    let m = path.match(/^\/checkout\/sessions\/([^/]+)\/expire$/);
    if (method === "POST" && m && pages[m[1]]) { pages[m[1]].status = "expired"; return reply(200, { id: m[1], status: "expired" }); }
    m = path.match(/^\/checkout\/sessions\/([^/]+)$/);
    if (m && pages[m[1]]) return reply(200, { id: m[1], object: "checkout.session", ...pages[m[1]] });
    m = path.match(/^\/payment_intents\/([^/]+)$/);
    if (m && payments[m[1]]) {
      const pm = { id: "pm_fakemethod0000001", object: "payment_method", type: payments[m[1]].type };
      return reply(200, { id: m[1], object: "payment_intent", status: payments[m[1]].status, payment_method: u.searchParams.getAll("expand[]").includes("payment_method") ? pm : pm.id });
    }
    return reply(404, { error: { code: "resource_missing", message: "No such thing" } });
  };
  return { made, pages, payments };
}
const typesOf = (form) => [...form.entries()].filter(([k]) => k.startsWith("payment_method_types")).map(([, v]) => v);
const refuseIf = (type, code = "amount_too_large") => (form) => (typesOf(form).includes(type) ? { status: 400, code } : null);

// The tables, every write kept: select/update/eq/neq/in/not/limit/maybeSingle. holdColumns false:
// Orders as it is before db/2026-11-21-bank-hold.sql, so a write of art_held or bank_page fails.
function fakeDb(tables, { holdColumns = true } = {}) {
  const writes = [];
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const tests = [];
    let payload = null, returning = false, single = false, lim = null;
    const q = {
      select: () => { if (payload) returning = true; return q; },
      update: (v) => { payload = v; return q; },
      eq: (k, v) => { tests.push(r => String(r[k]) === String(v)); return q; },
      neq: (k, v) => { tests.push(r => String(r[k]) !== String(v)); return q; },
      in: (k, list) => { tests.push(r => list.map(String).includes(String(r[k]))); return q; },
      not: (k, o, v) => { tests.push(r => r[k] !== v); return q; },
      limit: (n) => { lim = n; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        if (payload && !holdColumns && table === "Orders" && ("art_held" in payload || "bank_page" in payload)) {
          writes.push({ table, payload, refused: true });
          return { data: null, error: { message: "column does not exist" } };
        }
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
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  logs = [];
  console.log = console.warn = console.error = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
});

const invoice = (over = {}) => ({
  id: 21, invoice_token: TOKEN, invoice_approved: true, status: "confirmed", item_title: "Frida the manatee",
  amount: 450, client_name: "Ana Lopez", client_email: "ana@example.com", payment_methods: "zelle,stripe",
  created_at: "2026-11-17T21:19:56.080514+00:00", paid_method: null, art_held: null, bank_page: null, ...over,
});
const cartRows = (over = {}) => [
  { id: 41, status: "pending", item_title: "Frida the manatee", amount: 500, client_email: "jane@x.co", ship_name: "Jane Doe", notes: "Order Ref: FA-1752 · Jane Doe · Paying by card", paid_method: null, art_held: null, bank_page: null, ...over },
  { id: 42, status: "pending", item_title: "Madame Mango", amount: 300, client_email: "jane@x.co", ship_name: "Jane Doe", notes: "Order Ref: FA-1752 · Jane Doe · Paying by card", paid_method: null, art_held: null, bank_page: null, ...over },
];
const arts = (over = {}) => [
  { id: 7, title: "Frida the manatee", image: null, isSold: false, category: "Painting", price: 500, salePrice: null, ...over },
  { id: 8, title: "Madame Mango", image: null, isSold: false, category: "Painting", price: 300, salePrice: null, ...over },
];
const without = (row, ...keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
// Stripe's record of a finished page paid by bank: "unpaid" while it clears, "paid" once it has.
const bankPage = (over = {}) => ({ status: "complete", payment_status: "unpaid", amount_total: 45000, currency: "usd", payment_method_types: ["us_bank_account"], metadata: { invoice_token: TOKEN }, payment_intent: PAYMENT, ...over });
const bankCartPage = (over = {}) => ({ status: "complete", payment_status: "unpaid", amount_total: 80000, currency: "usd", payment_method_types: ["us_bank_account"], metadata: { order_ids: "41,42", cart_ref: "FA-1752" }, payment_intent: PAYMENT, ...over });
const BANK = (status) => ({ [PAYMENT]: { status, type: "us_bank_account" } });
const message = (id, type = "checkout.session.completed") => ({ body: { type, data: { object: { id } } } });
const CART_VIEW = { ref: "FA-1752", lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800, name: "Jane" };
const CART_BODY = { ref: "FA-1752", ids: [41, 42], email: "jane@x.co", titles: ["Frida the manatee", "Madame Mango"], embedded: true };
const cartLines = [{ title: "Frida the manatee", amount: 500, image: null }, { title: "Madame Mango", amount: 300, image: null }];
// cart-card's saving of the order (storeOps.js opOrder) stood in for: the order as it is saved.
const savedOrder = async () => ({ saved: true, orderRef: "FA-1752", ids: [41, 42], items: cartLines, total: 800, email: "jane@x.co" });
const sold = (db) => db.tables.Artworks.map(a => a.isSold);
const orderWrites = (db) => db.writes.filter(w => w.table === "Orders");

test("one way per payment page: card is cards and Link, Klarna alone, a bank account alone; no way, or a word it doesn't know, is cards and Klarna as before", async () => {
  const WANT = [["card", ["card", "link"]], ["klarna", ["klarna"]], ["bank", ["us_bank_account"]],
    [undefined, ["card", "klarna"]], ["paypal", ["card", "klarna"]], ["__proto__", ["card", "klarna"]], ["constructor", ["card", "klarna"]]];
  for (const [way, types] of WANT) {
    const { made } = fakeStripe();
    await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way });
    await stripeLib.createCartCheckout({ ref: "FA-1752", ids: [41, 42], lines: cartLines, email: "jane@x.co", way });
    for (const [n, form] of made.entries()) {
      const label = `${n ? "Cart" : "invoice"}, way ${String(way)}`;
      assert.deepEqual(typesOf(form), types, label);
      assert.equal(form.get("redirect_on_completion"), "if_required", `${label}: a way that may leave comes back`);
      assert.match(form.get("return_url"), n ? /\/\?cart=FA-1752&card=\{CHECKOUT_SESSION_ID\}$/ : new RegExp(`/\\?invoice=${TOKEN}&card=\\{CHECKOUT_SESSION_ID\\}$`), label);
    }
  }
  // The ways the pages send reach Stripe: the invoice's card form and the Cart's, again.
  const inv = fakeStripe();
  const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
  const answer = await op("card-checkout")(db, { body: { token: TOKEN, embedded: true, way: "bank" } }, mailbox());
  assert.equal(answer.clientSecret, "fake-form-1");
  assert.deepEqual(typesOf(inv.made[0]), ["us_bank_account"], "card-checkout: the way the client chose");
  const again = fakeStripe();
  const cdb = fakeDb({ Orders: cartRows(), Artworks: arts() });
  const cartAnswer = await op("cart-again")(cdb, { body: { ...CART_BODY, way: "klarna" } }, mailbox());
  assert.equal(cartAnswer.clientSecret, "fake-form-1");
  assert.deepEqual(typesOf(again.made[0]), ["klarna"], "cart-again: the way the buyer chose");
  const saved = fakeStripe();
  await cart.opCartCard(fakeDb({}), { embedded: true, way: "card" }, mailbox(), savedOrder);
  assert.deepEqual(typesOf(saved.made[0]), ["card", "link"], "cart-card: the way the buyer chose");
});

test("Klarna refused for an amount (a 400): one calm line, the choices stay, and NEVER a card form in its place", async () => {
  const LINE = "Klarna isn't available for this amount. Please choose another way.";
  // The control: the 400 itself. Before this change it was answered with a card form.
  const inv = fakeStripe({ refuse: refuseIf("klarna") });
  const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
  const mail = mailbox();
  await assert.rejects(op("card-checkout")(db, { body: { token: TOKEN, embedded: true, way: "klarna" } }, mail), (e) => e.status === 409 && e.message === LINE);
  assert.deepEqual(inv.made.map(typesOf), [["klarna"]], "Stripe asked once, for Klarna; never again for cards");
  assert.deepEqual([db.tables.Orders[0].status, orderWrites(db), mail.sent], ["confirmed", [], []], "nothing changes, nobody is emailed");
  assert.ok(logs.some(l => l.includes("no card form instead") && l.includes("amount_too_large")), "Stripe's own words stay in the log");

  const saved = fakeStripe({ refuse: refuseIf("klarna") });
  const first = await cart.opCartCard(fakeDb({}), { embedded: true, way: "klarna" }, mailbox(), savedOrder);
  assert.deepEqual(first, { ref: "FA-1752", ids: [41, 42], lines: CART_VIEW.lines, total: 800, refused: "klarna", cardError: LINE }, "cart-card: the order is kept, no form, the line");
  assert.deepEqual(saved.made.map(typesOf), [["klarna"]]);

  const again = fakeStripe({ refuse: refuseIf("klarna") });
  const cdb = fakeDb({ Orders: cartRows(), Artworks: arts() });
  await assert.rejects(op("cart-again")(cdb, { body: { ...CART_BODY, way: "klarna" } }, mailbox()), (e) => e.status === 409 && e.message === LINE);
  assert.deepEqual(again.made.map(typesOf), [["klarna"]], "cart-again: no card form either");

  // A bank payment chosen and refused: the same, in its own words.
  fakeStripe({ refuse: refuseIf("us_bank_account") });
  await assert.rejects(op("card-checkout")(fakeDb({ Orders: [invoice()], Artworks: arts() }), { body: { token: TOKEN, embedded: true, way: "bank" } }, mailbox()),
    (e) => e.status === 409 && e.message === "Paying by bank (ACH) isn't available for this amount. Please choose another way.");

  // Only a picture Stripe names: asked again, still Klarna, without the picture.
  const pic = fakeStripe({ refuse: (form) => (form.has("line_items[0][price_data][product_data][images][0]") ? { status: 400, code: "url_invalid", param: "line_items[0][price_data][product_data][images][0]" } : null) });
  await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", image: "https://example.com/frida.jpg", way: "klarna" });
  assert.deepEqual(pic.made.map(f => [typesOf(f), f.has("line_items[0][price_data][product_data][images][0]")]), [[["klarna"], true], [["klarna"], false]]);

  // Stripe down is not a refusal: card payment isn't working right now, as before.
  const down = fakeStripe({ refuse: () => ({ status: 500, code: "api_error" }) });
  await assert.rejects(op("card-checkout")(fakeDb({ Orders: [invoice()], Artworks: arts() }), { body: { token: TOKEN, embedded: true, way: "klarna" } }, mailbox()), (e) => e.status === 502);
  assert.equal(down.made.length, 1);
});

test("the card way, and no way at all, keep today's fallback: refused (a 400), asked again with cards only, and the card form opens", async () => {
  for (const [way, first] of [["card", ["card", "link"]], [undefined, ["card", "klarna"]]]) {
    const { made } = fakeStripe({ refuse: (form) => (typesOf(form).length > 1 ? { status: 400, code: "amount_too_large" } : null) });
    const page = await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way });
    assert.equal(page.clientSecret, "fake-form-2", `way ${String(way)}: a card form`);
    assert.deepEqual(made.map(typesOf), [first, ["card"]], `way ${String(way)}`);
    assert.equal(made[1].get("redirect_on_completion"), "never", "cards only: nobody is sent anywhere");
    const cartPage = fakeStripe({ refuse: (form) => (typesOf(form).length > 1 ? { status: 400, code: "amount_too_large" } : null) });
    const answer = await cart.opCartCard(fakeDb({}), { embedded: true, way }, mailbox(), savedOrder);
    assert.equal(answer.clientSecret, "fake-form-2", `cart-card, way ${String(way)}`);
    assert.deepEqual(cartPage.made.map(typesOf), [first, ["card"]]);
  }
});

test("Link: kept as \"link\" and said \"Link\" in both emails, on the paid invoice, on the thank-you and in Admin", async () => {
  fakeStripe({ pages: { [PAGE]: bankPage({ payment_status: "paid", payment_method_types: ["card", "link"] }) }, payments: { [PAYMENT]: { status: "succeeded", type: "link" } } });
  const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
  const mail = mailbox();
  assert.deepEqual(await op("card-paid")(db, { body: { token: TOKEN, session: PAGE } }, mail), { paid: true });
  assert.deepEqual([db.tables.Orders[0].status, db.tables.Orders[0].paid_method], ["paid", "link"]);
  const [shop, client] = mail.sent;
  assert.equal(shop.subject, "Paid by Link ✓ — Frida the manatee · $450");
  assert.match(shop.htmlContent, /paid <strong>\$450<\/strong> with Link for <strong>Frida the manatee<\/strong>/);
  assert.match(shop.htmlContent, /<strong>Paid with:<\/strong> Link \(Stripe\)/);
  assert.match(client.htmlContent, /<strong>Paid with:<\/strong> Link</);

  fakeStripe({ pages: { [CART_PAGE]: bankCartPage({ payment_status: "paid", payment_method_types: ["card", "link"] }) }, payments: { [PAYMENT]: { status: "succeeded", type: "link" } } });
  const cdb = fakeDb({ Orders: cartRows(), Artworks: arts() });
  const cmail = mailbox();
  assert.deepEqual(await op("cart-paid")(cdb, { body: { ref: "FA-1752", session: CART_PAGE } }, cmail), { paid: true, ...CART_VIEW, method: "link" });
  assert.deepEqual(cdb.tables.Orders.map(r => r.paid_method), ["link", "link"]);
  assert.equal(cmail.sent[0].subject, "Paid by Link ✓ — FA-1752: 2 pieces · $800");
  assert.match(cmail.sent[1].htmlContent, /<strong>Paid with:<\/strong> Link</);

  assert.equal(invoiceView.paidByLabel("link"), "Link");
  assert.equal(invoiceView.paidByLabel("bank"), "bank (ACH)");
  assert.equal(invoiceView.paidByLabel("card"), "card", "a card: as before");
  for (const [method, label] of [["link", "Link"], ["bank", "Bank (ACH)"]]) {
    assert.deepEqual(orderStatus.PAID_METHODS.find(([v]) => v === method), [method, label]);
    assert.equal(orderStatus.knownPaidMethod({ paid_method: method }), method);
    assert.ok(adminOps.PAID_METHODS.has(method));
    assert.doesNotThrow(() => adminOps.validateChain("Orders", [{ m: "update", a: [{ status: "paid", paid_method: method }] }, { m: "eq", a: ["id", 21] }]), `Admin may save a ${label} order back`);
    for (const ways of ["zelle,stripe", "stripe", null]) assert.ok(!orderStatus.markPaidChoices(ways).some(([v]) => v === method), `Mark paid (${ways}): no ${label} button, only Stripe records it`);
  }
  const PaidThanks = await loadPaidThanks();
  const paidBy = (view) => findAll(PaidThanks({ view: { ...CART_VIEW, ...view }, artworks: [], action: null }), n => n.props.className === "pay-return-by").map(textOf);
  assert.deepEqual(paidBy({ method: "link" }), ["Paid by Link ✓"]);
  assert.deepEqual(paidBy({ method: "bank" }), ["Paid by bank (ACH) ✓"]);
  assert.deepEqual(paidBy({}), ["Paid by card ✓"], "a card: as before");
});

test("an invoice paid by bank: Payment processing while it clears, the piece held, no email; Paid with the paid emails only once Stripe says paid", async () => {
  const stripe = fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("processing") });
  const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
  const mail = mailbox();
  const row = db.tables.Orders[0];
  assert.deepEqual(await op("card-paid")(db, { body: { token: TOKEN, session: PAGE } }, mail), { paid: false, processing: true });
  assert.deepEqual([row.status, row.paid_method, row.art_held, row.bank_page], ["processing", null, true, PAGE]);
  assert.deepEqual(sold(db), [true, false], "the piece is held for this client: Sold, so nobody else can buy it");
  assert.equal(mail.sent.length, 0, "no email while it clears");

  // Stripe's message, sent again; the bank still checking the account (micro-deposits); the payment
  // in at Stripe but the page not "paid" yet: still Payment processing, never Paid.
  for (const [label, status] of [["the message again", "processing"], ["micro-deposits to confirm", "requires_action"], ["the payment in, the page still unpaid", "succeeded"]]) {
    stripe.payments[PAYMENT].status = status;
    assert.deepEqual(await op("stripe-event")(db, message(PAGE), mail), { received: true, processing: true }, label);
    assert.deepEqual([row.status, row.paid_method, row.art_held, mail.sent.length], ["processing", null, true, 0], label);
  }

  // A page paid a cent short is never taken as paid.
  stripe.pages[PAGE] = bankPage({ payment_status: "paid", amount_total: 44999 });
  assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_succeeded"), mail), { received: true, ignored: "not paid" });
  assert.equal(row.status, "processing");

  // It cleared.
  stripe.pages[PAGE] = bankPage({ payment_status: "paid" });
  for (let i = 0; i < 2; i++) assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_succeeded"), mail), { received: true, paid: true });
  assert.deepEqual([row.status, row.paid_method], ["paid", "bank"]);
  assert.equal(mail.sent.length, 2, "the two paid emails, once");
  const [shop, client] = mail.sent;
  assert.equal(shop.subject, "Paid by bank (ACH) ✓ — Frida the manatee · $450");
  assert.match(shop.htmlContent, /paid <strong>\$450<\/strong> by bank \(ACH\) for <strong>Frida the manatee<\/strong>/);
  assert.match(shop.htmlContent, /<strong>Paid with:<\/strong> Bank, ACH \(Stripe\)/);
  assert.equal(client.subject, "Payment received — Frida the manatee · Fonkiart");
  assert.match(client.htmlContent, /<strong>Paid with:<\/strong> Bank \(ACH\)</);
  assert.deepEqual(sold(db), [true, false], "still Sold");
});

test("a Cart order paid by bank: every row Payment processing, every piece held, the checkout told \"processing\", and no second payment page", async () => {
  const stripe = fakeStripe({ pages: { [CART_PAGE]: bankCartPage() }, payments: BANK("processing") });
  const db = fakeDb({ Orders: cartRows(), Artworks: arts() });
  const mail = mailbox();
  assert.deepEqual(await op("cart-paid")(db, { body: { ref: "FA-1752", session: CART_PAGE } }, mail), { paid: false, processing: true, ...CART_VIEW });
  assert.deepEqual(db.tables.Orders.map(r => [r.status, r.art_held, r.bank_page]), [["processing", true, CART_PAGE], ["processing", true, CART_PAGE]]);
  assert.deepEqual(sold(db), [true, true]);
  assert.equal(mail.sent.length, 0);

  assert.deepEqual(await op("cart-order")(db, { body: { ...CART_BODY, session: CART_PAGE } }, mail), { state: "processing", ...CART_VIEW });
  assert.deepEqual(await op("cart-order")(db, { body: CART_BODY }, mail), { state: "processing", ...CART_VIEW }, "without the page: the rows say so");
  for (const body of [CART_BODY, { ...CART_BODY, session: CART_PAGE }]) {
    await assert.rejects(op("cart-again")(db, { body: { ...body, way: "card" } }, mail), (e) => e.status === 409);
  }
  assert.equal(stripe.made.length, 0, "no new payment page while it clears");
  assert.equal(mail.sent.length, 0);

  stripe.pages[CART_PAGE] = bankCartPage({ payment_status: "paid" });
  assert.deepEqual(await op("stripe-event")(db, message(CART_PAGE, "checkout.session.async_payment_succeeded"), mail), { received: true, paid: true });
  assert.deepEqual(db.tables.Orders.map(r => [r.status, r.paid_method]), [["paid", "bank"], ["paid", "bank"]]);
  assert.equal(mail.sent.length, 2);
  assert.equal(mail.sent[0].subject, "Paid by bank (ACH) ✓ — FA-1752: 2 pieces · $800");
  assert.match(mail.sent[1].htmlContent, /<strong>Paid with:<\/strong> Bank \(ACH\)</);
  assert.deepEqual(await op("cart-paid")(db, { body: { ref: "FA-1752", session: CART_PAGE } }, mail), { paid: true, ...CART_VIEW, method: "bank" });
  assert.equal(mail.sent.length, 2, "found paid already: nothing sent twice");
});

test("a bank payment that fails: back to unpaid, the piece for sale again, ONE short email to the buyer, and nothing on a replay", async () => {
  for (const [label, approved, back, status] of [["confirmed invoice", true, "confirmed", "requires_payment_method"], ["never confirmed", false, "pending", "canceled"]]) {
    fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK(status) });
    const db = fakeDb({ Orders: [invoice({ status: "processing", invoice_approved: approved, art_held: true, bank_page: PAGE })], Artworks: arts({ isSold: true }) });
    const mail = mailbox();
    for (let i = 0; i < 2; i++) assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_failed"), mail), { received: true, failed: true }, label);
    const row = db.tables.Orders[0];
    assert.deepEqual([row.status, row.paid_method, row.art_held], [back, null, false], label);
    assert.deepEqual(sold(db), [false, true], `${label}: for sale again (only the piece this order held)`);
    assert.equal(mail.sent.length, 1, `${label}: one email, to the client, once`);
    const [email] = mail.sent;
    assert.equal(email.to, "ana@example.com");
    assert.equal(email.subject, "Your bank payment didn't go through — Frida the manatee · Fonkiart");
    assert.match(email.htmlContent, /Your bank payment of <strong>\$450<\/strong> for <strong>Frida the manatee<\/strong> didn't go through, so your order is not paid\./);
    assert.match(email.htmlContent, new RegExp(`/\\?invoice=${TOKEN}"`), `${label}: the way back to the invoice`);
    assert.equal(orderWrites(db).filter(w => "status" in w.payload && w.ids.length).length, 1, `${label}: set back once; the replay's guarded write matches nothing`);
  }

  fakeStripe({ pages: { [CART_PAGE]: bankCartPage() }, payments: BANK("requires_payment_method") });
  const db = fakeDb({ Orders: cartRows({ status: "processing", art_held: true, bank_page: CART_PAGE }), Artworks: arts({ isSold: true }) });
  const mail = mailbox();
  for (let i = 0; i < 2; i++) assert.deepEqual(await op("stripe-event")(db, message(CART_PAGE, "checkout.session.async_payment_failed"), mail), { received: true, failed: true });
  assert.deepEqual(db.tables.Orders.map(r => [r.status, r.paid_method, r.art_held]), [["pending", null, false], ["pending", null, false]]);
  assert.deepEqual(sold(db), [false, false]);
  assert.equal(mail.sent.length, 1, "the buyer only, once; the shop has nothing to do");
  assert.equal(mail.sent[0].to, "jane@x.co");
  assert.equal(mail.sent[0].subject, "Your bank payment didn't go through — 2 pieces · Fonkiart");
  assert.match(mail.sent[0].htmlContent, /If you'd still like them, just reply to this email and we'll help\./);
  assert.deepEqual(await op("cart-order")(db, { body: CART_BODY }, mail), { state: "open", ref: "FA-1752", lines: CART_VIEW.lines, total: 800 }, "the order can be paid again");
});

test("a failed bank payment never undoes what isn't its own: a forged message, an old page, another order's sale or another order's hold", async () => {
  // Forged: the message says failed, Stripe's own record says it is still clearing.
  fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("processing") });
  const forged = fakeDb({ Orders: [invoice({ status: "processing", art_held: true, bank_page: PAGE })], Artworks: arts({ isSold: true }) });
  const fmail = mailbox();
  assert.deepEqual(await op("stripe-event")(forged, message(PAGE, "checkout.session.async_payment_failed"), fmail), { received: true, processing: true });
  assert.deepEqual([forged.tables.Orders[0].status, sold(forged)[0], fmail.sent.length], ["processing", true, 0]);

  // An old page that failed, while a newer page's bank payment clears.
  fakeStripe({ pages: { [OLD_PAGE]: bankPage({ payment_intent: OLD_PAYMENT }), [PAGE]: bankPage() }, payments: { [OLD_PAYMENT]: { status: "requires_payment_method", type: "us_bank_account" }, ...BANK("processing") } });
  const old = fakeDb({ Orders: [invoice({ status: "processing", art_held: true, bank_page: PAGE })], Artworks: arts({ isSold: true }) });
  const omail = mailbox();
  await op("stripe-event")(old, message(OLD_PAGE, "checkout.session.async_payment_failed"), omail);
  assert.deepEqual([old.tables.Orders[0].status, old.tables.Orders[0].art_held, sold(old)[0], omail.sent.length], ["processing", true, true, 0], "the newer payment is untouched");
  fakeStripe({ pages: { [OLD_PAGE]: bankCartPage({ payment_intent: OLD_PAYMENT }) }, payments: { [OLD_PAYMENT]: { status: "requires_payment_method", type: "us_bank_account" } } });
  const oldCart = fakeDb({ Orders: cartRows({ status: "processing", art_held: true, bank_page: CART_PAGE }), Artworks: arts({ isSold: true }) });
  await op("stripe-event")(oldCart, message(OLD_PAGE, "checkout.session.async_payment_failed"), omail);
  assert.deepEqual([oldCart.tables.Orders.map(r => r.status), sold(oldCart), omail.sent.length], [["processing", "processing"], [true, true], 0], "the Cart's too");

  // Another order has paid for the piece since: it stays Sold. Another order's bank payment is
  // clearing for it: it stays Sold, and that order holds it now.
  for (const [label, other, held] of [["another order paid", { status: "paid", art_held: null }, null], ["another order clearing", { status: "processing", art_held: false }, true]]) {
    fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("requires_payment_method") });
    const db = fakeDb({ Orders: [invoice({ status: "processing", art_held: true, bank_page: PAGE }), invoice({ id: 99, invoice_token: "85d82763-0000-4000-8000-000000000099", bank_page: "cs_test_paymentwaysother0001", ...other })], Artworks: arts({ isSold: true }) });
    const mail = mailbox();
    assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_failed"), mail), { received: true, failed: true }, label);
    assert.deepEqual([db.tables.Orders[0].status, db.tables.Orders[0].art_held, db.tables.Orders[1].art_held], ["confirmed", false, held], label);
    assert.equal(sold(db)[0], true, `${label}: still Sold`);
    assert.deepEqual(mail.sent.map(m => m.to), ["ana@example.com"], `${label}: the client is told; nothing for the shop to check`);
  }
});

test("until db/2026-11-21-bank-hold.sql is run: the piece is still held, and on a failure it stays Sold and the shop is asked to check it", async () => {
  const sql = read("db/2026-11-21-bank-hold.sql");
  assert.match(sql, /alter table public\."Orders" add column if not exists art_held boolean;/);
  assert.match(sql, /alter table public\."Orders" add column if not exists bank_page text;/);
  const stripe = fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("processing") });
  const db = fakeDb({ Orders: [without(invoice(), "art_held", "bank_page")], Artworks: arts() }, { holdColumns: false });
  const mail = mailbox();
  assert.deepEqual(await op("card-paid")(db, { body: { token: TOKEN, session: PAGE } }, mail), { paid: false, processing: true });
  assert.deepEqual([db.tables.Orders[0].status, sold(db)[0]], ["processing", true]);
  assert.deepEqual(db.writes.filter(w => w.refused), [], "it never writes a column that isn't there");
  assert.ok(logs.some(l => l.includes("until db/2026-11-21-bank-hold.sql is run")));

  stripe.payments[PAYMENT].status = "requires_payment_method";
  assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_failed"), mail), { received: true, failed: true });
  assert.deepEqual([db.tables.Orders[0].status, sold(db)[0]], ["confirmed", true], "back to Confirmed; the piece stays Sold");
  assert.deepEqual(db.writes.filter(w => w.refused), []);
  assert.deepEqual(mail.sent.map(m => m.to).sort(), ["ana@example.com", "shop@fonkiart.com"]);
  const shop = mail.sent.find(m => m.to === "shop@fonkiart.com");
  assert.match(shop.subject, /^Bank payment failed — FA-\d+: Frida the manatee · \$450$/);
  assert.match(shop.htmlContent, /Please check this piece: <strong>Frida the manatee<\/strong>\./);
  assert.match(shop.htmlContent, /untick <strong>Mark as Sold<\/strong> on it in Admin → Artworks/);
  assert.match(shop.htmlContent, /set it back to <strong>Confirmed<\/strong>/);
});

test("the invoice page while a bank payment clears: no new card form, whatever it names; one that failed is recorded, then a new form opens", async () => {
  const stripe = fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("processing") });
  const db = fakeDb({ Orders: [invoice({ status: "processing", art_held: true, bank_page: PAGE })], Artworks: arts({ isSold: true }) });
  const mail = mailbox();
  for (const body of [{}, { last: PAGE }, { last: OLD_PAGE }]) {
    assert.deepEqual(await op("card-checkout")(db, { body: { token: TOKEN, embedded: true, way: "card", ...body } }, mail), { paid: false, processing: true }, JSON.stringify(body));
  }
  assert.equal(stripe.made.length, 0);

  stripe.payments[PAYMENT].status = "requires_payment_method";
  const answer = await op("card-checkout")(db, { body: { token: TOKEN, embedded: true, way: "card", last: PAGE } }, mail);
  assert.equal(answer.clientSecret, "fake-form-1", "a new form");
  assert.deepEqual(stripe.made.map(typesOf), [["card", "link"]]);
  assert.deepEqual([db.tables.Orders[0].status, sold(db)[0], mail.sent.length], ["confirmed", false, 1], "the failure is recorded first: Confirmed, for sale, the client told");
});

test("Admin and the buyer: \"Payment processing\" has its own readable look, sits before Paid in that order's Status menu, and never counts as paid", () => {
  const look = orderStatus.statusLook(orderStatus.PROCESSING);
  assert.deepEqual(look, { label: "Payment processing", bg: "#2f5f8a", fg: "#fff", step: 1, dot: "#2f5f8a" });
  assert.ok(contrast(look.fg, look.bg) >= 4.5, `white on its blue reads at ${contrast(look.fg, look.bg).toFixed(2)}:1`);
  assert.deepEqual(orderStatus.statusOptions("processing").map(([v]) => v), ["pending", "confirmed", "processing", "paid", "shipped", "delivered"]);
  assert.equal(orderStatus.statusOptions("processing")[2][1], "Payment processing");
  for (const status of ["pending", "confirmed", "paid", "shipped", "delivered"]) assert.equal(orderStatus.statusOptions(status), orderStatus.ORDER_STATUSES, `${status}: the five steps, as before`);
  assert.equal(orderStatus.isPaid("processing"), false);
  assert.equal(orderStatus.canMarkPaid("processing"), false, "no Mark paid while the bank payment clears");
  assert.match(read("src/admin/OrdersTab.jsx"), /statusOptions\(status\)\.map\(/, "an order's own Status menu shows it");
});

test("the thank-you while a bank payment clears: no \"Paid\", the pieces and their total, and what happens next", async () => {
  const PaidThanks = await loadPaidThanks();
  const tree = PaidThanks({ view: { ...CART_VIEW, processing: true }, artworks: [], action: null });
  const text = textOf(tree);
  assert.equal(invoiceView.BANK_CLEARING.title, "Payment processing");
  assert.match(text, /Thank you!We're holding your order while your bank payment clears\./);
  assert.ok(text.includes(`${invoiceView.BANK_CLEARING.title}${invoiceView.BANK_CLEARING.note}`));
  assert.match(invoiceView.BANK_CLEARING.note, /up to 4 business days/);
  assert.doesNotMatch(text, /Paid by|Thank you for your payment|Congratulations/);
  assert.deepEqual(findAll(tree, n => n.type === PayArt).map(n => [n.props.lines, n.props.total, n.props.totalLabel]), [[CART_VIEW.lines, 800, "Total"]]);
  assert.match(text, /Also in the email we send once it clears/);
});

test("Stripe's messages: the three about a payment page are heard, any other is ignored, and the kind a message claims is never believed", async () => {
  fakeStripe({ pages: { [PAGE]: bankPage({ payment_status: "paid", payment_method_types: ["card", "link"] }) }, payments: { [PAYMENT]: { status: "succeeded", type: "card" } } });
  const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
  const mail = mailbox();
  assert.deepEqual(await op("stripe-event")(db, message(PAGE, "payment_intent.succeeded"), mail), { received: true, ignored: "payment_intent.succeeded" });
  assert.equal(db.tables.Orders[0].status, "confirmed");
  assert.deepEqual(await op("stripe-event")(db, message(PAGE, "checkout.session.async_payment_failed"), mail), { received: true, paid: true }, "says failed, Stripe says paid: paid");
  assert.deepEqual([db.tables.Orders[0].status, db.tables.Orders[0].paid_method, mail.sent.length], ["paid", "card", 2]);
  fakeStripe({ pages: { [PAGE]: bankPage() }, payments: BANK("processing") });
  const clearing = fakeDb({ Orders: [invoice()], Artworks: arts() });
  assert.deepEqual(await op("stripe-event")(clearing, message(PAGE, "checkout.session.async_payment_succeeded"), mail), { received: true, processing: true }, "says succeeded, Stripe says clearing: not paid");
  assert.equal(clearing.tables.Orders[0].status, "processing");
});

// LAST in this file: Stripe saying a way is switched off is remembered for as long as the server
// runs, so the ways card-setup answers change from here on.
test("card-setup's ways: all four while the card form can open; a way Stripe says is switched off is left out from then on, any other refusal leaves it in", async () => {
  const ALL = ["card", "link", "klarna", "bank"];
  assert.deepEqual(stripeLib.cardSetup().ways, ALL);
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  assert.deepEqual(stripeLib.cardSetup().ways, [], "no card form, no ways");
  process.env.STRIPE_PUBLISHABLE_KEY = PK;

  fakeStripe({ refuse: refuseIf("klarna", "amount_too_large") });
  await assert.rejects(stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "klarna" }), (e) => e.code === stripeLib.WAY_REFUSED && e.way === "klarna");
  assert.deepEqual(stripeLib.cardSetup().ways, ALL, "an amount Klarna won't take is about one page, not the account");

  fakeStripe({ refuse: refuseIf("link", "payment_method_unactivated") });
  const page = await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "card" });
  assert.equal(page.clientSecret, "fake-form-2", "Link off: the card form opens with cards only");
  assert.deepEqual(stripeLib.cardSetup().ways, ["card", "klarna", "bank"]);

  fakeStripe({ refuse: refuseIf("us_bank_account", "payment_method_unactivated") });
  await assert.rejects(op("card-checkout")(fakeDb({ Orders: [invoice()], Artworks: arts() }), { body: { token: TOKEN, embedded: true, way: "bank" } }, mailbox()),
    (e) => e.status === 409 && e.message === "Paying by bank (ACH) isn't available right now. Please choose another way.");
  assert.deepEqual(stripeLib.cardSetup().ways, ["card", "klarna"]);

  fakeStripe({ refuse: refuseIf("klarna", "payment_method_unactivated") });
  await assert.rejects(stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "klarna" }), (e) => e.message === "Klarna isn't available right now. Please choose another way.");
  const answer = stripeLib.cardSetup();
  assert.deepEqual(answer.ways, ["card"]);
  assert.ok(!JSON.stringify(answer).includes(PK) && !JSON.stringify(answer).includes(SK), "never a key");
});

// The thank-you (src/components/PaidThanks.jsx), compiled with the project's own Vite and drawn once
// by a stand-in for React, as tests/paid-method.test.js does.
const element = (type, props) => ({ type, props: props || {} });
function PayArt() { return null; }
globalThis.__paymentWaysTest = {
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "./PayArt": { default: PayArt },
  "../lib/invoiceView": invoiceView,
};
async function loadPaidThanks() {
  const file = "components/PaidThanks.jsx";
  const { code } = await transformWithOxc(read(`src/${file}`), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in globalThis.__paymentWaysTest)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__paymentWaysTest[${JSON.stringify(from)}]`;
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
// WCAG contrast of two #rrggbb colours.
function contrast(a, b) {
  const lum = (hex) => {
    const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join("")}` : hex;
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
