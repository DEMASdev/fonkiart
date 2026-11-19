// Andy, 2026-11-18, showing the card form's own options (Bank, Klarna) and its card logos (Visa,
// Mastercard, Amex, UnionPay): "we also should add to the icons at the bottom". The footer's
// Accepted Payments row shows every way to pay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const footer = readFileSync(new URL("../src/components/Footer.jsx", import.meta.url), "utf8");

test("the footer's Accepted Payments row: cards, UnionPay, Klarna, Bank, Zelle, Venmo, Cash App", () => {
  const shown = [...footer.matchAll(/<svg [^\n]*?aria-label="([^"]+)"/g)].map(m => m[1]);
  for (const name of ["Visa", "Mastercard", "American Express", "Discover", "UnionPay", "Klarna", "Bank", "Zelle", "Venmo", "Cash App"]) {
    assert.ok(shown.includes(name), `${name} is in the row`);
  }
});
