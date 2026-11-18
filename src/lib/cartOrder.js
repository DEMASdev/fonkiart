// The Cart order this browser saved for a card payment that isn't finished yet: its reference,
// its rows' ids, the email it was saved with, its pieces and amounts as the SERVER priced them,
// and the last payment page Stripe made for it. CheckoutModal keeps it so that paying again (a
// double tap, closing the card form and opening it again, coming back from Stripe's page without
// paying) re-opens THAT order (server op "cart-again", api/_lib/cartCheckout.js) instead of
// saving a second one and sending a second "order received" email. It lives in localStorage
// beside the cart itself (App.jsx "fonkiart-cart"), so it lasts through a reload or a new tab
// exactly as long as the cart does. Dropped once the order is paid (by card or another way), or
// once the server no longer knows it.
const KEY = "fonkiart-card-order";
const REF = /^FA-\d{1,9}$/;
const SESSION = /^cs_(live|test)_[A-Za-z0-9]{10,250}$/;
const clean = (title) => String(title ?? "").trim();

export function readCardOrder() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "null");
    const ok = o && REF.test(o.ref) && Array.isArray(o.ids) && o.ids.length > 0 && o.ids.every(Number.isSafeInteger)
      && typeof o.email === "string" && Array.isArray(o.lines) && o.lines.length === o.ids.length;
    return ok ? o : null;
  } catch { return null; }
}

// Keeps it and hands back what was kept.
export function saveCardOrder({ ref, ids, email, lines, total, session }) {
  const order = { ref, ids, email, lines: lines.map(({ title, amount }) => ({ title, amount })), total, session: SESSION.test(session || "") ? session : null };
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

// What the server needs to find the saved order again ("cart-again", "cart-order"). The titles
// are the cart's own: the server checks them against the order's rows.
export const cardOrderBody = (order, items) => ({
  ref: order.ref, ids: order.ids, email: order.email, titles: items.map(i => i.title),
  ...(order.session ? { session: order.session } : {}),
});

// The way back from Stripe (App.jsx): ?cart=FA-1752&card=cs_... once paid, or &card=cancelled
// from Stripe's own page. Anything else is not a way back from Stripe: null.
export function readCardReturn(search) {
  const q = new URLSearchParams(search || "");
  const ref = q.get("cart") || "", card = q.get("card") || "";
  if (!REF.test(ref)) return null;
  if (card === "cancelled") return { ref, cancelled: true };
  return SESSION.test(card) ? { ref, session: card } : null;
}
