// Admin -> Orders, one clean line per order (Andy, 2026-11-18: "it's a mess it's too much it's
// not intuitive — rethink dig deeper — should have an orange flag saying needs address, also the
// add button should be there and the shipped with carrier should be in a column"). The rules
// behind that line live here, away from the screen, so tests/ordersPage.test.js can check them.
import { SHIP_COLUMNS, hasShipAddress, shipFromClient, clientHasAddress } from "./shipAddress.js";
import { isPickup } from "./tracking.js";
import { invoiceNumber } from "./invoiceNumber.js";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// The order's number: its invoice number (FA-...), or, for a shop checkout order that has no
// invoice, # and the first characters of its id.
export const orderRef = (order) => order?.invoice_token
  ? invoiceNumber(order)
  : `#${String(order?.id ?? "").slice(0, 8).toUpperCase()}`;

// The client's "I approve" on the invoice (the old INVOICE SENT / CLIENT APPROVED badges). Approving
// sets the order to Confirmed (opInvoiceApprove, api/_lib/storeOps.js), so the Status already says
// it. Said in words only when the Status says otherwise: an approved invoice set back to Pending,
// or an invoice set to Confirmed by hand before the client approved it.
export function approvalNote(order) {
  if (!order?.invoice_token) return "";
  const status = order.status || "pending";
  if (order.invoice_approved && status === "pending") return "The client approved the invoice";
  if (!order.invoice_approved && status === "confirmed") return "Not approved by the client yet";
  return "";
}

// The statuses an order still has to go out from. An order saved with no status is Pending.
const NOT_GONE_OUT = new Set(["pending", "confirmed", "paid"]);

// The orange "Needs address" flag: the order still has to go out (Pending, Confirmed or Paid),
// it is not a Pickup / hand delivery, and it has no street to send it to (an address counts once
// it has a street: hasShipAddress). Shipped and Delivered orders have gone out already: no flag.
export function needsAddress(order) {
  if (!order) return false;
  return NOT_GONE_OUT.has(order.status || "pending") && !isPickup(order) && !hasShipAddress(order);
}

// The address, short, for the order's line: "Miami Beach, FL"; with no state, the country
// ("Paris, France"); with no city, the street. The whole address is in the pop-up.
export function shipShort(order) {
  const place = [clean(order?.ship_city), clean(order?.ship_state) || clean(order?.ship_country)].filter(Boolean).join(", ");
  return place || clean(order?.ship_address);
}

// The address itself, without the name and phone: it is only ever taken whole, from one place.
const BLOCK = ["ship_address", "ship_city", "ship_state", "ship_zip", "ship_country"];
const sameEmail = (a, b) => !!clean(a) && clean(a).toLowerCase() === clean(b).toLowerCase();
const when = (order) => Date.parse(order?.created_at) || 0;

// The client's other orders (same email, any capitals), newest first.
export function otherOrders(order, orders) {
  return (Array.isArray(orders) ? orders : [])
    .filter(o => o && o.id !== order?.id && sameEmail(o.client_email, order?.client_email))
    .sort((a, b) => when(b) - when(a));
}

// The address pop-up, filled in with everything already known (Andy, 2026-11-18: "a pop up
// should come up with prefilled info of the shipping information .... customer name , phone ,
// etc if any and the blank spaces needed to be filled"):
//  - what this order has saved always wins, field by field;
//  - the name: the order's client name, then the client's saved record (Admin -> Clients), then
//    their newest other order that has one;
//  - the phone: the client's saved record, then their newest other order that has one;
//  - the address (street, city, state, ZIP, country) as ONE block, never mixed from two places:
//    this order's own if it has any of it; else the client's saved address (what "Use the
//    client's saved address" copied); else their newest other order that has a street.
// Anything not known stays empty, for the admin to fill in.
// form: the seven columns, as text. from: what was filled in from elsewhere: client (the saved
// record), and orders (the client's other orders used, newest first).
export function shipPrefill(order, { client = null, orders = [] } = {}) {
  const saved = shipFromClient(client);
  const others = otherOrders(order, orders);
  const from = { client: false, orders: [] };
  const own = (column) => clean(order?.[column]);
  const fromOrder = (o) => { if (!from.orders.includes(o)) from.orders.push(o); };
  // The first place that knows this column: this order, the client's record, their other orders.
  const pick = (column, ...firsts) => {
    for (const value of [own(column), ...firsts.map(clean)]) if (value) return value;
    if (clean(saved[column])) { from.client = true; return clean(saved[column]); }
    const o = others.find(x => clean(x[column]));
    if (o) { fromOrder(o); return clean(o[column]); }
    return "";
  };
  const form = Object.fromEntries(SHIP_COLUMNS.map(column => [column, ""]));
  form.ship_name = pick("ship_name", order?.client_name);
  form.ship_phone = pick("ship_phone");
  if (BLOCK.some(column => own(column))) {
    for (const column of BLOCK) form[column] = own(column);
  } else if (clientHasAddress(client)) {
    from.client = true;
    for (const column of BLOCK) form[column] = clean(saved[column]);
  } else {
    const o = others.find(hasShipAddress);
    if (o) { fromOrder(o); for (const column of BLOCK) form[column] = clean(o[column]); }
  }
  return { form, from };
}

// The fields still to fill in: required, and empty.
export const neededFields = (fields, form) => fields.filter(([column, , , required]) => required && !clean(form?.[column])).map(([column]) => column);
