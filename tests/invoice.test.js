import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceLink, readInvoiceParams, canApprove, paymentOptions, findArtwork, SHOP_VIEW } from "../src/lib/invoiceView.js";
import { invoiceNumber } from "../src/lib/invoiceNumber.js";
import { invoiceNumber as serverInvoiceNumber } from "../api/_lib/invoiceNumber.js";
import { opInvoiceApprove } from "../api/_lib/storeOps.js";

const ORIGIN = "https://fonkiart.com";
const TOKEN = "8f0c2a5e-1111-2222-3333-444455556666";

test("the customer's invoice link is unchanged (what old invoice emails already carry)", () => {
  assert.equal(invoiceLink(ORIGIN, TOKEN), `${ORIGIN}/?invoice=${TOKEN}`);
  assert.deepEqual(readInvoiceParams(new URL(invoiceLink(ORIGIN, TOKEN)).search), { token: TOKEN, shopView: false, card: null });
});

test("the admin's Open link opens the same invoice in the read-only shop view", () => {
  const link = invoiceLink(ORIGIN, TOKEN, { shopView: true });
  assert.equal(link, `${ORIGIN}/?invoice=${TOKEN}&view=${SHOP_VIEW}`);
  assert.deepEqual(readInvoiceParams(new URL(link).search), { token: TOKEN, shopView: true, card: null });
});

test("only the customer, on their own link, can approve, and only once", () => {
  assert.equal(canApprove({ approved: false, shopView: false }), true);
  assert.equal(canApprove({ approved: false, shopView: true }), false, "opening it from the admin must never approve it");
  assert.equal(canApprove({ approved: true, shopView: false }), false);
  assert.equal(canApprove({ approved: true, shopView: true }), false);
});

test("anything other than view=shop is the normal customer page", () => {
  assert.equal(readInvoiceParams(`?invoice=${TOKEN}&view=admin`).shopView, false);
  assert.equal(readInvoiceParams(`?invoice=${TOKEN}&view=`).shopView, false);
  assert.equal(readInvoiceParams("?thread=abc").token, null);
});

test("a blank Zelle box on the invoice falls back to the Zelle address in Settings", () => {
  const settings = { zelleContact: "shop@example.com" };
  const sentAsIs = { payment_methods: "zelle", zelle_contact: "" };
  assert.equal(paymentOptions(sentAsIs, settings).zelle, "shop@example.com");
  assert.equal(paymentOptions(sentAsIs, settings).any, true, "the customer must see a way to pay");
  assert.equal(paymentOptions({ payment_methods: "zelle", zelle_contact: "  " }, settings).zelle, "shop@example.com");
  assert.equal(paymentOptions({ payment_methods: "zelle", zelle_contact: "typed@example.com" }, settings).zelle, "typed@example.com", "a typed address wins");
});

test("only the ways to pay ticked on the invoice show, and only when they have a value", () => {
  const settings = { zelleContact: "shop@example.com", venmoHandle: "@shop", cashAppHandle: "$shop" };
  const o = paymentOptions({ payment_methods: "venmo,stripe" }, settings, { cardReady: true });
  assert.deepEqual(o, { zelle: null, venmo: "@shop", cashApp: null, card: true, any: true });
  // Nothing usable: the page must say Fonkiart will email how to pay.
  assert.equal(paymentOptions({ payment_methods: "zelle" }, {}).any, false);
  assert.equal(paymentOptions({ payment_methods: "venmo" }, { venmoHandle: "" }).any, false);
  // Old invoices (no payment_methods saved) show every way that has a value.
  assert.deepEqual(paymentOptions({}, settings), { zelle: "shop@example.com", venmo: "@shop", cashApp: "$shop", card: false, any: true });
});

test("card shows only when ticked AND Stripe is set up; no pasted link is needed or used", () => {
  const oldLinks = { stripeLink: "https://buy.stripe.com/shop-default" };
  assert.equal(paymentOptions({ payment_methods: "stripe" }, {}, { cardReady: true }).card, true, "nothing to paste");
  assert.equal(paymentOptions({ payment_methods: "stripe" }, {}, { cardReady: true }).any, true, "the customer must see a way to pay");
  assert.equal(paymentOptions({ payment_methods: "stripe", stripe_link: "https://buy.stripe.com/x" }, oldLinks).card, false, "no Stripe key: no card, links or not");
  assert.equal(paymentOptions({ payment_methods: "stripe" }, oldLinks, { cardReady: "yes" }).card, false, "only a real true turns it on");
  assert.equal(paymentOptions({ payment_methods: "zelle" }, {}, { cardReady: true }).card, false, "not ticked, not shown");
  assert.equal(paymentOptions({ payment_methods: "stripe" }, oldLinks).any, false, "no key and nothing else: the page says Fonkiart will email how to pay");
});

test("Stripe's return address carries the payment page id", () => {
  assert.deepEqual(readInvoiceParams(`?invoice=${TOKEN}&card=cs_live_abc123`), { token: TOKEN, shopView: false, card: "cs_live_abc123" });
});

test("invoice number = FA- + the moment it was made, Florida time, to the millisecond", () => {
  // What Supabase sends (microseconds, UTC). 21:12 UTC in November = 4:12 PM in Florida.
  assert.equal(invoiceNumber({ id: 12, created_at: "2026-11-17T21:12:46.123456+00:00" }), "FA-261117161246123");
  // Summer: Florida is UTC-4, not UTC-5.
  assert.equal(invoiceNumber({ id: 3, created_at: "2026-07-04T16:00:00.007Z" }), "FA-260704120000007");
  // Late evening in Florida is already the next day in UTC: the date must be Florida's.
  assert.equal(invoiceNumber({ id: 4, created_at: "2026-11-18T03:30:00.5+00:00" }), "FA-261117223000500");
  // Midnight is 00, never 24.
  assert.equal(invoiceNumber({ id: 5, created_at: "2026-11-18T05:00:00Z" }), "FA-261118000000000");
});

test("two invoices a millisecond apart get different numbers; no time falls back to FA- + the order id", () => {
  const a = invoiceNumber({ created_at: "2026-11-17T21:12:46.123Z" });
  const b = invoiceNumber({ created_at: "2026-11-17T21:12:46.124Z" });
  assert.notEqual(a, b);
  assert.equal(invoiceNumber({ id: 12 }), "FA-12");
  assert.equal(invoiceNumber({ id: 12, created_at: "not a date" }), "FA-12");
});

test("the invoice shows the artwork it is for, found by its title, and never a wrong one", () => {
  const art = [
    { id: 1, title: "Frida the manatee", image: "https://x/frida.jpg" },
    { id: 2, title: "Pink palms", image: "https://x/palms.jpg" },
    { id: 3, title: "No picture yet", image: "" },
  ];
  assert.equal(findArtwork(art, "Frida the manatee")?.id, 1);
  assert.equal(findArtwork(art, "  frida  THE manatee ")?.id, 1, "case and spaces don't matter");
  assert.equal(findArtwork(art, '"Pink palms"')?.id, 2, "quotes don't matter");
  assert.equal(findArtwork(art, "Frida"), null, "part of a title is not a match");
  assert.equal(findArtwork(art, "No picture yet"), null, "a piece with no picture shows nothing");
  assert.equal(findArtwork(art, ""), null);
  assert.equal(findArtwork(undefined, "Pink palms"), null);
});

test("the server's invoice number (emails) and the browser's (invoice page) are always the same", () => {
  for (const created_at of [
    "2026-11-17T21:19:56.080514+00:00", "2026-07-04T16:00:00.007Z", "2026-11-18T03:30:00.5+00:00",
    "2026-11-18T05:00:00Z", "2027-03-14T06:59:59.999Z", undefined, "not a date",
  ]) {
    const order = { id: "abc-12345", created_at };
    assert.equal(serverInvoiceNumber(order), invoiceNumber(order), String(created_at));
  }
});

// A tiny stand-in for the database: one Orders table, records every update.
// updateError: make every update fail, like a database that refuses a value.
function fakeOrders(rows, { updateError = null } = {}) {
  const updates = [];
  const from = () => {
    let payload = null; const filters = [];
    const q = {
      select: () => q, limit: () => q,
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

test("when a client confirms, the shop's email says CONFIRMED BY CUSTOMER and NOT PAID, once", async () => {
  const TOKEN2 = "85d82763-0000-4000-8000-000000000016";
  const order = { id: 16, invoice_token: TOKEN2, invoice_approved: false, status: "pending", item_title: "Frida the manatee",
    amount: 450, client_name: "Ana <b>Lopez</b>", client_email: "ana@example.com", payment_methods: "zelle,venmo,cashapp",
    created_at: "2026-11-17T21:19:56.080514+00:00" };
  const db = fakeOrders([order]);
  const sent = [];
  const mail = { sender: "shop@fonkiart.com", send: async (m) => { sent.push(m); } };

  await opInvoiceApprove(db, { token: TOKEN2 }, mail);
  assert.deepEqual(db.updates, [{ invoice_approved: true, status: "confirmed" }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "shop@fonkiart.com");
  assert.equal(sent[0].subject, "Invoice confirmed by customer, NOT paid yet — Frida the manatee · $450");
  const html = sent[0].htmlContent;
  assert.match(html, /Invoice confirmed by customer/);
  assert.match(html, /not a payment/);
  assert.match(html, /FA-261117161956080/);
  assert.match(html, /Zelle, Venmo, Cash App/);
  assert.match(html, /When \$450 arrives by Zelle or Venmo or Cash App/);
  assert.match(html, /tap <strong>✓ Mark paid<\/strong>/);
  assert.doesNotMatch(html, /pay by card/, "card was not offered on this invoice");
  assert.doesNotMatch(html, /<b>Lopez<\/b>/, "the client's name is shown as text, never as HTML");
  assert.doesNotMatch(html, /Invoice Approved/);

  await opInvoiceApprove(db, { token: TOKEN2 }, mail);
  assert.equal(sent.length, 1, "confirming twice sends one email, not two");
});
