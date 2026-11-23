// Card payments through Stripe Checkout (Andy, 2026-11-17: "Yes, do it ... FOR NOW").
//
// Why not a pasted Payment Link: a link can't be told the amount. Stripe only lets a link
// carry a reference, a language and tracking tags, so one link charged one fixed price on
// every invoice, or made the client type the amount. Instead, when the client taps
// "Pay by card", the website asks Stripe for a payment page with that invoice's EXACT
// amount and invoice number, and shows its card form right there on the invoice page
// (Stripe.js), never on Stripe's own page (Andy, 2026-11-18: "i don't want to be making the
// user jump to stripe then back"). The form takes cards and Klarna (Andy, 2026-11-20: "Klarna is
// something we should try to push ... little payments"): a card is paid right there in the form;
// Klarna takes the buyer to Klarna's own site to agree the payments, and brings them back to
// fonkiart.com (return_url, waysToPay below). Since 2026-11-21 the checkout can also ask for ONE
// way per page (Andy: "also paying options look what strip offers .. klarma , Secure Link
// (https://link.com/) , bank transfer / ACH"): cards with Link, Klarna, or a US bank account (ACH),
// which clears days later (WAYS below).
//
// Once paid, the website asks Stripe AGAIN whether that page was really paid, for this
// invoice and this amount, before it marks the order Paid. Nothing the browser sends is
// trusted on its own. Stripe's own "paid" message (the webhook, op "stripe-event" in
// storeOps.js) is checked the same way, for the client who closes the tab too soon.
//
// Needs STRIPE_SECRET_KEY in Vercel (a restricted key with "Checkout Sessions: Write" is
// enough for cards; to tell Klarna, Link and a bank payment apart, and to know when a bank payment
// failed, it also needs "PaymentIntents: Read"; to know which ways to pay are switched on, Read
// on the payment method configurations and on the webhook endpoints, else cards and Klarna only,
// stripeWays). NEVER in git: this repo is public. No key = no card option; nothing else breaks.

import { siteUrl } from "./site.js";
import { offerWords } from "./klarnaOffer.js";

const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20"; // pinned: a change in Stripe's default can't change what we send
export const MIN_CENTS = 50;  // Stripe's smallest US card charge

// httpStatus: Stripe's own HTTP answer (400 = it refused what we sent), when it answered at all.
// param: the field Stripe named as the one it refused, when it named one.
export class StripeError extends Error {
  constructor(message, code, httpStatus, param) { super(message); this.code = code; this.httpStatus = httpStatus; this.param = param; }
}

const key = () => String(process.env.STRIPE_SECRET_KEY || "").trim();
export const cardReady = () => /^(sk|rk)_(live|test)_\S+$/.test(key());

// The account's PUBLIC key, which Stripe.js needs to open the card form inside fonkiart.com
// (the Cart's, cartCheckout.js, and the invoice page's, storeOps.js opCardCheckout). Vercel
// variable STRIPE_PUBLISHABLE_KEY (pk_live_...).
// Public by design: Stripe.js hands it to every browser. It still lives in Vercel, not in git.
// It must be the same mode as the secret key (both live or both test), or Stripe.js can't
// open the page. With none, a bad one or a mismatch, no card form opens (the Cart saves nothing,
// cartCheckout.js; an invoice keeps its other ways to pay): nobody is ever sent to Stripe's own
// page instead.
export function publishableKey() {
  const { pk, mode, why } = pkCheck();
  if (!mode || !cardReady()) return null;
  if (!why) return pk;
  console.warn(`stripe: STRIPE_PUBLISHABLE_KEY is a ${mode} key and STRIPE_SECRET_KEY is not; the Cart's card form can't open`);
  return null;
}

// The publishable key as Vercel has it, and what is wrong with it: "no-key" (not set), "bad-key"
// (not a pk_live_ / pk_test_ key of plain letters and digits: a stray quote, a space, a character
// nobody can see, or another key pasted in by mistake) or "mode-mismatch" (live with a test
// secret key, or the other way round). null: nothing wrong.
function pkCheck() {
  const pk = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  const mode = /^pk_(live|test)_[A-Za-z0-9]+$/.exec(pk)?.[1];
  const why = !pk ? "no-key" : !mode ? "bad-key" : cardReady() && !key().includes(`_${mode}_`) ? "mode-mismatch" : null;
  return { pk, mode, why };
}

// What a BAD publishable key looks like (op "card-setup", only while why is "bad-key"), so the
// shop can be told exactly what to fix. Vercel keeps the value sensitive: nobody can read it
// back. So this says it in WORDS, NEVER with any character of the value:
//   length: how long it is once trimmed.
//   kind: what it starts like: "publishable" (pk_), "secret" (sk_), "restricted" (rk_),
//     "webhook" (whsec_), or null.
//   slips: every one that fits: "secret" (a secret, restricted or webhook key anywhere in it,
//     which must never go here), "quoted" (a quote at either end), "named" (=, STRIPE or
//     PUBLISHABLE in it, as when a whole KEY=value line is pasted), "spaced" (a space or line
//     break inside), "hidden-start" / "hidden-inside" / "hidden-end" (a character outside plain
//     letters, digits and signs, such as a zero-width space nobody can see), "typo" (pk_, but not
//     pk_live_ or pk_test_). None of them: "other".
// Why: 2026-11-18, Andy pasted the key twice (saved 13:42 and 19:49, redeployed 19:53) and it
// still read bad-key; neither he nor Claude could see why.
export function keyShape(raw) {
  const pk = String(raw ?? "").trim();
  const kind = /^pk_/.test(pk) ? "publishable" : /^sk_/.test(pk) ? "secret" : /^rk_/.test(pk) ? "restricted" : /^whsec_/.test(pk) ? "webhook" : null;
  const slips = [];
  if (/(sk|rk)_(live|test)_|whsec_/.test(pk)) slips.push("secret");
  if (/^["'`]|["'`]$/.test(pk)) slips.push("quoted");
  if (/=|stripe|publishable/i.test(pk)) slips.push("named");
  if (/\s/.test(pk)) slips.push("spaced");
  const chars = [...pk];
  const hidden = new Set();
  chars.forEach((ch, i) => {
    const c = ch.codePointAt(0);
    if ((c < 0x21 || c > 0x7e) && !/\s/.test(ch)) hidden.add(i === 0 ? "hidden-start" : i === chars.length - 1 ? "hidden-end" : "hidden-inside");
  });
  for (const h of ["hidden-start", "hidden-inside", "hidden-end"]) if (hidden.has(h)) slips.push(h);
  if (/^pk_/i.test(pk) && !/^pk_(live|test)_/.test(pk)) slips.push("typo");
  return { length: pk.length, kind, slips: slips.length ? slips : ["other"] };
}

// The shop's own look at the card setup (op "card-setup"), without making a Stripe page: card
// payments on, the Cart's card form able to open inside fonkiart.com, and if not, why; with a
// bad key, its shape in words (keyShape). NEVER any part of a key (the answer goes to whoever asks).
// ways: the ways to pay Stripe has switched on for the account now (stripeWays), so the checkout
// shows a row only for those: "card", "link" (inside the card way), "klarna" and "bank". None, and
// Stripe not asked, while no form can open. cardKeys: the same answer without the ways, at once.
export async function cardSetup() {
  const answer = cardKeys();
  answer.ways = answer.card && answer.form ? [...await stripeWays()] : [];
  return answer;
}
export function cardKeys() {
  const { why } = pkCheck();
  const answer = { card: cardReady(), form: !!publishableKey(), why };
  if (why === "bad-key") answer.shape = keyShape(process.env.STRIPE_PUBLISHABLE_KEY);
  return answer;
}

export function toCents(amount) {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Stripe takes form fields, with [brackets] for nested ones: line_items[0][quantity]=1.
export function formBody(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formBody(v, name, out); // arrays too: their keys are 0, 1, ...
    else out.append(name, String(v));
  }
  return out;
}

async function stripe(path, body) {
  if (!cardReady()) throw new StripeError("Card payments are not set up yet", "no-key");
  const request = {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Stripe-Version": VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? formBody(body).toString() : undefined,
  };
  let res;
  try {
    res = await fetch(`${API}${path}`, request);
  } catch (e) {
    // No answer at all (network, DNS): a Stripe failure "for now", like Stripe being down.
    throw new StripeError(`Could not reach Stripe: ${e?.message || e}`, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe answered ${res.status}`, data?.error?.code || `http-${res.status}`, res.status, data?.error?.param);
  return data;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A payment page's id as Stripe makes them. Checked before it goes anywhere near a URL.
export const isSessionId = (id) => /^cs_(live|test)_[A-Za-z0-9]{10,250}$/.test(String(id || ""));

// A payment page: one item, paid once, in dollars, by card (Apple Pay and Google Pay count as
// cards). The card form sets its own ways to pay (waysToPay below); Admin's card check (cardCheck)
// stays cards only.
// image: one picture shown beside the item (Stripe's product_data.images), or none.
function paymentPage({ cents, name, description, image, ...rest }) {
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name, description, images: image ? [image] : undefined } } }],
    ...rest,
  };
}

// ── the ways to pay ─────────────────────────────────────────────
// The checkout shows each way to pay as its own choice, and asks for ONE way per payment page
// (way, from the browser; Andy, 2026-11-21: "also paying options look what strip offers ..
// klarma , Secure Link (https://link.com/) , bank transfer / ACH"). Stripe's names for each:
//  - "card": cards (Apple Pay and Google Pay count as cards) and Link, Stripe's saved details for
//    a faster checkout, which Stripe offers only when "link" is in the list beside "card";
//  - "klarna": Klarna alone;
//  - "bank": a US bank account (ACH Direct Debit). Stripe checks the account (it finds the bank
//    online, or sends two small deposits for the buyer to confirm), and the money can take up to
//    4 business days to clear (Stripe's ACH docs). Until then Stripe says the page is "complete"
//    but "unpaid" (bankClearing).
// No way named, or a word this list doesn't know: cards and Klarna, exactly as before the
// checkout asked for one.
const WAYS = new Map([["card", ["card", "link"]], ["klarna", ["klarna"]], ["bank", ["us_bank_account"]]]);
const BEFORE_WAYS = ["card", "klarna"];
const CARDS_ONLY = ["card"];
const isCardsOnly = (types) => types.length === 1 && types[0] === "card";
export const wayTypes = (way) => WAYS.get(way) ?? BEFORE_WAYS;
// The checkout's names for what Stripe calls them (card-setup's ways), and those in words (the log).
const ALL_WAYS = ["card", "link", "klarna", "bank"];
const WORDS = new Map([["card", "card"], ["link", "Link"], ["klarna", "Klarna"], ["us_bank_account", "bank (ACH)"]]);
const said = (types) => (isCardsOnly(types) ? "cards only" : types.map(t => WORDS.get(t) || t).join(" and "));

// Which ways to pay Stripe has switched on, as Stripe itself says, never as a guess: a way is
// offered only while the account's default payment method configuration (the one Stripe uses when
// none is named) says it is "available" (Stripe: "True if display_preference is on and the payment
// method's capability is active"), so a way not switched on in the Dashboard is never shown. A
// bank payment also needs Stripe's webhook to this site's op stripe-event (storeOps.js), switched
// on, with both messages that say how a bank payment ended (bankHook): without them its order
// would sit in "Payment processing", its piece held, for good. Anything else (Stripe out of reach
// or slower than waitMs, a restricted key that may not read these, no default configuration, or
// one that doesn't say whether cards are on): cards and Klarna, exactly as before the ways. Asked
// at most once every 10 minutes per server (WAYS_FOR), so a switch in the Dashboard shows within
// 10 minutes. Never throws, and never holds the checkout up for long.
const WAYS_FOR = 10 * 60 * 1000;
const STRIPE_NAMES = [["card", "card"], ["link", "link"], ["klarna", "klarna"], ["bank", "us_bank_account"]];
const BANK_EVENTS = ["checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"];
const LATE = Symbol("late");
let waysAsked = null; // { at, ways }: ways, a promise of the answer, shared by everyone asking meanwhile
export function stripeWays({ waitMs = 3000 } = {}) {
  if (!waysAsked || !(Date.now() - waysAsked.at < WAYS_FOR)) waysAsked = { at: Date.now(), ways: askWays(waitMs) };
  return waysAsked.ways;
}
async function askWays(waitMs) {
  let timer;
  try {
    const late = new Promise((resolve) => { timer = setTimeout(resolve, waitMs, LATE); });
    const answer = await Promise.race([Promise.all([stripe("/payment_method_configurations?limit=100"), stripe("/webhook_endpoints?limit=100")]), late]);
    if (answer === LATE) throw new Error(`Stripe didn't answer within ${waitMs} ms`);
    const [configs, hooks] = answer;
    const config = (Array.isArray(configs?.data) ? configs.data : []).find(c => c?.is_default === true && c.active === true);
    if (!config) throw new Error("Stripe has no default payment method configuration");
    if (typeof config.card?.available !== "boolean") throw new Error("Stripe's default payment method configuration doesn't say whether cards are on");
    const on = new Set(STRIPE_NAMES.filter(([, name]) => config[name]?.available === true).map(([way]) => way));
    if (on.has("bank") && !(Array.isArray(hooks?.data) ? hooks.data : []).some(bankHook)) on.delete("bank");
    return ALL_WAYS.filter(w => on.has(w));
  } catch (e) {
    console.warn("stripe: couldn't learn from Stripe which ways to pay are on, so the checkout offers cards and Klarna, as before:", e instanceof StripeError ? e.code : "", e?.message || e);
    return [...BEFORE_WAYS];
  } finally {
    clearTimeout(timer);
  }
}
// Stripe's webhook to this site's op stripe-event, switched on, with both of a bank payment's
// endings, or every event ("*").
function bankHook(hook) {
  let url;
  try { url = new URL(String(hook?.url)); } catch { return false; }
  const events = Array.isArray(hook.enabled_events) ? hook.enabled_events : [];
  return hook.status === "enabled" && url.origin === new URL(siteUrl()).origin && url.pathname === "/api/store"
    && url.searchParams.get("op") === "stripe-event" && (events.includes("*") || BANK_EVENTS.every(t => events.includes(t)));
}

// The ways to pay in one card form, and where Stripe brings a buyer back to.
// redirect_on_completion "if_required": a CARD (or Link) is paid right there in the form and the
// buyer STAYS (Stripe.js says so, onComplete, exactly as with "never": 3-D Secure opens inside
// Stripe's own form); only a way to pay that must leave (Klarna, its own site; a bank's own page,
// if Stripe needs one) comes back to return_url. "never" would turn those off ("redirect-based
// payment methods will be disabled").
// return_url: the shop's own address (site.js), NEVER one from the browser, on the return path the
// site already reads (back): an invoice's ?invoice=<token>&card=<page id> (InvoicePage, op
// card-paid), a Cart order's ?cart=FA-...&card=<page id> (CardReturnPage, op cart-paid). Stripe
// puts the page's id in place of {CHECKOUT_SESSION_ID}. Back there, the server asks Stripe itself
// whether that page is paid, for the exact amount (paidFor, cartPaidFor): until Stripe says
// "paid", the order stays unpaid. Cards only: never sent anywhere, exactly as before Klarna.
function waysToPay(types, back) {
  return isCardsOnly(types)
    ? { payment_method_types: CARDS_ONLY, redirect_on_completion: "never" }
    : { payment_method_types: types, redirect_on_completion: "if_required", return_url: `${siteUrl()}${back}{CHECKOUT_SESSION_ID}` };
}

// A way the buyer picked by name, Klarna or a bank payment, that isn't switched on (stripeWays)
// or that Stripe won't open for this page (an amount outside what Klarna takes, or the way not
// switched on after all): no page, and never a card form in its place, since the buyer asked for
// that way and not for a card. The buyer gets one calm line instead and picks another way (the
// ops answer it as a 409, which the invoice page and the checkout show as it is, or as
// cart-card's cardError). Stripe's own words stay in the log. off: not switched on.
export const WAY_REFUSED = "way-refused";
const CHOSEN = new Map([["klarna", "Klarna"], ["bank", "Paying by bank (ACH)"]]);
function wayRefused(way, off, e) {
  const refused = new StripeError(`${CHOSEN.get(way)} isn't available ${off ? "right now" : "for this amount"}. Please choose another way.`, WAY_REFUSED, e?.httpStatus, e?.param);
  refused.way = way;
  return refused;
}

// Asks Stripe for a payment page (make({ types, pictures }) builds it) for the way the checkout
// asked for, so that neither a way to pay nor a picture can ever stop a card payment. If Stripe
// refuses it (a 400): when Stripe names a picture as the field it refused, it is asked again
// without the pictures. Otherwise, for the card way or none (Link or Klarna off for the account,
// an amount Klarna won't take...), again with cards only, as before Klarna, then without the
// pictures too: at most three asks. For Klarna or a bank payment, chosen by name: no card form
// instead (wayRefused above). Anything else (Stripe down, a bad key) is thrown at once.
// A way the checkout named goes by what Stripe has switched on (stripeWays), as card-setup told the
// checkout: Klarna or a bank payment that isn't on is refused before Stripe is asked, and the card
// way carries Link only while Link is on. No way named: cards and Klarna, as before, unasked.
async function askForPage(what, make, { pictures, way }) {
  const chosen = CHOSEN.has(way);
  let types = wayTypes(way);
  if (WAYS.has(way)) {
    const on = await stripeWays();
    if (chosen && !on.includes(way)) {
      console.warn(`stripe: ${what}: ${WORDS.get(types[0])} isn't switched on in Stripe, so no page and no card form instead`);
      throw wayRefused(way, true);
    }
    if (way === "card" && !on.includes("link")) types = CARDS_ONLY;
  }
  let want = { types, pictures: !!pictures };
  for (;;) {
    try {
      return await stripe("/checkout/sessions", make(want));
    } catch (e) {
      if (!(e instanceof StripeError) || e.httpStatus !== 400) throw e;
      const next = want.pictures && /\[images\]/.test(String(e.param || "")) ? { ...want, pictures: false }
        : chosen ? null
        : !isCardsOnly(want.types) ? { ...want, types: CARDS_ONLY }
        : want.pictures ? { ...want, pictures: false }
        : null;
      if (!next && chosen) {
        console.warn(`stripe: Stripe refused ${what} (${said(want.types)}, ${want.pictures ? "with" : "without"} pictures); the buyer chose it, so no card form instead:`, e.code, e.param || "", e.message);
        throw wayRefused(way, e.code === "payment_method_unactivated", e);
      }
      if (!next) throw e;
      console.warn(`stripe: Stripe refused ${what} (${said(want.types)}, ${want.pictures ? "with" : "without"} pictures); asking again with ${said(next.types)}, ${next.pictures ? "with" : "without"} pictures:`, e.code, e.param || "", e.message);
      want = next;
    }
  }
}

// The card form for one invoice, INSIDE the invoice page (Stripe.js; ui_mode "embedded"), as the
// Cart's (createCartCheckout below), and never Stripe's own page any more. The page carries the
// invoice's token (metadata invoice_token), so the check once paid (op card-paid) and Stripe's
// own message find the order from Stripe's answer, never from the browser. Paid by card, the
// client STAYS on the invoice page; paid with Klarna, Klarna brings them back to
// ?invoice=<token>&card=<page id> (waysToPay), the same way back as Stripe's own pages made before
// this change, checked the same way (storeOps.js opCardPaid).
// image: the artwork's picture (artworks.js cardPicture), or nothing. Neither the picture nor
// Link or Klarna ever stops a card payment: if Stripe refuses the page, it is asked for again
// (askForPage). way: the one way to pay the client chose ("card", "klarna" or "bank", WAYS above),
// or none; Klarna or a bank payment chosen and refused: no page at all (WAY_REFUSED).
// Returns { id, clientSecret }: id, which the invoice page names once paid (card-paid) or when it
// asks for a form again (card-checkout's last); clientSecret, for Stripe.js to open the form.
export async function createCheckout({ order, invNum, image, way }) {
  const cents = toCents(order.amount);
  if (cents < MIN_CENTS) throw new StripeError("This invoice is too small for a card payment", "too-small");
  const title = String(order.item_title || "Fonkiart artwork").slice(0, 200);
  const picture = typeof image === "string" && image.startsWith("https://") ? image : undefined;
  const back = `/?invoice=${encodeURIComponent(order.invoice_token)}&card=`;
  const page = ({ types, pictures }) => paymentPage({
    cents, name: title, description: `Invoice ${invNum}`, image: pictures ? picture : undefined,
    customer_email: EMAIL_RE.test(order.client_email || "") ? order.client_email : undefined,
    client_reference_id: invNum,
    metadata: { invoice: invNum, invoice_token: order.invoice_token, order_id: order.id },
    // What Aliana sees on the payment in Stripe's own list.
    payment_intent_data: { description: `Fonkiart invoice ${invNum}: ${title}`, metadata: { invoice: invNum, order_id: order.id } },
    ui_mode: "embedded",
    ...waysToPay(types, back), // paid by card, the client stays on the invoice page
  });
  const session = await askForPage("the invoice's payment page", page, { pictures: picture, way });
  if (!isSessionId(session?.id)) throw new StripeError("Stripe sent no payment page", "no-id");
  if (!session.client_secret) throw new StripeError("Stripe sent no card form", "no-client-secret");
  return { id: session.id, clientSecret: session.client_secret };
}

// The card form for a Cart order (cartCheckout.js), INSIDE fonkiart.com (Stripe.js; ui_mode
// "embedded"), and never Stripe's own page (Andy, 2026-11-18: "i don't want to be making the user
// jump to stripe then back"). One line per piece, each with its name, its picture and the price
// the SERVER found for it. The page carries the order's rows (metadata order_ids) and its
// reference (cart_ref), so the check once paid (cart-paid) and Stripe's own message find the
// order from Stripe's answer, never from the browser. Paid by card, the buyer STAYS on
// fonkiart.com (3-D Secure opens inside Stripe's own form): the page hears it from Stripe.js
// (onComplete), asks cart-paid, and shows the thank-you there. Paid with Klarna, Klarna brings
// them back to ?cart=FA-...&card=<page id> (waysToPay), the way back the site already reads
// (CardReturnPage asks cart-paid).
// Returns { id, clientSecret }: id, kept by the checkout so paying again re-opens THIS order
// (cart-again); clientSecret, for Stripe.js to open the form.
// lines: [{ title, amount, image }]. Neither a picture nor Link or Klarna ever stops a card
// payment: if Stripe refuses the page, it is asked for again (askForPage). way: as for invoices.
// offer: the Klarna offer (klarnaOffer.js; cartCheckout.js works it out), { off, split } in cents,
// for a Klarna page ONLY (way "klarna", which never falls back to a card form): each piece's line
// is its price less its share (split), and the page says so in its metadata (klarna_off, the cents
// off; klarna_split, each piece's share, in the order of ids), which only this server writes, so the
// check once paid knows the lower amount is the right one (cartCheckout.js offerOf).
export async function createCartCheckout({ ref, ids, lines, email, way, offer }) {
  if (offer && (way !== "klarna" || !Array.isArray(offer.split) || offer.split.length !== lines.length
    || offer.split.reduce((a, b) => a + b, 0) !== offer.off)) throw new StripeError("The Klarna offer is for a Klarna payment page only, split across its pieces", "bad-offer");
  const cents = lines.map((l, n) => toCents(l.amount) - (offer ? offer.split[n] : 0));
  if (!lines.length || cents.some(c => c <= 0)) throw new StripeError("Every piece needs a price for a card payment", "no-price");
  if (cents.reduce((a, b) => a + b, 0) < MIN_CENTS) throw new StripeError("This order is too small for a card payment", "too-small");
  const names = lines.map(l => String(l.title || "Fonkiart artwork").slice(0, 200));
  const tags = { cart_ref: ref, order_ids: ids.join(","), ...(offer ? { klarna_off: String(offer.off), klarna_split: offer.split.join(",") } : {}) };
  const page = ({ types, pictures: withPictures }) => ({
    mode: "payment",
    line_items: lines.map((l, n) => {
      const picture = withPictures && typeof l.image === "string" && l.image.startsWith("https://") ? [l.image] : undefined;
      return { quantity: 1, price_data: { currency: "usd", unit_amount: cents[n], product_data: { name: names[n], images: picture } } };
    }),
    customer_email: EMAIL_RE.test(email || "") ? email : undefined,
    client_reference_id: ref,
    metadata: tags,
    // What Aliana sees on the payment in Stripe's own list.
    payment_intent_data: { description: `Fonkiart order ${ref}: ${names.join(", ")}${offer ? offerWords(offer.off) : ""}`.slice(0, 1000), metadata: tags },
    ui_mode: "embedded",
    ...waysToPay(types, `/?cart=${encodeURIComponent(ref)}&card=`), // as invoices
  });
  const session = await askForPage("the Cart's payment page", page, { pictures: lines.some(l => typeof l.image === "string" && l.image.startsWith("https://")), way });
  if (!isSessionId(session?.id)) throw new StripeError("Stripe sent no payment page", "no-id");
  if (!session.client_secret) throw new StripeError("Stripe sent no card form", "no-client-secret");
  return { id: session.id, clientSecret: session.client_secret };
}

// Closes a payment page nobody has paid, so it can never take money (Stripe's "expire"). The
// Cart does this before it opens a new page for the same order (cartCheckout.js opCartAgain):
// only ONE page per order can ever be paid. Stripe refuses it for a page that is already paid
// or closed; the caller then asks Stripe what the page is now.
export async function expireCheckout(sessionId) {
  if (!isSessionId(sessionId)) throw new StripeError("Not a payment page id", "bad-id");
  return stripe(`/checkout/sessions/${sessionId}/expire`, {});
}

// Stripe's own record of a payment page (null for an id that isn't one). Whatever a browser
// or a webhook says about a page, this is what gets believed.
export async function getCheckout(sessionId) {
  return isSessionId(sessionId) ? stripe(`/checkout/sessions/${sessionId}`) : null;
}

// Does Stripe's record say paid, for this invoice and this exact amount, in dollars?
export function paidFor(session, order) {
  return session?.payment_status === "paid"
    && session.metadata?.invoice_token === order.invoice_token
    && session.amount_total === toCents(order.amount)
    && String(session.currency).toLowerCase() === "usd";
}

// Was this payment page really paid, for this invoice and this exact amount?
export async function checkoutPaidFor({ sessionId, order }) {
  return paidFor(await getCheckout(sessionId), order);
}

// A page's payment (its PaymentIntent), as Stripe keeps it, with the payment method it used:
// null when the page names none. Stripe's own record, never a browser's.
async function paymentOf(session) {
  const payment = session?.payment_intent;
  if (payment && typeof payment === "object") return payment;
  if (typeof payment !== "string" || !/^pi_[A-Za-z0-9]{10,250}$/.test(payment)) return null;
  return stripe(`/payment_intents/${payment}?expand%5B%5D=payment_method`);
}

// How a paid page was paid, as the order keeps it (Orders.paid_method): "klarna", "link" (Link,
// inside the card way) or "bank" (a US bank account), else "card" (Apple Pay and Google Pay are
// cards), exactly as before Klarna. Read from Stripe's own record, never from a browser: the
// page's payment says the type of the payment method it used. Asked only once a page is found
// paid, and never throws: if Stripe can't answer this one question, the order is still recorded
// Paid, as a card, as before.
const PAID_WITH = new Map([["klarna", "klarna"], ["link", "link"], ["us_bank_account", "bank"]]);
export async function paidWith(session) {
  try {
    return PAID_WITH.get((await paymentOf(session))?.payment_method?.type) ?? "card";
  } catch (e) {
    console.warn("stripe: could not learn how a paid page was paid, so it is recorded as a card:", e?.code || "", e?.message || e);
    return "card";
  }
}

// ── a bank payment (ACH) clearing ───────────────────────────────
// A bank payment is not money yet when the buyer finishes the form: Stripe says the page is
// "complete" but "unpaid", then, days later, "paid" (its message
// checkout.session.async_payment_succeeded) or not (async_payment_failed). Until then the order
// reads "Payment processing" and its art stays held for that buyer (storeOps.js, cartCheckout.js).
// NOTHING is ever marked Paid on "unpaid": only paidFor / cartPaidFor do that, on "paid".
// bankClearing: does Stripe's record say a bank payment was made on this page and is clearing (or
// has failed: bankState tells which)? Only a page that offered a bank account (Klarna's pages,
// say, can also be "complete" but "unpaid" for a while, and stay exactly as before).
export function bankClearing(session) {
  return session?.status === "complete"
    && session.payment_status === "unpaid"
    && Array.isArray(session.payment_method_types) && session.payment_method_types.includes("us_bank_account")
    && String(session.currency).toLowerCase() === "usd";
}

// As bankClearing, for this invoice and its exact amount (as paidFor).
export function clearingFor(session, order) {
  return bankClearing(session)
    && session.metadata?.invoice_token === order.invoice_token
    && session.amount_total === toCents(order.amount);
}

// A clearing bank payment's state, from Stripe's own record of the payment, never from the message
// that brought it (anyone can post one): "failed" once Stripe has given up on it (the bank refused
// the debit, or the account was never confirmed: Stripe puts the payment back to
// "requires_payment_method", or cancels it), else "processing" (the account still being confirmed,
// or the money on its way). Throws when Stripe can't say, so nothing is decided on a guess.
const GAVE_UP = new Set(["requires_payment_method", "canceled"]);
export async function bankState(session) {
  const payment = await paymentOf(session);
  if (!payment?.status) throw new StripeError("Stripe sent no payment for this bank payment", "no-payment");
  return GAVE_UP.has(payment.status) ? "failed" : "processing";
}

// That way in words, as the emails say it (emails.js for invoices, cartEmails.js for the Cart).
// by: the subject's "Paid by card ✓"; how: "paid $X by card"; name: the buyer's receipt;
// stripe: the shop's "Paid with". A card (or a way this list doesn't know): word for word as
// before Klarna.
const CARD_WORDS = { by: "by card", how: "by card", name: "Card", stripe: "Card (Stripe)" };
const PAID_WORDS = new Map([
  ["klarna", { by: "by Klarna", how: "with Klarna", name: "Klarna", stripe: "Klarna (Stripe)" }],
  ["link", { by: "by Link", how: "with Link", name: "Link", stripe: "Link (Stripe)" }],
  ["bank", { by: "by bank (ACH)", how: "by bank (ACH)", name: "Bank (ACH)", stripe: "Bank, ACH (Stripe)" }],
]);
export const paidWords = (method) => ({ ...(PAID_WORDS.get(method) ?? CARD_WORDS) });

// Admin -> Settings -> Stripe: can this key take card payments?
//  - Quick (when the panel opens): a read. Proves Stripe accepts the key, NOT that it may
//    make payment pages.
//  - Deep ("Check again"): makes a real $0.50 payment page, cards only (an invoice's adds
//    Klarna), and cancels it at once, so nobody can pay it and nothing is charged. Ready only if
//    Stripe allows both; if not, Stripe's own message says why (it names a missing permission).
export async function cardCheck({ deep = false, site } = {}) {
  if (!cardReady()) return { ready: false, reason: "No Stripe key in Vercel yet (STRIPE_SECRET_KEY)." };
  const live = key().includes("_live_");
  if (!deep) {
    try {
      await stripe("/checkout/sessions?limit=1");
      return { ready: true, live };
    } catch (e) {
      return { ready: false, reason: `Stripe refused the key: ${e.message}` };
    }
  }
  let page;
  try {
    page = await stripe("/checkout/sessions", paymentPage({
      cents: MIN_CENTS, name: "Fonkiart card check", description: "Made by Admin's card check and cancelled at once",
      metadata: { purpose: "card-check" },
      success_url: `${site}/`,
    }));
  } catch (e) {
    return { ready: false, reason: `Stripe would not make a payment page: ${e.message}` };
  }
  if (!isSessionId(page?.id)) return { ready: false, reason: "Stripe sent no payment page." };
  try {
    await stripe(`/checkout/sessions/${page.id}/expire`, {});
  } catch (e) {
    return { ready: false, reason: `Stripe made the test payment page but would not cancel it: ${e.message}` };
  }
  return { ready: true, live, deep: true };
}
