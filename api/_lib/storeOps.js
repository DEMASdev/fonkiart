import crypto from "crypto";
import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { bearer } from "./adminToken.js";
import { checkPassword } from "./adminSecret.js";
import { opCustomerResetRequest, opCustomerResetSet } from "./customerReset.js";
import { siteUrl } from "./site.js";
import { artPrice, cardPicture, findPricedArtwork, holdArtForOrder, markSoldForOrder, otherPageClearing, releaseArtForOrder } from "./artworks.js";
import { opThread, opThreadReply, opInbound } from "./threads.js";
import { opReminders } from "./reminders.js";
import { invoiceNumber } from "./invoiceNumber.js";
import { bankState, cardReady, cardSetup, clearingFor, createCheckout, expireCheckout, getCheckout, paidFor, paidWith, isSessionId, publishableKey, StripeError, WAY_REFUSED } from "./stripe.js";
import { SHIP_LIMITS, SHIP_REQUIRED, SHIP_WORDS } from "./shipAddress.js";
import { opCartCard, opCartPaid, opCartAgain, opCartOrder, opCartOther, isCartPage, cartStripeEvent, formKey, CARD_NOTE } from "./cartCheckout.js";
import { bankFailed, bankFailedShop, bankFailedShopSubject, bankFailedSubject } from "./cartEmails.js";
import { buyerSignInLink } from "./verifyLink.js";
import { opCartSaving, opRememberCart } from "./cartMemory.js";
import { appliedWords, couponPrices, ownSizes, sizesOf, sizeWords } from "../../src/lib/couponSize.js";

// Every public action the shop needs, run on the server with the service key, so the
// database itself can stay locked to the public key. Each one does exactly what the
// browser used to do for that form, and nothing more.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_REF_OFFSET = 1710;

function text(value, max, label, { required = false, trim = true } = {}) {
  if (value == null || value === "") {
    if (required) throw new InputError(`Missing ${label}`);
    return "";
  }
  if (typeof value !== "string") throw new InputError(`Bad ${label}`);
  const s = trim ? value.trim() : value;
  if (required && !s) throw new InputError(`Missing ${label}`);
  if (s.length > max) throw new InputError(`${label} is too long`);
  return s;
}

function emailField(value) {
  const s = text(value, 254, "email", { required: true });
  if (!EMAIL_RE.test(s)) throw new InputError("Invalid email");
  return s;
}

function amountField(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new InputError("Bad amount");
  return n;
}

export function newCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `FK-${part(4)}-${part(4)}`;
}

export const formatOrderRef = (id) => `FA-${Number(id) + ORDER_REF_OFFSET}`;

export const sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

// The shop's coupon % (Admin -> Settings), the one the welcome popup offers, and what every code gives
// that has no size of its own (src/lib/couponSize.js).
export async function couponDiscount(db) {
  const { data } = await db.from("Settings").select("*").eq("id", 1).maybeSingle();
  return data?.couponDiscount ?? 15;
}

async function findCoupon(db, code) {
  const { data } = await db.from("Leads").select("*").eq("coupon_code", code).limit(2);
  return data && data.length === 1 ? data[0] : null;
}

// The one coupon an email has (Leads coupon_code): its own code when it has one (used or not),
// else a new code saved on its Leads row, the row made when there is none. source: where a new
// row came from. The welcome popup and the coupon after an unfinished checkout (Admin -> Orders,
// unfinishedCoupon.js) both get theirs here. email: already lower case. size: what its row says the
// code gives (Leads.coupon_size), null for the shop's %. Every column is read ("*"), never that one
// by name: it may not be there yet (db/2026-11-23-coupon-size.sql).
export async function leadCoupon(db, email, source) {
  const { data: rows, error } = await db.from("Leads").select("*").eq("email", email).limit(1);
  if (error) throw error;
  const existing = rows?.[0];
  if (existing?.coupon_code) return { code: existing.coupon_code, used: !!existing.coupon_used, made: false, size: existing.coupon_size ?? null };
  const code = newCouponCode();
  const write = existing
    ? db.from("Leads").update({ coupon_code: code, coupon_used: false }).eq("id", existing.id)
    : db.from("Leads").insert([{ email, source, coupon_code: code, coupon_used: false }]);
  const { error: writeErr } = await write;
  if (writeErr) throw writeErr;
  return { code, used: false, made: true, size: null };
}

export async function opWelcome(db, body, mail) {
  const email = emailField(body.email).toLowerCase();
  const { code, used, made, size } = await leadCoupon(db, email, "welcome-popup");
  // Their own code back: with what it gives when that is not the shop's %, so the popup says the truth.
  const sizes = used ? [] : ownSizes(size);
  if (!made) return { returning: true, code, used, ...(sizes.length ? { sizes } : {}) };
  const discount = await couponDiscount(db);
  // "Verify my email" beside the code: it signs them in as a buyer (verifyLink.js), or is null.
  const verifyLink = await buyerSignInLink(db, email);
  await mail.send({ to: email, subject: `Your ${discount}% Welcome Coupon — Fonkiart`, htmlContent: T.welcomeCoupon({ code, discount, verifyLink }) });
  return { returning: false, code };
}

export async function opCollectors(db, body) {
  const email = emailField(body.email).toLowerCase();
  const source = body.source === "collectors-request" ? "collectors-request" : "collectors-section";
  const { data: rows, error } = await db.from("Leads").select("id").eq("email", email).limit(1);
  if (error) throw error;
  if (!rows?.length) {
    const { error: insErr } = await db.from("Leads").insert([{ email, source, coupon_code: null, coupon_used: false }]);
    if (insErr) throw insErr;
  }
  return { ok: true };
}

export async function opRequest(db, body, mail) {
  if (body.kind === "contact") {
    const name = text(body.name, 200, "name", { required: true });
    const email = emailField(body.email);
    const message = text(body.message, 5000, "message", { required: true });
    const { error } = await db.from("Requests").insert([{ name, email, message, status: "new" }]);
    if (error) console.warn("store contact insert:", error.message);
    await Promise.allSettled([
      mail.send({ to: mail.sender, subject: "Contact Form Request", htmlContent: T.contactStore({ name, email, message }), replyTo: email }),
      mail.send({ to: email, subject: "We received your message — Fonkiart", htmlContent: T.contactBuyer({ name, message, sender: mail.sender }) }),
    ]);
    return { ok: true };
  }
  if (body.kind === "inquiry") {
    const name = text(body.name, 200, "name", { required: true });
    const email = emailField(body.email);
    const phone = text(body.phone, 50, "phone");
    const message = text(body.message, 5000, "message");
    if (!/^\d{1,20}$/.test(String(body.artworkId ?? ""))) throw new InputError("Bad artwork");
    const { data: art } = await db.from("Artworks").select("*").eq("id", String(body.artworkId)).maybeSingle();
    if (!art) throw new InputError("Artwork not found", 404);
    await Promise.allSettled([
      db.from("Requests").insert([{ name, email, status: "new",
        message: `Price inquiry for "${art.title}"${message ? ` — ${message}` : ""}. Phone: ${phone || "not provided"}.` }]),
      mail.send({ to: mail.sender, subject: `Enquiry about ${art.title}`, htmlContent: T.inquiryStore({ art, name, email, phone, message }) }),
      mail.send({ to: email, subject: `Your inquiry — ${art.title} · Fonkiart`, htmlContent: T.inquiryBuyer({ name, artTitle: art.title, sender: mail.sender }) }),
    ]);
    return { ok: true };
  }
  if (body.kind === "commission") {
    const name = text(body.name, 200, "name", { required: true });
    const email = text(body.email, 254, "email");
    const idea = text(body.idea, 5000, "idea", { required: true });
    const budget = text(body.budget, 100, "budget");
    const { error } = await db.from("Requests").insert([{ name, email, status: "new",
      message: `[COLLECTORS COMMISSION] Budget: ${budget || "TBD"}\n\n${idea}` }]);
    if (error) throw error;
    return { ok: true };
  }
  throw new InputError("Unknown request kind");
}

export async function opNextRef(db) {
  const { data, error } = await db.from("Orders").select("id").order("id", { ascending: false }).limit(1);
  if (error) throw error;
  const maxId = data && data.length ? data[0].id : 9;
  return { ref: formatOrderRef(maxId + 1) };
}

export async function opCoupon(db, body) {
  const code = text(body.code, 40, "code", { required: true }).toUpperCase();
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  const lead = await findCoupon(db, code);
  if (!lead) return { status: "invalid" };
  if (lead.coupon_used) return { status: "used" };
  if (String(lead.email || "").toLowerCase() !== email) return { status: "wrong-email" };
  // sizes: what this code gives (src/lib/couponSize.js), so the checkout shows what will be charged.
  // Nothing else about the person.
  return { status: "valid", sizes: sizesOf(lead.coupon_size, await couponDiscount(db)) };
}

// What a coupon takes off an order paid with Zelle, Venmo or Cash App, for its WORDS only (the
// amounts are the browser's, as before): { size, off }. A % says itself. Dollars depend on the
// cart, so they are worked out from the shop's own prices when every piece has one; if not, the
// code's newest size speaks for itself.
async function couponCut(db, items, sizes) {
  const newest = { size: sizes.at(-1) };
  if (sizes.every(s => s.dollars === undefined)) return newest;
  try {
    const prices = (await Promise.all(items.map(i => findPricedArtwork(db, i.title)))).map(artPrice);
    return prices.every(p => p !== null) ? couponPrices(prices, sizes) : newest;
  } catch (e) {
    console.warn("store order: couldn't price the pieces for the coupon's words:", e?.message || e);
    return newest;
  }
}

// The two "order received" emails, to the buyer and to the shop, about exactly these pieces (each
// shows their pictures: emails.js). Sent as an order is placed, except for a Cart card order:
// its confirmation is the paid pair (cartCheckout.js settleCart), or these two once it is paid
// another way after all (cartCheckout.js opCartOther).
// applied: the coupon's words ("20% coupon applied", "$300 coupon applied"), or "" when there is none.
export function orderReceived(mail, { firstName, orderRef, items, total, applied, fullName, email, phone, addr, saveFailed = false }) {
  const itemsLabel = items.length === 1 ? items[0].title : `${items.length} items`;
  return [
    mail.send({ to: email, subject: `Order Received — ${itemsLabel} · Fonkiart`,
      htmlContent: T.orderBuyer({ firstName, orderRef, items, total, applied, addr, sender: mail.sender }) }),
    mail.send({ to: mail.sender, subject: `🎨 New Order ${orderRef}: ${itemsLabel} — ${fullName}`,
      htmlContent: T.orderStore({ orderRef, items, total, applied, fullName, email, phone, addr, saveFailed }) }),
  ];
}

// The buyer's details as the checkout sends them, each with the checkout's limits: in words for
// the order's notes (words: name, phone, address), as the order's shipping columns (ship), and
// for the client card. For a new order (opOrder), and for a Cart card order the buyer comes back
// to and pays, its details filled in again and maybe changed (cartCheckout.js cart-again and
// cart-other, handed this by the router).
export function checkoutDetails(c) {
  const firstName = text(c?.firstName, 100, "first name", { required: true });
  const lastName = text(c?.lastName, 100, "last name", { required: true });
  const email = emailField(c?.email);
  const phone = text(c?.phone, 50, "phone");
  const address = text(c?.address, 300, "street");
  const city = text(c?.city, 100, "city");
  const state = text(c?.state, 100, "state");
  const zip = text(c?.zip, 30, "ZIP");
  const country = text(c?.country, 100, "country");
  const fullName = `${firstName} ${lastName}`.trim();
  const addr = [address, city, state, zip, country].filter(Boolean).join(", ");
  // The address also goes on the order itself (Andy, 2026-11-17: "also make sure in the admin
  // and for the user can add the shipping address !"): Admin -> Orders and the invoice page
  // read it from there. The notes keep it in words, exactly as before.
  const ship = { ship_name: fullName || null, ship_address: address || null, ship_city: city || null, ship_state: state || null, ship_zip: zip || null, ship_country: country || null, ship_phone: phone || null };
  return { firstName, lastName, email, phone, address, city, state, zip, country, fullName, addr, ship, words: [fullName, phone, addr].filter(Boolean).join(" · ") };
}

// The shop's client card for this email (Admin -> Clients), made the first time it buys.
export async function clientOnce(db, d) {
  const { data: existing } = await db.from("Clients").select("id").eq("email", d.email).limit(1);
  if (existing?.length) return;
  await db.from("Clients").insert([{ name: d.fullName, email: d.email, phone: d.phone || null, address: d.address || null, city: d.city || null, state: d.state || null, zip: d.zip || null, country: d.country || null }]);
}

// price (server only, never from a browser): the Cart's card payment (cartCheckout.js). It
// prices every piece from the Artworks table, after the coupon is checked and BEFORE anything
// is saved; the order rows and Stripe then use its prices, never the browser's. A piece it
// can't price refuses the order, and nothing is saved. With it, the answer also carries what
// the card payment needs (the new rows' ids, the prices, the reference, and the coupon when it
// counted: its code, and in words what it took off), and the two "order received" emails WAIT
// (Andy, 2026-11-18: a card order's emails only once it is paid): the rows' notes end with
// CARD_NOTE until it is paid, by card or another way.
export async function opOrder(db, body, mail, { price } = {}) {
  const d = checkoutDetails(body.customer || {});
  const { firstName, email, phone, fullName, addr, ship } = d;
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length || list.length > 25) throw new InputError("Bad items");
  let items = list.map(i => ({ title: text(i?.title, 300, "item", { required: true }), amount: amountField(i?.amount) }));
  let total = amountField(body.total);
  let orderRef = text(body.orderRef, 20, "order reference");
  if (orderRef && !/^FA-\d{1,9}$/.test(orderRef)) throw new InputError("Bad order reference");
  // Stripe's page and the way back need a reference: if the browser has none (its "next-ref"
  // call failed), the server predicts it the same way.
  if (price && !orderRef) orderRef = (await opNextRef(db)).ref;

  const code = body.couponCode ? text(body.couponCode, 40, "coupon").toUpperCase() : "";
  let couponLead = null;
  if (code) {
    const lead = await findCoupon(db, code);
    if (lead && !lead.coupon_used && String(lead.email || "").toLowerCase() === email.toLowerCase()) couponLead = lead;
  }
  // What THAT code gives, from its own row: a browser sends only a code (src/lib/couponSize.js).
  const sizes = couponLead ? sizesOf(couponLead.coupon_size, await couponDiscount(db)) : [];
  let cut = null;
  if (price) { cut = await price(items, sizes); ({ items, total } = cut); }
  else if (couponLead) cut = await couponCut(db, items, sizes);
  const applied = couponLead ? appliedWords(cut.size, cut.off) : "";
  const notes = [`Order Ref: ${orderRef}`, d.words].filter(Boolean).join(" · ") + (applied ? ` · ${applied}` : "") + (price ? CARD_NOTE : "");

  const insert = db.from("Orders").insert(items.map(i => ({ client_email: email, item_title: i.title, amount: i.amount, status: "pending", notes, ...ship })));
  const { data: savedRows, error: orderErr } = await (price ? insert.select("id") : insert);
  if (orderErr) console.error("store order insert:", orderErr.message);

  await Promise.allSettled([
    clientOnce(db, d),
    couponLead ? db.from("Leads").update({ coupon_used: true }).eq("id", couponLead.id) : null,
    ...(price ? [] : orderReceived(mail, { firstName, orderRef, items, total, applied, fullName, email, phone, addr, saveFailed: !!orderErr })),
  ]);
  if (!price) return { ok: true, saved: !orderErr };
  const ids = (savedRows || []).map(r => r.id).filter(id => Number.isSafeInteger(id));
  return { ok: true, saved: !orderErr && ids.length === items.length, ids, items, total, orderRef, email, ...(couponLead ? { coupon: code, couponWords: sizeWords(cut.size, cut.off) } : {}) };
}

function invoiceToken(value) {
  const t = text(value, 100, "invoice", { required: true });
  if (!/^[A-Za-z0-9-]{8,100}$/.test(t)) throw new InputError("Bad invoice link", 404);
  return t;
}

async function findInvoice(db, token) {
  const { data, error } = await db.from("Orders").select("*").eq("invoice_token", token).limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new InputError("Invoice not found", 404);
  return data[0];
}

// The whole order row (findInvoice selects "*"): the invoice page also reads its tracking
// (tracking_carrier, tracking_number, tracking_url) for "Track your package". If this is ever
// narrowed to named columns, keep those three (tests/tracking.test.js checks they come back).
export async function opInvoice(db, body) {
  const order = await findInvoice(db, invoiceToken(body.token));
  const { data: settings } = await db.from("Settings").select("*").eq("id", 1).maybeSingle();
  return { order, settings: settings || {}, cardReady: cardReady() };
}

// Money has arrived: Paid, and everything after it. (Browser copy: src/lib/orderStatus.js.)
const PAID_STATUSES = ["paid", "shipped", "delivered"];
const NOT_PAID_STATUSES = ["pending", "confirmed"];
// A bank payment (ACH) on its way: "Payment processing" until Stripe says it is paid, or that it
// failed (stripe.js bankClearing; browser copy: src/lib/orderStatus.js PROCESSING). Not money yet.
const CLEARING = "processing";
const BEFORE_PAID = [...NOT_PAID_STATUSES, CLEARING];
const cardTicked = (order) => !order.payment_methods || String(order.payment_methods).split(",").includes("stripe");

// Stripe refused or is out of reach: the client hears card payment isn't working right now, never
// Stripe's own words (the log keeps them). Anything else is not Stripe's, and stays as it is.
const cardLater = (op, e) => {
  if (!(e instanceof StripeError)) return e;
  console.error(`store ${op}:`, e.code, e.message);
  return new InputError("Card payment isn't working right now", 502);
};

// "Pay by card" on the invoice page: Stripe's card form with this invoice's exact amount, INSIDE
// the invoice page, or none (Andy, 2026-11-18: "i don't want to be making the user jump to stripe
// then back"). As the Cart's (cartCheckout.js formKey): the browser must have Stripe.js ready
// (embedded: true) and the shop's publishable key must be set and right, or no page is made and
// the page says so calmly (CARD_FORM_DOWN, 409). Stripe's own page is never made any more; pages
// made before still bring the client back (&card=..., opCardPaid), and so does any way to pay in
// the form that leaves for its own site, such as Klarna (stripe.js waysToPay).
// last: the card page this tab opened before for this invoice, asked about first so only ONE page
// can take the money. Paid after all: recorded (markCardPaid: Paid, the emails once) and no new
// form. A bank payment made there, still clearing: no new form either ({ processing: true }); one
// that failed: recorded (markBankFailed), and a new form. Still open: closed (Stripe "expire")
// before the new one. Another invoice's: left alone. A bank payment still clearing for this
// invoice (Payment processing): no new form, whatever page the tab names, until Stripe says how
// it went.
// way: the one way to pay the client chose (stripe.js WAYS: "card", "klarna" or "bank"); none: as
// before the checkout asked for one. Klarna or a bank payment that Stripe won't open here: a 409
// with one calm line (stripe.js wayRefused), and never a card form in its place.
// Answers the form: { ref (the invoice number), lines, total, session, clientSecret, publishableKey }.
export async function opCardCheckout(db, body, mail) {
  let order = await findInvoice(db, invoiceToken(body.token));
  if (PAID_STATUSES.includes(order.status)) return { paid: true };
  if (!order.invoice_approved) throw new InputError("Please confirm the invoice first", 409);
  if (!cardTicked(order)) throw new InputError("Card payment is not offered on this invoice", 409);
  if (!cardReady()) throw cardLater("card-checkout", new StripeError("Card payments are not set up yet", "no-key"));
  let before = await pageBefore(body.last, order);
  if (before?.status === "complete") {
    const done = await paidBefore(db, before, order, mail);
    if (done) return done;
    // Its bank payment failed, and that is recorded now: on with the invoice as it stands now.
    before = null;
    order = await findInvoice(db, order.invoice_token);
    if (PAID_STATUSES.includes(order.status)) return { paid: true };
  }
  if (order.status === CLEARING) return { paid: false, processing: true };
  const key = formKey("card-checkout", body); // before the page before is closed: no form, no change
  if (before?.status === "open") {
    try {
      await expireCheckout(before.id);
    } catch (e) {
      if (!(e instanceof StripeError)) throw e;
      // Stripe won't close it: just paid, or closed already? Its own record says.
      try { before = await getCheckout(before.id); } catch (again) { throw cardLater("card-checkout", again); }
      if (before?.status === "complete") {
        const done = await paidBefore(db, before, order, mail);
        if (done) return done;
      }
      if (before?.status !== "expired") throw cardLater("card-checkout", e);
    }
  }
  // The artwork's picture beside the item in the form; none if it can't be had (artworks.js).
  const image = await cardPicture(db, order.item_title);
  const invNum = invoiceNumber(order);
  let page;
  try {
    page = await createCheckout({ order, invNum, image, way: body.way });
  } catch (e) {
    // Klarna or a bank payment, chosen, that Stripe won't open for this invoice: its one calm line
    // (stripe.js wayRefused), which the invoice page shows as it is, beside the other ways to pay.
    if (e instanceof StripeError && e.code === WAY_REFUSED) throw new InputError(e.message, 409);
    throw cardLater("card-checkout", e);
  }
  // What the page shows above the form, the piece first (src/components/CardCheckout.jsx).
  const amount = Number(order.amount);
  return { ref: invNum, lines: [{ title: order.item_title, amount }], total: amount, session: page.id, clientSecret: page.clientSecret, publishableKey: key };
}

// The card page named as the one this tab opened before (card-checkout's last), as Stripe tells
// it, or null: none named, not a page id, a page Stripe doesn't have, or another invoice's.
async function pageBefore(sessionId, order) {
  if (!isSessionId(sessionId)) return null;
  let page;
  try {
    page = await getCheckout(sessionId);
  } catch (e) {
    if (e instanceof StripeError && e.code === "resource_missing") return null;
    throw cardLater("card-checkout", e);
  }
  return page?.metadata?.invoice_token === order.invoice_token ? page : null;
}

// The page before is finished (the tab moved on before it heard, or Stripe's message hasn't come
// yet): recorded exactly as on the way back (settleInvoice). Paid: { paid: true }; its bank payment
// still clearing: { paid: false, processing: true }; that bank payment failed: null, and the
// invoice can be paid again. A finished page for another amount (the invoice was changed since)
// is never taken as paid.
async function paidBefore(db, page, order, mail) {
  const done = await settleInvoice(db, order, mail, "redirect", page);
  if (done.paid || done.processing) return done;
  if (done.failed) return null;
  console.warn("store card-checkout: a finished card page that isn't this invoice's exact amount", page.id);
  throw new InputError("This invoice already has a card payment. Please contact Fonkiart.", 409);
}

// What Stripe's record of a finished page (page) means for this invoice, acted on once, however
// it is heard (the client coming back, a page found paid before, Stripe's message):
//  - paid, for its exact amount: Paid, the emails, the piece SOLD (markCardPaid) -> { paid: true };
//  - a bank payment (ACH) still clearing: Payment processing, the piece held (markClearing), no
//    email -> { paid: false, processing: true };
//  - that bank payment failed: back to unpaid, the piece released, the client told (markBankFailed)
//    -> { paid: false, failed: true };
//  - anything else: nothing changes -> { paid: false }.
// NOTHING is marked Paid unless Stripe says "paid". Throws a 502 when Stripe can't say how a bank
// payment stands, so nothing is decided on a guess (Stripe's message is then sent again).
async function settleInvoice(db, order, mail, via, page) {
  if (paidFor(page, order)) {
    await markCardPaid(db, order, mail, via, page);
    await markSoldForOrder(db, { ...order, status: "paid" }); // the artwork is SOLD (artworks.js)
    return { paid: true };
  }
  if (!clearingFor(page, order)) return { paid: false };
  let state;
  try {
    state = await bankState(page);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    console.error(`store card-paid (${via}): couldn't ask Stripe how a bank payment stands:`, e.code, e.message);
    throw new InputError("Couldn't check the bank payment right now", 502);
  }
  if (state === "processing") {
    await markClearing(db, order, via, page);
    return { paid: false, processing: true };
  }
  await markBankFailed(db, order, mail, via, page);
  return { paid: false, failed: true };
}

// A bank payment is clearing for this invoice: "Payment processing" (only from Pending or
// Confirmed, so never over a Paid one), and its piece held for this client (artworks.js
// holdArtForOrder). A message sent again holds it again, which changes nothing. If the database
// refuses: via "webhook", 500, so Stripe sends it again; via "redirect", the log.
async function markClearing(db, order, via, page) {
  const { data: moved, error } = await db.from("Orders").update({ status: CLEARING })
    .eq("id", order.id).in("status", NOT_PAID_STATUSES).select("id");
  if (error) {
    console.error(`store card-paid (${via}): could not mark the order Payment processing:`, error.message);
    if (via === "webhook") throw new InputError("Could not mark the order Payment processing yet. Please send this again.", 500);
    return;
  }
  const fresh = !!moved?.length;
  if (fresh || order.status === CLEARING) await holdArtForOrder(db, order, { page: page.id, fresh });
}

// That bank payment failed: the order goes back to Confirmed (Pending if it was never confirmed),
// its piece back on sale (artworks.js releaseArtForOrder), and the client gets ONE short email
// with the way back to their invoice. Only the call whose guarded write moves the order out of
// Payment processing does this, so a replay, a second tab or a forged message sends nothing; and
// a page that failed long ago never undoes a newer page's bank payment (otherPageClearing). The
// shop hears it only when a piece needs a person: one the website can't put back on sale itself.
async function markBankFailed(db, order, mail, via, page) {
  if (otherPageClearing(order, page.id)) return;
  const back = order.invoice_approved ? "confirmed" : "pending";
  const { data: moved, error } = await db.from("Orders").update({ status: back })
    .eq("id", order.id).eq("status", CLEARING).select("id");
  if (error) {
    console.error(`store card-paid (${via}): could not set the order back to ${back} after its bank payment failed:`, error.message);
    if (via === "webhook") throw new InputError("Could not record the failed bank payment yet. Please send this again.", 500);
    return;
  }
  if (!moved?.length) return; // recorded already, or no longer clearing
  const released = await releaseArtForOrder(db, order);
  const amount = Number(order.amount);
  const view = { ref: invoiceNumber(order), refLabel: "Invoice", lines: [{ title: order.item_title, amount }], total: amount,
    name: String(order.client_name || "").trim().split(/\s+/)[0] || "" };
  const link = `${siteUrl()}/?invoice=${encodeURIComponent(order.invoice_token)}`;
  const who = order.client_name || order.client_email || "The client";
  await Promise.allSettled([
    mail.send({ to: order.client_email, subject: bankFailedSubject(view), htmlContent: bankFailed({ ...view, link }) }),
    ...(released === "check" ? [mail.send({ to: mail.sender, subject: bankFailedShopSubject(view),
      htmlContent: bankFailedShop({ ...view, who, email: order.client_email, back, check: [order.item_title] }) })] : []),
  ]);
}

// Stripe says this invoice is paid (page: Stripe's record of the paid page): mark the order Paid,
// with the way Stripe says it was paid (stripe.js paidWith: "klarna", "link", "bank", else
// "card"; the paid invoice then says "Paid by Klarna", "Paid by card"...), then email the shop and
// the client in the same words.
// The update only matches an order that is still Pending, Confirmed or Payment processing (a bank
// payment that just cleared), so whoever gets there first (the client coming back, Stripe's
// webhook, a second tab, a replay) sends the two emails, and everyone after them sends none.
// If the database refuses the change:
//  - via "redirect" (the client coming back): email anyway, telling the shop to mark it by hand;
//  - via "webhook" (Stripe's message): email nobody and answer 500, so Stripe sends it again later.
async function markCardPaid(db, order, mail, via, page) {
  const method = await paidWith(page);
  const { data: flipped, error } = await db.from("Orders").update({ status: "paid", invoice_approved: true, paid_method: method })
    .eq("id", order.id).in("status", BEFORE_PAID).select("id");
  if (error) {
    console.error(`store card-paid (${via}): could not mark the order Paid:`, error.message);
    if (via === "webhook") throw new InputError("Could not mark the order Paid yet. Please send this again.", 500);
  } else if (!flipped?.length) return; // someone else got there first, and sent the emails
  const invNum = invoiceNumber(order);
  const paid = { ...order, paid_method: method };
  await Promise.allSettled([
    mail.send({ to: mail.sender, subject: T.cardPaidSubject(paid), htmlContent: T.cardPaidShop({ order: paid, invNum, saved: !error }) }),
    mail.send({ to: order.client_email, subject: T.paymentReceivedSubject(order), htmlContent: T.paymentReceived({ order: paid, invNum }) }),
  ]);
}

// Paid in the card form on the invoice page, or back on it (?invoice=...&card=<page id>) from
// Klarna's own site, or from Stripe's own page for a page made before the form opened inside it.
// Ask Stripe if that page was really paid, for this invoice and amount; only then mark the order
// Paid and email the shop and the client, once (settleInvoice). Not paid yet (Klarna can say so):
// nothing changes. A bank payment made there: { paid: false, processing: true } while it clears.
export async function opCardPaid(db, body, mail) {
  const order = await findInvoice(db, invoiceToken(body.token));
  if (PAID_STATUSES.includes(order.status)) return { paid: true };
  const sessionId = text(body.session, 300, "payment reference", { required: true });
  let page;
  try {
    page = await getCheckout(sessionId);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    console.error("store card-paid:", e.code, e.message);
    throw new InputError("Couldn't check the card payment right now", 502);
  }
  return settleInvoice(db, order, mail, "redirect", page);
}

// Stripe's own messages about a payment page (a webhook), for the client who pays and closes the
// tab before coming back, and for a bank payment, which clears days later. Set up in Stripe ->
// Developers -> Webhooks: endpoint POST https://fonkiart.com/api/store?op=stripe-event, events
// checkout.session.completed (a page finished: paid, or a bank payment started),
// checkout.session.async_payment_succeeded (that bank payment cleared) and
// checkout.session.async_payment_failed (it didn't).
//
// No signature check, on purpose: nothing in the message is believed, not even which of the three
// it says it is. Only the payment page's id is taken from it; the website then asks Stripe about
// that page with its own key (settleInvoice: paid, clearing or failed, as Stripe's own record says
// NOW), and finds the order from STRIPE's answer, exactly like the client coming back. So a forged
// or replayed message can only make the website learn what Stripe itself says, and the order turns
// Paid (and the emails go out) once.
//
// What we answer matters to Stripe: 200 means done (also for anything we choose to ignore);
// anything else means "try again later", which Stripe does for up to 3 days.
const EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"]);
export async function opStripeEvent(db, event, mail) {
  const type = typeof event.type === "string" ? event.type.slice(0, 100) : "no type";
  if (!EVENTS.has(type)) return { received: true, ignored: type };
  const sessionId = event.data?.object?.id;
  if (!isSessionId(sessionId)) return { received: true, ignored: "not a payment page id" };
  let session;
  try {
    session = await getCheckout(sessionId);
  } catch (e) {
    if (!(e instanceof StripeError)) throw e;
    // Stripe has no such payment page (e.g. Stripe's own "send test event", whose ids are made
    // up). It will never exist, so asking again can't help: 200, or Stripe would retry for days
    // and email failure alarms. Anything else (Stripe down, too many requests, Stripe out of
    // reach) is "not right now": 502, and Stripe sends the message again later.
    if (e.code === "resource_missing") {
      console.warn("store stripe-event: Stripe has no payment page", sessionId);
      return { received: true, ignored: "no such payment page" };
    }
    console.error("store stripe-event:", e.code, e.message);
    throw new InputError("Couldn't check the payment with Stripe right now", 502);
  }
  // A Cart order names its rows in the page's metadata instead of an invoice (cartCheckout.js).
  if (isCartPage(session)) return cartStripeEvent(db, session, mail);
  let order;
  try {
    order = await findInvoice(db, invoiceToken(session?.metadata?.invoice_token));
  } catch (e) {
    if (!(e instanceof InputError)) throw e; // the database failed: 500, Stripe retries
    console.warn("store stripe-event: no invoice for payment page", sessionId);
    return { received: true, ignored: "unknown order" };
  }
  if (PAID_STATUSES.includes(order.status)) return { received: true, paid: true };
  const { paid, processing, failed } = await settleInvoice(db, order, mail, "webhook", session);
  if (paid) return { received: true, paid: true };
  if (processing) return { received: true, processing: true };
  return failed ? { received: true, failed: true } : { received: true, ignored: "not paid" };
}

export async function opInvoiceApprove(db, body, mail) {
  const order = await findInvoice(db, invoiceToken(body.token));
  if (!order.invoice_approved) {
    const { error } = await db.from("Orders").update({ invoice_approved: true, status: "confirmed" }).eq("id", order.id);
    if (error) throw error;
    await mail.send({ to: mail.sender, subject: T.invoiceConfirmedSubject(order), htmlContent: T.invoiceApproved({ order, invNum: invoiceNumber(order) }) })
      .catch(e => console.warn("store invoice email:", e.message));
  }
  return { ok: true };
}

export async function opTrack(db, body) {
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  if (!email.includes("@")) throw new InputError("Invalid email");
  const { data, error } = await db.from("Orders").select("id,item_title,status,amount,created_at").eq("client_email", email).order("created_at", { ascending: false });
  if (error) throw error;
  return { orders: data || [] };
}

export async function opLegacyLogin(db, body) {
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  const password = text(body.password, 200, "password", { required: true, trim: false });
  const { data: rows } = await db.from("Clients").select("id,name,email,password").eq("email", email).limit(1);
  const client = rows?.[0];
  if (!client?.password) return { ok: false };
  const safe = { id: client.id, name: client.name, email: client.email };
  // Passwords saved by "Forgot password?" are scrypt hashes; the admin still saves sha256.
  if (client.password.startsWith("scrypt$")) return checkPassword(password, client.password) ? { ok: true, client: safe } : { ok: false };
  const hashed = sha256hex(password);
  if (client.password === hashed) return { ok: true, client: safe };
  if (client.password === password) {
    await db.from("Clients").update({ password: hashed }).eq("id", client.id);
    return { ok: true, client: safe };
  }
  return { ok: false };
}

export async function opBuyer(db, req) {
  const token = bearer(req);
  if (!token) throw new InputError("Sign in required", 401);
  const { data, error } = await db.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) throw new InputError("Sign in required", 401);
  if (!user.email_confirmed_at && !user.confirmed_at) throw new InputError("Email not confirmed", 403);
  const email = user.email.toLowerCase();
  const [ordersRes, clientRes] = await Promise.all([
    db.from("Orders").select("*").eq("client_email", email).order("created_at", { ascending: false }),
    db.from("Clients").select("*").eq("email", email).limit(1),
  ]);
  let client = clientRes.data?.[0] || null;
  if (!client && user.user_metadata?.name) {
    await db.from("Clients").insert([{ name: user.user_metadata.name, email }]);
    const { data: again } = await db.from("Clients").select("*").eq("email", email).limit(1);
    client = again?.[0] || null;
  }
  if (client) delete client.password;
  return { orders: ordersRes.data || [], client };
}

export const STORE_OPS = {
  "welcome": (db, req, mail) => opWelcome(db, req.body || {}, mail),
  // The cart of someone who gave their email, or of a signed-in buyer (cartMemory.js), and
  // whether that saving is on at all: one yes or no for the whole site.
  "remember-cart": (db, req) => opRememberCart(db, req),
  "cart-saving": (db) => opCartSaving(db),
  "collectors": (db, req) => opCollectors(db, req.body || {}),
  "request": (db, req, mail) => opRequest(db, req.body || {}, mail),
  "next-ref": (db) => opNextRef(db),
  "coupon": (db, req) => opCoupon(db, req.body || {}),
  "order": (db, req, mail) => opOrder(db, req.body || {}, mail),
  "invoice": (db, req) => opInvoice(db, req.body || {}),
  "invoice-approve": (db, req, mail) => opInvoiceApprove(db, req.body || {}, mail),
  "card-checkout": (db, req, mail) => opCardCheckout(db, req.body || {}, mail),
  "card-paid": (db, req, mail) => opCardPaid(db, req.body || {}, mail),
  "stripe-event": (db, req, mail) => opStripeEvent(db, req.body || {}, mail),
  // The Cart's card payment (cartCheckout.js). It saves the order with opOrder, handed in here
  // so that file needs nothing from this one.
  "cart-card": (db, req, mail) => opCartCard(db, req.body || {}, mail, opOrder),
  "cart-paid": (db, req, mail) => opCartPaid(db, req.body || {}, mail),
  // Paying that same saved order again, and asking whether it is paid: never a second order.
  // The buyer's details, filled in again and maybe changed, go on its rows (checkoutDetails and
  // clientOnce, handed in like opOrder above).
  "cart-again": (db, req, mail) => opCartAgain(db, req.body || {}, mail, { checkoutDetails, clientOnce }),
  "cart-order": (db, req, mail) => opCartOrder(db, req.body || {}, mail),
  // ...and paying it another way after all (Zelle, Venmo, Cash App): its card page closed, and
  // its "order received" emails then, once (orderReceived, handed in like opOrder above).
  "cart-other": (db, req, mail) => opCartOther(db, req.body || {}, mail, orderReceived, { checkoutDetails, clientOnce }),
  // Is the card form ready to open inside fonkiart.com, and if not, why (stripe.js). Never a key.
  "card-setup": () => cardSetup(),
  // Klarna's "pay in 4" line under the price on a piece's page (src/lib/klarnaLine.js): the shop's
  // PUBLIC key, which Stripe.js needs to show it, only while the card form can open (stripe.js
  // publishableKey: card payments on, a right key of the same mode), else null and no line shows.
  // Public by design, like the key the card form gets (cart-card, card-checkout). Never logged.
  // card-setup above stays key-free.
  "klarna-line": () => ({ publishableKey: publishableKey() }),
  "track": (db, req) => opTrack(db, req.body || {}),
  "legacy-login": (db, req) => opLegacyLogin(db, req.body || {}),
  "buyer": (db, req) => opBuyer(db, req),
  "reset-request": (db, req, mail) => opCustomerResetRequest(db, req.body || {}, mail, siteUrl()),
  "reset-set": (db, req) => opCustomerResetSet(db, req.body || {}),
  "thread": (db, req) => opThread(db, req.body || {}),
  "thread-reply": (db, req, mail) => opThreadReply(db, req.body || {}, mail),
  "inbound": (db, req, mail) => opInbound(db, req, mail),
  "reminders": (db, req, mail) => opReminders(db, req, mail),
  "ship-address": (db, req, mail) => opShipAddress(db, req.body || {}, mail),
};

// Ops a plain GET may call: only Vercel's daily cron, which can't POST.
export const GET_OPS = new Set(["reminders"]);

// The client's shipping address, from their invoice page (Andy, 2026-11-17: "also make sure in
// the admin and for the user can add the shipping address !"). Only someone with the invoice
// link can set it, like opInvoice, before or after paying. Once the order has gone out
// (Shipped, Delivered) it can't be changed here any more: the client asks Fonkiart instead.
// Every field has the checkout's limits (opOrder); only the seven address columns are written.
// When the client really adds or changes it, the shop gets one short email (Andy, 2026-11-18:
// "7ab Yes"): "added" while the order had no street yet, else "changed", with the old address.
// Saving the same address again sends nothing. The address is saved first, so an email that
// fails never loses it and the client still sees it saved. Never emails the client.
export async function opShipAddress(db, body, mail) {
  const order = await findInvoice(db, invoiceToken(body.token));
  if (order.status === "shipped" || order.status === "delivered") {
    throw new InputError("This order has already gone out, so the address can't be changed here. Please contact Fonkiart.", 409);
  }
  const typed = body.address && typeof body.address === "object" ? body.address : {};
  const address = {};
  for (const [column, max] of Object.entries(SHIP_LIMITS)) {
    address[column] = text(typed[column], max, SHIP_WORDS[column], { required: SHIP_REQUIRED.has(column) }) || null;
  }
  const { error } = await db.from("Orders").update(address).eq("id", order.id);
  if (error) throw error;
  // What it had, as it would be saved (trimmed, empty as null), so only a real change counts.
  const before = Object.fromEntries(Object.keys(SHIP_LIMITS).map(column =>
    [column, order[column] == null ? null : String(order[column]).trim() || null]));
  const changed = Object.keys(SHIP_LIMITS).some(column => before[column] !== address[column]);
  if (changed && mail) {
    const had = before.ship_address ? before : null; // an address counts once it has a street
    const invNum = invoiceNumber(order);
    await mail.send({ to: mail.sender, subject: T.shipAddressSubject({ order, invNum, changed: !!had }),
      htmlContent: T.shipAddressShop({ order, invNum, address, before: had }) })
      .catch(e => console.warn("store ship-address email:", e?.message || e));
  }
  return { ok: true, address };
}
