// My Account and Track my order show an order's status the same way, from ONE table in
// src/lib/orderStatus.js (ORDER_STATUSES + STATUS_LOOK). 2026-11-18: My Account kept its own
// four-step list with no Paid, so a buyer who had just paid saw a plain chip and nothing lit on
// the line: their order looked less far along than an unpaid one. These tests fail on that code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as status from "../src/lib/orderStatus.js";

const { ORDER_STATUSES } = status;
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const VIEWS = { "My Account": "src/pages/BuyerDashboard.jsx", "Track my order": "src/components/TrackOrderModal.jsx" };
const look = (s) => {
  assert.equal(typeof status.statusLook, "function", "lib/orderStatus.js gives the buyer screens a statusLook");
  return status.statusLook(s);
};

test("a paid order reads Paid, on the paid colour, at step 3 of 5", () => {
  const paid = look("paid");
  assert.equal(paid.label, "Paid");
  assert.equal(paid.bg, "#52b788");
  assert.equal(paid.fg, "#fff");
  assert.equal(paid.step, 2);
});

test("each status is one step further than the one before, Paid between Confirmed and Shipped", () => {
  assert.deepEqual(ORDER_STATUSES.map(([s]) => look(s).step), [0, 1, 2, 3, 4]);
  assert.ok(look("confirmed").step < look("paid").step && look("paid").step < look("shipped").step);
});

test("every status on the list has its word and its colours, and the table has no others", () => {
  assert.deepEqual(Object.keys(status.STATUS_LOOK || {}), ORDER_STATUSES.map(([s]) => s));
  for (const [s, word] of ORDER_STATUSES) {
    const l = look(s);
    assert.equal(l.label, word, s);
    assert.ok(l.bg && l.fg && l.dot, `${s} has a chip colour, a word colour and a dot colour`);
  }
  assert.equal(look("pending").dot, "#c9a96e", "Pending's dot stays the darker gold, seen on white");
  assert.equal(look("paid").dot, look("paid").bg, "every other dot is its chip's colour");
});

test("a status the list doesn't know: its own word on a plain chip, nothing lit", () => {
  assert.deepEqual(look("cancelled"), { label: "cancelled", bg: "var(--border)", fg: "var(--ink)", dot: "var(--border)", step: -1 });
  assert.equal(look(undefined).label, "");
  assert.equal(look(null).step, -1);
});

test("My Account and Track my order read the one table: no status colours, names or words of their own", () => {
  const COLOURS = ["#52b788", "#1e3a52", "#2d6a4f", "#f0d5a8", "#c9a96e"];
  for (const [name, file] of Object.entries(VIEWS)) {
    const code = read(file);
    assert.match(code, /import \{[^}]*\bstatusLook\b[^}]*\} from "\.\.\/lib\/orderStatus"/, `${name} reads statusLook from lib/orderStatus`);
    for (const c of COLOURS) assert.ok(!code.toLowerCase().includes(c), `${name} has a status colour of its own: ${c}`);
    for (const [s, word] of ORDER_STATUSES) {
      assert.ok(!new RegExp(`["'\`]${s}["'\`]`).test(code), `${name} names the status "${s}" itself`);
      assert.ok(!new RegExp(`["'\`]${word}["'\`]`).test(code), `${name} spells the word "${word}" itself`);
    }
  }
});

test("My Account's line walks the shared list: a dot and a word for every status, Paid included", () => {
  const code = read(VIEWS["My Account"]);
  assert.ok((code.match(/ORDER_STATUSES\.map\(/g) || []).length >= 2, "the dots and the words both walk ORDER_STATUSES");
  assert.match(code, /statusLook\(s\)\.dot/, "a lit dot takes its colour from the table");
  assert.ok(!/indexOf\(o\.status\)/.test(code), "no step counting of its own");
});
