// The Cart's card payment, through the same kind of Stripe page as invoices (Andy said yes to
// "Switch the Cart's 'Pay by card' button to the same Stripe page your invoices use?", then
// asked: "can it be imbedded inside fonkiart instead of sending the customer away ?").
//
// 1. "cart-card": the buyer taps "Pay Securely with Card". Card payments must be ON (cardReady),
//    or nothing is saved and the checkout says so. Every piece is priced from the Artworks table,
//    and the coupon counts only as the server checks it: the amount charged comes from the
//    shop's own records, NEVER from the browser. A piece that can't be found or priced, or is
//    already sold, refuses the card payment with a message the buyer can act on, and nothing is
//    saved. Then the order is saved exactly as for Zelle (opOrder: the rows, the client, the
//    coupon, both "order received" emails), with the server's prices, and Stripe makes a payment
//    page for exactly those rows. The card form opens INSIDE fonkiart.com when the account's
//    publishable key is set (stripe.js publishableKey) and the browser has Stripe.js ready;
//    otherwise the buyer goes to Stripe's own page in the same tab.
// 2. "cart-paid": the buyer is back on fonkiart.com (?cart=FA-...&card=cs_...). The server asks
//    Stripe about that page itself: paid, for this reference, for the rows' exact cents, in
//    dollars. Only then do the rows turn Paid by card and the pieces SOLD, and ONE "Payment
//    received" email goes to the buyer and ONE "Paid by card" to the shop, for the whole cart.
// 3. Stripe's own "paid" message (op "stripe-event", storeOps.js) does the same for a buyer who
//    closes the tab. Whichever of the two gets there first sends the emails; the other, none.

import { InputError } from "./errors.js";
import { artPrice, cardImage, findPricedArtwork, markSoldForOrder, PAID_STATUSES } from "./artworks.js";
import { cardReady, createCartCheckout, getCheckout, isSessionId, publishableKey, StripeError, toCents } from "./stripe.js";
import { siteUrl } from "./site.js";
import { cartPaidShop, cartPaidSubject, cartReceived, cartReceivedSubject } from "./cartEmails.js";

// The checkout's own words when card payments are off (src/components/CheckoutModal.jsx).
export const CARD_SOON = "Card payment is being set up. Please use Zelle or contact Fonkiart directly.";

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

// "Pay Securely with Card". body: the checkout's order, exactly as for Zelle (opOrder), plus
// embedded: true when the browser has Stripe.js ready to show the form inside the page.
// saveOrder: opOrder, handed in by the router (storeOps.js) so this file needs nothing from it.
export async function opCartCard(db, body, mail, saveOrder) {
  if (!cardReady()) throw new InputError(CARD_SOON, 409);
  const order = await saveOrder(db, body, mail, { price: (items, discount) => priceCart(db, items, discount) });
  if (!order.saved) throw new InputError("We couldn't save your order.", 500);
  const key = body.embedded === true ? publishableKey() : null;
  let page;
  try {
    page = await createCartCheckout({ ref: order.orderRef, ids: order.ids, lines: order.items, email: order.email, site: siteUrl(), embedded: !!key });
  } catch (e) {
    console.error("store cart-card:", e instanceof StripeError ? e.code : "", e?.message || e);
    // The order is saved and both "order received" emails are out, so it says so.
    throw new InputError(`Your order ${order.orderRef} is saved, but the card payment couldn't open right now. Please email ${mail.sender} with your order number to finish paying.`, 502);
  }
  const lines = order.items.map(({ title, amount }) => ({ title, amount }));
  const how = key ? { clientSecret: page.clientSecret, publishableKey: key } : { url: page.url };
  return { ref: order.orderRef, lines, total: order.total, ...how };
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
  const view = {
    ref,
    lines: rows.map(r => ({ title: r.item_title, amount: Number(r.amount) })),
    total: rows.reduce((sum, r) => sum + cents(r.amount), 0) / 100,
    name: firstName(rows[0].ship_name),
  };
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

// Stripe's own "paid" message for a Cart order (storeOps.js opStripeEvent). 200 means done,
// also for anything ignored; a database failure throws, and Stripe sends it again later.
export async function cartStripeEvent(db, session, mail) {
  const { paid, why } = await settleCart(db, session, mail, "webhook");
  return paid ? { received: true, paid: true } : { received: true, ignored: why };
}
