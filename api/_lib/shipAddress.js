// The shipping address on an order (Andy, 2026-11-17: "also make sure in the admin and for the
// user can add the shipping address !"): seven text columns on Orders, with the same length
// limits as the shop's checkout (storeOps.js opOrder; the name is first + space + last, 100
// each). Used by the admin's guard (adminOps.js validateChain) and by the client's invoice page
// (storeOps.js opShipAddress).
// Browser copy, with the labels: src/lib/shipAddress.js (tests/shipAddress.test.js checks they agree).

export const SHIP_LIMITS = {
  ship_name: 201,
  ship_address: 300,
  ship_city: 100,
  ship_state: 100,
  ship_zip: 30,
  ship_country: 100,
  ship_phone: 50,
};

// What the client must fill in on the invoice page. State, ZIP and phone can stay empty: not
// every country has a state or a postal code.
export const SHIP_REQUIRED = new Set(["ship_name", "ship_address", "ship_city", "ship_country"]);

// The words in the server's answers ("Missing city", "street is too long"), as the checkout says them.
export const SHIP_WORDS = {
  ship_name: "name",
  ship_address: "street",
  ship_city: "city",
  ship_state: "state",
  ship_zip: "ZIP",
  ship_country: "country",
  ship_phone: "phone",
};
