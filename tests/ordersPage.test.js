// Admin -> Orders, one clean line per order (Andy, 2026-11-18: "it's a mess it's too much it's not
// intuitive — rethink dig deeper — should have an orange flag saying needs address, also the add
// button should be there and the shipped with carrier should be in a column"), and its address
// pop-up ("when click add shipping address a pop up should come up with prefilled info of the
// shipping information .... customer name , phone , etc if any and the blank spaces needed to be
// filled"). The rules live in src/lib/orderRow.js. All names and emails here are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsAddress, shipShort, shipPrefill, otherOrders, neededFields, orderRef, approvalNote } from "../src/lib/orderRow.js";
import { SHIP_FIELDS, SHIP_COLUMNS } from "../src/lib/shipAddress.js";
import { invoiceNumber } from "../src/lib/invoiceNumber.js";

const ADDRESS = { ship_name: "Jane Test", ship_address: "1 Test St", ship_city: "Miami", ship_state: "FL", ship_zip: "33101", ship_country: "USA", ship_phone: "305 555 0100" };

test("the orange flag: Pending, Confirmed and Paid orders with no address", () => {
  for (const status of ["pending", "confirmed", "paid"]) {
    assert.equal(needsAddress({ status }), true, status);
    assert.equal(needsAddress({ status, ...ADDRESS }), false, `${status} with an address`);
  }
  // An order saved with no status is Pending.
  assert.equal(needsAddress({ status: null }), true);
  assert.equal(needsAddress({}), true);
});

test("no flag once it has gone out, or for a pickup / hand delivery", () => {
  assert.equal(needsAddress({ status: "shipped" }), false);
  assert.equal(needsAddress({ status: "delivered" }), false);
  assert.equal(needsAddress({ status: "paid", tracking_carrier: "pickup" }), false);
  assert.equal(needsAddress({ status: "pending", tracking_carrier: "pickup" }), false);
  // A carrier is not a pickup: still no street to send it to.
  assert.equal(needsAddress({ status: "paid", tracking_carrier: "usps", tracking_number: "9400 1118 9922" }), true);
  assert.equal(needsAddress(null), false);
});

test("an address counts once it has a street: a name and phone alone still need one", () => {
  // The shop's checkout saves the buyer's name and phone even when they skip the address.
  assert.equal(needsAddress({ status: "pending", ship_name: "Jane Test", ship_phone: "305 555 0100" }), true);
  assert.equal(needsAddress({ status: "paid", ship_address: "   ", ship_city: "Miami" }), true);
  assert.equal(needsAddress({ status: "paid", ship_address: "1 Test St" }), false);
});

test("the address, short, for the order's line", () => {
  assert.equal(shipShort(ADDRESS), "Miami, FL");
  assert.equal(shipShort({ ship_address: "2 Rue Test", ship_city: " Paris ", ship_country: "France" }), "Paris, France");
  assert.equal(shipShort({ ship_address: "1 Test St" }), "1 Test St");
  assert.equal(shipShort({ ship_city: "Miami" }), "Miami");
  assert.equal(shipShort({}), "");
  assert.equal(shipShort(null), "");
});

test("the pop-up: a known name and phone are filled in, anything unknown stays blank", () => {
  const order = { id: 1, client_name: "Jane Test", client_email: "jane@example.com", status: "paid" };
  const client = { name: "Jane Test", email: "jane@example.com", phone: "305 555 0100", address: "", city: "", state: "", zip: "", country: "" };
  const { form, from } = shipPrefill(order, { client, orders: [order] });
  assert.deepEqual(Object.keys(form), SHIP_COLUMNS);
  assert.equal(form.ship_name, "Jane Test");
  assert.equal(form.ship_phone, "305 555 0100");
  for (const column of ["ship_address", "ship_city", "ship_state", "ship_zip", "ship_country"]) assert.equal(form[column], "", column);
  assert.deepEqual(from, { client: true, orders: [] });
  // Nothing known at all: every box empty, and never null (the boxes are always text).
  const empty = shipPrefill({ id: 2 });
  assert.deepEqual(empty.form, Object.fromEntries(SHIP_COLUMNS.map(c => [c, ""])));
  assert.deepEqual(empty.from, { client: false, orders: [] });
});

test("the pop-up: the client's saved address is used whole when the order has none", () => {
  const order = { id: 1, client_name: "Jane Test", client_email: "JANE@example.com" };
  const client = { name: "Jane Q. Test", email: "jane@example.com", phone: "305 555 0100", address: "9 Saved Rd", city: "Naples", state: "FL", zip: "34102", country: "USA" };
  const { form, from } = shipPrefill(order, { client });
  assert.deepEqual(form, { ship_name: "Jane Test", ship_address: "9 Saved Rd", ship_city: "Naples", ship_state: "FL", ship_zip: "34102", ship_country: "USA", ship_phone: "305 555 0100" });
  assert.equal(from.client, true);
  // With no name on the order, the client's saved name.
  assert.equal(shipPrefill({ id: 1 }, { client }).form.ship_name, "Jane Q. Test");
});

test("the pop-up: else the client's newest other order with an address (same email, any capitals, never itself)", () => {
  const order = { id: 5, client_name: "Jane Test", client_email: "jane@example.com", created_at: "2026-11-18T10:00:00Z" };
  const older = { id: 3, client_email: "Jane@Example.com", created_at: "2026-09-01T10:00:00Z", ...ADDRESS, ship_address: "1 Old St" };
  const newer = { id: 4, client_email: "jane@example.com", created_at: "2026-10-01T10:00:00Z", ...ADDRESS, ship_address: "2 New St", ship_phone: "305 555 0199" };
  const stranger = { id: 6, client_email: "someone.else@example.com", created_at: "2026-11-01T10:00:00Z", ...ADDRESS, ship_address: "6 Other St" };
  const self = { ...order, ship_address: "" };
  const { form, from } = shipPrefill(order, { orders: [older, stranger, newer, self] });
  assert.equal(form.ship_address, "2 New St");
  assert.equal(form.ship_phone, "305 555 0199");
  assert.deepEqual(from.orders.map(o => o.id), [4]);
  assert.deepEqual(otherOrders(order, [older, stranger, newer, self]).map(o => o.id), [4, 3]);
  // An order with no email has no "other orders".
  assert.deepEqual(otherOrders({ id: 7 }, [older, newer]), []);
});

test("the pop-up: what the order already has wins, and an address is never mixed from two places", () => {
  const client = { name: "Jane Test", email: "jane@example.com", phone: "305 555 0100", address: "9 Saved Rd", city: "Naples", state: "FL", zip: "34102", country: "USA" };
  const order = { id: 1, client_name: "Jane Test", client_email: "jane@example.com", ship_name: "J. Test", ship_city: "Key West" };
  const { form, from } = shipPrefill(order, { client });
  assert.equal(form.ship_name, "J. Test");
  // The order's own (partial) address stays as it is: its city, and the rest empty to fill in.
  assert.deepEqual([form.ship_address, form.ship_city, form.ship_state, form.ship_zip, form.ship_country], ["", "Key West", "", "", ""]);
  assert.equal(form.ship_phone, "305 555 0100");
  assert.equal(from.client, true); // the phone came from the saved record
});

test("the boxes still needed: required and empty", () => {
  const form = { ship_name: "Jane Test", ship_address: " ", ship_city: "", ship_state: "", ship_zip: "", ship_country: "USA", ship_phone: "" };
  assert.deepEqual(neededFields(SHIP_FIELDS, form), ["ship_address", "ship_city"]);
  assert.deepEqual(neededFields(SHIP_FIELDS, { ...form, ship_address: "1 Test St", ship_city: "Miami" }), []);
});

test("the order's number: the invoice number, or # and the id for a checkout order", () => {
  const invoice = { id: 41, invoice_token: "aaaaaaaa-bbbb-4ccc-8ddd-000000000041", created_at: "2026-11-18T04:36:29.277Z" };
  assert.equal(orderRef(invoice), invoiceNumber(invoice));
  assert.match(orderRef(invoice), /^FA-\d{15}$/);
  assert.equal(orderRef({ id: 48, invoice_token: null }), "#48");
});

test("the client's approval is said in words only when the Status does not already say it", () => {
  const invoice = { invoice_token: "aaaaaaaa-bbbb-4ccc-8ddd-000000000041" };
  // The usual way: approving sets Confirmed, and an unapproved invoice is Pending. Nothing to add.
  assert.equal(approvalNote({ ...invoice, status: "confirmed", invoice_approved: true }), "");
  assert.equal(approvalNote({ ...invoice, status: "pending", invoice_approved: false }), "");
  assert.equal(approvalNote({ ...invoice, status: "paid", invoice_approved: true }), "");
  // The Status says otherwise: the old INVOICE SENT / CLIENT APPROVED badge is still said.
  assert.equal(approvalNote({ ...invoice, status: "pending", invoice_approved: true }), "The client approved the invoice");
  assert.equal(approvalNote({ ...invoice, status: null, invoice_approved: true }), "The client approved the invoice");
  assert.equal(approvalNote({ ...invoice, status: "confirmed", invoice_approved: false }), "Not approved by the client yet");
  // A shop checkout order has no invoice to approve.
  assert.equal(approvalNote({ status: "pending", invoice_approved: true }), "");
  assert.equal(approvalNote(null), "");
});

// The flag must read clearly: Andy's "some people can't see well". WCAG's 4.5:1 for normal text.
const CSS = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const ruleOf = (selector) => {
  const at = CSS.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is in src/index.css`);
  return CSS.slice(at, CSS.indexOf("}", at));
};
const hex = (rule, prop) => rule.match(new RegExp(`(?:^|[;{ ])${prop}:(#[0-9a-fA-F]{6})`))?.[1];
const luminance = (h) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("the 'Needs address' flag is orange and reads clearly (at least 4.5:1)", () => {
  const flag = ruleOf(".orders-tab .order-flag");
  const color = hex(flag, "color"), background = hex(flag, "background");
  assert.ok(color && background, `found the flag's colours: ${color} on ${background}`);
  assert.ok(contrast(color, background) >= 4.5, `${color} on ${background}: ${contrast(color, background).toFixed(2)}:1`);
  assert.ok(contrast(color, "#ffffff") >= 4.5, "and on the white page");
  // Orange: red high, green middle, blue low.
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex(ruleOf(".orders-tab .order-flag-dot"), "background").slice(i, i + 2), 16));
  assert.ok(r > 200 && g > 90 && g < 160 && b < 90, `the dot is orange: ${r},${g},${b}`);
  // Control: the check fails a colour that is too light (the shop's gold on white is 2.9:1).
  assert.ok(contrast("#b8923f", "#ffffff") < 4.5);
});

test("Andy's text sizes on the Orders tab: nothing under 16px", () => {
  const start = CSS.indexOf("/* ── Admin -> Orders (src/admin/OrdersTab.jsx) ──");
  const end = CSS.indexOf("/* The client's invoice page: the \"Shipping address\" box. */");
  assert.ok(start !== -1 && end > start, "found the Orders part of src/index.css");
  const sizes = [...CSS.slice(start, end).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 40, `read ${sizes.length} sizes`);
  assert.deepEqual(sizes.filter(px => px < 16), []);
  // Control: the same reading finds a 13px size when there is one.
  assert.deepEqual([..."a { font-size:13px; }".matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])), [13]);
});

test("the new Orders screens ask nothing in a browser pop-up", () => {
  const POPUP = /\b(alert|confirm|prompt)\s*\(/;
  for (const file of ["../src/admin/OrdersTab.jsx", "../src/admin/ShipAddressDialog.jsx", "../src/admin/ArtThumb.jsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), POPUP, file);
  }
});
