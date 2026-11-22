import { InputError } from "./errors.js";
import { bearer } from "./adminToken.js";
import { artPrice } from "./artworks.js";

// Remembered carts (Andy, 2026-11-22: "then we know who the person is"). The pieces in the cart
// of someone who gave their email (the welcome gift, the 5-minute box: src/lib/cartMemory.js) or
// is signed in as a buyer, kept on their Leads row (cart, cart_at: db/2026-11-22-cart-email.sql),
// so the shop can follow up with people who leave pieces in their cart (cartsLeft, below).
// - Only for an email that gave itself: its Leads row is already there, or it is a signed-in
//   buyer's own. Never anyone anonymous, and an email typed here never makes a Leads row.
// - Before "Verify my email" is tapped, an email is ONLY this cart link: nothing about it is ever
//   answered (no orders, no address, no account). The answer is { ok: true } and nothing else,
//   the same whether anything was kept or not, so it can't tell anyone who is on the list.
// - Until the SQL has run there are no cart columns (seen on the row read, the way artworks.js
//   keepsHold does): nothing is saved and nothing breaks.

const MAX_PIECES = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasCart = (row) => Object.hasOwn(row || {}, "cart") && Object.hasOwn(row || {}, "cart_at");

// The cart's pieces as the browser sends them: artwork ids, whole numbers, each once, at most 30.
function pieceIds(value) {
  if (!Array.isArray(value)) throw new InputError("Bad pieces");
  const ids = [...new Set(value.map(Number))];
  if (ids.length > MAX_PIECES || ids.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new InputError("Bad pieces");
  return ids;
}

function typedEmail(value) {
  if (value == null || value === "") return null;
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s.length > 254 || !EMAIL_RE.test(s)) throw new InputError("Invalid email");
  return s;
}

// A signed-in buyer, as Supabase says from their own sign-in: their email, else null.
async function buyerEmail(db, req) {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email || user.user_metadata?.role !== "buyer") return null;
  if (!user.email_confirmed_at && !user.confirmed_at) return null;
  return user.email.toLowerCase();
}

// The pieces as the shop's own records name them, never in the browser's words: id, title,
// price (the one the shop shows, artworks.js artPrice), picture. Ids the shop doesn't have drop out.
async function piecesOf(db, ids) {
  if (!ids.length) return [];
  const { data, error } = await db.from("Artworks").select("id,title,price,salePrice,image").in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map(a => [Number(a.id), a]));
  return ids.map(id => byId.get(id)).filter(Boolean)
    .map(a => ({ id: Number(a.id), title: a.title ?? "", price: artPrice(a), image: a.image || null }));
}

// The store action "remember-cart": { email?, pieces: [ids] }, or { pieces } with a buyer's sign-in.
// An empty cart (bought, or taken out) clears what was kept, so nobody is followed up about it.
export async function opRememberCart(db, req, now = new Date()) {
  const body = req.body || {};
  const ids = pieceIds(body.pieces);
  const account = await buyerEmail(db, req);
  const email = account || typedEmail(body.email);
  if (!email) return { ok: true };
  const { data: rows, error } = await db.from("Leads").select("*").eq("email", email).limit(1);
  if (error) throw error;
  const lead = rows?.[0];
  if (!lead && !account) return { ok: true }; // an email that never gave itself: nothing
  if (lead && !hasCart(lead)) return { ok: true }; // the SQL hasn't run yet
  const pieces = await piecesOf(db, ids);
  const cart = pieces.length ? pieces : null;
  if (!lead) {
    if (!cart) return { ok: true };
    const { data: any, error: probeErr } = await db.from("Leads").select("*").limit(1);
    if (probeErr) throw probeErr;
    if (!hasCart(any?.[0])) return { ok: true }; // the SQL hasn't run yet (or no row to tell by)
  }
  const at = now.toISOString();
  const { error: writeErr } = lead
    ? await db.from("Leads").update({ cart, cart_at: at }).eq("id", lead.id)
    : await db.from("Leads").insert([{ email, source: "buyer-cart", coupon_code: null, coupon_used: false, cart, cart_at: at }]);
  if (writeErr) throw writeErr;
  return { ok: true };
}

// Everyone whose cart is remembered, the newest first: [{ email, pieces, at }]. For the shop's
// follow-up (the morning email and Admin's list). [] until the SQL has run, or if it can't be read.
export async function cartsLeft(db, { limit = 200 } = {}) {
  const { data, error } = await db.from("Leads").select("*").not("cart", "is", null)
    .order("cart_at", { ascending: false }).limit(limit);
  if (error) {
    console.warn(`cartsLeft: not read (${error.code || "error"})`);
    return [];
  }
  return (data || []).filter(r => hasCart(r) && Array.isArray(r.cart) && r.cart.length > 0)
    .map(r => ({ email: r.email, pieces: r.cart, at: r.cart_at }));
}
