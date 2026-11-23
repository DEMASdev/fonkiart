// The Cart order this browser saved for a card payment that isn't finished yet: its reference,
// its rows' ids, the email it was saved with, its pieces and amounts as the SERVER priced them,
// and the last payment page Stripe made for it. CheckoutModal keeps it so that paying again (a
// double tap, closing the card form and opening it again, coming back from Stripe's page without
// paying) re-opens THAT order (server op "cart-again", api/_lib/cartCheckout.js) instead of
// saving a second one and sending a second "order received" email. It lives in localStorage
// beside the cart itself (App.jsx "fonkiart-cart"), so it lasts through a reload or a new tab
// exactly as long as the cart does. Dropped once the order is paid (by card or another way), or
// once the server no longer knows it.
// It also keeps the buyer's details as they typed them, and the coupon the server took, so that
// coming back the checkout looks normal, filled in (Andy, 2026-11-19, yes to: "When they come
// back, the checkout looks normal, with their name and address already filled in"). They stay in
// this browser: the server never hands them back. Beside the coupon, what it took off in the
// server's words ("$300 off": couponSize.js sizeWords), so coming back the checkout says it right.
import { isSizeWords } from "./couponSize.js";

const KEY = "fonkiart-card-order";
const DETAILS = ["firstName", "lastName", "email", "phone", "address", "city", "state", "zip", "country"];

// The checkout's words when the card form can't open inside fonkiart.com (Stripe.js didn't load,
// the server can't offer the form, or Stripe.js refused it): nothing saved, nothing charged. The
// server's copy is api/_lib/cartCheckout.js CARD_FORM_DOWN, which it answers (409) BEFORE saving
// anything; tests/checkout-flow.test.js checks the two agree.
export const CARD_FORM_DOWN = "The secure card form couldn't open right now. Nothing was charged. Please try again, or choose another way to pay.";
const REF = /^FA-\d{1,9}$/;
const SESSION = /^cs_(live|test)_[A-Za-z0-9]{10,250}$/;
const clean = (title) => String(title ?? "").trim();

export function readCardOrder() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "null");
    const ok = o && REF.test(o.ref) && Array.isArray(o.ids) && o.ids.length > 0 && o.ids.every(Number.isSafeInteger)
      && typeof o.email === "string" && Array.isArray(o.lines) && o.lines.length === o.ids.length;
    if (!ok) return null;
    // The details and the coupon as the checkout can use them: the fields as text, nothing else.
    const { customer, coupon, couponWords, ...order } = o;
    return { ...order, ...(customer && typeof customer === "object" ? { customer: details(customer) } : {}), ...taken(coupon, couponWords) };
  } catch { return null; }
}

// The checkout's own fields only, each as text.
const details = (customer) => Object.fromEntries(DETAILS.map(k => [k, typeof customer[k] === "string" ? customer[k] : ""]));
// The coupon the server took, and its words when they are real ones.
const taken = (coupon, words) => typeof coupon === "string" && coupon ? { coupon, ...(isSizeWords(words) ? { couponWords: words } : {}) } : {};

// Keeps it and hands back what was kept. customer: the details as typed; coupon: the code the
// server took for this order, couponWords: what it took off. Any of them left out (an order kept
// before they were): none kept.
export function saveCardOrder({ ref, ids, email, lines, total, session, customer, coupon, couponWords }) {
  const order = {
    ref, ids, email, lines: lines.map(({ title, amount }) => ({ title, amount })), total, session: SESSION.test(session || "") ? session : null,
    ...(customer && typeof customer === "object" ? { customer: details(customer) } : {}),
    ...taken(coupon, couponWords),
  };
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* storage blocked: a retry can't be recognised then, and nothing else breaks */ }
  return order;
}

export function dropCardOrder() {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept, nothing to drop */ }
}

// Is the saved order for exactly the pieces in this cart: the same titles, as many times?
export function matchesCart(order, items) {
  if (!order || !Array.isArray(items) || items.length !== order.lines.length) return false;
  const want = items.map(i => clean(i.title)).sort(), have = order.lines.map(l => clean(l.title)).sort();
  return want.every((title, n) => title === have[n]);
}

// The cart once a card payment is in: each paid title leaves it ONCE, so a second copy of the
// same piece, or anything added since, stays.
export function withoutTitles(items, titles) {
  const left = (titles || []).map(clean);
  return items.filter((item) => {
    const n = left.indexOf(clean(item.title));
    if (n < 0) return true;
    left.splice(n, 1);
    return false;
  });
}

// What the server needs to find the saved order again ("cart-again", "cart-order", "cart-other").
// The titles are the cart's own: the server checks them against the order's rows. customer: the
// details as typed last, whose email names the order too (a changed email that reached the rows
// when its answer never reached this browser: api/_lib/cartCheckout.js savedCart).
export const cardOrderBody = (order, items) => ({
  ref: order.ref, ids: order.ids, email: order.email, titles: items.map(i => i.title),
  ...(order.session ? { session: order.session } : {}),
  ...(order.customer ? { customer: order.customer } : {}),
});

// The way back from Stripe (App.jsx): ?cart=FA-1752&card=cs_... once paid, or &card=cancelled
// from Stripe's own page (only pages made there before the card form opened inside fonkiart.com:
// no new one is ever made). Anything else is not a way back from Stripe: null.
export function readCardReturn(search) {
  const q = new URLSearchParams(search || "");
  const ref = q.get("cart") || "", card = q.get("card") || "";
  if (!REF.test(ref)) return null;
  if (card === "cancelled") return { ref, cancelled: true };
  return SESSION.test(card) ? { ref, session: card } : null;
}
