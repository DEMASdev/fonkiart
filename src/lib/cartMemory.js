// Who this browser's cart belongs to (Andy, 2026-11-22: "if someone enters their email they
// should get a verify your email .. email, and inmediately that session is logged in and if they
// add something to cart now we know !!"). The email someone gives (the welcome gift, the 5-minute
// box) is kept here AT ONCE, and from then on the cart is saved with it on the server whenever it
// changes (the store action "remember-cart", api/_lib/cartMemory.js). A signed-in buyer's cart is
// saved with their own sign-in instead.
// Before they tap "Verify my email", that email is ONLY this cart link: nothing about it ever comes
// back to this browser (no orders, no address, no My Account) until they sign in for real.
// An anonymous visitor's cart is never sent anywhere.

const KEY = "fonkiart-cart-email";
const SENT = "fonkiart-cart-sent"; // what the server last got: "<owner>|<piece ids>"
export const REMEMBERED = "fonkiart-cart-email"; // the window event when the email changes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let held = ""; // a browser that keeps nothing (a private window): kept for this visit only

export function rememberedEmail() {
  let v = held;
  try { v = localStorage.getItem(KEY) || held; } catch { /* this visit's copy */ }
  return EMAIL_RE.test(v) ? v : "";
}

export function remember(email) {
  const v = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return false;
  held = v;
  try { localStorage.setItem(KEY, v); } catch { /* kept for this visit only */ }
  window.dispatchEvent(new Event(REMEMBERED));
  return true;
}

// "Not you?": this browser forgets the email (and what it last sent, so the next email is sent afresh).
export function forget() {
  held = "";
  try { localStorage.removeItem(KEY); localStorage.removeItem(SENT); } catch { /* nothing kept */ }
  window.dispatchEvent(new Event(REMEMBERED));
}

// fn() whenever the remembered email changes, here or in another tab; returns the way to stop.
export function onRemembered(fn) {
  const other = (e) => { if (e.key === KEY) fn(); };
  window.addEventListener(REMEMBERED, fn);
  window.addEventListener("storage", other);
  return () => { window.removeEventListener(REMEMBERED, fn); window.removeEventListener("storage", other); };
}

// A buyer signed in for real (Supabase, email confirmed): their cart goes with their own sign-in.
export const isBuyer = (user) => user?.user_metadata?.role === "buyer" && !!(user.email_confirmed_at || user.confirmed_at);

// Whose cart this is, for the server: a signed-in buyer, else the remembered email, else nobody ("").
export const cartOwner = (user, email) => (isBuyer(user) ? `buyer:${user.id}` : email || "");

// The pieces as the server takes them: their artwork ids, each once, at most 30.
export const pieceIds = (cart) => [...new Set((cart || []).map(i => Number(i?.id)).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 30);

// Send this cart? Only to someone known, only when it differs from what the server last got (a
// reload sends nothing, so "when it last changed" stays true), and never an empty cart to someone
// just met: that would empty a cart they left on another device.
export function shouldSend(owner, ids, last) {
  if (!owner) return false;
  const now = `${owner}|${ids.join(",")}`;
  if (now === last) return false;
  return !(ids.length === 0 && String(last || "").split("|")[0] !== owner);
}

const lastSent = () => { try { return localStorage.getItem(SENT) || ""; } catch { return ""; } };
const markSent = (v) => { try { localStorage.setItem(SENT, v); } catch { /* sent again next time */ } };

// Saves the cart with whoever it belongs to, when it should (above). true when it was sent.
export async function saveCart(ask, cart, { user, email }) {
  const owner = cartOwner(user, email);
  const ids = pieceIds(cart);
  if (!shouldSend(owner, ids, lastSent())) return false;
  if (isBuyer(user)) await ask("remember-cart", { pieces: ids }, { signedIn: true });
  else await ask("remember-cart", { email, pieces: ids });
  markSent(`${owner}|${ids.join(",")}`);
  return true;
}
