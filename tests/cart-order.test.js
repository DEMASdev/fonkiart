// What the browser keeps of a Cart order it saved for a card payment (src/lib/cartOrder.js), the
// way back from Stripe it reads (?cart=FA-...&card=...), and Stripe.js loading the way Stripe
// requires (src/lib/stripeJs.js). The checkout's own flows are in checkout-flow.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCardOrder, saveCardOrder, dropCardOrder, matchesCart, cardOrderBody, readCardReturn, withoutTitles } from "../src/lib/cartOrder.js";
import { stripeJsReady } from "../src/lib/stripeJs.js";

const storage = new Map();
let blocked = false; // a private window, or storage turned off
globalThis.localStorage = {
  getItem: (k) => { if (blocked) throw new Error("SecurityError"); return storage.has(k) ? storage.get(k) : null; },
  setItem: (k, v) => { if (blocked) throw new Error("SecurityError"); storage.set(k, String(v)); },
  removeItem: (k) => { if (blocked) throw new Error("SecurityError"); storage.delete(k); },
};
const SESSION = "cs_test_a1B2c3D4e5F6g7";
const ORDER = { ref: "FA-1752", ids: [5001, 5002], email: "jane@x.co", lines: [{ title: "Frida", amount: 500 }, { title: "Mango", amount: 300 }], total: 800, session: SESSION };

test("the way back from Stripe: paid (a real page id) or cancelled, for a real reference; anything else is not a way back", () => {
  assert.deepEqual(readCardReturn(`?cart=FA-1752&card=${SESSION}`), { ref: "FA-1752", session: SESSION });
  assert.deepEqual(readCardReturn("?cart=FA-1752&card=cancelled"), { ref: "FA-1752", cancelled: true });
  assert.deepEqual(readCardReturn(`?invoice=x&cart=FA-9&card=${SESSION}`), { ref: "FA-9", session: SESSION });
  for (const search of ["", "?card=cancelled", "?cart=FA-1752", "?cart=FA-1752&card=", "?cart=XX-1&card=cancelled", "?cart=FA-&card=cancelled",
    "?cart=FA-1752&card=cs_test_short", "?cart=FA-1752&card=cs_test_a1B2c3D4e5<b>", "?cart=FA-1752&card=pi_test_a1B2c3D4e5F6", "?cart=FA-1752&card=Cancelled"]) {
    assert.equal(readCardReturn(search), null, search);
  }
});

test("the saved order: kept and read back whole; a page id that isn't one is kept as none; only titles and amounts of the lines", () => {
  storage.clear();
  const out = saveCardOrder({ ...ORDER, lines: ORDER.lines.map(l => ({ ...l, image: "https://x/y.jpg" })) });
  assert.deepEqual(out, ORDER);
  assert.deepEqual(readCardOrder(), ORDER);
  assert.equal(saveCardOrder({ ...ORDER, session: "cs_test_<script>" }).session, null);
  assert.equal(readCardOrder().session, null);
  assert.equal(saveCardOrder({ ...ORDER, session: undefined }).session, null);
  dropCardOrder();
  assert.equal(readCardOrder(), null);
});

test("a kept order that isn't whole is not used: bad reference, ids, email or lines, or not JSON at all", () => {
  for (const [what, bad] of [
    ["not JSON", "{oops"], ["nothing", "null"], ["a number", "7"],
    ["a bad reference", JSON.stringify({ ...ORDER, ref: "FA-x" })],
    ["no rows", JSON.stringify({ ...ORDER, ids: [], lines: [] })],
    ["a row id that isn't a whole number", JSON.stringify({ ...ORDER, ids: [5001, "5002"] })],
    ["a row id too big to be exact", JSON.stringify({ ...ORDER, ids: [5001, 2 ** 60] })],
    ["no email", JSON.stringify({ ...ORDER, email: 7 })],
    ["lines and rows that don't pair up", JSON.stringify({ ...ORDER, lines: ORDER.lines.slice(1) })],
  ]) {
    storage.set("fonkiart-card-order", bad);
    assert.equal(readCardOrder(), null, what);
  }
  storage.set("fonkiart-card-order", JSON.stringify(ORDER));
  assert.deepEqual(readCardOrder(), ORDER, "control: a whole one is read");
});

test("storage blocked: nothing is kept and nothing breaks; the order is still handed back to use now", () => {
  blocked = true;
  try {
    assert.deepEqual(saveCardOrder(ORDER), ORDER);
    assert.equal(readCardOrder(), null);
    assert.doesNotThrow(() => dropCardOrder());
  } finally { blocked = false; }
});

test("the saved order is this cart's only when it holds the same pieces, as many times each", () => {
  const cart = (...titles) => titles.map((title, n) => ({ id: n, title }));
  assert.equal(matchesCart(ORDER, cart("Mango", "Frida")), true, "any order");
  assert.equal(matchesCart(ORDER, cart(" Frida ", "Mango")), true, "spaces around a title");
  assert.equal(matchesCart(ORDER, cart("Frida")), false, "a piece taken out");
  assert.equal(matchesCart(ORDER, cart("Frida", "Mango", "Sol")), false, "a piece added");
  assert.equal(matchesCart(ORDER, cart("Frida", "Frida")), false, "the same count, other pieces");
  assert.equal(matchesCart(null, cart("Frida", "Mango")), false);
  assert.equal(matchesCart(ORDER, null), false);
});

test("what the server is sent to find the saved order: its reference, rows and email, the cart's titles, and its last page when there is one", () => {
  const items = [{ id: 1, title: "Mango" }, { id: 2, title: "Frida" }];
  assert.deepEqual(cardOrderBody(ORDER, items), { ref: "FA-1752", ids: [5001, 5002], email: "jane@x.co", titles: ["Mango", "Frida"], session: SESSION });
  assert.equal("session" in cardOrderBody({ ...ORDER, session: null }, items), false);
});

test("coming back: the buyer's details and the coupon are kept too, the checkout's own fields only, each as text, and sent back so the server can find the order by the email typed last", () => {
  storage.clear();
  const typed = { firstName: "Jane", lastName: "Doe", email: "jane.doe@x.co", phone: "305 555 0199", address: "9 Ocean Dr", city: "Miami Beach", state: "FL", zip: "33139", country: "USA" };
  const out = saveCardOrder({ ...ORDER, customer: { ...typed, isAdmin: true, zip: 33139 }, coupon: "FK-1111-2222" });
  assert.deepEqual(out, { ...ORDER, customer: { ...typed, zip: "" }, coupon: "FK-1111-2222" }, "no field the checkout lacks; a number is not text");
  assert.deepEqual(readCardOrder(), out);
  // Kept by hand, or by anything else: the same rules on the way back in.
  storage.set("fonkiart-card-order", JSON.stringify({ ...ORDER, customer: { ...typed, firstName: { x: 1 }, extra: "<b>" }, coupon: 7 }));
  assert.deepEqual(readCardOrder(), { ...ORDER, customer: { ...typed, firstName: "" } });
  // Kept before the details were (no customer, no coupon): read exactly as before.
  saveCardOrder(ORDER);
  assert.deepEqual(readCardOrder(), ORDER);
  // Beside the coupon, what it took off in the server's words, when they are real ones.
  for (const words of ["$300 off", "$1,200 off", "15% off", "12.5% off", "$0 off"]) {
    assert.deepEqual(saveCardOrder({ ...ORDER, coupon: "FK-1111-2222", couponWords: words }), { ...ORDER, coupon: "FK-1111-2222", couponWords: words }, words);
    assert.deepEqual(readCardOrder(), { ...ORDER, coupon: "FK-1111-2222", couponWords: words }, words);
  }
  for (const words of ["", "free", "$300", "<b>$300 off</b>", "$300 off!", "$1200 off", "100% off", 300, null, { x: 1 }]) {
    assert.deepEqual(saveCardOrder({ ...ORDER, coupon: "FK-1111-2222", couponWords: words }), { ...ORDER, coupon: "FK-1111-2222" }, `not words the shop says: ${JSON.stringify(words)}`);
    storage.set("fonkiart-card-order", JSON.stringify({ ...ORDER, coupon: "FK-1111-2222", couponWords: words }));
    assert.deepEqual(readCardOrder(), { ...ORDER, coupon: "FK-1111-2222" }, `nor on the way back in: ${JSON.stringify(words)}`);
  }
  assert.deepEqual(saveCardOrder({ ...ORDER, couponWords: "$300 off" }), ORDER, "no coupon: no words");
  saveCardOrder(ORDER);
  // Sent back beside the order's own email.
  const items = [{ id: 1, title: "Mango" }, { id: 2, title: "Frida" }];
  assert.deepEqual(cardOrderBody({ ...ORDER, customer: typed }, items), { ref: "FA-1752", ids: [5001, 5002], email: "jane@x.co", titles: ["Mango", "Frida"], session: SESSION, customer: typed });
  assert.equal("customer" in cardOrderBody(ORDER, items), false);
  dropCardOrder();
});

test("once paid, each paid title leaves the cart ONCE: a second copy, or anything added since, stays", () => {
  const cart = [{ id: 1, title: "Frida" }, { id: 2, title: "Mango" }, { id: 3, title: "Frida" }, { id: 4, title: "Sol" }];
  assert.deepEqual(withoutTitles(cart, ["Frida", " Sol "]).map(i => i.id), [2, 3]);
  assert.deepEqual(withoutTitles(cart, ["Frida", "Frida", "Mango", "Sol"]), []);
  assert.deepEqual(withoutTitles(cart, ["Not in the cart"]).map(i => i.id), [1, 2, 3, 4]);
  assert.deepEqual(withoutTitles(cart, undefined).map(i => i.id), [1, 2, 3, 4]);
  assert.equal(cart.length, 4, "the cart given is not changed");
});

test("Stripe.js: one script tag from js.stripe.com/v3; true once it loads; false (and the tag gone, to try again) if it fails or is too slow", async () => {
  const tags = [];
  globalThis.window = {};
  globalThis.document = { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: (tag) => { tags.push(tag); } } };
  try {
    // Blocked: the tag fails; the next try adds a new one.
    const first = stripeJsReady(1000);
    assert.equal(tags.length, 1);
    assert.deepEqual([tags[0].src, tags[0].async], ["https://js.stripe.com/v3/", true]);
    tags[0].onerror();
    assert.equal(await first, false);
    assert.equal(tags[0].removed, true);

    // Too slow: false in time, the same tag kept loading; asking again adds no second tag.
    assert.equal(await stripeJsReady(5), false);
    assert.equal(tags.length, 2);
    const later = stripeJsReady(1000);
    assert.equal(tags.length, 2, "one tag at a time");
    window.Stripe = function Stripe() {};
    tags[1].onload();
    assert.equal(await later, true);
    assert.equal(await stripeJsReady(1000), true, "already there: no new tag");
    assert.equal(tags.length, 2);
  } finally { delete globalThis.window; delete globalThis.document; }
  assert.equal(await stripeJsReady(), false, "no browser at all: false, nothing tried");
});

// The checkout loads Stripe.js BEFORE anything is saved, and says calmly that the card form
// couldn't open only once it has given up. A slow phone network gets 15 s (it was 6 s).
test("Stripe.js gets 15 s before the checkout gives up on it", async (t) => {
  const fresh = await import("../src/lib/stripeJs.js?fifteen"); // its own copy: nothing loading yet
  assert.equal(fresh.STRIPE_JS_WAIT, 15000);
  const tags = [];
  globalThis.window = {};
  globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild: (tag) => { tags.push(tag); } } };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const turn = () => new Promise(r => setImmediate(r));
  try {
    let answer = "still waiting";
    fresh.stripeJsReady().then(v => { answer = v; });
    t.mock.timers.tick(14999); await turn();
    assert.equal(answer, "still waiting", "at 14.999 s it is still waiting");
    t.mock.timers.tick(1); await turn();
    assert.equal(answer, false, "at 15 s: not ready");
    assert.equal(tags.length, 1, "one script tag, still loading");

    // Control: the same clock, the script in at 14 s: ready.
    let late = "still waiting";
    fresh.stripeJsReady().then(v => { late = v; });
    t.mock.timers.tick(14000); window.Stripe = function Stripe() {}; tags[0].onload(); await turn();
    assert.equal(late, true);
  } finally { t.mock.timers.reset(); delete globalThis.window; delete globalThis.document; }
});
