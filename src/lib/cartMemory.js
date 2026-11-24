// Who this browser's cart belongs to (Andy, 2026-11-22: "if someone enters their email they
// should get a verify your email .. email, and inmediately that session is logged in and if they
// add something to cart now we know !!"). The email someone gives (the welcome gift, the 5-minute
// box) is kept here AT ONCE, and from then on the cart is saved with it on the server whenever it
// changes (the store action "remember-cart", api/_lib/cartMemory.js). Whoever is signed in, a buyer
// or a collector, has it saved with their own sign-in instead.
// Only the browser that gave an email FIRST may save a cart with it (Andy, 2026-11-23, "all 8"):
// the server handed it a pass then (api/_lib/cartPass.js), kept beside the email and sent with
// every save. Someone typing an email that is on the list already has none, so nothing is sent.
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
const PASS = "fonkiart-cart-pass"; // the pass that email was handed: "<email> <pass>"
const SENT = "fonkiart-cart-sent"; // what the server last got: "<owner>|<piece ids>"
const BACK = "fonkiart-cart-back"; // whose saved cart has come back to this browser: their sign-in's id
export const REMEMBERED = "fonkiart-cart-email"; // the window event when any of it changes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A browser that keeps nothing (a private window, storage blocked): kept for this visit only.
const held = new Map();
function get(key) {
  if (held.has(key)) return held.get(key);
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function put(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    held.delete(key);
  } catch {
    if (value) held.set(key, value);
    else held.delete(key);
  }
}
const changed = () => window.dispatchEvent(new Event(REMEMBERED));

export function rememberedEmail() {
  const v = get(KEY);
  return EMAIL_RE.test(v) ? v : "";
}

// The pass this browser was handed for this email, or "".
function passOf(email) {
  const [whose, pass] = get(PASS).split(" ");
  return email && whose === email && pass ? pass : "";
}

// The remembered email, when it was told its cart is saved AND its pass is here: the only email a
// cart is saved with, and the only one the site says so about.
export function toldEmail() {
  const v = rememberedEmail();
  return v && get(TOLD) === v && passOf(v) ? v : "";
}

// told: the words the email was given with said the pieces are remembered (saving was on). pass: the
// one the server handed back, only for an email nobody had given before. The same email given again
// stays told and keeps its pass; another one given without them is known, but not saved with.
export function remember(email, { told = false, pass = "" } = {}) {
  const v = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return false;
  const given = typeof pass === "string" ? pass : "";
  const keep = told || (rememberedEmail() === v && get(TOLD) === v);
  const kept = given || passOf(v);
  put(KEY, v);
  put(TOLD, keep ? v : "");
  put(PASS, kept ? `${v} ${kept}` : "");
  if (given) put(SENT, ""); // a new pass goes with a new row on the server, which has no cart yet
  changed();
  return true;
}

// This browser forgets the email, its pass, and what it last sent (so the next email is sent afresh).
export function forget() {
  for (const key of [KEY, TOLD, PASS, SENT]) put(key, "");
  changed();
}

// The server says this pass is no good (too old, or the row it was made for is gone): the email
// stays known, but the site stops saying its cart is saved.
function dropPass(pass) {
  if (passOf(rememberedEmail()) !== pass) return; // another email, or a newer pass, by now
  for (const key of [TOLD, PASS, SENT]) put(key, "");
  changed();
}

// fn() whenever any of it changes, here or in another tab; returns the way to stop.
export function onRemembered(fn) {
  const other = (e) => { if (e.key === null || [KEY, TOLD, PASS, BACK].includes(e.key)) fn(); };
  window.addEventListener(REMEMBERED, fn);
  window.addEventListener("storage", other);
  return () => { window.removeEventListener(REMEMBERED, fn); window.removeEventListener("storage", other); };
}

// Signed in for real (Supabase, email confirmed), a buyer or a collector: their cart goes with
// their own sign-in.
export const isBuyer = (user) => !!user?.id && !!(user.email_confirmed_at || user.confirmed_at);

// Whose cart this is, for the server: whoever is signed in, else the remembered email, else nobody ("").
export const cartOwner = (user, email) => (isBuyer(user) ? `account:${user.id}` : email || "");

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

// ── their art is waiting (Andy, 2026-11-23, "all 8") ────────────
// Someone who signs in finds the art they left in their cart, whichever device they left it on. Once
// per sign-in in each browser (BACK, taken away when they sign out): a piece they take out after
// that is gone for good. Until their saved cart has come back, this browser's own cart is not saved
// with their account, or it would be saved over the one they left elsewhere.

export const backHere = () => get(BACK);
export const cameBack = (id) => !!id && backHere() === String(id);

// ids: what the server has for them (nothing is sent for a cart that is the same).
export function markBack(id, ids) {
  put(SENT, `account:${id}|${ids.join(",")}`);
  put(BACK, String(id));
  changed();
}

// Signed out: the next sign-in asks again.
export function forgetBack() {
  if (!get(BACK)) return;
  put(BACK, "");
  changed();
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Their saved pieces' ids, as the store action "my-cart" answers the sign-in itself. Tried three
// times; null when it can't be asked, or answers as if nobody were signed in. paying: is the cart
// being paid for right now? It isn't changed then: this waits, and asks again after, as some of those
// pieces may be bought by then. pauses: how long it waits before each new try; look: how long before
// each new look at the checkout.
export async function waitingPieces(ask, { paying = () => false, pauses = [2000, 6000], look = 3000 } = {}) {
  for (let tries = 0; ;) {
    if (paying()) { await pause(look); continue; }
    try {
      const { signedIn, pieces } = await ask("my-cart", {}, { signedIn: true });
      if (signedIn !== true || !Array.isArray(pieces)) throw new Error("no answer");
      if (!paying()) return pieceIds(pieces.map(id => ({ id })));
    } catch (e) {
      if (tries >= pauses.length) { console.warn("Saved cart not read:", e?.status || "offline"); return null; }
      await pause(pauses[tries++]);
    }
  }
}

// The cart, then the pieces that aren't in it yet: what is in it stays as it is.
export function joinCart(cart, items) {
  const have = new Set(cart.map(i => Number(i?.id)));
  const more = items.filter(i => i && !have.has(Number(i.id)));
  return more.length ? [...cart, ...more] : cart;
}

// Those pieces from the shop's list, only ones it still sells (the rule of its own Add to cart).
export const stillSold = (ids, artworks) => ids.map(id => artworks.find(a => Number(a.id) === id)).filter(a => a && !a.isSold && (a.price || a.salePrice));

// Saves the cart with whoever it belongs to, when it should (above), and only while saving is on
// (saving: cartSaving's answer). email: the told one (toldEmail). true when it was saved. One at a
// time, in order, so an older cart never lands after a newer one.
let turn = Promise.resolve();
const inTurn = (fn) => { const mine = turn.then(fn); turn = mine.catch(() => {}); return mine; };

export const saveCart = (ask, cart, who) => inTurn(() => saveNow(ask, cart, who));

async function saveNow(ask, cart, { user, email, saving }) {
  if (!saving) return false;
  const owner = cartOwner(user, email);
  const ids = pieceIds(cart);
  if (!shouldSend(owner, ids, get(SENT))) return false;
  if (isBuyer(user)) {
    if (!cameBack(user.id)) return false; // their saved cart hasn't come back here yet
    await ask("remember-cart", { pieces: ids }, { signedIn: true });
  } else {
    const pass = passOf(email);
    if (!pass) return false;
    const r = await ask("remember-cart", { email, pass, pieces: ids });
    if (r?.kept === false) dropPass(pass);
    if (r?.kept !== true || passOf(email) !== pass) return false;
  }
  put(SENT, `${owner}|${ids.join(",")}`);
  return true;
}

// "Not you?" on the Cart page: takes the pieces off that email, with its pass, then this browser
// forgets all of it.
export function notMe(ask) {
  const email = toldEmail();
  const pass = passOf(email);
  forget();
  return email ? inTurn(() => ask("remember-cart", { email, pass, pieces: [] })) : Promise.resolve();
}
