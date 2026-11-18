// Opening a sent invoice from the admin (Andy, 2026-11-17: "i can't open past invoices").
// The admin's Orders list only had "Link" (copies the address) and "Resend", so
// there was no way to look at an invoice. "Open" now opens the customer's own
// invoice page with &view=shop added: the same page the customer sees, but
// READ-ONLY. The Approve button is not shown there, so opening an invoice can never
// approve it on the customer's behalf.

import { isPaid } from "./orderStatus.js";

export const SHOP_VIEW = "shop";

// The customer's link (what the invoice email carries) is unchanged; the shop's
// link is the same address plus &view=shop.
export function invoiceLink(origin, token, { shopView = false } = {}) {
  const link = `${origin}/?invoice=${encodeURIComponent(token)}`;
  return shopView ? `${link}&view=${SHOP_VIEW}` : link;
}

// card: Stripe sends the client back with &card=<payment page id> after paying by card.
export function readInvoiceParams(search) {
  const p = new URLSearchParams(search);
  return { token: p.get("invoice"), shopView: p.get("view") === SHOP_VIEW, card: p.get("card") || null };
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
// Card (Stripe): no pasted link any more (Andy, 2026-11-17: "why do i need to put a new
// link ? is it needed ?"). A Stripe link can't be told the amount, so the website now asks
// Stripe for a payment page with the invoice's exact amount (api/_lib/stripe.js). The card
// option shows when it's ticked on the invoice AND the Stripe key is set up (cardReady).
// payment_methods is null on old invoices: then every way that has a value shows.
export function paymentOptions(order = {}, settings = {}, { cardReady = false } = {}) {
  const methods = order.payment_methods ? String(order.payment_methods).split(",") : null;
  const allowed = (m) => !methods || methods.includes(m);
  const val = (v) => (typeof v === "string" && v.trim()) ? v.trim() : null;
  const zelle   = allowed("zelle")   ? (val(order.zelle_contact) || val(settings.zelleContact)) : null;
  const venmo   = allowed("venmo")   ? val(settings.venmoHandle)   : null;
  const cashApp = allowed("cashapp") ? val(settings.cashAppHandle) : null;
  const card    = allowed("stripe") && cardReady === true;
  return { zelle, venmo, cashApp, card, any: !!(zelle || venmo || cashApp || card) };
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

// Paid: a congratulations under the Fonkiart title (Andy, 2026-11-17, after paying his own
// test invoice: "should say Congratulations you make it yours ! a one of a kind ! very
// nicely and elegant under the fonkiart title"). His words, grammar fixed, nothing added.
// Paid, Shipped and Delivered all count, so a Zelle payment marked by hand shows it too.
// Never before the money is in: null.
export function paidCongrats(status) {
  return isPaid(status) ? { title: "Congratulations, you made it yours!", sub: "A one of a kind!" } : null;
}

// How a paid invoice was paid, in words for "Paid by <label> ✓" (Andy, 2026-11-17: "should say
// Thank you for your payment ! then under Paid by ... and the method used"). The order's
// paid_method holds one of: card, zelle, venmo, cashapp, cash, other. "other", empty (older
// orders) or a word not on this list: null, and the page says just "Paid ✓".
const PAID_BY = new Map([["card", "card"], ["zelle", "Zelle"], ["venmo", "Venmo"], ["cashapp", "Cash App"], ["cash", "cash"]]);
export function paidByLabel(method) {
  return PAID_BY.get(String(method ?? "").trim().toLowerCase()) ?? null;
}
