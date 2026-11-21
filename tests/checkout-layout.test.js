// The checkout as a gallery wall (src/components/CheckoutModal.jsx, src/index.css), for the Cart's
// checkout page and the Collectors Room's Purchase window alike. Andy, 2026-11-21: "rethink that page
// if you haven't , make it nicer simpler more intuitive and artsy without making the art the person is
// buying small and 2nd page/hand". The art being bought is the biggest thing on the screen at every
// step, framed, with its label; on a computer it is the left half and the steps the right; on a phone
// it comes first, full width, then the steps, which ask one thing each.
// What is drawn is checked in tests/checkout-flow.test.js ("GALLERY"); WHERE it sits is CSS, pinned
// here. Measured in a browser at 375 and 1280 wide when it was made. Each test but the first fails
// on the checkout before (7587d64: the shop counter, the order one tapped line on a phone) and on the
// live one (8d85f29: a small picture beside the title, four boxed tiles with emoji).
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
// The gallery's own part of src/index.css: from its heading to the next section.
const gallery = (() => {
  const a = css.indexOf("/* The checkout as a gallery wall");
  const b = css.indexOf("/* Admin -> Settings -> Stripe", a);
  return a < 0 || b < 0 ? "" : css.slice(a, b);
})();

// The ways to pay's own part of src/index.css (the Cart's checkout and the invoice page share it).
const payRowsCss = (() => {
  const a = css.indexOf("/* The ways to pay, as rows");
  const b = css.indexOf("/* Admin -> Settings -> Stripe", a);
  return a < 0 || b < 0 ? "" : css.slice(a, b);
})();
// Contrast of two #rrggbb colours (WCAG): 4.5 or more reads as body text.
function contrast(a, b) {
  const lum = (h) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test("the rule readers themselves: they find a rule in a block, and say null when it is missing", () => {
  const block = "\n  .a { color:red; }\n  .a .b { color:blue; }\n";
  assert.equal(rule(block, ".a"), "color:red; ");
  assert.equal(rule(block, ".a .b"), "color:blue; ");
  assert.equal(rule(block, ".c"), null);
  assert.equal(rule(null, ".a"), null);
});

test("a computer (900px and wider): two halves, the art on the left (one piece kept in view), a thin gold line, the steps on the right", () => {
  const wide = media("(min-width:900px)");
  assert.ok(wide, "the computer's block is in src/index.css");
  const box = rule(wide, ".checkout.checkout-gallery");
  assert.ok(box, "the checkout (the Cart's page and the Purchase window) is the gallery");
  assert.match(box, /max-width:1100px;display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/, "the art half, the steps half");
  assert.match(box, /background:linear-gradient\(90deg, var\(--wall\) 50%, var\(--line\) 50%, var\(--line\) calc\(50% \+ 1px\), #fff calc\(50% \+ 1px\)\);/, "the wall, a thin gold line, the steps on white");
  assert.match(rule(wide, ".checkout-wall") || "", /position:sticky;top:0;/, "the art stays in view while the steps scroll (the pop-up scrolls in its own box)");
  assert.match(rule(wide, ".checkout-gallery.checkout-fullpage .checkout-wall") || "", /top:calc\(var\(--marquee\) \+ var\(--topbar\) \+ 16px\);/, "on the Cart's page, below the shop's bars");
  assert.match(rule(gallery, ".checkout-gallery.checkout-fullpage") || "", /max-height:none;overflow:visible;/, "the Cart's checkout is a page, not a box with its own scroll: else the art could not stay in view, and a pop-up's 90vh would cut the wall short");
  assert.match(rule(wide, ".checkout-wall.is-many") || "", /position:static;/, "several pieces stack, each big, and scroll with the page");
  assert.match(rule(wide, ".checkout-piece-pic") || "", /max-height:min\(calc\(90vh - 300px\), 560px\);/, "the picture as big as the window allows");
  assert.match(rule(wide, ".checkout-wall.is-many .checkout-piece-pic") || "", /max-height:min\(46vh, 440px\);/, "several: each still big");
});

test("a phone (under 900px): the art first, full width; several pieces side by side, to swipe; on a phone the Purchase window is the whole screen", () => {
  assert.match(rule(gallery, ".checkout-wall") || "", /background:var\(--wall\);padding:58px 20px 28px;/, "the art first, on the wall, with room above it for the ✕");
  assert.match(rule(gallery, ".checkout-piece-pic") || "", /max-width:100%;max-height:44vh;/, "full width, never more than about half the screen tall");
  assert.match(rule(gallery, ".checkout-steps") || "", /border-top:1px solid var\(--line\);/, "a thin gold line, then the steps");
  const narrow = media("(max-width:899px)");
  assert.ok(narrow, "the phone's block is in src/index.css");
  const row = rule(narrow, ".checkout-wall.is-many .checkout-wall-list") || "";
  assert.match(row, /display:grid;grid-auto-flow:column;grid-auto-columns:84%;/, "side by side, each nearly the width of the screen (the next one peeks in)");
  assert.match(row, /overflow-x:auto;/);
  assert.match(row, /scroll-snap-type:x mandatory;/, "a swipe lands on a piece");
  const phone = media("(max-width:640px)");
  assert.ok(phone, "the small phone's block is in src/index.css");
  assert.match(rule(phone, ".checkout-gallery-bg") || "", /padding:0;/);
  assert.match(rule(phone, ".checkout-gallery-bg > .checkout-gallery") || "", /max-width:none;min-height:100%;max-height:none;overflow:visible;/, "the Purchase window: the whole screen");
  assert.match(rule(phone, ".checkout-gallery-bg > .checkout-gallery > .checkout-x") || "", /position:fixed;/, "its ✕ stays in the corner");
  assert.match(rule(phone, ".checkout-gallery-page") || "", /padding:0;/, "the Cart's checkout: edge to edge");
  assert.doesNotMatch(css, /checkout-order-line/, "no one tapped line in place of the art");
});

test("the art's label and the money: titles in Cormorant Garamond, prices in Cormorant Garamond 600 with lining figures; all text 16px or more, the fields 17px", () => {
  assert.match(rule(gallery, ".checkout-piece-title") || "", /font-family:'Cormorant Garamond',serif;font-size:27px;font-weight:500;/);
  for (const sel of [".checkout-piece-price", ".checkout-wall-total-sum"]) {
    const r = rule(gallery, sel) || "";
    assert.match(r, /font-family:'Cormorant Garamond',serif;/, `${sel}: Cormorant Garamond`);
    assert.match(r, /font-weight:600;/, `${sel}: 600`);
    assert.match(r, /font-variant-numeric:lining-nums;/, `${sel}: lining figures`);
  }
  assert.match(rule(gallery, ".checkout-piece-label::before") || "", /width:40px;height:1px;background:var\(--gold\);/, "a thin gold line over each label");
  const sizes = [...gallery.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length >= 15, `found ${sizes.length} sizes`);
  assert.deepEqual(sizes.filter(n => n < 16), [], "nothing under 16px");
  assert.match(rule(gallery, ".checkout-gallery .fld input, .checkout-coupon-input") || "", /font-size:17px;/, "what the buyer types: 17px");
  assert.deepEqual([..."font-size:12px;x font-size:16px".matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 16), [12], "control: the scan sees a small size");
});

test("how to pay: rows, the words first (no emoji), a quiet line under each, the footer's own small marks, and the one chosen plain to see: a pale pink and a gold bar, its words easy to read", () => {
  const rows = read("src/components/PayRows.jsx");
  assert.match(rows, /role="radiogroup" aria-label="How to pay"/);
  assert.match(rows, /role="radio" aria-checked=\{chosen\} className=\{`pay-row\$\{chosen \? " sel" : ""\}`\}/, "a screen reader hears which one is chosen");
  assert.match(rows, /<span className="pay-row-marks" aria-hidden="true"><PayMarks way=\{id\} \/><\/span>/, "the marks: pictures of the words beside them, heard once");
  const modal = read("src/components/CheckoutModal.jsx");
  const invoice = read("src/pages/InvoicePage.jsx");
  for (const [name, file, use] of [["the Cart's checkout", modal, "<PayRows rows={rows} value={method}"], ["the invoice page", invoice, "<PayRows rows={payChoices} value={chosenWay}"]]) {
    assert.ok(file.includes(use), `${name}: the same rows`);
    assert.doesNotMatch(file, /💚|🔵|💵|💳|pay-opt/, `${name}: no emoji boxes left`);
  }
  assert.match(rule(payRowsCss, ".pay-row.sel") || "", /background:#fff0fb;color:var\(--ink\);box-shadow:inset 3px 0 0 var\(--gold\);/, "chosen: a pale pink and a gold bar");
  assert.match(rule(payRowsCss, ".pay-row.sel .pay-row-dot::after") || "", /background:var\(--gold\);/, "and its circle filled in gold");
  assert.match(rule(payRowsCss, ".pay-row-sub") || "", /font-size:16px;line-height:1\.4;color:var\(--quiet\);/, "the line under each name, quiet");
  assert.match(rule(payRowsCss, ".pay-rows") || "", /--quiet:#6b6b6b;/);
  const ink = (css.match(/--ink:(#[0-9a-f]{6});/) || [])[1];
  for (const [what, fg] of [["the names", ink], ["the quiet lines", "#6b6b6b"]]) {
    for (const bg of ["#ffffff", "#fff0fb", "#fff7fd"]) assert.ok(contrast(fg, bg) >= 4.5, `${what} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
  }
  assert.ok(contrast("#9e7fa0", "#ffffff") < 4.5, "control: the site's pale --muted would not pass");
  const sizes = [...payRowsCss.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length >= 5, `found ${sizes.length} sizes`);
  assert.deepEqual(sizes.filter(n => n < 16), [], "nothing under 16px");
});

test("the steps column on a computer: it stays in view while the art scrolls; taller than the window, it scrolls until its end shows, then holds (never trapped: no sticking until it is measured)", () => {
  const wide = media("(min-width:900px)");
  assert.doesNotMatch(rule(wide, ".checkout-steps") || "", /position:sticky/, "not measured yet: it never sticks, so it can never be trapped");
  assert.match(rule(wide, ".checkout-steps.is-measured") || "", /^position:sticky;top:min\(0px, calc\(90dvh - var\(--steps-h\) - 16px\)\); $/, "the Purchase window: at its top, or held with its end 16px above the window's bottom");
  assert.match(rule(wide, ".checkout-gallery.checkout-fullpage .checkout-steps.is-measured") || "", /^top:min\(calc\(var\(--marquee\) \+ var\(--topbar\) \+ 16px\), calc\(100vh - var\(--steps-h\) - 16px\)\); $/, "the Cart's page: below the shop's bars, or held with its end in view");
  const modal = read("src/components/CheckoutModal.jsx");
  assert.match(modal, /const measure = \(\) => setStepsH\(el\.offsetHeight\);/, "its own height, measured");
  assert.match(modal, /new ResizeObserver\(measure\)/, "and again whenever it changes (a step, a message, the card form)");
  assert.match(modal, /className=\{`checkout-steps\$\{stepsH \? " is-measured" : ""\}`\} style=\{stepsH \? \{ "--steps-h": `\$\{stepsH\}px` \} : undefined\}/, "sticky only once measured, with its height");
});

test("the checkout draws the art once, before the steps; three steps, one question each; the card form without its own pictures", () => {
  const modal = read("src/components/CheckoutModal.jsx");
  const view = modal.slice(modal.lastIndexOf("  return ("));
  assert.match(view, /<button className="modal-close checkout-x"[^>]*>✕<\/button>\s*\{wall\}\s*<div ref=\{stepsBox\} className=\{`checkout-steps/, "the ✕, the art, then the steps");
  assert.match(view, /checkout checkout-buy checkout-gallery/);
  for (const [n, q] of [[1, "Where should we send it?"], [2, "How would you like to pay?"]]) {
    assert.ok(view.includes(`{step === ${n} && (`) && view.includes(`<h2 className="checkout-q">${q}</h2>`), `step ${n}: ${q}`);
  }
  assert.ok(view.includes("{step === 3 && ("), "step 3: the payment");
  assert.match(modal, /<CardCheckout pay=\{pay\} artworks=\{items\} art=\{false\}/, "the card form: no pictures of its own");
  const card = read("src/components/CardCheckout.jsx");
  assert.match(card, /\{art && <PayArt /, "PayArt only when asked for");
  assert.match(card, /art = true \}\) \{/, "the invoice page keeps its pictures (art defaults to true)");
});
