import test from "node:test";
import assert from "node:assert/strict";
import { knownPaidMethod, paidPick } from "../src/lib/orderStatus.js";

test("knownPaidMethod: the saved method, or null", () => {
  assert.equal(knownPaidMethod({ paid_method: "card" }), "card");
  assert.equal(knownPaidMethod({ paid_method: "zelle" }), "zelle");
  assert.equal(knownPaidMethod({}), null);
  assert.equal(knownPaidMethod(null), null);
  assert.equal(knownPaidMethod({ paid_method: null }), null);
  assert.equal(knownPaidMethod({ paid_method: "" }), null);
  assert.equal(knownPaidMethod({ paid_method: "bitcoin" }), null);
});

test("paidPick: ask only when Paid is picked and no method is known", () => {
  assert.equal(paidPick({ paid_method: "card" }, "paid"), "save-quietly");
  assert.equal(paidPick({ status: "pending" }, "paid"), "ask");
  assert.equal(paidPick({ paid_method: "" }, "paid"), "ask");
  assert.equal(paidPick({ paid_method: "card" }, "shipped"), "save");
  assert.equal(paidPick({}, "shipped"), "save");
});
