// Who this browser's cart belongs to (Andy, 2026-11-22: "if someone enters their email they
// should get a verify your email .. email, and inmediately that session is logged in and if they
// add something to cart now we know !!"). The email someone gives (the welcome gift, the 5-minute
// box) is kept here AT ONCE, and from then on the cart is saved with it on the server whenever it
// changes (the store action "remember-cart", api/_lib/cartMemory.js). A signed-in buyer's cart is
// saved with their own sign-in instead.
// Before they tap "Verify my email", that email is ONLY this cart link: nothing about it ever comes
// back to this browser (no orders, no address, no My Account) until they sign in for real.
// An anonymous visitor's cart is never sent anywhere.
// Cart saving is on only once the server says so (the store action "cart-saving": the SQL has
// run). Until then nothing is sent, and nothing on the site says the pieces are saved. And a cart
// is only ever saved with an email that was TOLD so, in the words it was given with ("...and
// remember the pieces in your cart with it"): an email given while saving was off is known here,
// but never saved with.

const KEY = "fonkiart-cart-email";
const TOLD = "fonkiart-cart-told"; // the email that was told its cart is saved (remember, below)
const SENT = "fonkiart-cart-sent"; // what the server last got: "<owner>|<piece ids>"
export const REMEMBERED = "fonkiart-cart-email"; // the window event when the email changes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let held = ""; // a browser that keeps nothing (a private window): kept for this visit only
let heldTold = "";

export function rememberedEmail() {
  let v = held;
  try { v = localStorage.getItem(KEY) || held; } catch { /* this visit's copy */ }
  return EMAIL_RE.test(v) ? v : "";
}

// The remembered email, when it was told its cart is saved: the only email a cart is saved with.
export function toldEmail() {
  const v = rememberedEmail();
  let t = heldTold;
  try { t = localStorage.getItem(TOLD) || heldTold; } catch { /* this visit's copy */ }
  return v && t === v ? v : "";
}

// told: the words the email was given with said the pieces are remembered (saving was on). The
// same email stays told; another one given without those words is known, but not saved with.
export function remember(email, { told = false } = {}) {
  const v = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return false;
  const keep = told || toldEmail() === v;
  held = v;
  heldTold = keep ? v : "";
  try {
    localStorage.setItem(KEY, v);
    if (keep) localStorage.setItem(TOLD, v);
    else localStorage.removeItem(TOLD);
  } catch { /* kept for this visit only */ }
  window.dispatchEvent(new Event(REMEMBERED));
  return true;
}

// "Not you?": this browser forgets the email (and what it last sent, so the next email is sent afresh).
export function forget() {
  held = "";
  heldTold = "";
  try { localStorage.removeItem(KEY); localStorage.removeItem(TOLD); localStorage.removeItem(SENT); } catch { /* nothing kept */ }
  window.dispatchEvent(new Event(REMEMBERED));
}

// fn() whenever the remembered email changes, here or in another tab; returns the way to stop.
export function onRemembered(fn) {
  const other = (e) => { if (e.key === KEY || e.key === TOLD || e.key === null) fn(); };
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

// Is cart saving on for the whole site? The store action "cart-saving" says (yes once
// db/2026-11-22-cart-email.sql has run). Asked once a visit. Anything but a clear yes is no, so
// the site never says a cart is saved when it isn't; a question that failed is asked again.
const asked = new WeakMap();
export function cartSaving(ask) {
  if (!asked.has(ask)) {
    asked.set(ask, Promise.resolve().then(() => ask("cart-saving"))
      .then((r) => r?.on === true, () => { asked.delete(ask); return false; }));
  }
  return asked.get(ask);
}

// Saves the cart with whoever it belongs to, when it should (above), and only while saving is on
// (saving: cartSaving's answer). email: the told one (toldEmail). true when it was sent.
export async function saveCart(ask, cart, { user, email, saving }) {
  if (!saving) return false;
  const owner = cartOwner(user, email);
  const ids = pieceIds(cart);
  if (!shouldSend(owner, ids, lastSent())) return false;
  if (isBuyer(user)) await ask("remember-cart", { pieces: ids }, { signedIn: true });
  else await ask("remember-cart", { email, pieces: ids });
  markSent(`${owner}|${ids.join(",")}`);
  return true;
}
