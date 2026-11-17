import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceLink, readInvoiceParams, canApprove, SHOP_VIEW } from "../src/lib/invoiceView.js";

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
