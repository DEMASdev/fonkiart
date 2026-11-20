// The invoice page as a shop counter (Andy, 2026-11-20: "that page still looks vertical in a
// computer ... again in a phone needs to be crisp but in a computer there's a lot of unused space").
// A computer gets two sides: the art on the LEFT (picture, title, total), kept in view, and the
// steps on the RIGHT (details, how to pay, the card form beside the art). A phone gets one tight
// column: the order as one strip at the top, opened with a tap, and no second picture above the
// card form. Static checks on the code, as tests/textFloor.test.js does. The three layout checks
// fail on the one-column page before it (c3227df); "the checks can see" (the checks' own control)
// and "nothing removed" pass on both, as they should.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("src/pages/InvoicePage.jsx");
const css = read("src/index.css");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The invoice page's own @container block: its smallest width and its body ("" if missing).
function containerBlock(src) {
  const m = /@container inv-page \(min-width:\s*(\d+)px\)\s*\{/.exec(src);
  if (!m) return { min: null, body: "", outside: src };
  let depth = 1, i = m.index + m[0].length;
  const start = i;
  for (; i < src.length && depth; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; }
  return { min: Number(m[1]), body: src.slice(start, i - 1), outside: src.slice(0, m.index) + src.slice(i) };
}
// The body of a rule "sel { ... }" in src (null if missing).
const rule = (src, sel) => (src.match(new RegExp(`(?:^|\\n)\\s*${esc(sel)} \\{([^}]*)\\}`)) || [])[1] ?? null;
const counter = containerBlock(css);
const wide = counter.body, narrow = counter.outside;
// The CSS written for the shop counter (index.css), to the next section.
const section = (css.split("── The invoice as a shop counter")[1] || "").split("/* ═══")[0];
const at = (s) => page.indexOf(s);

test("the checks can see: a sample @container block and its rules are found", () => {
  const sample = containerBlock("a { x:1; }\n@container inv-page (min-width: 900px) {\n  .b { display:grid; }\n  .c { top:1px; }\n}\n.d { y:2; }");
  assert.equal(sample.min, 900);
  assert.equal(rule(sample.body, ".b"), " display:grid; ");
  assert.equal(rule(sample.outside, ".d"), " y:2; ");
  assert.equal(rule(sample.outside, ".b"), null, "a rule inside the block is not outside it");
});

test("a computer: one wide page with two sides, the art on the left kept in view, the steps on the right", () => {
  assert.match(rule(narrow, ".inv-shell") || "", /container:inv-page \/ inline-size/, "the page measures its own box");
  assert.match(page, /className=\{embedded \? "inv-embed inv-shell" : "invoice-page inv-shell"\}/, "the page's box is the one measured");
  assert.ok(counter.min >= 760 && counter.min <= 1000, `two sides from a computer's width (not a phone's): ${counter.min}`);
  assert.match(rule(wide, ".inv-shell .invoice-card.inv-counter") || "", /max-width:(\d{4})px/, "the page is wide on a computer");
  assert.ok(Number(/max-width:(\d+)px/.exec(rule(wide, ".inv-shell .invoice-card.inv-counter") || "")?.[1]) >= 1000, "at least 1000px wide");
  const sides = rule(wide, ".inv-sides") || "";
  assert.match(sides, /display:grid/, "two sides");
  assert.match(sides, /grid-template-columns:minmax\([^)]*\) minmax\([^)]*\);/, "exactly two columns");
  assert.match(sides, /align-items:start/, "each side as tall as its own content, so the art can stay in view");
  assert.match(rule(wide, ".inv-side-art") || "", /position:sticky;top:calc\(var\(--marquee\) \+ var\(--topbar\) \+ \d+px\)/, "the art stays in view, under the top bars");
  assert.match(rule(wide, ".inv-strip") || "", /display:none/, "no phone strip on a computer");
  assert.match(rule(wide, ".inv-side-pic") || "", /display:block/, "the picture shows");
  assert.match(rule(wide, ".inv-side-cap") || "", /display:block/, "its title and total show under it");
  assert.match(rule(wide, ".inv-card-panel .pay-art") || "", /display:none/, "the card form beside the art does not repeat the piece");
  // In the page: the art's side first (the picture, the title, the total), then the steps, the card form among them.
  assert.ok(at('className="inv-sides"') > at('className="invoice-header"'), "the two sides come under the Fonkiart title");
  assert.ok(at("inv-side-art") > at('className="inv-sides"') && at("inv-side-steps") > at("inv-side-art"), "art, then steps");
  const artSide = page.slice(at("<aside"), at("</aside>"));
  for (const part of ["inv-side-pic", "{itemRow}", '<div className="invoice-total">', "{totalLabel}"]) assert.ok(artSide.includes(part), `the art's side holds ${part}`);
  for (const part of ['className="inv-num-row"', "{clientRow}{notesRow}", "invoice-approved-banner", "inv-card-panel", 'className="inv-ship"', "Questions? Contact us at"]) {
    assert.ok(at(part) > at("inv-side-steps") && at(part) < at("{/* inv-side-steps */}"), `the steps side holds ${part}`);
  }
});

test("a phone: one tight column, the order as one strip at the top, a tap opens the whole picture, no second picture above the card form", () => {
  assert.match(rule(narrow, ".inv-strip") || "", /display:grid/, "the strip: the picture, and the words beside it");
  assert.match(rule(narrow, ".inv-strip") || "", /grid-template-areas:"pic label label" "pic title hint" "pic total total"/, "label, title and total one line each, View beside the title");
  assert.match(rule(narrow, ".inv-strip-text") || "", /display:contents/, "...the words straight in the strip's grid");
  assert.match(rule(narrow, ".inv-strip-pic") || "", /width:64px;height:64px;object-fit:contain/, "a small picture, never cropped");
  assert.match(rule(narrow, ".inv-side-pic") || "", /display:none/, "the whole picture waits for the tap");
  assert.match(rule(narrow, ".inv-side-art.is-open .inv-side-pic") || "", /display:block/, "...and shows once tapped");
  assert.match(rule(narrow, ".inv-side-pic img") || "", /max-width:100%;max-height:70vh/, "whole, on the screen");
  assert.match(rule(narrow, ".inv-side-cap") || "", /display:none/, "the strip already says the title and the total");
  assert.match(rule(narrow, ".inv-card-panel .pay-art-pic") || "", /display:none/, "no second picture above the card form");
  assert.match(page, /<button type="button" className="tap inv-strip" aria-expanded=\{artOpen\} aria-controls="inv-side-pic" onClick=\{\(\) => setArtOpen\(o => !o\)\}>/, "the strip is a real button that says whether it is open");
  assert.match(page, /<figure className="inv-side-pic" id="inv-side-pic">/, "...naming the picture it opens");
  assert.ok(at("inv-strip") < at('className="inv-num-row"'), "the strip is at the top, before the invoice number");
  assert.doesNotMatch(page, /inv-art-row/, "not the picture-beside-the-rows block of the vertical page");
});

test("nothing removed: the same fields and controls as before", () => {
  for (const s of ["Client</span>", "Notes</span>", "Artwork / Item</span>", '"Total Paid" : "Total Due"', "Confirm order →", "by card →", "Choose Another Way to Pay ↑",
    "Add shipping address", "Save address", "Change</button>", "Track your package →", "Thank you for your payment!", "Order Confirmed ✓", "Send Payment To", "<CopyButton text={invNum} />",
    "Shop view, read-only.", "Not approved by the customer yet.", "Payment due upon receipt", "<CardCheckout pay={pay}"]) {
    assert.ok(page.includes(s), `still there: ${s}`);
  }
});

test("text 16px and up, and the money in Cormorant Garamond 600 with lining figures", () => {
  assert.ok(section.length > 500, "the shop counter's CSS is found");
  const sizes = [...section.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length >= 3, "the scan sees the sizes");
  assert.deepEqual(sizes.filter(n => n < 16), [], "nothing under 16px");
  const money = rule(narrow, ".inv-strip-money") || "";
  for (const want of [/font-family:'Cormorant Garamond'/, /font-weight:600/, /font-variant-numeric:lining-nums/]) assert.match(money, want, "the strip's total");
  assert.match(rule(css, ".invoice-total .invoice-value") || "", /font-family:'Cormorant Garamond',serif;.*font-weight:600;.*font-variant-numeric:lining-nums/, "the art side's total (the invoice's own total rule)");
  assert.doesNotMatch(section, /\.invoice-total \.invoice-value \{[^}]*font-(weight|variant-numeric)/, "...and nothing here changes it");
  const small = [...page.matchAll(/fontSize:\s*"?(\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(n => n < 16);
  assert.deepEqual(small, [], "no inline font size under 16px on the page");
});
