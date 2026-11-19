// The Cart's card payment, through the same kind of Stripe page as invoices (Andy said yes to
// "Switch the Cart's 'Pay by card' button to the same Stripe page your invoices use?", then
// asked: "can it be imbedded inside fonkiart instead of sending the customer away ?").
//
// 1. "cart-card": the buyer taps "Pay Securely with Card". Card payments must be ON (cardReady),
//    or nothing is saved and the checkout says so. The card form opens INSIDE fonkiart.com or
//    the card payment doesn't start: the buyer is NEVER sent to Stripe's own page (Andy,
//    2026-11-18: "i don't want to be making the user jump to stripe then back"). So the browser
//    must have Stripe.js ready (embedded: true) and the shop's publishable key must be set and
//    right (stripe.js publishableKey); if not, nothing is saved or emailed, and the checkout says
//    so calmly (CARD_FORM_DOWN). Every piece is priced from the Artworks table, and the coupon
//    counts only as the server checks it: the amount charged comes from the shop's own records,
//    NEVER from the browser. A piece that can't be found or priced, or is already sold, refuses
//    the card payment with a message the buyer can act on, and nothing is saved. Then the order
//    is saved exactly as for Zelle (opOrder: the rows, the client, the coupon, both "order
//    received" emails), with the server's prices, and Stripe makes the card form for exactly
//    those rows. Once paid, Stripe brings the buyer back to the shop address they paid from
//    (returnSite).
// 2. "cart-paid": the buyer is back on fonkiart.com (?cart=FA-...&card=cs_...). The server asks
//    Stripe about that page itself: paid, for this reference, for the rows' exact cents, in
//    dollars. Only then do the rows turn Paid by card and the pieces SOLD, and ONE "Payment
//    received" email goes to the buyer and ONE "Paid by card" to the shop, for the whole cart.
// 3. Stripe's own "paid" message (op "stripe-event", storeOps.js) does the same for a buyer who
//    closes the tab. Whichever of the two gets there first sends the emails; the other, none.
// 4. ONE order per cart, however the buyer retries (a double tap, closing the card form and
//    opening it again, coming back from Stripe's page without paying, a card form that couldn't
//    open). The checkout keeps the saved order (its reference, rows, email and last payment page)
//    and asks again with it: "cart-again" opens a new card form for the SAME rows, and
//    "cart-order" says whether that order is paid by now, still open, or closed. Neither saves
//    an order or sends an "order received" email.
// 5. Orders started on Stripe's own page before the card form opened inside fonkiart.com come
//    back the same way (?cart=FA-...&card=cs_... or &card=cancelled) and are paid exactly as
//    above, by the card form if paid by card again. No new one is ever made.

import { InputError } from "./errors.js";
import { artPrice, cardImage, findPricedArtwork, markSoldForOrder, PAID_STATUSES } from "./artworks.js";
import { cardReady, cardSetup, createCartCheckout, expireCheckout, getCheckout, isSessionId, publishableKey, StripeError, toCents } from "./stripe.js";
import { siteUrl } from "./site.js";
import { cartPaidShop, cartPaidSubject, cartReceived, cartReceivedSubject } from "./cartEmails.js";

// The checkout's own words when card payments are off (src/components/CheckoutModal.jsx).
export const CARD_SOON = "Card payment is being set up. Please use Zelle or contact Fonkiart directly.";
// ...and when the card form can't open inside fonkiart.com: nothing saved, nothing charged. The
// browser's copy (src/lib/cartOrder.js) lets the checkout say it calmly, with Try Again and
// another way to pay; tests/checkout-flow.test.js checks the two agree.
export const CARD_FORM_DOWN = "The secure card form couldn't open right now. Nothing was charged. Please try again, or choose another way to pay.";

const NOT_PAID = ["pending", "confirmed"]; // as storeOps.js NOT_PAID_STATUSES
const REF_RE = /^FA-\d{1,9}$/;
const IDS_RE = /^\d{1,15}(,\d{1,15}){0,24}$/;  // opOrder takes at most 25 pieces

// A Cart order's payment page: it names the order's rows and its reference (stripe.js
// createCartCheckout). An invoice's page names an invoice instead.
export const isCartPage = (session) => IDS_RE.test(String(session?.metadata?.order_ids ?? ""))
  && REF_RE.test(String(session?.metadata?.cart_ref ?? ""));

const pageIds = (session) => String(session.metadata.order_ids).split(",").map(Number);
const cents = (amount) => toCents(amount);
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const sumCents = (rows) => rows.reduce((sum, r) => sum + cents(r.amount), 0);
const notFound = () => new InputError("We couldn't find that order.", 404);
const stripeLater = (op, e) => {
  console.error(`store ${op}:`, e instanceof StripeError ? e.code : "", e?.message || e);
  return new InputError("The card payment couldn't open right now. Please try again in a moment, or choose another way to pay.", 502);
};

// Where Stripe brings the buyer back once paid: the shop address they are paying from (the
// checkout sends it). The cart and the saved order live in that browser's own storage, and fonkiart.com and
// www.fonkiart.com both serve the shop without sharing it, so coming back to the other one would
// show an empty cart. Only the shop's own addresses; anything else gets the usual one (site.js).
const SHOP_SITES = ["https://fonkiart.com", "https://www.fonkiart.com"];
export const returnSite = (site) => (SHOP_SITES.includes(site) || site === siteUrl() ? site : siteUrl());

// What the buyer sees of a Cart order: its pieces and amounts as the rows hold them, the total,
// and the first name it was saved with.
const cartView = (ref, rows) => ({
  ref,
  lines: rows.map(r => ({ title: r.item_title, amount: Number(r.amount) })),
  total: sumCents(rows) / 100,
  name: firstName(rows[0].ship_name),
});

// Every piece's price from the Artworks table (opOrder's `price`): the sale price when there is
// one, else the price, less the coupon's percent (discount: 0 unless the server found the coupon
// valid), in whole dollars like the checkout shows it.
export async function priceCart(db, items, discount) {
  const pct = Number(discount);
  const off = Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : 0;
  const arts = await Promise.all(items.map(i => findPricedArtwork(db, i.title)));
  const lines = items.map(({ title }, n) => {
    const art = arts[n];
    const name = `“${title}”`;
    if (!art) throw new InputError(`We couldn't find ${name} in the shop to price it, so it can't be paid by card here. You can still order it with Zelle, Venmo or Cash App.`, 409);
    if (art.isSold === true) throw new InputError(`${name} has already been sold. Please remove it from your cart.`, 409);
    const price = artPrice(art);
    if (price === null) throw new InputError(`${name} has no price yet, so it can't be paid by card. You can still order it with Zelle, Venmo or Cash App.`, 409);
    return { title, amount: off ? Math.round(price * (1 - off / 100)) : price, image: cardImage(art.image) };
  });
  return { items: lines, total: lines.reduce((sum, l) => sum + cents(l.amount), 0) / 100 };
}

// The card form opens INSIDE fonkiart.com, or the card payment doesn't start (Andy: "i don't want
// to be making the user jump to stripe then back"). Asked BEFORE anything is saved, emailed,
// closed or made: the browser must have Stripe.js ready (embedded: true), and the shop's
// publishable key must be set and right. Returns that key. Why not goes in the log, never the key
// (op "card-setup" tells it too).
function formKey(op, body) {
  const key = publishableKey();
  if (body.embedded === true && key) return key;
  const why = body.embedded !== true ? "the browser has no Stripe.js ready" : `publishable key: ${cardSetup().why}`;
  console.warn(`store ${op}: the card form can't open inside fonkiart.com (${why}); nothing saved, nothing sent`);
  throw new InputError(CARD_FORM_DOWN, 409);
}

// "Pay Securely with Card". body: the checkout's order, exactly as for Zelle (opOrder), plus
// embedded: true (the browser has Stripe.js ready to show the form inside the page).
// saveOrder: opOrder, handed in by the router (storeOps.js) so this file needs nothing from it.
export async function opCartCard(db, body, mail, saveOrder) {
  if (!cardReady()) throw new InputError(CARD_SOON, 409);
  const key = formKey("cart-card", body);
  const order = await saveOrder(db, body, mail, { price: (items, discount) => priceCart(db, items, discount) });
  if (!order.saved) throw new InputError("We couldn't save your order.", 500);
  // ids: the saved rows, which the checkout keeps to pay this same order again (cart-again).
  const saved = { ref: order.orderRef, ids: order.ids, lines: order.items.map(({ title, amount }) => ({ title, amount })), total: order.total };
  let page;
  try {
    page = await createCartCheckout({ ref: order.orderRef, ids: order.ids, lines: order.items, email: order.email, site: returnSite(body.site) });
  } catch (e) {
    console.error("store cart-card:", e instanceof StripeError ? e.code : "", e?.message || e);
    // The order is saved and both "order received" emails are out. Not an error for the
    // checkout: it keeps the order, says so, and offers card again (cart-again) or another way.
    return { ...saved, cardError: `Your order ${order.orderRef} is saved, but the card payment couldn't open right now. Please try again in a moment, or choose another way to pay.` };
  }
  return { ...saved, session: page.id, clientSecret: page.clientSecret, publishableKey: key };
}

// Does Stripe's record say paid, in dollars, for exactly the cents these rows hold?
export function cartPaidFor(session, rows) {
  return session?.payment_status === "paid"
    && String(session.currency).toLowerCase() === "usd"
    && session.amount_total === rows.reduce((sum, r) => sum + cents(r.amount), 0);
}

// Stripe's page for a Cart order -> its rows -> Paid, SOLD and the two emails, once.
// The update only matches rows still Pending or Confirmed, so whoever gets there first (the
// buyer coming back, Stripe's message, a second tab, a replay) sends the two emails, and
// everyone after sends none. If the database refuses the change:
//  - via "redirect" (the buyer coming back): email anyway, telling the shop to mark it by hand;
//  - via "webhook" (Stripe's message): email nobody and answer 500, so Stripe sends it again.
async function settleCart(db, session, mail, via) {
  const ids = pageIds(session);
  const ref = session.metadata.cart_ref;
  const { data, error } = await db.from("Orders").select("*").in("id", ids);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = (data || []).filter(r => ids.includes(r.id)).sort((a, b) => a.id - b.id);
  if (rows.length !== ids.length) {
    console.warn(`store cart (${via}): Stripe's page for ${ref} names orders that aren't there`, session.id);
    return { paid: false, why: "unknown order" };
  }
  const view = cartView(ref, rows);
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { paid: true, ...view };
  if (!cartPaidFor(session, rows)) return { paid: false, why: "not paid", ...view };

  const { data: flipped, error: flipErr } = await db.from("Orders").update({ status: "paid", paid_method: "card" })
    .in("id", ids).in("status", NOT_PAID).select("id");
  if (flipErr) {
    console.error(`store cart (${via}): could not mark order ${ref} Paid:`, flipErr.message);
    if (via === "webhook") throw new InputError("Could not mark the order Paid yet. Please send this again.", 500);
  }
  if (flipErr || flipped?.length) {
    const email = rows[0].client_email;
    const who = rows[0].ship_name || email || "The customer";
    await Promise.allSettled([
      mail.send({ to: mail.sender, subject: cartPaidSubject(view), htmlContent: cartPaidShop({ ...view, who, email, saved: !flipErr }) }),
      mail.send({ to: email, subject: cartReceivedSubject(view), htmlContent: cartReceived(view) }),
    ]);
  }
  // The pieces are SOLD (artworks.js: never a print, never twice).
  for (const row of rows) await markSoldForOrder(db, { ...row, status: "paid" });
  return { paid: true, ...view };
}

// The buyer is back from paying (?cart=FA-...&card=cs_...). Stripe's answer decides; the
// reference in the link must be the page's own.
export async function opCartPaid(db, body, mail) {
  const ref = String(body.ref ?? "");
  const sessionId = String(body.session ?? "");
  if (!REF_RE.test(ref) || !isSessionId(sessionId)) throw new InputError("Payment not found", 404);
  let session;
  try {
    session = await getCheckout(sessionId);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    if (e.code === "resource_missing") throw new InputError("Payment not found", 404);
    console.error("store cart-paid:", e.code, e.message);
    throw new InputError("Couldn't check the card payment right now", 502);
  }
  if (!isCartPage(session) || session.metadata.cart_ref !== ref) throw new InputError("Payment not found", 404);
  const { why, ...out } = await settleCart(db, session, mail, "redirect");
  if (why) console.warn(`store cart-paid: ${ref} not marked Paid: ${why}`);
  return out;
}

// ── paying the same order again ─────────────────────────────────

// The saved Cart order a checkout asks about again: its reference, its rows' ids, the email it
// was saved with and the titles in the cart now. Every row must be there, carry that reference
// and that email, and the titles must be the rows' own, piece for piece. Anything else is "not
// found", without saying which part was wrong. rows: in the order of ids.
async function savedCart(db, body) {
  const ref = String(body.ref ?? "");
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const titles = Array.isArray(body.titles) ? body.titles : [];
  if (!REF_RE.test(ref) || !email || !ids.length || ids.length > 25 || titles.length !== ids.length
    || !ids.every(id => Number.isSafeInteger(id) && id > 0) || new Set(ids).size !== ids.length
    || !titles.every(t => typeof t === "string")) throw notFound();
  const { data, error } = await db.from("Orders").select("*").in("id", ids);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = ids.map(id => (data || []).find(r => r.id === id));
  const notes = (r) => String(r.notes || "");
  const ours = (r) => r && String(r.client_email || "").trim().toLowerCase() === email
    && (notes(r) === `Order Ref: ${ref}` || notes(r).startsWith(`Order Ref: ${ref} · `));
  const sorted = (list) => JSON.stringify(list.map(t => String(t ?? "").trim()).sort());
  if (!rows.every(ours) || sorted(rows.map(r => r.item_title)) !== sorted(titles)) throw notFound();
  return { ref, ids, rows };
}

// The payment page the checkout opened last for this order, as Stripe tells it, or null when it
// names none. A page that isn't this order's (another reference, other rows) is "not found".
async function lastPage(op, sessionId, ref, ids) {
  if (sessionId == null || sessionId === "") return null;
  if (!isSessionId(sessionId)) throw notFound();
  let page;
  try {
    page = await getCheckout(sessionId);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    if (e.code === "resource_missing") throw notFound();
    throw stripeLater(op, e);
  }
  if (!isCartPage(page) || page.metadata.cart_ref !== ref || page.metadata.order_ids !== ids.join(",")) throw notFound();
  return page;
}

// "Pay by card" again for a Cart order the checkout already saved. It never saves a second order
// or sends a second "order received" email: it opens a new card form for the SAME rows, inside
// fonkiart.com, or nothing changes (formKey).
//  - All Paid already, or the last page was paid after all: the answer is { paid: true, ... },
//    recorded exactly as on the way back (settleCart: the emails go once).
//  - Every row must still be Pending, and no piece sold since.
//  - The amounts are the rows', and only when the shop's own records vouch for them: our own
//    earlier page for exactly these rows and cents (made from the Artworks prices by cart-card),
//    or today's Artworks prices, piece for piece (e.g. Stripe failed as the order was saved, so
//    there is no page). So rows a browser priced (the plain "order" op) never get a card page.
//  - The last page, if still open, is closed first (Stripe "expire"): only ONE page per order
//    can ever take the money. If Stripe won't close it because it was just paid, that payment
//    is recorded instead.
export async function opCartAgain(db, body, mail) {
  if (!cardReady()) throw new InputError(CARD_SOON, 409);
  const { ref, ids, rows } = await savedCart(db, body);
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { paid: true, ...cartView(ref, rows) };
  let last = await lastPage("cart-again", body.session, ref, ids);
  const paidAlready = async (page) => {
    const { paid, why, ...view } = await settleCart(db, page, mail, "redirect");
    if (paid) return { paid: true, ...view };
    console.warn(`store cart-again: ${ref} has a finished payment page that isn't its exact amount: ${why}`, page.id);
    throw new InputError("This order already has a card payment. Please contact Fonkiart.", 409);
  };
  if (last?.status === "complete") return paidAlready(last);
  if (rows.some(r => r.status !== "pending")) throw new InputError("This order can't be paid here any more. Please contact Fonkiart.", 409);

  const arts = await Promise.all(rows.map(r => findPricedArtwork(db, r.item_title)));
  const sold = rows.find((r, n) => arts[n]?.isSold === true);
  if (sold) throw new InputError(`“${sold.item_title}” has already been sold, so this order can't be paid by card. Please contact Fonkiart.`, 409);
  const pageVouches = !!last && last.amount_total === sumCents(rows) && String(last.currency).toLowerCase() === "usd";
  const pricesVouch = rows.every((r, n) => arts[n] && cents(artPrice(arts[n])) === cents(r.amount));
  if (!pageVouches && !pricesVouch) throw new InputError("This order can't be paid by card here. You can still pay it with Zelle, Venmo or Cash App, or contact Fonkiart.", 409);
  const key = formKey("cart-again", body); // before the page before is closed: no form, no change

  if (last?.status === "open") {
    try {
      await expireCheckout(last.id);
    } catch (e) {
      if (!(e instanceof StripeError)) throw e;
      try { last = await getCheckout(last.id); } catch (again) { throw stripeLater("cart-again", again); }
      if (last?.status === "complete") return paidAlready(last);
      if (last?.status !== "expired") throw stripeLater("cart-again", e);
    }
  }
  const lines = rows.map((r, n) => ({ title: r.item_title, amount: Number(r.amount), image: arts[n] ? cardImage(arts[n].image) : null }));
  let page;
  try {
    page = await createCartCheckout({ ref, ids, lines, email: rows[0].client_email, site: returnSite(body.site) });
  } catch (e) {
    throw stripeLater("cart-again", e);
  }
  const { name: _name, ...view } = cartView(ref, rows);
  return { ...view, ids, session: page.id, clientSecret: page.clientSecret, publishableKey: key };
}

// The checkout opening again with a Cart order it saved earlier: paid by now, still open to pay,
// or closed (cancelled, confirmed or shipped by hand: the checkout then starts afresh). It only
// reads, except for a payment Stripe says is done that nobody recorded yet (the buyer paid and
// closed the tab before coming back, and Stripe's own message hasn't come): that is recorded
// here, exactly as on the way back. Stripe out of reach: the rows alone answer.
export async function opCartOrder(db, body, mail) {
  const { ref, ids, rows } = await savedCart(db, body);
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { state: "paid", ...cartView(ref, rows) };
  let page = null;
  try {
    page = await lastPage("cart-order", body.session, ref, ids);
  } catch (e) {
    if (!(e instanceof InputError) || e.status !== 502) throw e;
  }
  if (page?.status === "complete") {
    const { paid, why: _why, ...view } = await settleCart(db, page, mail, "redirect");
    if (paid) return { state: "paid", ...view };
  }
  if (rows.some(r => r.status !== "pending")) return { state: "closed" };
  const { name: _name, ...view } = cartView(ref, rows);
  return { state: "open", ...view };
}

// Stripe's own "paid" message for a Cart order (storeOps.js opStripeEvent). 200 means done,
// also for anything ignored; a database failure throws, and Stripe sends it again later.
export async function cartStripeEvent(db, session, mail) {
  const { paid, why } = await settleCart(db, session, mail, "webhook");
  return paid ? { received: true, paid: true } : { received: true, ignored: why };
}
