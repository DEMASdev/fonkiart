// The checkout as a shop counter (src/components/CheckoutModal.jsx, src/index.css). Andy, 2026-11-19,
// yes to: "On a computer, the checkout becomes one wide page with two sides, like a shop counter. Your
// art stays on the left: pictures, titles and total, always in view. The steps go on the right: your
// details, how to pay, then the card form. The card form sits beside the art instead of under it ...
// On a phone it stays one column, but tighter. The order shrinks to one line at the top that you tap
// to see the pieces, and the big pictures don't repeat above the card form."
// What is drawn is checked in tests/checkout-flow.test.js ("COUNTER"); WHERE it sits is CSS, pinned
// here. Measured in a browser at 375 and 1280 wide when it was made. Each test fails on the checkout
// before (c3227df), which drew the pieces above the steps in one column, and the card form's own
// pictures above the form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/index.css");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The body of the first `@media <query> {` block, as written in src/index.css (null if missing).
function media(query) {
  const at = css.indexOf(`@media ${query} {`);
  if (at < 0) return null;
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
  }
  return null;
}
// One rule's body inside a block of CSS: "sel { ... }" (null if missing).
const rule = (block, sel) => ((block || "").match(new RegExp(`(?:^|\\n)\\s*${esc(sel)} \\{\\s*([^}]*)\\}`)) || [])[1] ?? null;

test("the rule readers themselves: they find a rule in a block, and say null when it is missing", () => {
  const block = "\n  .a { color:red; }\n  .a .b { color:blue; }\n";
  assert.equal(rule(block, ".a"), "color:red; ");
  assert.equal(rule(block, ".a .b"), "color:blue; ");
  assert.equal(rule(block, ".c"), null);
  assert.equal(rule(null, ".a"), null);
});

test("a computer (960px and wider): two sides, the order on the left (sticky), the title and the steps on the right", () => {
  const wide = media("(min-width:960px)");
  assert.ok(wide, "the computer's block is in src/index.css");
  const box = rule(wide, ".checkout-counter.checkout-fullpage");
  assert.ok(box, "the Cart's checkout page (not a pop-up, and not its thank-you) is the counter");
  assert.match(box, /display:grid;/);
  assert.match(box, /grid-template-columns:minmax\(0,5fr\) minmax\(0,6fr\);/, "the art side and the steps side");
  assert.match(box, /grid-template-areas:"order title" "order steps";/, "the order beside BOTH the title and the steps");
  assert.match(box, /overflow:visible;/, "not a scroll box of its own, or the art could not stay in view");
  assert.match(box, /max-width:1100px;/);
  const order = rule(wide, ".checkout-counter.checkout-fullpage > .checkout-order");
  assert.ok(order);
  assert.match(order, /grid-area:order;/);
  assert.match(order, /position:sticky;top:calc\(var\(--marquee\) \+ var\(--topbar\) \+ 16px\);/, "always in view, below the shop's bars");
  assert.match(order, /align-self:start;/, "sticky needs its own height, not the row's");
  assert.match(rule(wide, ".checkout-counter.checkout-fullpage > .checkout-steps") || "", /grid-area:steps;min-width:0;/, "the card form sits in the steps, beside the art");
  assert.match(rule(wide, ".checkout-counter.checkout-fullpage > h2") || "", /grid-area:title;/);
  assert.equal(rule(wide, ".checkout-order-line"), null, "no one line on a computer: the pieces are all there");
});

test("a phone (under 960px): one column; the order is one line until tapped; the ways to pay two by two", () => {
  const narrow = media("(max-width:959px)");
  assert.ok(narrow, "the phone's block is in src/index.css");
  assert.match(rule(narrow, ".checkout-order-line") || "", /display:flex;/, "the one line shows");
  assert.match(rule(narrow, ".checkout-order-pieces") || "", /display:none;/, "the pieces wait for a tap");
  assert.match(rule(narrow, ".checkout-order.is-open .checkout-order-pieces") || "", /display:block;/, "tapped: the pieces");
  assert.match(rule(narrow, ".checkout-buy .pay-opts") || "", /grid-template-columns:1fr 1fr;/, "tighter: two by two, also at 375 wide");
  assert.match(rule(narrow, ".checkout-counter > h2") || "", /min-height:46px;/, "the title is as tall as the ✕ beside it, so the ✕ never sits on the order line");
  assert.match(css, /\n\.checkout-order-line \{ display:none; \}/, "outside a phone, no one line");
  assert.match(rule(css, ".checkout-order-what") || "", /white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/, "a long title stays on ONE line");
  assert.match(rule(css, ".checkout-order-sum") || "", /font-family:'Cormorant Garamond',serif;font-size:25px;font-weight:600;font-variant-numeric:lining-nums;/, "the total in the money font");
});

test("the checkout draws the order once, before the steps, and the card form without its own pictures", () => {
  const modal = read("src/components/CheckoutModal.jsx");
  const view = modal.slice(modal.lastIndexOf("  return ("));
  assert.match(view, /<h2>Purchase<\/h2>\s*\{orderBox\}\s*<div className="checkout-steps">/, "title, order, then the steps");
  assert.match(view, /checkout checkout-buy checkout-counter/);
  assert.match(modal, /<CardCheckout pay=\{pay\} artworks=\{items\} art=\{false\}/, "the card form: no pictures of its own");
  assert.equal((modal.match(/\{payOptions\}/g) || []).length, 1, "the ways to pay drawn in one place");
  const step1 = view.slice(view.indexOf("{step === 1 && ("), view.indexOf("{step === 2 && ("));
  assert.ok(step1.indexOf("Your Information") >= 0 && step1.indexOf("Your Information") < step1.indexOf("{payOptions}"), "the details, then how to pay");
  const card = read("src/components/CardCheckout.jsx");
  assert.match(card, /\{art && <PayArt /, "PayArt only when asked for");
  assert.match(card, /art = true \}\) \{/, "the invoice page keeps its pictures (art defaults to true)");
});
