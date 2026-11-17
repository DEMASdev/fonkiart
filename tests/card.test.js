// Card payments (Andy, 2026-11-17: "why do i need to put a new link ? is it needed ?" ...
// "Yes, do it ... FOR NOW"). Stripe is never called for real here: fetch is replaced by a
// fake that records what we would have sent and answers like Stripe does.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formBody, toCents, createCheckout, checkoutPaidFor, cardCheck, cardReady } from "../api/_lib/stripe.js";
import { opCardCheckout, opCardPaid, opInvoice } from "../api/_lib/storeOps.js";
import { isPaid, canMarkPaid, ORDER_STATUSES } from "../src/lib/orderStatus.js";

const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
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
afterEach(() => { globalThis.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; });

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

test("the payment page asks for the invoice's EXACT amount, with its number, and sends the client back to the invoice", async () => {
  fakeStripe(() => ({ json: { id: SESSION, url: "https://checkout.stripe.com/c/pay/x" } }));
  const url = await createCheckout({ order: order(), invNum: "FA-261117161956080", site: "https://fonkiart.com" });
  assert.equal(url, "https://checkout.stripe.com/c/pay/x");
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
  assert.equal(body.get("success_url"), `https://fonkiart.com/?invoice=${TOKEN}&card={CHECKOUT_SESSION_ID}`);
  assert.equal(body.get("cancel_url"), `https://fonkiart.com/?invoice=${TOKEN}`);
});

test("no Stripe key, or an amount under 50 cents: nothing is sent to Stripe", async () => {
  fakeStripe(() => ({ json: { url: "https://checkout.stripe.com/x" } }));
  await assert.rejects(createCheckout({ order: order({ amount: 0.4 }), invNum: "FA-1", site: "https://fonkiart.com" }), /too small/);
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(cardReady(), false);
  await assert.rejects(createCheckout({ order: order(), invNum: "FA-1", site: "https://fonkiart.com" }), /not set up/);
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
  fakeStripe(() => ({ json: { url: "https://checkout.stripe.com/c/pay/x" } }));
  assert.deepEqual(await opCardCheckout(fakeDb([order()]), { token: TOKEN }), { url: "https://checkout.stripe.com/c/pay/x" });
  await assert.rejects(opCardCheckout(fakeDb([order({ invoice_approved: false, status: "pending" })]), { token: TOKEN }), /confirm the invoice first/);
  await assert.rejects(opCardCheckout(fakeDb([order({ payment_methods: "zelle" })]), { token: TOKEN }), /not offered/);
  calls = [];
  assert.deepEqual(await opCardCheckout(fakeDb([order({ status: "paid" })]), { token: TOKEN }), { paid: true }, "already paid: no new payment page");
  assert.equal(calls.length, 0);
  fakeStripe(() => ({ status: 401, json: { error: { message: "Invalid API Key provided", code: "invalid_key" } } }));
  await assert.rejects(opCardCheckout(fakeDb([order()]), { token: TOKEN }), /isn't working right now/, "Stripe's own error never reaches the client");
});

test("back from Stripe, paid: the order turns Paid ONCE, the shop and the client each get one email", async () => {
  const row = order();
  const db = fakeDb([row]);
  const mail = mailbox();
  fakeStripe(() => ({ json: { payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } } }));
  assert.deepEqual(await opCardPaid(db, { token: TOKEN, session: SESSION }, mail), { paid: true });
  assert.deepEqual(db.updates, [{ status: "paid", invoice_approved: true }]);
  assert.equal(row.status, "paid");
  assert.deepEqual(mail.sent.map(m => m.to).sort(), ["ana@example.com", "shop@fonkiart.com"]);
  const shop = mail.sent.find(m => m.to === "shop@fonkiart.com");
  assert.equal(shop.subject, "Paid by card ✓ — Frida the manatee · $450");
  assert.match(shop.htmlContent, /already marked the order <strong>Paid<\/strong>/);
  const client = mail.sent.find(m => m.to === "ana@example.com");
  assert.equal(client.subject, "Payment received — Frida the manatee · Fonkiart");
  assert.match(client.htmlContent, /FA-261117161956080/);
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
