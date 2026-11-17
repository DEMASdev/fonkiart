// Opening a sent invoice from the admin (Andy, 2026-11-17: "i can't open past invoices").
// The admin's Orders list only had "Link" (copies the address) and "Resend", so
// there was no way to look at an invoice. "Open" now opens the customer's own
// invoice page with &view=shop added: the same page the customer sees, but
// READ-ONLY. The Approve button is not shown there, so opening an invoice can never
// approve it on the customer's behalf.

export const SHOP_VIEW = "shop";

// The customer's link (what the invoice email carries) is unchanged; the shop's
// link is the same address plus &view=shop.
export function invoiceLink(origin, token, { shopView = false } = {}) {
  const link = `${origin}/?invoice=${encodeURIComponent(token)}`;
  return shopView ? `${link}&view=${SHOP_VIEW}` : link;
}

export function readInvoiceParams(search) {
  const p = new URLSearchParams(search);
  return { token: p.get("invoice"), shopView: p.get("view") === SHOP_VIEW };
}

// Only the customer, on their own link, can approve, and only once.
export function canApprove({ approved, shopView }) {
  return !approved && !shopView;
}

// Which ways to pay the customer sees after confirming (Andy, 2026-11-17: "confirm how
// pay how ?"). Zelle is ticked by default on the Send Invoice form but its box starts
// EMPTY, with the shop's address only as grey placeholder text, so an invoice sent
// as-is used to save a blank Zelle address and the customer saw no way to pay at all.
// A blank box now falls back to the Zelle address in Settings, as the shop checkout does.
// The card (Stripe) box works the same way: blank falls back to Settings' Default Stripe
// Payment Link (Andy, 2026-11-17, after creating the Stripe account).
// payment_methods is null on old invoices: then every way that has a value shows.
export function paymentOptions(order = {}, settings = {}) {
  const methods = order.payment_methods ? String(order.payment_methods).split(",") : null;
  const allowed = (m) => !methods || methods.includes(m);
  const val = (v) => (typeof v === "string" && v.trim()) ? v.trim() : null;
  const zelle   = allowed("zelle")   ? (val(order.zelle_contact) || val(settings.zelleContact)) : null;
  const venmo   = allowed("venmo")   ? val(settings.venmoHandle)   : null;
  const cashApp = allowed("cashapp") ? val(settings.cashAppHandle) : null;
  const stripe  = allowed("stripe")  ? (val(order.stripe_link) || val(settings.stripeLink)) : null;
  return { zelle, venmo, cashApp, stripe, any: !!(zelle || venmo || cashApp || stripe) };
}

// The artwork an invoice is for (Andy, 2026-11-17: "can't see the artwork i'm paying for").
// An invoice only stores the item's TITLE, so find the piece in the catalogue by its
// title: same words, ignoring case, extra spaces and quotes. No match, no picture;
// it never guesses, so a customer is never shown the wrong piece.
const norm = (t) => String(t ?? "").toLowerCase().replace(/["'‘’“”]/g, "").replace(/\s+/g, " ").trim();
export function findArtwork(artworks = [], title) {
  const want = norm(title);
  if (!want) return null;
  return artworks.find(a => a && a.image && norm(a.title) === want) || null;
}
