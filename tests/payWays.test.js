// The ways to pay, as rows (src/lib/payWays.js, src/components/PayRows.jsx, PayMarks.jsx), on the
// Cart's checkout and the invoice page. Andy, 2026-11-21: "also paying options look what strip
// offers .. klarma , Secure Link (https://link.com/) , bank transfer / ACH". The shop's own ways
// first (Zelle, Venmo, Cash App), then Stripe's, each only when the server can open it right now:
// its card-setup answer names them in `ways` ("card", "link", "klarna", "bank"). A server that names
// none (one from before `ways`) opens cards and Klarna, never a bank transfer. A row must never
// promise a way the server can't open. What the buyer sees and taps: tests/checkout-flow.test.js
// ("WAYS"); where it sits: tests/checkout-layout.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { payRows, stripeRows, isStripe, serverWays, STRIPE_WAYS, WAYS_BEFORE } from "../src/lib/payWays.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ids = (rows) => rows.map(r => r.id);
const labels = (rows) => rows.map(r => r.label);
const ALL = ["card", "link", "klarna", "bank"];

test("every way the server names gets a row, always in the same order, each with its own line", () => {
  assert.deepEqual(payRows({ ways: ALL }), [
    { id: "zelle", label: "Zelle", sub: "Instant · Free" },
    { id: "venmo", label: "Venmo", sub: "Instant · Free" },
    { id: "cashapp", label: "Cash App", sub: "Instant · Free" },
    { id: "card", label: "Card or Link", sub: "Stripe · Secure" },
    { id: "klarna", label: "Klarna", sub: "Pay over time" },
    { id: "bank", label: "Bank transfer (ACH)", sub: "Clears in about 4 business days" },
  ]);
  assert.deepEqual(ids(stripeRows(["bank", "klarna", "link", "card"])), ["card", "klarna", "bank"], "the server's order does not move the rows");
  for (const way of ["card", "klarna", "bank"]) assert.deepEqual(ids(stripeRows([way])), [way], `${way} alone: its row alone`);
  assert.deepEqual(ids(stripeRows([])), [], "the server opens none: no Stripe row");
  assert.deepEqual(ids(stripeRows(["link"])), [], "Link rides inside the card form: without cards, no row for it");
});

test("'Card or Link' only when the server names Link; otherwise just 'Card'", () => {
  assert.deepEqual(labels(stripeRows(["card", "link"])), ["Card or Link"]);
  assert.deepEqual(labels(stripeRows(["card"])), ["Card"]);
  assert.deepEqual(labels(stripeRows(["card", "klarna", "bank"])), ["Card", "Klarna", "Bank transfer (ACH)"]);
});

test("no bank row unless the server names a bank transfer; a server that names no ways: cards and Klarna, never a bank row", () => {
  for (const ways of [undefined, null, "bank", { bank: true }]) {
    assert.deepEqual(ids(stripeRows(ways)), ["card", "klarna"], `ways ${JSON.stringify(ways)}`);
    assert.deepEqual(labels(stripeRows(ways)), ["Card", "Klarna"]);
  }
  assert.deepEqual(WAYS_BEFORE, ["card", "klarna"]);
  assert.equal(ids(payRows()).includes("bank"), false);
  assert.equal(ids(stripeRows(["card", "klarna"])).includes("bank"), false);
  assert.ok(ids(stripeRows(["card", "klarna", "bank"])).includes("bank"), "control: named, it shows");
});

test("the invoice page offers only what the shop ticked on it; no card ticked: no Stripe row at all", () => {
  assert.deepEqual(ids(payRows({ zelle: false, venmo: false, ways: ALL })), ["cashapp", "card", "klarna", "bank"]);
  assert.deepEqual(ids(payRows({ card: false, ways: ALL })), ["zelle", "venmo", "cashapp"]);
  assert.deepEqual(ids(payRows({ zelle: false, venmo: false, cashApp: false, ways: ["card"] })), ["card"]);
});

test("the server's ways from its card-setup answer: a list of words, or null (an older server, or none reached)", () => {
  assert.deepEqual(serverWays({ card: true, form: true, why: null, ways: ["card", "klarna"] }), ["card", "klarna"]);
  assert.deepEqual(serverWays({ ways: ["card", 3, null, "bank"] }), ["card", "bank"], "only words");
  assert.deepEqual(serverWays({ ways: [] }), []);
  for (const answer of [{ card: true, form: true, why: null }, { ways: "bank" }, null, undefined, "card"]) assert.equal(serverWays(answer), null, JSON.stringify(answer));
});

test("which ways are paid in Stripe's form (the server is told which: way)", () => {
  assert.deepEqual(STRIPE_WAYS, ["card", "klarna", "bank"]);
  for (const way of STRIPE_WAYS) assert.equal(isStripe(way), true, way);
  for (const way of ["zelle", "venmo", "cashapp", "link", null, undefined]) assert.equal(isStripe(way), false, String(way));
});

test("no emoji on the rows: the words (the small marks are the footer's own badges, below)", () => {
  const words = payRows({ ways: ALL }).flatMap(r => [r.label, r.sub]).join(" ");
  assert.doesNotMatch(words, /\p{Extended_Pictographic}/u, "no emoji");
  assert.match("💳", /\p{Extended_Pictographic}/u, "control: the scan sees one");
  // Klarna chooses pay-in-4 or monthly by the amount (on a large one maybe no pay-in-4 at all), so
  // its row names no plan.
  assert.doesNotMatch(words, /interest-free|\b4 (interest|payments)|\/ ?month/i, "Klarna's row promises no plan");
  assert.match("Klarna 4 interest-free payments", /interest-free|\b4 (interest|payments)|\/ ?month/i, "control: the check sees a promise");
});

test("each mark beside a way is the footer's own badge, copied exactly (one look for each way, everywhere)", () => {
  const marks = read("src/components/PayMarks.jsx");
  const footer = read("src/components/Footer.jsx");
  const svgs = [...marks.matchAll(/const (\w+) = (<svg[\s\S]*?<\/svg>);/g)];
  assert.deepEqual(svgs.map(m => m[1]), ["visa", "mastercard", "klarna", "bank", "zelle", "venmo", "cashApp"]);
  for (const [, name, svg] of svgs) assert.ok(footer.includes(svg), `${name}: the footer's own`);
  assert.equal(footer.includes(svgs[0][2].replace("#1A1F71", "#1A1F72")), false, "control: a changed copy is not the footer's");
  assert.match(marks, /const MARKS = \{\s*zelle,\s*venmo,\s*cashapp: cashApp,\s*card: <>\{visa\}\{mastercard\}<\/>,[^\n]*\n\s*klarna,\s*bank,\s*\};/, "each way's marks, by its row's id");
});

test("the server is asked which ways it opens, and told the way chosen: the Cart's checkout (cart-card, cart-again) and the invoice page (card-checkout)", () => {
  const modal = read("src/components/CheckoutModal.jsx");
  assert.match(modal, /storeCall\("card-setup"\)\.then\(\(r\) => \{\s*const can = serverWays\(r\);/);
  assert.match(modal, /storeCall\("cart-again", \{ \.\.\.cardOrderBody\(keepTyped\(\), items\), customer, embedded: true, way: method \}\)/);
  assert.match(modal, /storeCall\("cart-card", \{ \.\.\.orderPayload\(\), embedded: true, way: method \}\)/);
  const invoice = read("src/pages/InvoicePage.jsx");
  assert.match(invoice, /storeCall\("card-setup"\)\.then\(\(r\) => \{\s*const can = serverWays\(r\);/);
  assert.match(invoice, /storeCall\("card-checkout", \{ token, embedded: true, way, /);
  assert.match(invoice, /const handleCard = \(way = "card"\) => \{/, "Try Again and an older call: a card, as before");
});
