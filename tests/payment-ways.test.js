// The ways to pay through Stripe, one per payment page (Andy, 2026-11-21: "also paying options look
// what strip offers .. klarma , Secure Link (https://link.com/) , bank transfer / ACH"): "card" is
// cards with Link, "klarna" is Klarna alone, "bank" is a US bank account (ACH) alone, and no way
// (or a word it doesn't know) is cards and Klarna, as before. A bank payment clears days later:
// "Payment processing" meanwhile, the piece held for the buyer, and Paid (with the paid emails)
// only once Stripe says paid, for the exact cents; if it fails, back to unpaid, the piece for sale
// again, one short email to the buyer. Klarna or a bank payment that Stripe refuses for a page: one
// calm line, and never a card form in its place. Which ways the checkout lists, and the server
// opens, is what Stripe itself says is switched on (its payment method settings, and for a bank
// payment its webhook too), never a guess; Stripe unable to say: cards and Klarna, as before.
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

// The clock stripe.js reads (Date.now). It asks Stripe which ways are on at most once every 10
// minutes (stripeWays), so each test, and each new stand-in for Stripe, starts an hour later:
// what an earlier one said is too old to be used. later(minutes) moves it on.
const realNow = Date.now;
let clock = Date.UTC(2026, 10, 21, 12);
const later = (minutes) => { clock += minutes * 60 * 1000; };

// The account's default payment method configuration as Stripe answers it (the one Stripe uses
// when none is named). on: which ways are available, by Stripe's name: all of them unless named,
// Affirm too, which Fonkiart doesn't offer. over: other fields in place of these.
const AVAILABLE = (yes) => ({ available: yes, display_preference: { overridable: null, preference: yes ? "on" : "off", value: yes ? "on" : "off" } });
const config = (on = {}, over = {}) => ({
  id: "pmc_paymentwaysdefault01", object: "payment_method_configuration", active: true, is_default: true, livemode: false, name: "Default",
  ...Object.fromEntries(["card", "link", "klarna", "us_bank_account", "affirm"].map(t => [t, AVAILABLE(on[t] ?? true)])), ...over,
});
// Stripe's webhook to this site's op stripe-event as it must be set up for a bank payment: on,
// with both of a bank payment's endings.
const HOOK = {
  id: "we_paymentwaysbank000001", object: "webhook_endpoint", status: "enabled", livemode: false, api_version: null,
  url: "https://fonkiart.com/api/store?op=stripe-event",
  enabled_events: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"],
};

// Answers like Stripe. pages: its records of payment pages, by id; payments: { status, type } by
// payment id; refuse(form): what Stripe says to a new payment page, null for yes, or
// { status, code, param } for no. made: every new payment page asked for, as the form sent.
// Which ways are on (stripe.js stripeWays): on, as config above, read each time Stripe is asked
// (so a test can switch a way on later), or configs, Stripe's list of configurations in its
// place; hooks, its list of webhooks (HOOK unless named). Either list may be { status, code }
// instead (Stripe refusing to say, as to a restricted key that may not read it), "unreachable"
// (no answer at all), "silent" (an answer that never comes) or any other body, as it is. A new
// stand-in is a new Stripe: the clock moves on an hour first.
function fakeStripe({ pages = {}, payments = {}, refuse = () => null, on = {}, configs, hooks = [HOOK] } = {}) {
  later(60);
  const made = [];
  calls = [];
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
  const list = (what) => (what === "unreachable" ? Promise.reject(new TypeError("fetch failed"))
    : what === "silent" ? new Promise(() => {})
    : Array.isArray(what) ? reply(200, { object: "list", data: what, has_more: false })
    : what?.status ? reply(what.status, { error: { code: what.code, type: "invalid_request_error", message: "Stripe won't say" } })
    : reply(200, what));
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/v1/, "");
    const method = init.method || "GET";
    calls.push(`${method} ${path}`);
    if (method === "GET" && path === "/payment_method_configurations") return list(configs ?? [config(on)]);
    if (method === "GET" && path === "/webhook_endpoints") return list(hooks);
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
  Date.now = () => clock;
  later(60);
  calls = [];
  // Until a test makes its stand-in for Stripe, nothing gets out.
  globalThis.fetch = async (url) => { throw new Error(`asked for ${url} with no stand-in for Stripe`); };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
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
  assert.deepEqual(await op("cart-order")(db, { body: CART_BODY }, mail), { state: "open", ref: "FA-1752", lines: CART_VIEW.lines, total: 800, email: "jane@x.co" }, "the order can be paid again, its email filled in again (the checkout's piece 2)");
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

// The ways to pay, as Stripe says they are switched on (stripe.js stripeWays), and as card-setup
// tells the checkout which rows to show.
const ALL = ["card", "link", "klarna", "bank"];
const BEFORE = ["card", "klarna"];
const waysNow = async () => (await stripeLib.cardSetup()).ways;
const asked = () => calls.filter(c => c === "GET /payment_method_configurations" || c === "GET /webhook_endpoints");

test("card-setup's ways are Stripe's own: a way is listed only while the account's default payment method configuration says it is available", async () => {
  fakeStripe();
  const answer = await stripeLib.cardSetup();
  assert.deepEqual(answer, { card: true, form: true, why: null, ways: ALL }, "all four on, and the webhook a bank payment needs; Affirm, on in Stripe, never listed");
  assert.deepEqual(calls, ["GET /payment_method_configurations", "GET /webhook_endpoints"], "Stripe asked, and no payment page made");
  assert.ok(!JSON.stringify(answer).includes(PK) && !JSON.stringify(answer).includes(SK), "never a key");

  // The control: each one Stripe says isn't available is left out (before this change, all four were listed).
  for (const [off, want] of [["card", ["link", "klarna", "bank"]], ["link", ["card", "klarna", "bank"]], ["klarna", ["card", "link", "bank"]], ["us_bank_account", ["card", "link", "klarna"]]]) {
    fakeStripe({ on: { [off]: false } });
    assert.deepEqual(await waysNow(), want, `${off} not available`);
  }
  fakeStripe({ on: { card: false, link: false, klarna: false, us_bank_account: false } });
  assert.deepEqual(await waysNow(), [], "none available, none listed");
  // On in the Dashboard, but Stripe hasn't activated it yet: Stripe says not available.
  fakeStripe({ configs: [config({}, { us_bank_account: { available: false, display_preference: { overridable: null, preference: "on", value: "on" } } })] });
  assert.deepEqual(await waysNow(), ["card", "link", "klarna"], "switched on, not active yet: not listed");
  // Only the default configuration counts, the one Stripe uses when none is named.
  fakeStripe({ configs: [config({ klarna: false, us_bank_account: false }, { id: "pmc_paymentwaysother001", is_default: false }), config({ link: false })] });
  assert.deepEqual(await waysNow(), ["card", "klarna", "bank"]);

  delete process.env.STRIPE_PUBLISHABLE_KEY;
  fakeStripe();
  assert.deepEqual(await waysNow(), [], "no card form, no ways");
  assert.deepEqual(calls, [], "and Stripe isn't asked");
});

test("a bank payment is listed only while Stripe's webhook to this site's op stripe-event is on, with both of a bank payment's endings", async () => {
  const hook = (over) => ({ ...HOOK, ...over });
  for (const [label, hooks, bank] of [
    ["the webhook as it must be set up", [HOOK], true],
    ["every event (*)", [hook({ enabled_events: ["*"] })], true],
    ["both endings, without the page finishing", [hook({ enabled_events: ["checkout.session.async_payment_failed", "checkout.session.async_payment_succeeded"] })], true],
    ["one webhook of several", [hook({ id: "we_paymentwaysother0001", url: "https://example.com/hook" }), HOOK], true],
    ["no webhook at all", [], false],
    ["switched off", [hook({ status: "disabled" })], false],
    ["only the page finishing (the card payments' message)", [hook({ enabled_events: ["checkout.session.completed"] })], false],
    ["one ending only", [hook({ enabled_events: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] })], false],
    ["another site", [hook({ url: "https://example.com/api/store?op=stripe-event" })], false],
    ["www, which only sends Stripe on (Stripe doesn't follow)", [hook({ url: "https://www.fonkiart.com/api/store?op=stripe-event" })], false],
    ["not https", [hook({ url: "http://fonkiart.com/api/store?op=stripe-event" })], false],
    ["another op", [hook({ url: "https://fonkiart.com/api/store?op=card-paid" })], false],
    ["another path", [hook({ url: "https://fonkiart.com/api/stripe?op=stripe-event" })], false],
    ["not an address", [hook({ url: "fonkiart" })], false],
  ]) {
    fakeStripe({ hooks });
    assert.deepEqual(await waysNow(), bank ? ALL : ["card", "link", "klarna"], label);
  }
});

test("Stripe can't say which ways are on (a restricted key, out of reach, too slow, an answer it can't read): cards and Klarna, exactly as before, and nothing throws", async () => {
  for (const [label, stand] of [
    ["may not read the configurations (a restricted key)", { configs: { status: 403 } }],
    ["may not read the webhooks (a restricted key)", { hooks: { status: 403 } }],
    ["Stripe down", { configs: { status: 500, code: "api_error" } }],
    ["out of reach", { configs: "unreachable", hooks: "unreachable" }],
    ["no configurations", { configs: [] }],
    ["no default configuration", { configs: [config({}, { is_default: false })] }],
    ["the default one not active", { configs: [config({}, { active: false })] }],
    ["an answer it can't read", { configs: { object: "list", data: "nope" } }],
    ["a default one that doesn't say whether cards are on", { configs: [without(config(), "card")] }],
  ]) {
    fakeStripe(stand);
    logs = [];
    assert.deepEqual(await stripeLib.cardSetup(), { card: true, form: true, why: null, ways: BEFORE }, label);
    assert.ok(logs.some(l => l.includes("couldn't learn from Stripe which ways to pay are on")), `${label}: the log says so`);
  }
  fakeStripe({ configs: "silent" });
  assert.deepEqual(await stripeLib.stripeWays({ waitMs: 20 }), BEFORE, "an answer that never comes: cards and Klarna, after a short wait");
  assert.ok(logs.some(l => l.includes("didn't answer within 20 ms")));
  assert.deepEqual(await waysNow(), BEFORE, "and card-setup doesn't wait for it again");
});

test("Stripe is asked at most once every 10 minutes per server, and everyone asking meanwhile shares that one answer", async () => {
  const on = { klarna: false };
  fakeStripe({ on });
  assert.deepEqual(await Promise.all([waysNow(), waysNow()]), [["card", "link", "bank"], ["card", "link", "bank"]]);
  assert.equal(asked().length, 2, "two at once: Stripe asked once (its two lists)");
  on.klarna = true; // switched on in the Dashboard
  later(9);
  assert.deepEqual(await waysNow(), ["card", "link", "bank"], "9 minutes on: the same answer");
  await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "bank" });
  assert.equal(asked().length, 2, "a payment page made meanwhile goes by the same answer");
  later(2);
  assert.deepEqual(await waysNow(), ALL, "11 minutes on: asked again, and Klarna is there");
  assert.equal(asked().length, 4);

  fakeStripe({ configs: "unreachable" });
  assert.deepEqual(await waysNow(), BEFORE);
  later(5);
  assert.deepEqual(await waysNow(), BEFORE);
  assert.equal(asked().length, 2, "Stripe out of reach: not asked again within the 10 minutes, so no checkout waits on it twice");
});

test("the server goes by the same answer: Klarna or a bank payment not on is refused at once, in calm words, with no page and never a card form; the card way carries Link only while Link is on", async () => {
  const OFF = (name) => `${name} isn't available right now. Please choose another way.`;
  for (const [label, stand, way, line] of [
    ["bank not on", { on: { us_bank_account: false } }, "bank", OFF("Paying by bank (ACH)")],
    ["bank on, but no webhook to tell how it ends", { hooks: [] }, "bank", OFF("Paying by bank (ACH)")],
    ["Stripe can't say (a restricted key)", { configs: { status: 403 } }, "bank", OFF("Paying by bank (ACH)")],
    ["Klarna not on", { on: { klarna: false } }, "klarna", OFF("Klarna")],
  ]) {
    const stripe = fakeStripe(stand);
    const db = fakeDb({ Orders: [invoice()], Artworks: arts() });
    const cdb = fakeDb({ Orders: cartRows(), Artworks: arts() });
    const mail = mailbox();
    await assert.rejects(op("card-checkout")(db, { body: { token: TOKEN, embedded: true, way } }, mail), (e) => e.status === 409 && e.message === line, label);
    await assert.rejects(op("cart-again")(cdb, { body: { ...CART_BODY, way } }, mail), (e) => e.status === 409 && e.message === line, `${label}: cart-again`);
    assert.deepEqual(await cart.opCartCard(fakeDb({}), { embedded: true, way }, mail, savedOrder),
      { ref: "FA-1752", ids: [41, 42], lines: CART_VIEW.lines, total: 800, refused: way, cardError: line }, `${label}: cart-card keeps the order, no form`);
    assert.equal(stripe.made.length, 0, `${label}: no payment page asked for`);
    assert.deepEqual([db.tables.Orders[0].status, orderWrites(db), orderWrites(cdb), mail.sent], ["confirmed", [], [], []], `${label}: nothing changes, nobody is emailed`);
    assert.ok(logs.some(l => l.includes("isn't switched on in Stripe, so no page and no card form instead")), label);
  }
  for (const [label, stand, types] of [["Link on", {}, ["card", "link"]], ["Link not on", { on: { link: false } }, ["card"]], ["Stripe can't say", { configs: { status: 403 } }, ["card"]]]) {
    const stripe = fakeStripe(stand);
    assert.equal((await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "card" })).clientSecret, "fake-form-1", label);
    assert.deepEqual(stripe.made.map(typesOf), [types], `${label}: one ask, and the card form opens`);
    assert.equal(stripe.made[0].get("redirect_on_completion"), types.length > 1 ? "if_required" : "never", label);
  }
  const plain = fakeStripe({ configs: { status: 403 } });
  await stripeLib.createCheckout({ order: invoice(), invNum: "FA-1" });
  assert.deepEqual(plain.made.map(typesOf), [BEFORE], "no way named: cards and Klarna, as before");
  assert.deepEqual(asked(), [], "and Stripe isn't asked which ways are on");
});

test("the refusal line stays as the backstop: a way Stripe lists as on but then won't open is \"not available right now\", and never a card form; Stripe's lists still decide what's listed", async () => {
  const bank = fakeStripe({ refuse: refuseIf("us_bank_account", "payment_method_unactivated") });
  await assert.rejects(op("card-checkout")(fakeDb({ Orders: [invoice()], Artworks: arts() }), { body: { token: TOKEN, embedded: true, way: "bank" } }, mailbox()),
    (e) => e.status === 409 && e.message === "Paying by bank (ACH) isn't available right now. Please choose another way.");
  assert.deepEqual(bank.made.map(typesOf), [["us_bank_account"]], "asked once; never a card form");
  assert.deepEqual(await waysNow(), ALL, "what Stripe's lists say still decides the ways, not one refusal");
  fakeStripe({ refuse: refuseIf("klarna", "payment_method_unactivated") });
  await assert.rejects(stripeLib.createCheckout({ order: invoice(), invNum: "FA-1", way: "klarna" }),
    (e) => e.code === stripeLib.WAY_REFUSED && e.way === "klarna" && e.message === "Klarna isn't available right now. Please choose another way.");
});

test("a Cart order whose bank payment failed can be paid again another way: a new form, or Zelle; one whose bank payment is still clearing can't", async () => {
  const failedOrder = () => ({
    stripe: fakeStripe({ pages: { [CART_PAGE]: bankCartPage() }, payments: BANK("requires_payment_method") }),
    db: fakeDb({ Orders: cartRows({ status: "processing", art_held: true, bank_page: CART_PAGE }), Artworks: arts({ isSold: true }) }),
    mail: mailbox(),
  });
  const FAILED = "Your bank payment didn't go through — 2 pieces · Fonkiart";
  // The control: before this change, both answered "This order already has a card payment" (a 409).
  const again = failedOrder();
  const answer = await op("cart-again")(again.db, { body: { ...CART_BODY, session: CART_PAGE, way: "card" } }, again.mail);
  assert.deepEqual([answer.clientSecret, answer.ref, answer.ids, answer.total], ["fake-form-1", "FA-1752", [41, 42], 800], "a new card form, for the same rows");
  assert.deepEqual(again.stripe.made.map(typesOf), [["card", "link"]], "for the way the buyer chose now");
  assert.deepEqual(again.db.tables.Orders.map(r => [r.status, r.art_held]), [["pending", false], ["pending", false]], "the failure recorded first");
  assert.deepEqual(sold(again.db), [false, false], "the pieces for sale again until it's paid");
  assert.deepEqual(again.mail.sent.map(m => [m.to, m.subject]), [["jane@x.co", FAILED]], "the buyer told, once");
  const twice = await op("cart-again")(again.db, { body: { ...CART_BODY, session: CART_PAGE, way: "klarna" } }, again.mail);
  assert.equal(twice.clientSecret, "fake-form-2", "asked again, another way: another form");
  assert.deepEqual(again.stripe.made.map(typesOf), [["card", "link"], ["klarna"]]);
  assert.equal(again.mail.sent.length, 1, "still one email");

  const other = failedOrder();
  assert.deepEqual(await op("cart-other")(other.db, { body: { ...CART_BODY, session: CART_PAGE, method: "zelle" } }, other.mail), { ok: true, ref: "FA-1752" });
  assert.deepEqual(other.db.tables.Orders.map(r => [r.status, r.notes]), [["pending", "Order Ref: FA-1752 · Jane Doe · Paying by Zelle"], ["pending", "Order Ref: FA-1752 · Jane Doe · Paying by Zelle"]]);
  assert.equal(other.stripe.made.length, 0);
  const sent = other.mail.sent.map(m => `${m.to}: ${m.subject}`);
  assert.equal(sent.length, 3, sent.join(" | "));
  assert.equal(sent[0], `jane@x.co: ${FAILED}`, "the failure first");
  assert.ok(sent.some(t => /^jane@x\.co: Order Received — .+ · Fonkiart$/.test(t)) && sent.some(t => /^shop@fonkiart\.com: 🎨 New Order FA-1752: /.test(t)), "then the order received pair, as for any Zelle order");

  const stripe = fakeStripe({ pages: { [CART_PAGE]: bankCartPage() }, payments: BANK("processing") });
  const db = fakeDb({ Orders: cartRows({ status: "processing", art_held: true, bank_page: CART_PAGE }), Artworks: arts({ isSold: true }) });
  const mail = mailbox();
  const CLEARING = "This order's bank payment is still clearing. We'll email you as soon as it does.";
  await assert.rejects(op("cart-again")(db, { body: { ...CART_BODY, session: CART_PAGE, way: "card" } }, mail), (e) => e.status === 409 && e.message === CLEARING);
  await assert.rejects(op("cart-other")(db, { body: { ...CART_BODY, session: CART_PAGE, method: "zelle" } }, mail), (e) => e.status === 409 && e.message === CLEARING);
  assert.equal(stripe.made.length, 0, "no new page while it clears");
  assert.deepEqual([db.tables.Orders.map(r => [r.status, r.notes]), sold(db), mail.sent.length],
    [[["processing", "Order Ref: FA-1752 · Jane Doe · Paying by card"], ["processing", "Order Ref: FA-1752 · Jane Doe · Paying by card"]], [true, true], 0], "nothing changes");
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
