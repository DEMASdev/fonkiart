import { InputError } from "./errors.js";
import { CART_DAYS, cartsLeft } from "./cartMemory.js";
import { EMAIL_RE, canChoose, couponsOf, lower, sendCoupon, sentCoupons } from "./couponMail.js";
import { couponDiscount } from "./storeOps.js";

// "Left in the cart" on Admin -> Orders, with "Send a coupon" (Andy, 2026-11-23, "all 8": nobody saw
// who left art in their cart). The same people as the morning email's "Left in the cart" (cartMemory.js
// cartsLeft), but at once: each is here from the moment their cart is saved, for CART_DAYS. The code,
// how much it gives, the email and the note of it: couponMail.js.
//  - ONE coupon per person in CART_DAYS, whichever list it went from: the row then says "Coupon sent
//    <date>", a plain line with no button, and a second send is refused here too.
//  - The pieces and their prices are the shop's own, as they are when it is sent. A cart that was
//    bought, emptied or let go since, or whose pieces have all sold, gets nothing.
const DAYS_MS = CART_DAYS * 24 * 60 * 60 * 1000;
const keyOf = (email) => `cart:${email}`;

// The last coupon this person was sent in CART_DAYS, from either list: { at, to, said }, or null.
function lastSent(sent, email, now) {
  const lately = Object.entries(sent).filter(([key, v]) => (key === keyOf(email) || lower(v?.to) === email) && now.getTime() - (Date.parse(v?.at || "") || 0) <= DAYS_MS);
  return lately.map(([, v]) => v).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}

// The list: { carts, choose, percent }, the cart saved last first.
//  - carts: [{ email, name, pieces: [{ id, title, price, image }], total, at, sentAt, said, used, code,
//    sizes }]: cartsLeft's, with their coupon as on "Didn't finish paying" (unfinishedCoupon.js
//    couponStatus); sentAt, said: the last one they were sent.
//  - choose, percent: as there.
// A list that can't be read throws: never an empty one that looks like nobody.
export async function cartsForAdmin(db, now = new Date()) {
  const carts = await cartsLeft(db, { now, strict: true });
  if (!carts.length) return { carts: [] };
  const percent = await couponDiscount(db);
  const theirs = await couponsOf(db, carts.map(c => c.email), percent);
  const sent = await sentCoupons(db);
  const choose = await canChoose(db).catch((e) => { console.warn("carts left:", e?.message || e); return false; });
  return {
    choose, percent,
    carts: carts.map(c => {
      const before = lastSent(sent, c.email, now);
      return { ...c, sentAt: before?.at || null, said: before?.said || null, ...theirs(c.email) };
    }),
  };
}

// Sends the coupon to the person whose cart it is: { email, percent } or { email, dollars }, or { email }
// alone (couponMail.js sendCoupon, whose answer this gives). Or { sent: false, why: "sent", sentAt, said }
// when they had one already; { sent: false, why: "gone" } when there is no such cart any more.
export async function cartCouponSend(db, body, mail, now = new Date()) {
  const email = lower(body?.email);
  if (!EMAIL_RE.test(email)) throw new InputError("Bad email");
  const before = lastSent(await sentCoupons(db, { strict: true }), email, now);
  if (before) return { sent: false, why: "sent", sentAt: before.at, ...(before.said ? { said: before.said } : {}) };
  const cart = (await cartsLeft(db, { now, limit: Infinity, strict: true })).find(c => c.email === email);
  if (!cart) return { sent: false, why: "gone" };
  return sendCoupon(db, mail, { email, name: cart.name, pieces: cart.pieces, amount: body, key: keyOf(email), source: "left-in-cart", now });
}
