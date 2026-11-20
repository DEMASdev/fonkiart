// Andy, 2026-11-20: "the orders page is looking better but still too thick rows". Admin -> Orders
// keeps every fact and control it had, in thinner rows: less air above and below each order, a
// tighter line height, and short pieces side by side where they fit. Never by smaller text: 17px,
// small 16px, money in Cormorant Garamond 600 with lining figures. Each test below except the last
// two fails on the rows as they were (c3227df); the last two guard what must not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const CSS = read("src/index.css");
const JSX = read("src/admin/OrdersTab.jsx");
const START = CSS.indexOf("/* ── Admin -> Orders (src/admin/OrdersTab.jsx) ──");
const END = CSS.indexOf("/* The client's invoice page: the \"Shipping address\" box. */");
const ORDERS = CSS.slice(START, END);

// The inside of an "@media(<query>){ ... }" block of the Orders part (braces counted), the one
// that holds `needle` when the same query appears more than once.
function media(query, needle) {
  for (let at = ORDERS.indexOf(`@media(${query}){`); at !== -1; at = ORDERS.indexOf(`@media(${query}){`, at + 1)) {
    let i = ORDERS.indexOf("{", at), depth = 0;
    const from = i + 1;
    for (; i < ORDERS.length; i++) { if (ORDERS[i] === "{") depth++; else if (ORDERS[i] === "}" && --depth === 0) break; }
    const body = ORDERS.slice(from, i);
    if (!needle || body.includes(needle)) return body;
  }
  assert.fail(`@media(${query}) with ${needle} is in the Orders part of src/index.css`);
}
// The declarations of one rule, by its exact selector, in `css` (the top level of the Orders part
// when no block is given): { "padding": "10px 7px", ... }.
function rule(selector, css = ORDERS) {
  const at = css.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is in src/index.css`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries(body.split(";").map(d => d.trim()).filter(Boolean).map(d => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]));
}
const px = (v) => (String(v).match(/-?\d+(?:\.\d+)?(?=px)/g) || []).map(Number);
const vertical = (padding) => { const [t, , b = t] = px(padding); return Math.max(t, b); }; // top/bottom of a padding
const rowGap = (gap) => px(gap)[0];

test("the reading helpers work: they find a rule, a block, and the numbers in it", () => {
  assert.ok(START > 0 && END > START, "found the Orders part of src/index.css");
  assert.equal(vertical("18px 8px"), 18);
  assert.equal(vertical("4px 34px 6px 29px"), 6);
  assert.equal(rowGap("18px 20px"), 18);
  assert.ok(media("min-width:1280px").includes("th:nth-child(7)"), "the wide-screen block");
  assert.ok(media("max-width:700px", "tr.order-row").includes(".orders-tab"), "the phone block of the Orders part");
});

test("computer: each order's cells have little air above and below, and a tight line height", () => {
  const td = rule(".orders-tab .orders-table td");
  assert.ok(vertical(td.padding) <= 10, `cell padding ${td.padding} (was 18px 8px)`);
  assert.ok(Number(td["line-height"]) <= 1.3, `line height ${td["line-height"]} (was 1.4)`);
  assert.equal(td["font-size"], "17px", "the text stays 17px");
});

test("computer: Status, Mark paid, Open / More / Notes and the small lines sit closer", () => {
  const pill = rule(".orders-tab .o-pill select");
  assert.ok(vertical(pill.padding) <= 4, `status menu padding ${pill.padding}`);
  assert.equal(pill["font-size"], "16px");
  const paid = rule(".orders-tab .mark-paid");
  assert.ok(px(paid["margin-top"])[0] <= 6 && vertical(paid.padding) <= 2, `Mark paid: ${paid["margin-top"]} above, padding ${paid.padding}`);
  const btn = rule(".orders-tab .o-btn");
  assert.ok(vertical(btn.padding) <= 4, `Open / More / Notes padding ${btn.padding}`);
  assert.equal(btn["font-size"], "16px");
  assert.ok(px(rule(".orders-tab .o-actions-in").gap)[0] <= 5, "the three buttons 5px apart or less");
  for (const [sel, max] of [[".orders-tab .o-ref", 3], [".orders-tab .o-date", 2], [".orders-tab .o-note", 4]]) {
    const top = px(rule(sel)["margin-top"])[0];
    assert.ok(top <= max, `${sel}: ${top}px above it`);
  }
});

test("Shipping: the carrier, its tracking and Edit / Remove flow side by side as one line of text", () => {
  assert.equal(rule(".orders-tab .o-track").display, "block", "one flowing line, not a stack");
  const carrier = rule(".orders-tab .o-carrier");
  assert.equal(carrier["white-space"], "nowrap", "the carrier's name never breaks");
  assert.equal(rule(".orders-tab .o-inline-btns").display, "inline-flex", "Edit and Remove stay together, on the same line when there is room");
});

test("computer: the Client column is wider and the invoice number stays on one line", () => {
  const wide = media("min-width:1280px");
  const widths = [1, 2, 3, 4, 5, 6, 7].map(n => Number(rule(`.orders-tab .orders-table th:nth-child(${n})`, wide).width.replace("%", "")));
  assert.ok(Math.abs(widths.reduce((s, w) => s + w, 0) - 100) < 0.01, `the columns add up to 100%: ${widths.join(" + ")}`);
  assert.ok(widths[1] >= 15, `Client ${widths[1]}% (was 12%)`);
  assert.equal(rule(".orders-tab .o-ref", wide)["flex-wrap"], "nowrap", "the copy button beside the number, not under it");
  assert.equal(rule(".orders-tab .o-shipto-flag", wide)["flex-wrap"], "nowrap", "still: the flag and Add on one line");
});

test("cards (tablet and phone): less space between the lines of each order", () => {
  const cards = media("max-width:1279px");
  const row = rule(".orders-tab .orders-table > tbody > tr.order-row", cards);
  assert.ok(rowGap(row.gap) <= 12 && vertical(row.padding) <= 14, `card: gap ${row.gap}, padding ${row.padding} (was 18px 20px / 18px 20px)`);
  const label = rule(".orders-tab .orders-table > tbody > tr > td[data-label]::before", cards);
  assert.ok(px(label["margin-bottom"])[0] <= 1 && Number(label["line-height"]) <= 1.2, `labels: ${label["margin-bottom"]} under, line height ${label["line-height"]}`);
  assert.equal(label["font-size"], "16px", "the labels stay 16px");
  assert.ok(px(rule(".orders-tab .orders-table > tbody > tr > td.o-actions", cards)["padding-top"])[0] <= 10, "the buttons' row");
  const client = rule(".orders-tab .orders-table > tbody > tr > td.o-client", cards);
  assert.equal(client.display, "flex", "the client's name and email side by side when they fit");
  assert.equal(client["flex-wrap"], "wrap", "else the email under the name");
  const phone = rule(".orders-tab .orders-table > tbody > tr.order-row", media("max-width:700px", "tr.order-row"));
  assert.ok(rowGap(phone.gap) <= 10 && vertical(phone.padding) <= 12, `phone: gap ${phone.gap}, padding ${phone.padding} (was 18px 14px / 16px)`);
});

test("guard: the same facts and controls, nothing hidden or cut short", () => {
  for (const label of ["Artwork", "Client", "Amount", "Status", "Ship to", "Shipping", "Actions"]) assert.match(JSX, new RegExp(`data-label="${label}"`), `${label} is still a column`);
  for (const text of ["👁 Open", ">More<", ">Notes<", "✓ Mark paid", "Needs address", ">Add<", ">Edit<", ">Remove<", "Shipped with a carrier", "🔗 Link", "✉ Resend", ">Delete<"]) assert.ok(JSX.includes(text), `${text} is still there`);
  // The only thing the Orders part hides is the table's header row, on the cards (each card names its own parts).
  const hidden = [...ORDERS.matchAll(/([^{}]+)\{[^{}]*display:none/g)].map(m => m[1].trim());
  assert.deepEqual(hidden, [".orders-tab .orders-table thead"]);
  assert.doesNotMatch(ORDERS, /text-overflow:ellipsis|line-clamp|visibility:hidden/, "no text is cut short");
});

test("guard: text sizes stay (17px text, 16px small) and money stays Cormorant Garamond 600, lining", () => {
  const money = rule(".orders-tab .o-money");
  assert.equal(money["font-family"], "'Cormorant Garamond',serif");
  assert.equal(money["font-weight"], "600");
  assert.equal(money["font-variant-numeric"], "lining-nums");
  assert.equal(money["font-size"], "25px");
  assert.equal(rule(".orders-tab")["font-size"], "17px");
  assert.equal(rule(".orders-tab .o-title")["font-size"], "22px");
  for (const sel of [".orders-tab .o-email", ".orders-tab .o-date", ".orders-tab .o-ref", ".orders-tab .o-note"]) assert.equal(rule(sel)["font-size"], "16px", sel);
});
