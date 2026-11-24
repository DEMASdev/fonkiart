import { InputError } from "./errors.js";
import { bearer } from "./adminToken.js";
import { artPrice } from "./artworks.js";
import { goodPass } from "./cartPass.js";
// The same rule as Admin -> Orders "Didn't finish paying", imported, never copied.
import { unfinishedCard, unfinishedThisWeek } from "../../src/lib/orderRow.js";

// Remembered carts (Andy, 2026-11-22: "then we know who the person is"). The pieces in the cart
// of someone who gave their email (the welcome gift, the 5-minute box: src/lib/cartMemory.js) or
// is signed in, kept on their Leads row (cart, cart_at: db/2026-11-22-cart-email.sql), so the art
// is waiting when they sign in (opMyCart), and so the shop can follow up with people who leave
// pieces in their cart (cartsLeft).
// - Only its owner can save, change or empty it (Andy, 2026-11-23, "all 8"): the person signed in
//   with that email, or the browser that gave the email FIRST, which shows the pass it was handed
//   then (cartPass.js). Anyone else typing that email changes nothing. Never anyone anonymous, and
//   an email typed here never makes a Leads row.
// - Before "Verify my email" is tapped, an email is ONLY this cart link: nothing about it is ever
//   answered (no orders, no address, no account). A typed email's answer depends on the pass alone,
//   never on whether that email is on the list, so it can't tell anyone who is.
// - Until the SQL has run there are no cart columns (seen on the row read, the way artworks.js
//   keepsHold does): nothing is saved and nothing breaks. The store action "cart-saving" tells the
//   site which it is, one yes or no for everyone, so the site says the pieces are saved only when
//   they really are (src/lib/cartMemory.js cartSaving).
// - A saved cart lasts CART_DAYS from its last change. Art that has sold, and art the person has
//   bought since, is out of it.

const MAX_PIECES = 30;
export const CART_DAYS = 30;
const CART_MS = CART_DAYS * 24 * 60 * 60 * 1000;
const READ_MAX = 1000; // the most rows Supabase answers at once
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasCart = (row) => Object.hasOwn(row || {}, "cart") && Object.hasOwn(row || {}, "cart_at");
const lower = (s) => String(s ?? "").trim().toLowerCase();
const when = (iso) => Date.parse(iso || "") || 0;
const savedLately = (at, now) => when(at) > 0 && now.getTime() - when(at) <= CART_MS;

// Has the SQL run? A Leads row shows its columns (as above). An empty list shows none, so then the
// two columns are asked for by name, and a refusal means no. A list that can't be read throws.
async function cartColumns(db) {
  const { data, error } = await db.from("Leads").select("*").limit(1);
  if (error) throw error;
  if (data?.length) return hasCart(data[0]);
  const { error: missing } = await db.from("Leads").select("cart,cart_at").limit(1);
  return !missing;
}

// The store action "cart-saving": is cart saving on? One yes or no for the whole site. It reads no
// email and answers nothing about anyone.
export async function opCartSaving(db) {
  return { on: await cartColumns(db) };
}

const isId = (n) => Number.isSafeInteger(n) && n > 0;

// The cart's pieces as the browser sends them: artwork ids, whole numbers, each once, at most 30.
function pieceIds(value) {
  if (!Array.isArray(value)) throw new InputError("Bad pieces");
  const ids = [...new Set(value.map(Number))];
  if (ids.length > MAX_PIECES || !ids.every(isId)) throw new InputError("Bad pieces");
  return ids;
}

// The pieces of a saved cart, by their ids.
const savedIds = (cart) => [...new Set((Array.isArray(cart) ? cart : []).map(p => Number(p?.id)))].filter(isId).slice(0, MAX_PIECES);

function typedEmail(value) {
  if (value == null || value === "") return null;
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s.length > 254 || !EMAIL_RE.test(s)) throw new InputError("Invalid email");
  return s;
}

// Whoever is signed in for real, as Supabase says from their own sign-in (Andy, 2026-11-23: the
// collectors too): a confirmed email, and whether it is a buyer's. Else null. Supabase not
// answering at all is an error, never "nobody": taken for nobody, a browser could think there was
// no saved cart, and save its own over it.
async function signedInAs(db, req) {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error && (error.name === "AuthRetryableFetchError" || error.status === 429 || error.status >= 500)) throw error;
  const user = data?.user;
  if (error || !user?.email) return null;
  if (!user.email_confirmed_at && !user.confirmed_at) return null;
  return { email: user.email.toLowerCase(), buyer: user.user_metadata?.role === "buyer" };
}

// An email's Leads rows (one, as a rule): the one whose cart was saved last comes first.
async function leadsOf(db, email) {
  const { data, error } = await db.from("Leads").select("*").eq("email", email).limit(10);
  if (error) throw error;
  return (data || []).sort((a, b) => when(b.cart_at) - when(a.cart_at));
}

// Those pieces as the shop's own records have them now, by id. Ids the shop doesn't have are out.
async function shopPieces(db, ids) {
  const found = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("Artworks").select("id,title,price,salePrice,image,isSold").in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const a of data || []) found.set(Number(a.id), a);
  }
  return found;
}

// A piece as a cart keeps it and the shop's follow-up shows it, never in the browser's words: id,
// title, price (the one the shop shows, artworks.js artPrice), picture.
const pieceOf = (a) => ({ id: Number(a.id), title: a.title ?? "", price: artPrice(a), image: a.image || null });

async function piecesOf(db, ids) {
  if (!ids.length) return [];
  const shop = await shopPieces(db, ids);
  return ids.map(id => shop.get(id)).filter(Boolean).map(pieceOf);
}

// The store action "remember-cart": { email, pass, pieces: [ids] }, or { pieces } signed in. An
// empty cart (bought, or taken out) clears what was kept, so nobody is followed up about it.
// A typed email with no pass: { ok: true }, and nothing is read or written. A pass that isn't good
// for it: { ok: true, kept: false }, nothing written, whoever the email is. Good, and saved:
// { ok: true, kept: true }.
export async function opRememberCart(db, req, now = new Date()) {
  const body = req.body || {};
  const ids = pieceIds(body.pieces);
  const account = await signedInAs(db, req);
  const email = account?.email || typedEmail(body.email);
  if (!email) return { ok: true };
  const { pass } = body;
  if (!account && (pass == null || pass === "")) return { ok: true };
  const rows = await leadsOf(db, email);
  // An email nobody knows is checked the same way, against no code, so it looks just like one
  // whose pass is wrong.
  const lead = account ? rows[0] : (rows.length ? rows : [{}]).find(r => goodPass(pass, email, r.coupon_code, now));
  if (!account && !lead) return { ok: true, kept: false };
  if (lead && !hasCart(lead)) return { ok: true }; // the SQL hasn't run yet
  const pieces = await piecesOf(db, ids);
  const cart = pieces.length ? pieces : null;
  if (!lead) {
    if (!cart) return { ok: true };
    if (!(await cartColumns(db))) return { ok: true }; // the SQL hasn't run yet
  }
  const at = now.toISOString();
  const { error: writeErr } = lead
    ? await db.from("Leads").update({ cart, cart_at: at }).eq("id", lead.id)
    : await db.from("Leads").insert([{ email, source: account.buyer ? "buyer-cart" : "collector-cart", coupon_code: null, coupon_used: false, cart, cart_at: at }]);
  if (writeErr) throw writeErr;
  return account ? { ok: true } : { ok: true, kept: true };
}

// What this person has ordered since their cart was saved, by title: theirs already, so it doesn't
// come back to their cart. A card checkout they didn't finish paying bought nothing.
async function orderedSince(db, email, at) {
  const like = email.replace(/[\\%_]/g, "\\$&"); // any capitals, and nothing but this email
  const { data, error } = await db.from("Orders").select("client_email,item_title,status,notes,created_at").ilike("client_email", like);
  if (error) throw error;
  return new Set((data || []).filter(o => lower(o.client_email) === email && when(o.created_at) >= when(at) && !unfinishedCard(o))
    .map(o => o.item_title).filter(Boolean));
}

// The store action "my-cart" (Andy, 2026-11-23, "all 8": their art is waiting in the cart when they
// sign in): the saved pieces of whoever is signed in, by their own sign-in, never an email in the
// body: { signedIn: true, pieces: [ids] }, the ones the shop still sells today; none when saving is
// off, or nothing is kept (or too long ago). Nobody signed in for real: { pieces: [] }, without that
// word, so a browser whose sign-in didn't get here (expired, or Supabase out of its reach) never
// takes it for "nothing saved", and saves its own cart over theirs. Nothing else about the person.
export async function opMyCart(db, req, now = new Date()) {
  const account = await signedInAs(db, req);
  if (!account) return { pieces: [] };
  const [lead] = await leadsOf(db, account.email);
  const ids = lead && hasCart(lead) && savedLately(lead.cart_at, now) ? savedIds(lead.cart) : [];
  if (!ids.length) return { signedIn: true, pieces: [] };
  const [shop, theirs] = await Promise.all([shopPieces(db, ids), orderedSince(db, account.email, lead.cart_at)]);
  const sells = (a) => !!a && !a.isSold && artPrice(a) !== null && !theirs.has(a.title);
  return { signedIn: true, pieces: ids.filter(id => sells(shop.get(id))) };
}

// Who left art in their cart, the last saved first, for the shop's follow-up (the morning email,
// reminders.js; Admin's list): [{ email, name, pieces: [{ id, title, price, image }], total, at }].
// - saved in the last CART_DAYS, with the pieces as the shop has them TODAY: art that has sold, or
//   left the shop, is out, and so is a cart with nothing left in it;
// - not someone with any order since that cart was saved, whatever its status: they came back;
// - not someone on "Didn't finish paying" this week: they are listed there already.
// name: from Clients, or an order's shipping name; "" when the shop doesn't know it.
// [] until the SQL has run, or if any of it can't be read. strict: that throws instead, for Admin's
// list (cartCoupon.js), where nobody must mean nobody. limit: at most this many.
export async function cartsLeft(db, { now = new Date(), limit = 200, strict = false } = {}) {
  try {
    return (await leftCarts(db, now)).slice(0, limit);
  } catch (e) {
    if (strict) throw new Error(`couldn't read who left art in their cart: ${e?.message || e}`, { cause: e });
    console.warn(`cartsLeft: not read (${e?.code || "error"})`);
    return [];
  }
}

async function leftCarts(db, now) {
  if (!(await cartColumns(db))) return []; // the SQL hasn't run yet
  const { data, error } = await db.from("Leads").select("*").not("cart", "is", null)
    .order("cart_at", { ascending: false }).limit(READ_MAX);
  if (error) throw error;
  const carts = new Map(); // each email once: the cart it saved last
  for (const r of (data || []).filter(r => hasCart(r) && savedLately(r.cart_at, now)).sort((a, b) => when(b.cart_at) - when(a.cart_at))) {
    const email = lower(r.email);
    if (email && !carts.has(email)) carts.set(email, { email, ids: savedIds(r.cart), at: r.cart_at });
  }
  if (!carts.size) return [];

  const orders = await db.from("Orders").select("*").order("created_at", { ascending: false }).limit(READ_MAX);
  if (orders.error) throw orders.error;
  const names = new Map();
  for (const o of orders.data || []) {
    const email = lower(o.client_email);
    const cart = carts.get(email);
    if (!cart) continue;
    const name = String(o.ship_name || o.client_name || "").trim();
    if (name && !names.has(email)) names.set(email, name);
    if (when(o.created_at) >= when(cart.at) || unfinishedThisWeek(o, now.getTime())) cart.gone = true;
  }
  const left = [...carts.values()].filter(c => !c.gone && c.ids.length);
  if (!left.length) return [];

  const shop = await shopPieces(db, [...new Set(left.flatMap(c => c.ids))]);
  const clients = await clientNames(db);
  return left.map(({ email, ids, at }) => {
    const pieces = ids.map(id => shop.get(id)).filter(a => a && !a.isSold).map(pieceOf);
    return { email, name: clients.get(email) || names.get(email) || "", pieces, total: pieces.reduce((sum, p) => sum + (p.price || 0), 0), at };
  }).filter(c => c.pieces.length);
}

// The shop's own names (Admin -> Clients), by email, any capitals. A name is a nicety: when they
// can't be read there are none.
async function clientNames(db) {
  const names = new Map();
  try {
    const { data, error } = await db.from("Clients").select("name,email").limit(READ_MAX);
    if (error) throw error;
    for (const c of data || []) if (lower(c.email) && String(c.name || "").trim()) names.set(lower(c.email), String(c.name).trim());
  } catch (e) {
    console.warn(`cartsLeft: client names not read (${e?.code || "error"})`);
  }
  return names;
}

// Once a day (reminders.js): a cart saved more than CART_DAYS ago is let go, the Leads row itself
// stays as it is. Nothing to do until the SQL has run.
export async function forgetOldCarts(db, now = new Date()) {
  if (!(await cartColumns(db))) return;
  const { error } = await db.from("Leads").update({ cart: null, cart_at: null }).lt("cart_at", new Date(now.getTime() - CART_MS).toISOString());
  if (error) throw error;
}
