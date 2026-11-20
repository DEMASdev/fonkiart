// Card payments (Andy, 2026-11-17: "why do i need to put a new link ? is it needed ?" ...
// "Yes, do it ... FOR NOW"). Stripe is never called for real here: fetch is replaced by a
// fake that records what we would have sent and answers like Stripe does.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formBody, toCents, createCheckout, checkoutPaidFor, cardCheck, cardReady } from "../api/_lib/stripe.js";
import { opCardCheckout, opCardPaid, opInvoice, STORE_OPS } from "../api/_lib/storeOps.js";
import { CARD_FORM_DOWN } from "../api/_lib/cartCheckout.js";
import { readSlot } from "../api/_lib/emails.js";
import { isPaid, canMarkPaid, ORDER_STATUSES, markPaidChoices, asksPaidMethod, statusChange, resendQuestion } from "../src/lib/orderStatus.js";
import { validateChain } from "../api/_lib/adminOps.js";
import storeHandler from "../api/store.js";

const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_"); // in pieces: no key-shaped text in the repo
const realFetch = globalThis.fetch;
let calls;

// Answers like Stripe: a new payment page, or the page's state when asked about it.
function fakeStripe(answer) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? new URLSearchParams(init.body) : null });
    const { status = 200, json } = answer(url, init);
    return { ok: status < 400, status, json: async () => json };
  };
}

beforeEach(() => { process.env.STRIPE_SECRET_KEY = "rk_test_FAKEKEYFORTESTS"; calls = []; });
afterEach(() => { globalThis.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_PUBLISHABLE_KEY; });

const order = (over = {}) => ({
  id: 21, invoice_token: TOKEN, invoice_approved: true, status: "confirmed", item_title: "Frida the manatee",
  amount: 450, client_name: "Ana Lopez", client_email: "ana@example.com", payment_methods: "zelle,stripe",
  created_at: "2026-11-17T21:19:56.080514+00:00", ...over,
});

// One Orders table (+ Settings), records every update; updateError makes updates fail.
function fakeDb(rows, { updateError = null } = {}) {
  const updates = [];
  const from = (table) => {
    let payload = null; const filters = [];
    const q = {
      select: () => q, limit: () => q,
      maybeSingle: () => Promise.resolve({ data: table === "Settings" ? { zelleContact: "shop@example.com" } : null, error: null }),
      update: (v) => { payload = v; return q; },
      eq: (k, v) => { filters.push(r => String(r[k]) === String(v)); return q; },
      in: (k, list) => { filters.push(r => list.includes(r[k])); return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        const hit = rows.filter(r => filters.every(f => f(r)));
        if (payload) {
          if (updateError) return { data: null, error: { message: updateError } };
          updates.push(payload); hit.forEach(r => Object.assign(r, payload));
          return { data: hit.map(r => ({ id: r.id })), error: null };
        }
        return { data: hit.map(r => ({ ...r })), error: null };
      }).then(ok, bad),
    };
    return q;
  };
  return { from, updates };
}
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };

test("Stripe gets form fields with [brackets], and money in cents", () => {
  const b = formBody({ mode: "payment", line_items: [{ quantity: 1, price_data: { unit_amount: 45000 } }], skip: undefined, empty: "" });
  assert.equal(b.get("mode"), "payment");
  assert.equal(b.get("line_items[0][quantity]"), "1");
  assert.equal(b.get("line_items[0][price_data][unit_amount]"), "45000");
  assert.equal(b.has("skip"), false);
  assert.equal(b.has("empty"), false);
  assert.equal(toCents(450), 45000);
  assert.equal(toCents("12.5"), 1250);
  assert.equal(toCents(0.1 + 0.2), 30, "no 29.999 cents");
  assert.equal(toCents("abc"), 0);
});

test("the payment page asks for the invoice's EXACT amount, with its number, as a card form for INSIDE the invoice page: paid by card, nobody is sent anywhere; Klarna comes back to the invoice", async () => {
  fakeStripe(() => ({ json: { id: SESSION, client_secret: `${SESSION}_secret_FAKE` } }));
  const made = await createCheckout({ order: order(), invNum: "FA-261117161956080" });
  assert.deepEqual(made, { id: SESSION, clientSecret: `${SESSION}_secret_FAKE` });
  assert.equal(calls.length, 1);
  const { url: to, method, headers, body } = calls[0];
  assert.equal(to, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(method, "POST");
  assert.equal(headers.Authorization, "Bearer rk_test_FAKEKEYFORTESTS");
  assert.equal(body.get("mode"), "payment");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "45000");
  assert.equal(body.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(body.get("line_items[0][price_data][product_data][name]"), "Frida the manatee");
  assert.equal(body.get("line_items[0][price_data][product_data][description]"), "Invoice FA-261117161956080");
  assert.equal(body.get("metadata[invoice_token]"), TOKEN);
  assert.equal(body.get("client_reference_id"), "FA-261117161956080");
  assert.equal(body.get("customer_email"), "ana@example.com");
  assert.equal(body.get("ui_mode"), "embedded");
  // Cards and Klarna (Andy, 2026-11-20): a card is paid in the form ("if_required" sends it nowhere);
  // only Klarna leaves, and comes back to this invoice on the shop's own address (tests/klarna.test.js).
  assert.equal(body.get("redirect_on_completion"), "if_required");
  assert.equal(body.get("return_url"), `https://fonkiart.com/?invoice=${TOKEN}&card={CHECKOUT_SESSION_ID}`);
  for (const k of ["success_url", "cancel_url"]) assert.equal(body.has(k), false, k);
  assert.deepEqual([...body.entries()].filter(([, v]) => /^https?:/.test(v)).map(([k]) => k), ["return_url"], "no other address for Stripe to send anyone to");
  // Stripe answering without the form's secret, or without a page id, is a failure, not a form.
  for (const json of [{ id: SESSION }, { client_secret: "x" }, { id: "nope", client_secret: "x" }]) {
    fakeStripe(() => ({ json }));
    await assert.rejects(createCheckout({ order: order(), invNum: "FA-1" }), /Stripe sent no/, JSON.stringify(json));
  }
});

test("no Stripe key, or an amount under 50 cents: nothing is sent to Stripe", async () => {
  fakeStripe(() => ({ json: { url: "https://checkout.stripe.com/x" } }));
  await assert.rejects(createCheckout({ order: order({ amount: 0.4 }), invNum: "FA-1" }), /too small/);
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(cardReady(), false);
  await assert.rejects(createCheckout({ order: order(), invNum: "FA-1" }), /not set up/);
  process.env.STRIPE_SECRET_KEY = "pk_live_PUBLISHABLEKEY";
  assert.equal(cardReady(), false, "a publishable key can't take payments");
  assert.equal(calls.length, 0);
});

test("Paid only when Stripe itself says paid, for THIS invoice and THIS amount", async () => {
  const page = (over = {}) => ({ id: SESSION, payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN }, ...over });
  for (const [label, json, want] of [
    ["paid, matching", page(), true],
    ["not paid yet", page({ payment_status: "unpaid" }), false],
    ["another invoice", page({ metadata: { invoice_token: "someone-else" } }), false],
    ["another amount", page({ amount_total: 100 }), false],
    ["another currency", page({ currency: "eur" }), false],
  ]) {
    fakeStripe(() => ({ json }));
    assert.equal(await checkoutPaidFor({ sessionId: SESSION, order: order() }), want, label);
    assert.equal(calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${SESSION}`);
  }
  fakeStripe(() => ({ json: page() }));
  assert.equal(await checkoutPaidFor({ sessionId: "cs_live_x/../../v1/charges", order: order() }), false, "a made-up id never reaches Stripe");
  assert.equal(calls.length, 0);
});

test("Pay by card: only after the client confirmed, only if card was ticked, never twice", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  const form = { token: TOKEN, embedded: true };
  fakeStripe(() => ({ json: { id: SESSION, client_secret: `${SESSION}_secret_FAKE` } }));
  assert.equal((await opCardCheckout(fakeDb([order()]), form, mailbox())).session, SESSION);
  await assert.rejects(opCardCheckout(fakeDb([order({ invoice_approved: false, status: "pending" })]), form, mailbox()), /confirm the invoice first/);
  await assert.rejects(opCardCheckout(fakeDb([order({ payment_methods: "zelle" })]), form, mailbox()), /not offered/);
  calls = [];
  assert.deepEqual(await opCardCheckout(fakeDb([order({ status: "paid" })]), form, mailbox()), { paid: true }, "already paid: no new payment page");
  assert.equal(calls.length, 0);
  fakeStripe(() => ({ status: 401, json: { error: { message: "Invalid API Key provided", code: "invalid_key" } } }));
  const { error } = console; console.error = () => {};
  try {
    await assert.rejects(opCardCheckout(fakeDb([order()]), form, mailbox()), /isn't working right now/, "Stripe's own error never reaches the client");
  } finally { console.error = error; }
});

test("back from Stripe, paid: the order turns Paid ONCE, the shop and the client each get one email", async () => {
  const row = order();
  const db = fakeDb([row]);
  const mail = mailbox();
  fakeStripe(() => ({ json: { payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } } }));
  assert.deepEqual(await opCardPaid(db, { token: TOKEN, session: SESSION }, mail), { paid: true });
  assert.deepEqual(db.updates, [{ status: "paid", invoice_approved: true, paid_method: "card" }]);
  assert.equal(row.status, "paid");
  assert.deepEqual(mail.sent.map(m => m.to).sort(), ["ana@example.com", "shop@fonkiart.com"]);
  const shop = mail.sent.find(m => m.to === "shop@fonkiart.com");
  assert.equal(shop.subject, "Paid by card ✓ — Frida the manatee · $450");
  assert.match(shop.htmlContent, /already marked the order <strong>Paid<\/strong>/);
  const client = mail.sent.find(m => m.to === "ana@example.com");
  assert.equal(client.subject, "Payment received — Frida the manatee · Fonkiart");
  assert.match(client.htmlContent, /FA-261117161956080/);
  assert.match(client.htmlContent, /We will be sending you a tracking number or delivery updates if shipping is needed\./, "the paid invoice's tracking sentence");
  // A reload (or a second tab) must not mark it again or email again.
  assert.deepEqual(await opCardPaid(db, { token: TOKEN, session: SESSION }, mail), { paid: true });
  assert.equal(db.updates.length, 1);
  assert.equal(mail.sent.length, 2);
});

test("two tabs coming back at the same moment: still one Paid, one email each", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  fakeStripe(() => ({ json: { payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } } }));
  await Promise.all([1, 2].map(() => opCardPaid(db, { token: TOKEN, session: SESSION }, mail)));
  assert.equal(mail.sent.length, 2, "one to the shop, one to the client");
});

test("back from Stripe, NOT paid: nothing changes and nobody is emailed", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  fakeStripe(() => ({ json: { payment_status: "unpaid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } } }));
  assert.deepEqual(await opCardPaid(db, { token: TOKEN, session: SESSION }, mail), { paid: false });
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("paid, but the database refuses the change: the shop is told to mark it by hand", async () => {
  const db = fakeDb([order()], { updateError: "violates check constraint" });
  const mail = mailbox();
  fakeStripe(() => ({ json: { payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } } }));
  assert.deepEqual(await opCardPaid(db, { token: TOKEN, session: SESSION }, mail), { paid: true });
  const shop = mail.sent.find(m => m.to === "shop@fonkiart.com");
  assert.match(shop.htmlContent, /could not mark the order Paid/);
});

test("the invoice page is told whether card payments are set up, never the key", async () => {
  const r = await opInvoice(fakeDb([order()]), { token: TOKEN });
  assert.equal(r.cardReady, true);
  assert.doesNotMatch(JSON.stringify(r), /FAKEKEY/);
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal((await opInvoice(fakeDb([order()]), { token: TOKEN })).cardReady, false);
});

test("Admin's Stripe check: says OFF with the reason, or ON after Stripe accepts the key", async () => {
  fakeStripe(() => ({ json: { data: [] } }));
  assert.deepEqual(await cardCheck(), { ready: true, live: false });
  fakeStripe(() => ({ status: 401, json: { error: { message: "Invalid API Key provided" } } }));
  assert.match((await cardCheck()).reason, /Stripe refused the key: Invalid API Key/);
  delete process.env.STRIPE_SECRET_KEY;
  assert.match((await cardCheck()).reason, /No Stripe key/);
});

test("the order steps: Paid sits between Confirmed and Shipped; money is in from Paid on", () => {
  assert.deepEqual(ORDER_STATUSES.map(([v]) => v), ["pending", "confirmed", "paid", "shipped", "delivered"]);
  assert.deepEqual(["pending", "confirmed", "paid", "shipped", "delivered"].map(isPaid), [false, false, true, true, true]);
  assert.deepEqual([undefined, "pending", "confirmed", "paid", "shipped"].map(canMarkPaid), [true, true, true, false, false]);
});

test("Mark paid asks how the money came: the ways the invoice offered (its card is 'stripe'), then Cash and Other", () => {
  const offered = (methods) => markPaidChoices(methods).map(([v]) => v);
  assert.deepEqual(offered("zelle,stripe"), ["zelle", "card", "cash", "other"]);
  assert.deepEqual(offered("venmo"), ["venmo", "cash", "other"]);
  assert.deepEqual(offered("cashapp,venmo,zelle"), ["zelle", "venmo", "cashapp", "cash", "other"], "always in the same order");
  const all = ["zelle", "venmo", "cashapp", "card", "cash", "other"];
  assert.deepEqual(offered(null), all, "an old invoice saved no ways: all four");
  assert.deepEqual(offered(""), all, "nothing ticked: all four");
  assert.deepEqual(markPaidChoices("zelle,venmo,cashapp,stripe").map(([, label]) => label), ["Zelle", "Venmo", "Cash App", "Card", "Cash", "Other"]);
});

// Picking Paid in a Status menu (an order's, or "+ Add Order") asks the same question first.
// The server refuses an empty paid_method (a 400), so a status change must never carry one.
test("Status menus: only Paid asks 'Paid by:' first; paid_method goes only with Paid, never empty, and the server takes every change", () => {
  assert.deepEqual(ORDER_STATUSES.map(([v]) => asksPaidMethod(v)), [false, false, true, false, false]);
  assert.deepEqual(statusChange("paid", "zelle"), { status: "paid", paid_method: "zelle" });
  for (const none of [undefined, null, ""]) assert.deepEqual(statusChange("paid", none), { status: "paid" }, JSON.stringify(none));
  for (const s of ["pending", "confirmed", "shipped", "delivered"]) assert.deepEqual(statusChange(s, "zelle"), { status: s }, `${s} leaves paid_method alone`);
  for (const [status] of ORDER_STATUSES) for (const method of [undefined, null, "", ...markPaidChoices(null).map(([v]) => v)]) {
    const change = statusChange(status, method), why = `${status}, ${JSON.stringify(method)}`;
    assert.doesNotThrow(() => validateChain("Orders", [{ m: "update", a: [change] }, { m: "eq", a: ["id", 1] }]), why);
    assert.doesNotThrow(() => validateChain("Orders", [{ m: "insert", a: [[{ item_title: "A", ...change }]] }]), `new order: ${why}`);
  }
});

// Resend asks first (Andy, 2026-11-17: "this invoice was sent already ... or this invoice was
// sent already and paid"). Once the money is in (Paid, Shipped, Delivered) it says "and paid".
test("Resend warns before sending again, and says 'and paid' once the money is in", () => {
  const sent = "This invoice was sent already. Send it again?";
  const paid = "This invoice was sent already and paid. Send it again?";
  assert.deepEqual([undefined, "pending", "confirmed", "paid", "shipped", "delivered"].map(resendQuestion), [sent, sent, sent, paid, paid, paid]);
});

test("cards and Klarna, nothing slower (no bank transfer that comes back 'not paid yet'); Apple Pay and Google Pay count as cards", async () => {
  fakeStripe(() => ({ json: { id: SESSION, client_secret: `${SESSION}_secret_FAKE` } }));
  await createCheckout({ order: order(), invNum: "FA-261117161956080" });
  const { body } = calls[0];
  assert.deepEqual([...body.keys()].filter(k => k.startsWith("payment_method_types")), ["payment_method_types[0]", "payment_method_types[1]"]);
  assert.deepEqual([body.get("payment_method_types[0]"), body.get("payment_method_types[1]")], ["card", "klarna"]);
});

// ── the invoice's card form INSIDE the invoice page (Andy, 2026-11-18: "i don't want to be making
// the user jump to stripe then back") ──────────────────────────────────────────────────────────
const FORM = { token: TOKEN, embedded: true };
const SECRET = `${SESSION}_secret_FAKE`;
const OLD = "cs_test_beforeBEFORE01";
const quiet = async (fn) => { const { warn, error } = console; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { Object.assign(console, { warn, error }); } };
// Stripe keeping its pages: GET answers a page's record, /expire closes an OPEN page (any other is
// refused, as Stripe does), and a POST makes a new open page. paidWhenClosed: that page is paid at
// the very moment the shop tries to close it, so Stripe refuses to close it.
function stripePages(pages, { paidWhenClosed = null } = {}) {
  let made = 0;
  fakeStripe((url, init) => {
    const path = url.replace("https://api.stripe.com/v1/checkout/sessions", "");
    if (init.method === "POST" && path === "") {
      const id = `cs_test_newpage${String(++made).padStart(8, "0")}`;
      pages[id] = { id, status: "open", payment_status: "unpaid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } };
      return { json: { id, client_secret: `${id}_secret_FAKE` } };
    }
    const [, id, act] = path.split("/");
    const p = pages[id];
    if (!p) return { status: 404, json: { error: { code: "resource_missing", message: `No such checkout.session: '${id}'` } } };
    if (act === "expire") {
      if (id === paidWhenClosed) Object.assign(p, { status: "complete", payment_status: "paid" });
      if (p.status !== "open") return { status: 400, json: { error: { message: "Only Checkout Sessions with a status of open can be expired." } } };
      p.status = "expired";
    }
    return { json: { ...p } };
  });
  return pages;
}
const openPage = (over = {}) => ({ id: OLD, status: "open", payment_status: "unpaid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN }, ...over });
const asked = () => calls.map(c => [c.method, c.url.replace("https://api.stripe.com/v1/checkout/sessions", "") || "(new page)"]);

test("Pay by card: the card form, INSIDE the invoice page: the invoice's exact amount and number, the piece first, and once paid by card nobody is sent anywhere", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  fakeStripe(() => ({ json: { id: SESSION, client_secret: SECRET } }));
  const db = fakeDb([order()]);
  const mail = mailbox();
  assert.deepEqual(await STORE_OPS["card-checkout"](db, { body: FORM }, mail), {
    ref: "FA-261117161956080", lines: [{ title: "Frida the manatee", amount: 450 }], total: 450,
    session: SESSION, clientSecret: SECRET, publishableKey: PK,
  });
  assert.deepEqual(asked(), [["POST", "(new page)"]]);
  const { body } = calls[0];
  assert.equal(body.get("ui_mode"), "embedded");
  assert.equal(body.get("redirect_on_completion"), "if_required", "a card is paid in place; only Klarna leaves");
  assert.equal(body.get("return_url"), `https://fonkiart.com/?invoice=${TOKEN}&card={CHECKOUT_SESSION_ID}`, "...and comes back to this invoice");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "45000");
  assert.equal(body.get("metadata[invoice_token]"), TOKEN);
  assert.equal(body.get("client_reference_id"), "FA-261117161956080");
  for (const k of ["success_url", "cancel_url"]) assert.equal(body.has(k), false, `no ${k}: never Stripe's own page`);
  assert.deepEqual([db.updates, mail.sent], [[], []], "a card form changes nothing and emails nobody");
});

test("NO JUMP for invoices: no Stripe.js in the browser, or no right publishable key: no page is made at all (never Stripe's own page), and the page hears the calm word", async () => {
  for (const [label, body, pk] of [
    ["a page from before this change (it asks without Stripe.js)", { token: TOKEN }, PK],
    ["embedded is not exactly true", { token: TOKEN, embedded: "true" }, PK],
    ["no publishable key in Vercel", FORM, undefined],
    ["a malformed one (a stray quote)", FORM, `"${PK}"`],
    ["a live key beside a test secret key", FORM, ["pk", "live", "FAKEPUBLISHABLE"].join("_")],
  ]) {
    if (pk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = pk;
    fakeStripe(() => ({ json: { id: SESSION, client_secret: SECRET, url: "https://checkout.stripe.com/c/pay/x" } }));
    await quiet(() => assert.rejects(opCardCheckout(fakeDb([order()]), body, mailbox()), (e) => e.status === 409 && e.message === CARD_FORM_DOWN, label));
    assert.equal(calls.length, 0, `${label}: Stripe was asked nothing`);
  }
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  delete process.env.STRIPE_SECRET_KEY;
  fakeStripe(() => ({ json: { id: SESSION, client_secret: SECRET } }));
  await quiet(() => assert.rejects(opCardCheckout(fakeDb([order()]), FORM, mailbox()), (e) => e.status === 502 && /isn't working right now/.test(e.message), "card payments off since the page loaded"));
  assert.equal(calls.length, 0);
});

test("card again: the page this tab opened before is closed first, so only ONE page can ever take the money; then the new form", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  const pages = stripePages({ [OLD]: openPage() });
  const db = fakeDb([order()]);
  const out = await opCardCheckout(db, { ...FORM, last: OLD }, mailbox());
  assert.deepEqual(asked(), [["GET", `/${OLD}`], ["POST", `/${OLD}/expire`], ["POST", "(new page)"]]);
  assert.equal(pages[OLD].status, "expired");
  assert.deepEqual([out.session, out.clientSecret], ["cs_test_newpage00000001", "cs_test_newpage00000001_secret_FAKE"]);
  assert.deepEqual(db.updates, []);
  // A page closed already is just left as it is.
  pages[OLD].status = "expired";
  calls = [];
  await opCardCheckout(db, { ...FORM, last: OLD }, mailbox());
  assert.deepEqual(asked(), [["GET", `/${OLD}`], ["POST", "(new page)"]]);
});

test("card again, the page before was paid after all: recorded Paid by card ONCE (the paid pair, each showing exactly this piece), and no new form", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  stripePages({ [OLD]: openPage({ status: "complete", payment_status: "paid" }) });
  const row = order();
  const db = fakeDb([row]);
  const mail = mailbox();
  assert.deepEqual(await STORE_OPS["card-checkout"](db, { body: { ...FORM, last: OLD } }, mail), { paid: true });
  assert.deepEqual(asked(), [["GET", `/${OLD}`]], "nothing closed, nothing made");
  assert.deepEqual(db.updates, [{ status: "paid", invoice_approved: true, paid_method: "card" }]);
  assert.deepEqual(mail.sent.map(m => m.subject).sort(), ["Paid by card ✓ — Frida the manatee · $450", "Payment received — Frida the manatee · Fonkiart"]);
  for (const m of mail.sent) assert.deepEqual(readSlot(m.htmlContent).titles, ["Frida the manatee"], `${m.to}: the picture is this invoice's piece`);
  // Asked again (a second tab, a double tap): Paid already, so Stripe is not asked and nobody is emailed.
  assert.deepEqual(await STORE_OPS["card-checkout"](db, { body: { ...FORM, last: OLD } }, mail), { paid: true });
  assert.deepEqual([asked().length, db.updates.length, mail.sent.length], [1, 1, 2]);
  // With no form to offer (no publishable key), a page paid after all is still recorded.
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  stripePages({ [OLD]: openPage({ status: "complete", payment_status: "paid" }) });
  const db2 = fakeDb([order()]);
  assert.deepEqual(await opCardCheckout(db2, { ...FORM, last: OLD }, mailbox()), { paid: true });
  assert.equal(db2.updates.length, 1);
});

test("card again, Stripe won't close the page before because it was paid that very moment: that payment is recorded instead, and no new form", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  stripePages({ [OLD]: openPage() }, { paidWhenClosed: OLD });
  const db = fakeDb([order()]);
  const mail = mailbox();
  assert.deepEqual(await opCardCheckout(db, { ...FORM, last: OLD }, mail), { paid: true });
  assert.deepEqual(asked(), [["GET", `/${OLD}`], ["POST", `/${OLD}/expire`], ["GET", `/${OLD}`]]);
  assert.deepEqual([db.updates.length, mail.sent.length], [1, 2]);
});

test("card again, the page before can't be the money (another amount: the invoice changed since), can't be closed, or Stripe is out of reach: said, and nothing is made or marked", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  stripePages({ [OLD]: openPage({ status: "complete", payment_status: "paid", amount_total: 30000 }) });
  let db = fakeDb([order()]);
  await quiet(() => assert.rejects(opCardCheckout(db, { ...FORM, last: OLD }, mailbox()), (e) => e.status === 409 && /already has a card payment/.test(e.message), "another amount"));
  assert.deepEqual([asked(), db.updates], [[["GET", `/${OLD}`]], []]);
  // Stripe refuses to close a page that is still open (it never should): no second page beside it.
  fakeStripe((url) => url.endsWith("/expire") ? { status: 500, json: { error: { message: "Something went wrong" } } } : { json: openPage() });
  await quiet(() => assert.rejects(opCardCheckout(fakeDb([order()]), { ...FORM, last: OLD }, mailbox()), (e) => e.status === 502));
  assert.deepEqual(asked(), [["GET", `/${OLD}`], ["POST", `/${OLD}/expire`], ["GET", `/${OLD}`]], "no new page");
  // Stripe out of reach when asked about the page before.
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  db = fakeDb([order()]);
  await quiet(() => assert.rejects(opCardCheckout(db, { ...FORM, last: OLD }, mailbox()), (e) => e.status === 502 && /isn't working right now/.test(e.message)));
  assert.deepEqual(db.updates, []);
});

test("card again, the page named isn't one to touch (another invoice's, not a page id, one Stripe doesn't have): left alone, and the new form is made", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  const pages = stripePages({ [OLD]: openPage({ metadata: { invoice_token: "someone-elses-invoice" } }) });
  await opCardCheckout(fakeDb([order()]), { ...FORM, last: OLD }, mailbox());
  assert.deepEqual(asked(), [["GET", `/${OLD}`], ["POST", "(new page)"]], "another invoice's page: asked about, never closed");
  assert.equal(pages[OLD].status, "open");
  stripePages({});
  await opCardCheckout(fakeDb([order()]), { ...FORM, last: "cs_live_x/../../v1/charges" }, mailbox());
  assert.deepEqual(asked(), [["POST", "(new page)"]], "not a page id: never sent to Stripe");
  stripePages({});
  await opCardCheckout(fakeDb([order()]), { ...FORM, last: "cs_test_nosuchpage0001" }, mailbox());
  assert.deepEqual(asked(), [["GET", "/cs_test_nosuchpage0001"], ["POST", "(new page)"]], "a page Stripe doesn't have");
  // No publishable key: the open page before stays exactly as it was (nothing closed, nothing made).
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  const kept = stripePages({ [OLD]: openPage() });
  await quiet(() => assert.rejects(opCardCheckout(fakeDb([order()]), { ...FORM, last: OLD }, mailbox()), (e) => e.status === 409 && e.message === CARD_FORM_DOWN));
  assert.deepEqual([asked(), kept[OLD].status], [[["GET", `/${OLD}`]], "open"]);
});

// Stripe's own "paid" message (op stripe-event). Stripe is asked about the page every time;
// the message itself only supplies the page's id.
const paidPage = (over = {}) => ({ id: SESSION, object: "checkout.session", payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN }, ...over });
const stripeEvent = (type = "checkout.session.completed", object = { id: SESSION }) => ({ id: "evt_test_1", object: "event", type, data: { object } });
const webhook = (db, event, mail) => STORE_OPS["stripe-event"](db, { body: event }, mail);

test("Stripe's message, paid: the order turns Paid, the shop and the client each get one email", async () => {
  const row = order();
  const db = fakeDb([row]);
  const mail = mailbox();
  fakeStripe(() => ({ json: paidPage() }));
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, paid: true });
  assert.deepEqual(calls.map(c => [c.method, c.url]), [["GET", `https://api.stripe.com/v1/checkout/sessions/${SESSION}`]], "asked Stripe itself");
  assert.deepEqual(db.updates, [{ status: "paid", invoice_approved: true, paid_method: "card" }]);
  assert.equal(row.status, "paid");
  assert.deepEqual(mail.sent.map(m => m.to).sort(), ["ana@example.com", "shop@fonkiart.com"]);
  const shop = mail.sent.find(m => m.to === "shop@fonkiart.com");
  assert.equal(shop.subject, "Paid by card ✓ — Frida the manatee · $450");
  assert.match(shop.htmlContent, /already marked the order <strong>Paid<\/strong>/);
  assert.equal(mail.sent.find(m => m.to === "ana@example.com").subject, "Payment received — Frida the manatee · Fonkiart");
});

// The paid invoice says "Paid by ..." from the order's paid_method (Andy, 2026-11-17).
test("a card payment is saved as paid by card, whether the client comes back or Stripe's message comes first", async () => {
  fakeStripe(() => ({ json: paidPage() }));
  const back = order();
  assert.deepEqual(await opCardPaid(fakeDb([back]), { token: TOKEN, session: SESSION }, mailbox()), { paid: true });
  const message = order();
  assert.deepEqual(await webhook(fakeDb([message]), stripeEvent(), mailbox()), { received: true, paid: true });
  assert.deepEqual([back.status, back.paid_method], ["paid", "card"], "the client came back");
  assert.deepEqual([message.status, message.paid_method], ["paid", "card"], "Stripe's message");
});

test("the same Stripe message twice, one after the other or both at once: the emails go out once", async () => {
  fakeStripe(() => ({ json: paidPage() }));
  const db = fakeDb([order()]);
  const mail = mailbox();
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, paid: true });
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, paid: true }, "a replay still gets a 200, so Stripe stops sending it");
  assert.equal(db.updates.length, 1);
  assert.equal(mail.sent.length, 2);
  const db2 = fakeDb([order()]);
  const mail2 = mailbox();
  await Promise.all([1, 2].map(() => webhook(db2, stripeEvent(), mail2)));
  assert.equal(mail2.sent.length, 2, "one to the shop, one to the client");
});

test("the client comes back AND Stripe's message arrives: the emails go out once, whichever is first", async () => {
  fakeStripe(() => ({ json: paidPage() }));
  const back = { token: TOKEN, session: SESSION };
  let db = fakeDb([order()]); let mail = mailbox();
  assert.deepEqual(await opCardPaid(db, back, mail), { paid: true });
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, paid: true });
  assert.equal(mail.sent.length, 2, "client first, then Stripe");
  db = fakeDb([order()]); mail = mailbox();
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, paid: true });
  assert.deepEqual(await opCardPaid(db, back, mail), { paid: true });
  assert.equal(mail.sent.length, 2, "Stripe first, then the client");
  db = fakeDb([order()]); mail = mailbox();
  await Promise.all([opCardPaid(db, back, mail), webhook(db, stripeEvent(), mail)]);
  assert.equal(mail.sent.length, 2, "both at the same moment");
});

test("Stripe's other messages get a 200 and are ignored, without asking Stripe or touching the order", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  fakeStripe(() => ({ json: paidPage() }));
  for (const type of ["payment_intent.succeeded", "checkout.session.expired", "charge.refunded"]) {
    assert.deepEqual(await webhook(db, stripeEvent(type), mail), { received: true, ignored: type });
  }
  assert.deepEqual(await webhook(db, {}, mail), { received: true, ignored: "no type" });
  assert.equal(calls.length, 0);
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("the address Andy gives Stripe: a POST to /api/store?op=stripe-event gets in and is answered 200", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FAKEKEYFORTESTS" };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    const res = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
    const a = res();
    await storeHandler({ method: "POST", query: { op: "stripe-event" }, headers: {}, body: stripeEvent("payment_intent.succeeded") }, a);
    assert.equal(a.code, 200);
    assert.deepEqual(a.body, { received: true, ignored: "payment_intent.succeeded" });
    const b = res();
    await storeHandler({ method: "GET", query: { op: "stripe-event" }, headers: {} }, b);
    assert.equal(b.code, 405, "Stripe always POSTs; a GET is refused");
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("a message whose id isn't a payment page's is ignored, and that id never reaches Stripe", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  fakeStripe(() => ({ json: paidPage() }));
  for (const object of [{ id: "cs_live_x/../../v1/charges" }, { id: "pi_3Abc1234567890" }, { id: 12345 }, {}, null]) {
    assert.deepEqual(await webhook(db, stripeEvent("checkout.session.completed", object), mail), { received: true, ignored: "not a payment page id" });
  }
  assert.equal(calls.length, 0);
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("Stripe says the page is not paid (or not this amount): nothing changes, even when the message claims it is paid", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  const claims = stripeEvent("checkout.session.completed", paidPage());
  for (const stripeSays of [paidPage({ payment_status: "unpaid" }), paidPage({ amount_total: 100 }), paidPage({ currency: "eur" })]) {
    fakeStripe(() => ({ json: stripeSays }));
    assert.deepEqual(await webhook(db, claims, mail), { received: true, ignored: "not paid" });
  }
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("a paid page for no order the shop has: 200 and nothing, and the order is found from Stripe's answer, not the message", async () => {
  const row = order();
  const db = fakeDb([row]);
  const mail = mailbox();
  const claimsOurs = stripeEvent("checkout.session.completed", paidPage());
  for (const stripeSays of [
    paidPage({ metadata: { invoice_token: "00000000-dead-4000-8000-000000000000" } }), // another invoice
    paidPage({ metadata: {} }),                                                     // e.g. an old Payment Link
    paidPage({ metadata: { invoice_token: "../../x" } }),
  ]) {
    fakeStripe(() => ({ json: stripeSays }));
    assert.deepEqual(await webhook(db, claimsOurs, mail), { received: true, ignored: "unknown order" });
  }
  assert.equal(row.status, "confirmed");
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("the database fails on Stripe's message: 500 and no email, so Stripe sends it again; the retry then works, once", async () => {
  const rows = [order()];
  const mail = mailbox();
  fakeStripe(() => ({ json: paidPage() }));
  await assert.rejects(webhook(fakeDb(rows, { updateError: "connection reset" }), stripeEvent(), mail), e => e.status === 500);
  assert.equal(mail.sent.length, 0, "no email, not even the 'mark it by hand' one");
  assert.equal(rows[0].status, "confirmed");
  // Stripe itself not answering is not a 200 either.
  fakeStripe(() => ({ status: 500, json: { error: { message: "Stripe is having a moment" } } }));
  await assert.rejects(webhook(fakeDb(rows), stripeEvent(), mail), e => e.status === 502);
  assert.equal(mail.sent.length, 0);
  // Stripe sends it again later, and the database is back.
  fakeStripe(() => ({ json: paidPage() }));
  assert.deepEqual(await webhook(fakeDb(rows), stripeEvent(), mail), { received: true, paid: true });
  assert.equal(rows[0].status, "paid");
  assert.equal(mail.sent.length, 2);
  assert.match(mail.sent.find(m => m.to === "shop@fonkiart.com").htmlContent, /already marked the order <strong>Paid<\/strong>/);
});

// The real address, called the way Stripe calls it: what Stripe acts on is the HTTP status.
async function postToStore(event) {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FAKEKEYFORTESTS" };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
    await storeHandler({ method: "POST", query: { op: "stripe-event" }, headers: {}, body: event }, r);
    return { code: r.code, body: r.body };
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// Stripe's answer about a payment page it never had, e.g. one in its own "send test event".
const noSuchPage = { status: 404, json: { error: { type: "invalid_request_error", code: "resource_missing", param: "session", message: `No such checkout.session: '${SESSION}'` } } };

test("Stripe has no such payment page (e.g. its own test event): 200 and nothing, so Stripe stops sending it", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  fakeStripe(() => noSuchPage);
  assert.deepEqual(await webhook(db, stripeEvent(), mail), { received: true, ignored: "no such payment page" });
  assert.deepEqual(calls.map(c => [c.method, c.url]), [["GET", `https://api.stripe.com/v1/checkout/sessions/${SESSION}`]], "asked Stripe once");
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
  assert.deepEqual(await postToStore(stripeEvent()), { code: 200, body: { received: true, ignored: "no such payment page" } });
});

test("Stripe down, busy or out of reach: still 502 and nothing, so Stripe sends the message again later", async () => {
  const db = fakeDb([order()]);
  const mail = mailbox();
  for (const [label, answer] of [
    ["Stripe's own error", { status: 500, json: { error: { type: "api_error", message: "An unknown error occurred" } } }],
    ["Stripe unavailable, no answer", { status: 503, json: undefined }],
    ["too many requests", { status: 429, json: { error: { type: "invalid_request_error", code: "rate_limit", message: "Too many requests" } } }],
    ["a 404 that is not Stripe saying 'no such page'", { status: 404, json: undefined }],
  ]) {
    fakeStripe(() => answer);
    await assert.rejects(webhook(db, stripeEvent(), mail), e => e.status === 502, label);
  }
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); }; // no answer at all
  await assert.rejects(webhook(db, stripeEvent(), mail), e => e.status === 502, "network down");
  assert.equal(db.updates.length, 0);
  assert.equal(mail.sent.length, 0);
  fakeStripe(() => ({ status: 503, json: undefined }));
  assert.deepEqual(await postToStore(stripeEvent()), { code: 502, body: { error: "Couldn't check the payment with Stripe right now" } });
});

test("Admin's full card check ('Check again'): makes a $0.50 payment page and cancels it at once; ready only if Stripe allows both", async () => {
  const site = "https://fonkiart.com";
  fakeStripe((url) => url.endsWith("/expire") ? { json: { id: SESSION, status: "expired" } } : { json: { id: SESSION, url: "https://checkout.stripe.com/c/pay/x" } });
  assert.deepEqual(await cardCheck({ deep: true, site }), { ready: true, live: false, deep: true });
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ["POST", "https://api.stripe.com/v1/checkout/sessions"],
    ["POST", `https://api.stripe.com/v1/checkout/sessions/${SESSION}/expire`],
  ]);
  const made = calls[0].body;
  assert.equal(made.get("line_items[0][price_data][unit_amount]"), "50");
  assert.equal(made.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(made.get("line_items[0][price_data][product_data][name]"), "Fonkiart card check");
  assert.equal(made.get("payment_method_types[0]"), "card", "a card page, as an invoice makes");
  assert.equal(made.get("payment_method_types[1]"), null, "cards only: the check proves the key, Klarna is not needed for it");

  // A key that may only read: Stripe's own message (it names the missing permission) is shown.
  fakeStripe(() => ({ status: 403, json: { error: { code: "permission_error", message: "The provided key 'rk_test_*****ESTS' does not have the required permissions for this endpoint. Having the 'rak_checkout_session_write' permission would allow this request to continue." } } }));
  const refused = await cardCheck({ deep: true, site });
  assert.equal(refused.ready, false);
  assert.match(refused.reason, /^Stripe would not make a payment page: .*rak_checkout_session_write/);
  assert.equal(calls.length, 1, "nothing was made, so nothing to cancel");

  // Made, but Stripe won't cancel it: not ready either, with Stripe's reason.
  fakeStripe((url) => url.endsWith("/expire") ? { status: 400, json: { error: { message: "Only Checkout Sessions with a status of open can be expired." } } } : { json: { id: SESSION } });
  const stuck = await cardCheck({ deep: true, site });
  assert.equal(stuck.ready, false);
  assert.match(stuck.reason, /would not cancel it: Only Checkout Sessions/);

  // The quick check when the panel opens stays a read: one GET, nothing made.
  fakeStripe(() => ({ json: { data: [] } }));
  assert.deepEqual(await cardCheck(), { ready: true, live: false });
  assert.deepEqual(calls.map(c => c.method), ["GET"]);
});

// The invoice page itself: its card form opens in the page, and it never sends anyone to Stripe.
test("the invoice page: Pay by card asks for the form INSIDE the page (Stripe.js first) and never sends the client to Stripe", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/pages/InvoicePage.jsx", import.meta.url), "utf8");
  const code = src.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(code, /location\.(assign|replace)\s*\(|location\.href\s*=|window\.open\s*\(/, "no jump to another page");
  assert.match(code, /storeCall\("card-checkout", \{ token, embedded: true/, "asks for the in-page form");
  assert.match(code, /await stripeJsReady\(\)/, "Stripe.js first");
  assert.match(code, /<CardCheckout pay=\{pay\}/, "the Cart's card panel, art first");
  assert.match(code, /storeCall\("card-paid", \{ token, session: page\.session \}\)/, "paid in the form: the server asks Stripe");
});
