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
//    is saved as for Zelle (opOrder: the rows, the client, the coupon), with the server's prices,
//    but WITHOUT the two "order received" emails: a card order is confirmed once it is PAID (2.
//    and 3.), or once it is paid another way after all (6.). Its rows' notes end with CARD_NOTE
//    until then. Stripe makes the card form for exactly those rows. Paid by card, the buyer stays
//    right there (stripe.js createCartCheckout), and the form says so. The form also offers
//    Klarna, which leaves for Klarna's own site and comes back to ?cart=FA-...&card=<page id> (2.).
// 2. "cart-paid": the card form says the buyer has paid, or the buyer is back from Klarna (or from
//    Stripe's own page, 5.): ?cart=FA-...&card=cs_.... The server asks Stripe about that page
//    itself: paid, for this reference, for the rows' exact cents, in dollars. Only then do the
//    rows turn Paid by card and the pieces SOLD, and ONE "Payment received" email goes to the
//    buyer and ONE "Paid by card" to the shop, for the whole cart.
// 3. Stripe's own "paid" message (op "stripe-event", storeOps.js) does the same for a buyer who
//    closes the tab. Whichever of the two gets there first sends the emails; the other, none.
// 4. ONE order per cart, however the buyer retries (a double tap, closing the card form and
//    opening it again, coming back from Klarna or Stripe's page without paying, a card form
//    that couldn't open). The checkout keeps the saved order (its reference, rows, email and last
//    payment page) and asks again with it: "cart-again" opens a new card form for the SAME rows,
//    and "cart-order" says whether that order is paid by now, still open, or closed. Neither
//    saves an order or sends an "order received" email. The buyer never hears of it as "saved",
//    nor its number, before paying (Andy, 2026-11-19, yes to: "there's no 'saved' message and no
//    order number until they pay"): coming back, the checkout looks normal, the details filled
//    in, and details changed there go on the same rows (withDetails).
// 5. Orders started on Stripe's own page before the card form opened inside fonkiart.com come
//    back the same way (?cart=FA-...&card=cs_... or &card=cancelled) and are paid exactly as
//    above, by the card form if paid by card again. No new one is ever made.
// 6. "cart-other": the buyer pays a saved card order with Zelle, Venmo or Cash App instead. Its
//    card page is closed first, then, ONCE, the normal "order received" pair goes out for its
//    rows, exactly as for a Zelle order (Andy's rule, 2026-11-18: a card order's emails only
//    once it is paid).
// 7. A bank payment (ACH, the checkout's "bank" way) clears days after the form is done. Until
//    then the rows read "Payment processing" and their pieces are held for the buyer; they turn
//    Paid, with the two emails, only once Stripe says paid. If it fails, the rows go back to
//    Pending, the pieces back on sale, and the buyer gets one short email (bankCart).

import { InputError } from "./errors.js";
import { artPrice, cardImage, findPricedArtwork, holdArtForOrder, markSoldForOrder, otherPageClearing, PAID_STATUSES, releaseArtForOrder } from "./artworks.js";
import { bankClearing, bankState, cardReady, cardSetup, createCartCheckout, expireCheckout, getCheckout, isSessionId, paidWith, publishableKey, StripeError, toCents, WAY_REFUSED } from "./stripe.js";
import { bankFailed, bankFailedShop, bankFailedShopSubject, bankFailedSubject, cartPaidShop, cartPaidSubject, cartReceived, cartReceivedSubject } from "./cartEmails.js";

// The checkout's own words when card payments are off (src/components/CheckoutModal.jsx).
export const CARD_SOON = "Card payment is being set up. Please use Zelle or contact Fonkiart directly.";
// ...and when the card form can't open inside fonkiart.com: nothing saved, nothing charged. The
// browser's copy (src/lib/cartOrder.js) lets the checkout say it calmly, with Try Again and
// another way to pay; tests/checkout-flow.test.js checks the two agree.
export const CARD_FORM_DOWN = "The secure card form couldn't open right now. Nothing was charged. Please try again, or choose another way to pay.";
// The end of a Cart card order's notes while its "order received" emails wait (opOrder, card
// path). Paid by card, the paid pair confirms it (settleCart); paid another way instead,
// opCartOther changes these words and sends the pair, once. Orders saved before this rule carry
// none: their emails went out as they were saved, so nothing is sent for them again.
export const CARD_NOTE = " · Paying by card";
// A Map, so only these three count (an object would also answer "toString" or "__proto__").
const OTHER_WAYS = new Map([["zelle", "Zelle"], ["venmo", "Venmo"], ["cashapp", "Cash App"]]);
const COUPON_RE = / · (\d{1,2})% coupon applied\b/;

const NOT_PAID = ["pending", "confirmed"]; // as storeOps.js NOT_PAID_STATUSES
// A bank payment (ACH) on its way, as storeOps.js CLEARING: "Payment processing", not money yet.
const CLEARING = "processing";
const BEFORE_PAID = [...NOT_PAID, CLEARING];
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
// (op "card-setup" tells it too). The invoice page's card form asks the same (storeOps.js).
export function formKey(op, body) {
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
  // ids: the saved rows, which the checkout keeps to pay this same order again (cart-again);
  // coupon: the code, when it counted, so the checkout shows it again coming back.
  const saved = { ref: order.orderRef, ids: order.ids, lines: order.items.map(({ title, amount }) => ({ title, amount })), total: order.total, ...(order.coupon ? { coupon: order.coupon } : {}) };
  let page;
  try {
    // way: the one way to pay the buyer chose (stripe.js WAYS), or none, as before.
    page = await createCartCheckout({ ref: order.orderRef, ids: order.ids, lines: order.items, email: order.email, way: body.way });
  } catch (e) {
    console.error("store cart-card:", e instanceof StripeError ? e.code : "", e?.message || e);
    // Klarna or a bank payment, chosen, that Stripe won't open for this order: its one calm line
    // (stripe.js wayRefused) and which way it was (refused), never a card form in its place.
    if (e instanceof StripeError && e.code === WAY_REFUSED) return { ...saved, refused: e.way, cardError: e.message };
    // The order is saved (its emails wait until it is paid). Not an error for the checkout: it
    // keeps the order and offers card again (cart-again) or another way (cart-other). It says
    // nothing of "saved" or the order's number: the buyer hears of those once paid.
    return { ...saved, cardError: "The card payment couldn't open right now. Please try again in a moment, or choose another way to pay." };
  }
  return { ...saved, session: page.id, clientSecret: page.clientSecret, publishableKey: key };
}

// Does Stripe's record say paid, in dollars, for exactly the cents these rows hold?
export function cartPaidFor(session, rows) {
  return session?.payment_status === "paid"
    && String(session.currency).toLowerCase() === "usd"
    && session.amount_total === rows.reduce((sum, r) => sum + cents(r.amount), 0);
}

// A bank payment for these rows, still clearing or failed (stripe.js bankClearing), for exactly
// the cents they hold.
export function cartClearingFor(session, rows) {
  return bankClearing(session) && session.amount_total === sumCents(rows);
}

// The thank-you's "Paid by ..." (src/components/PaidThanks.jsx): a payment made another way than a
// card names its way in the answer ("klarna", "link", "bank"), so a card's answer stays exactly as
// before ("Paid by card").
const SAID = new Set(["klarna", "link", "bank"]);
const saidHow = (method) => (SAID.has(method) ? { method } : {});

// Stripe's page for a Cart order -> its rows -> Paid, SOLD and the two emails, once. The rows keep
// the way Stripe says it was paid (stripe.js paidWith: "klarna", "link", "bank", else "card"),
// and the emails and the thank-you say it. A bank payment still clearing, or failed: bankCart.
// The update only matches rows still Pending, Confirmed or Payment processing (a bank payment
// that just cleared), so whoever gets there first (the buyer coming back, Stripe's message, a
// second tab, a replay) sends the two emails, and everyone after sends none. If the database
// refuses the change:
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
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { paid: true, ...view, ...saidHow(rows[0].paid_method) };
  if (cartClearingFor(session, rows)) return bankCart(db, session, rows, view, mail, via);
  if (!cartPaidFor(session, rows)) return { paid: false, why: "not paid", ...view };

  const method = await paidWith(session);
  const { data: flipped, error: flipErr } = await db.from("Orders").update({ status: "paid", paid_method: method })
    .in("id", ids).in("status", BEFORE_PAID).select("id");
  if (flipErr) {
    console.error(`store cart (${via}): could not mark order ${ref} Paid:`, flipErr.message);
    if (via === "webhook") throw new InputError("Could not mark the order Paid yet. Please send this again.", 500);
  }
  if (flipErr || flipped?.length) {
    const email = rows[0].client_email;
    const who = rows[0].ship_name || email || "The customer";
    const paid = { ...view, method };
    await Promise.allSettled([
      mail.send({ to: mail.sender, subject: cartPaidSubject(paid), htmlContent: cartPaidShop({ ...paid, who, email, saved: !flipErr }) }),
      mail.send({ to: email, subject: cartReceivedSubject(view), htmlContent: cartReceived(paid) }),
    ]);
  }
  // The pieces are SOLD (artworks.js: never a print, never twice).
  for (const row of rows) await markSoldForOrder(db, { ...row, status: "paid" });
  return { paid: true, ...view, ...saidHow(method) };
}

// A bank payment (ACH) for a Cart order, still clearing or failed, as Stripe's own record of the
// payment says (stripe.js bankState), handled as for invoices (storeOps.js settleInvoice):
//  - clearing: every row still Pending or Confirmed turns "Payment processing", and its piece is
//    held for this buyer (artworks.js holdArtForOrder). No email: the paid pair goes out once it
//    clears (settleCart above). Answer: { paid: false, processing: true, ...view }.
//  - failed: the rows go back to Pending, their pieces back on sale (releaseArtForOrder), and the
//    buyer gets ONE short email: only the call whose guarded write moves the rows sends it, and a
//    page that failed long ago never undoes a newer page's (otherPageClearing). The shop hears it
//    only when a piece needs a person. Answer: { paid: false, failed: true, ...view }.
// Stripe can't say how it stands: 502, nothing decided. The database refuses: via "webhook", 500,
// so Stripe sends it again; via "redirect", the log.
async function bankCart(db, session, rows, view, mail, via) {
  let state;
  try {
    state = await bankState(session);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    console.error(`store cart (${via}): couldn't ask Stripe how ${view.ref}'s bank payment stands:`, e.code, e.message);
    throw new InputError("Couldn't check the bank payment right now", 502);
  }
  if (state === "processing") {
    const { data: moved, error } = await db.from("Orders").update({ status: CLEARING })
      .in("id", rows.map(r => r.id)).in("status", NOT_PAID).select("id");
    if (error) {
      console.error(`store cart (${via}): could not mark order ${view.ref} Payment processing:`, error.message);
      if (via === "webhook") throw new InputError("Could not mark the order Payment processing yet. Please send this again.", 500);
    } else {
      const now = new Set((moved || []).map(r => r.id));
      for (const row of rows) {
        if (now.has(row.id) || row.status === CLEARING) await holdArtForOrder(db, row, { page: session.id, fresh: now.has(row.id) });
      }
    }
    return { paid: false, processing: true, ...view };
  }
  const mine = rows.filter(r => r.status === CLEARING && !otherPageClearing(r, session.id));
  if (!mine.length) return { paid: false, failed: true, ...view };
  const { data: back, error } = await db.from("Orders").update({ status: "pending" })
    .in("id", mine.map(r => r.id)).eq("status", CLEARING).select("id");
  if (error) {
    console.error(`store cart (${via}): could not set order ${view.ref} back to Pending after its bank payment failed:`, error.message);
    if (via === "webhook") throw new InputError("Could not record the failed bank payment yet. Please send this again.", 500);
    return { paid: false, failed: true, ...view };
  }
  const moved = new Set((back || []).map(r => r.id));
  const freed = rows.filter(r => moved.has(r.id));
  if (freed.length) {
    const check = [];
    for (const row of freed) if (await releaseArtForOrder(db, row) === "check") check.push(row.item_title);
    const email = rows[0].client_email;
    const who = rows[0].ship_name || email || "The customer";
    await Promise.allSettled([
      mail.send({ to: email, subject: bankFailedSubject(view), htmlContent: bankFailed(view) }),
      ...(check.length ? [mail.send({ to: mail.sender, subject: bankFailedShopSubject(view), htmlContent: bankFailedShop({ ...view, who, email, back: "pending", check }) })] : []),
    ]);
  }
  return { paid: false, failed: true, ...view };
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
// The email may also be the one the buyer typed last (body.customer.email): when a changed email
// reached the rows (withDetails) but the answer never reached the browser (Stripe failed just
// after, or the connection dropped), the browser still names the order by its old one. Either
// is the same proof as before: an email the rows hold. So a retry finds THIS order, never "not
// found" and then a second order.
async function savedCart(db, body) {
  const ref = String(body.ref ?? "");
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const lower = (e) => typeof e === "string" ? e.trim().toLowerCase() : "";
  const email = lower(body.email);
  const emails = new Set([email, lower(body.customer?.email)].filter(Boolean));
  const titles = Array.isArray(body.titles) ? body.titles : [];
  if (!REF_RE.test(ref) || !email || !ids.length || ids.length > 25 || titles.length !== ids.length
    || !ids.every(id => Number.isSafeInteger(id) && id > 0) || new Set(ids).size !== ids.length
    || !titles.every(t => typeof t === "string")) throw notFound();
  const { data, error } = await db.from("Orders").select("*").in("id", ids);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = ids.map(id => (data || []).find(r => r.id === id));
  const notes = (r) => String(r.notes || "");
  const ours = (r) => r && emails.has(lower(r.client_email))
    && (notes(r) === `Order Ref: ${ref}` || notes(r).startsWith(`Order Ref: ${ref} · `));
  const sorted = (list) => JSON.stringify(list.map(t => String(t ?? "").trim()).sort());
  if (!rows.every(ours) || sorted(rows.map(r => r.item_title)) !== sorted(titles)) throw notFound();
  return { ref, ids, rows };
}

// The buyer's details, filled in again on the way back and maybe changed (Andy, 2026-11-19, yes
// to: "When they come back, the checkout looks normal, with their name and address already
// filled in"). They go on the order's own rows, the same rows, never a second order: the email, the
// shipping columns, and the notes' words, when the notes are still as the checkout wrote them
// (a hand-written note is never overwritten): their reference and their ending (the coupon,
// how it is paid) stay. A new email gets its client card, as a new order's does. customer
// missing (an older checkout), or nothing changed: nothing is written. checked:
// storeOps.js checkoutDetails, with the checkout's limits. Rows changed meanwhile (another tab,
// the shop): the guarded write passes over them, so the shop's words are never written over; the
// buyer is asked to try again (409), and that try finishes the change.
const ENDING_RE = /^( · \d{1,2}% coupon applied)?( · Paying by (?:card|Zelle|Venmo|Cash App))?$/;
const wordsOf = (r) => [r.ship_name, r.ship_phone, [r.ship_address, r.ship_city, r.ship_state, r.ship_zip, r.ship_country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
async function withDetails(db, ref, ids, rows, checked, { clientOnce } = {}) {
  if (!checked) return rows;
  const head = `Order Ref: ${ref}`;
  const was = String(rows[0].notes ?? "");
  const before = [head, wordsOf(rows[0])].filter(Boolean).join(" · ");
  const ending = was.startsWith(before) ? was.slice(before.length) : null;
  const ours = ending !== null && ENDING_RE.test(ending) && rows.every(r => String(r.notes ?? "") === was);
  const change = { client_email: checked.email, ...checked.ship, ...(ours ? { notes: [head, checked.words].filter(Boolean).join(" · ") + ending } : {}) };
  if (rows.every(r => Object.entries(change).every(([k, v]) => (r[k] ?? null) === v))) return rows;
  let update = db.from("Orders").update(change).in("id", ids).eq("status", "pending");
  if (ours) update = update.eq("notes", was);
  const { data: changed, error } = await update.select("id");
  if (error) throw new Error(`Orders update: ${error.message}`);
  if ((changed?.length ?? 0) !== ids.length) {
    console.warn(`store cart: ${ref} changed while its details were saved (${changed?.length ?? 0} of ${ids.length} rows)`);
    throw new InputError("This order changed just now. Please try again in a moment.", 409);
  }
  const newEmail = rows.some(r => String(r.client_email ?? "").trim().toLowerCase() !== checked.email.trim().toLowerCase());
  if (newEmail && clientOnce) await clientOnce(db, checked).catch(e => console.warn(`store cart: ${ref}'s new client card:`, e?.message || e));
  return rows.map(r => ({ ...r, ...change }));
}

// The last page was paid after all (another tab, or Stripe's message hasn't come yet): recorded
// exactly as on the way back (settleCart: the emails go once). A finished page for another amount
// is never taken as paid: said, and nothing else happens.
async function paidAlready(op, db, page, mail, ref) {
  const { paid, why, ...view } = await settleCart(db, page, mail, "redirect");
  if (paid) return { paid: true, ...view };
  console.warn(`store ${op}: ${ref} has a finished payment page that isn't its exact amount: ${why}`, page.id);
  throw new InputError("This order already has a card payment. Please contact Fonkiart.", 409);
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
//  - body.customer: the details as the checkout shows them again; changed, they go on these
//    same rows (withDetails) once the new page is made, which carries that email; the answer
//    gives back the email the rows now hold (the checkout names the order by it next time).
// helpers: storeOps.js checkoutDetails and clientOnce, handed in by the router.
export async function opCartAgain(db, body, mail, helpers = {}) {
  if (!cardReady()) throw new InputError(CARD_SOON, 409);
  const { ref, ids, rows: found } = await savedCart(db, body);
  const checked = body.customer != null && helpers.checkoutDetails ? helpers.checkoutDetails(body.customer) : null;
  let rows = found;
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { paid: true, ...cartView(ref, rows) };
  let last = await lastPage("cart-again", body.session, ref, ids);
  if (last?.status === "complete") return paidAlready("cart-again", db, last, mail, ref);
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
      if (last?.status === "complete") return paidAlready("cart-again", db, last, mail, ref);
      if (last?.status !== "expired") throw stripeLater("cart-again", e);
    }
  }
  const lines = rows.map((r, n) => ({ title: r.item_title, amount: Number(r.amount), image: arts[n] ? cardImage(arts[n].image) : null }));
  // The new page carries the email the buyer gave last. The rows take the details only once it is
  // made, so a Stripe failure writes nothing, and the browser's email still names the order.
  let page;
  try {
    page = await createCartCheckout({ ref, ids, lines, email: checked ? checked.email : rows[0].client_email, way: body.way });
  } catch (e) {
    if (e instanceof StripeError && e.code === WAY_REFUSED) throw new InputError(e.message, 409); // as cart-card
    throw stripeLater("cart-again", e);
  }
  try {
    rows = await withDetails(db, ref, ids, rows, checked, helpers);
  } catch (e) {
    // The details couldn't go on the rows: the page just made is closed again (nobody has it, and
    // only ONE page per order may take the money), and the buyer tries again.
    await expireCheckout(page.id).catch(x => console.error(`store cart-again: couldn't close ${ref}'s unused card page; it closes by itself within a day`, page.id, x?.code || x?.message || x));
    throw e;
  }
  const { name: _name, ...view } = cartView(ref, rows);
  return { ...view, ids, email: rows[0].client_email, session: page.id, clientSecret: page.clientSecret, publishableKey: key };
}

// "I've Sent the Payment" by Zelle, Venmo or Cash App for a Cart order the checkout saved for a
// card payment. Nothing is saved again, and the checks are cart-again's: the reference, the
// rows, the email, the cart's own pieces, every row still Pending. Its card page, if still open,
// is closed first, so only one way can take the money. If Stripe is out of reach the switch
// still goes through (the buyer may have sent the money already); that page then closes by
// itself within a day, and the log says so. Then, ONCE, the normal "order received" pair goes
// out, exactly as for a Zelle order: only the call whose guarded write changes the rows' notes
// from CARD_NOTE sends it, so a retry, a second tab or an order saved before this rule sends
// nothing. orderReceived: the pair (storeOps.js), handed in by the router like opOrder above.
// body.customer: the details as the checkout shows them again; changed, they go on these same
// rows first (withDetails, as in cart-again), so the pair goes to the email and names the
// address the buyer gave last. helpers: storeOps.js checkoutDetails and clientOnce.
export async function opCartOther(db, body, mail, orderReceived, helpers = {}) {
  const way = OTHER_WAYS.get(body.method);
  if (!way) throw new InputError("Bad payment method");
  const { ref, ids, rows: found } = await savedCart(db, body);
  const checked = body.customer != null && helpers.checkoutDetails ? helpers.checkoutDetails(body.customer) : null;
  let rows = found;
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { paid: true, ...cartView(ref, rows) };
  let page = null;
  try {
    page = await lastPage("cart-other", body.session, ref, ids);
  } catch (e) {
    if (!(e instanceof InputError) || e.status !== 502) throw e;
    console.error(`store cart-other: couldn't ask Stripe about ${ref}'s card page; it closes by itself within a day`, body.session);
  }
  if (page?.status === "complete") return paidAlready("cart-other", db, page, mail, ref);
  if (rows.some(r => r.status !== "pending")) throw new InputError("This order can't be paid here any more. Please contact Fonkiart.", 409);
  rows = await withDetails(db, ref, ids, rows, checked, helpers);
  if (page?.status === "open") {
    try {
      await expireCheckout(page.id);
    } catch (e) {
      if (!(e instanceof StripeError)) throw e;
      let now = null;
      try { now = await getCheckout(page.id); } catch { /* still out of reach */ }
      if (now?.status === "complete") return paidAlready("cart-other", db, now, mail, ref);
      if (now?.status !== "expired") console.error(`store cart-other: couldn't close ${ref}'s card page (${e.code || e.message}); it closes by itself within a day`, page.id);
    }
  }
  const was = String(rows[0].notes ?? "");
  if (was.endsWith(CARD_NOTE) && rows.every(r => r.notes === was)) {
    const { data: changed, error } = await db.from("Orders").update({ notes: `${was.slice(0, -CARD_NOTE.length)} · Paying by ${way}` })
      .in("id", ids).eq("notes", was).eq("status", "pending").select("id");
    if (error) console.error(`store cart-other: couldn't note ${ref} as paid by ${way}, so its emails wait:`, error.message);
    else if (changed?.length) {
      const r = rows[0], coupon = COUPON_RE.exec(was);
      await Promise.allSettled(orderReceived(mail, {
        firstName: firstName(r.ship_name), fullName: String(r.ship_name || "").trim(), email: r.client_email, phone: r.ship_phone || "",
        addr: [r.ship_address, r.ship_city, r.ship_state, r.ship_zip, r.ship_country].filter(Boolean).join(", "),
        orderRef: ref, items: rows.map(x => ({ title: x.item_title, amount: Number(x.amount) })), total: sumCents(rows) / 100,
        couponApplied: !!coupon, discount: coupon ? Number(coupon[1]) : 0,
      }));
    }
  }
  return { ok: true, ref };
}

// The checkout opening again with a Cart order it saved earlier: paid by now, a bank payment still
// clearing ("processing"), still open to pay, or closed (cancelled, confirmed or shipped by hand:
// the checkout then starts afresh). It only reads, except for a payment Stripe says is done that
// nobody recorded yet (the buyer paid and closed the tab before coming back, and Stripe's own
// message hasn't come): that is recorded here, exactly as on the way back, and so is a bank
// payment that failed (the rows are then read again). Stripe out of reach: the rows alone answer.
export async function opCartOrder(db, body, mail) {
  const { ref, ids, rows: saved } = await savedCart(db, body);
  let rows = saved;
  if (rows.every(r => PAID_STATUSES.has(r.status))) return { state: "paid", ...cartView(ref, rows) };
  let page = null;
  try {
    page = await lastPage("cart-order", body.session, ref, ids);
  } catch (e) {
    if (!(e instanceof InputError) || e.status !== 502) throw e;
  }
  if (page?.status === "complete") {
    let settled = {};
    try {
      settled = await settleCart(db, page, mail, "redirect");
    } catch (e) {
      if (!(e instanceof InputError) || e.status !== 502) throw e;
    }
    const { paid, processing, failed, why: _why, ...view } = settled;
    if (paid) return { state: "paid", ...view };
    if (processing) return { state: "processing", ...view };
    if (failed) ({ rows } = await savedCart(db, body));
  }
  if (rows.some(r => r.status === CLEARING)) return { state: "processing", ...cartView(ref, rows) };
  if (rows.some(r => r.status !== "pending")) return { state: "closed" };
  const { name: _name, ...view } = cartView(ref, rows);
  // email: the one the rows hold, which the checkout names the order by from now on (savedCart).
  return { state: "open", ...view, email: rows[0].client_email };
}

// Stripe's own messages for a Cart order (storeOps.js opStripeEvent): paid, a bank payment clearing
// or failed. 200 means done, also for anything ignored; a database failure throws, and Stripe
// sends it again later.
export async function cartStripeEvent(db, session, mail) {
  const { paid, processing, failed, why } = await settleCart(db, session, mail, "webhook");
  if (paid) return { received: true, paid: true };
  if (processing) return { received: true, processing: true };
  return failed ? { received: true, failed: true } : { received: true, ignored: why };
}
