// The shipping address on an order (Andy, 2026-11-17: "also make sure in the admin and for the
// user can add the shipping address !"): seven text columns on Orders. The shop's checkout fills
// them in, the client can add or change them on their invoice page, and the admin in
// Admin -> Orders. The server keeps its own copy of the limits (api/_lib/shipAddress.js;
// tests/shipAddress.test.js checks the two agree).

// [column, label, longest it may be, must it be filled in]
export const SHIP_FIELDS = [
  ["ship_name", "Full name", 201, true],
  ["ship_address", "Street address", 300, true],
  ["ship_city", "City", 100, true],
  ["ship_state", "State / province", 100, false],
  ["ship_zip", "ZIP / postal code", 30, false],
  ["ship_country", "Country", 100, true],
  ["ship_phone", "Phone (optional)", 50, false],
];
export const SHIP_COLUMNS = SHIP_FIELDS.map(([column]) => column);

// The browser's autofill names, so a phone can fill the form in one tap.
export const SHIP_AUTOFILL = {
  ship_name: "name",
  ship_address: "street-address",
  ship_city: "address-level2",
  ship_state: "address-level1",
  ship_zip: "postal-code",
  ship_country: "country-name",
  ship_phone: "tel",
};

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// An address counts as saved once it has a street. The checkout's address is optional, so a
// buyer who skipped it has only their name (and maybe a phone) on the order, and the invoice
// page still asks them where to send it.
export const hasShipAddress = (order) => !!clean(order?.ship_address);

// The address in lines, to show it: name, street, "City, ST 12345", country, phone.
export function shipLines(order) {
  const v = (column) => clean(order?.[column]);
  const cityLine = [v("ship_city"), [v("ship_state"), v("ship_zip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [v("ship_name"), v("ship_address"), cityLine, v("ship_country"), v("ship_phone")].filter(Boolean);
}

// The form, filled in with what the order has saved; with no name saved yet, the client's name.
export function shipForm(order) {
  const form = Object.fromEntries(SHIP_COLUMNS.map(column => [column, typeof order?.[column] === "string" ? order[column] : ""]));
  if (!form.ship_name.trim() && typeof order?.client_name === "string") form.ship_name = order.client_name;
  return form;
}

// What was typed, checked and tidied for saving: { fields } (all seven; an empty one is null)
// or { problem } (what to tell the person typing).
export function shipFields(form) {
  const fields = {};
  for (const [column, label, max, required] of SHIP_FIELDS) {
    const s = clean(form?.[column]);
    if (required && !s) return { problem: `Please fill in: ${label}.` };
    if (s.length > max) return { problem: `${label.replace(" (optional)", "")} is too long: ${max} characters at most.` };
    fields[column] = s || null;
  }
  return { fields };
}

// A client's saved details (Admin -> Clients) as an order's shipping address: whatever they have.
export function shipFromClient(client) {
  const v = (value) => clean(value) || null;
  return {
    ship_name: v(client?.name),
    ship_address: v(client?.address),
    ship_city: v(client?.city),
    ship_state: v(client?.state),
    ship_zip: v(client?.zip),
    ship_country: v(client?.country),
    ship_phone: v(client?.phone),
  };
}
export const clientHasAddress = (client) => !!clean(client?.address);
