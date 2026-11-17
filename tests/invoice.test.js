import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceLink, readInvoiceParams, canApprove, paymentOptions, SHOP_VIEW } from "../src/lib/invoiceView.js";

const ORIGIN = "https://fonkiart.com";
const TOKEN = "8f0c2a5e-1111-2222-3333-444455556666";

test("the customer's invoice link is unchanged (what old invoice emails already carry)", () => {
  assert.equal(invoiceLink(ORIGIN, TOKEN), `${ORIGIN}/?invoice=${TOKEN}`);
  assert.deepEqual(readInvoiceParams(new URL(invoiceLink(ORIGIN, TOKEN)).search), { token: TOKEN, shopView: false });
});

test("the admin's Open link opens the same invoice in the read-only shop view", () => {
  const link = invoiceLink(ORIGIN, TOKEN, { shopView: true });
  assert.equal(link, `${ORIGIN}/?invoice=${TOKEN}&view=${SHOP_VIEW}`);
  assert.deepEqual(readInvoiceParams(new URL(link).search), { token: TOKEN, shopView: true });
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
  const o = paymentOptions({ payment_methods: "venmo,stripe", stripe_link: "https://buy.stripe.com/x" }, settings);
  assert.deepEqual(o, { zelle: null, venmo: "@shop", cashApp: null, stripe: "https://buy.stripe.com/x", any: true });
  // Nothing usable: the page must say Fonkiart will email how to pay.
  assert.equal(paymentOptions({ payment_methods: "zelle" }, {}).any, false);
  assert.equal(paymentOptions({ payment_methods: "venmo" }, { venmoHandle: "" }).any, false);
  // Old invoices (no payment_methods saved) show every way that has a value.
  assert.deepEqual(paymentOptions({}, settings), { zelle: "shop@example.com", venmo: "@shop", cashApp: "$shop", stripe: null, any: true });
});

test("a blank card (Stripe) box on the invoice falls back to the Default Stripe Payment Link in Settings", () => {
  const settings = { stripeLink: "https://buy.stripe.com/shop-default" };
  assert.equal(paymentOptions({ payment_methods: "stripe", stripe_link: "" }, settings).stripe, "https://buy.stripe.com/shop-default");
  assert.equal(paymentOptions({ payment_methods: "stripe", stripe_link: null }, settings).any, true, "the customer must see a way to pay");
  assert.equal(paymentOptions({ payment_methods: "stripe", stripe_link: "https://buy.stripe.com/this-one" }, settings).stripe, "https://buy.stripe.com/this-one", "a pasted link wins");
  assert.equal(paymentOptions({ payment_methods: "zelle", stripe_link: "" }, settings).stripe, null, "not ticked, not shown");
});
