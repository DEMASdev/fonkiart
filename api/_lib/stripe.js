// Card payments through Stripe Checkout (Andy, 2026-11-17: "Yes, do it ... FOR NOW").
//
// Why not a pasted Payment Link: a link can't be told the amount. Stripe only lets a link
// carry a reference, a language and tracking tags, so one link charged one fixed price on
// every invoice, or made the client type the amount. Instead, when the client taps
// "Pay by card", the website asks Stripe for a payment page with that invoice's EXACT
// amount and invoice number, and sends the client there.
//
// When the client comes back from paying, the website asks Stripe AGAIN whether that page
// was really paid, for this invoice and this amount, before it marks the order Paid. Nothing
// the browser sends is trusted on its own. Stripe's own "paid" message (the webhook, op
// "stripe-event" in storeOps.js) is checked the same way, for the client who closes the tab
// before coming back.
//
// Needs STRIPE_SECRET_KEY in Vercel (a restricted key with "Checkout Sessions: Write" is
// enough). NEVER in git: this repo is public. No key = no card option; nothing else breaks.

const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20"; // pinned: a change in Stripe's default can't change what we send
export const MIN_CENTS = 50;  // Stripe's smallest US card charge

// httpStatus: Stripe's own HTTP answer (400 = it refused what we sent), when it answered at all.
export class StripeError extends Error {
  constructor(message, code, httpStatus) { super(message); this.code = code; this.httpStatus = httpStatus; }
}

const key = () => String(process.env.STRIPE_SECRET_KEY || "").trim();
export const cardReady = () => /^(sk|rk)_(live|test)_\S+$/.test(key());

// The account's PUBLIC key, which Stripe.js needs to open the Cart's card form inside
// fonkiart.com (cartCheckout.js). Vercel variable STRIPE_PUBLISHABLE_KEY (pk_live_...).
// Public by design: Stripe.js hands it to every browser. It still lives in Vercel, not in git.
// It must be the same mode as the secret key (both live or both test), or Stripe.js can't
// open the page. With none, or a mismatch, the Cart sends the buyer to Stripe's own page.
export function publishableKey() {
  const { pk, mode, why } = pkCheck();
  if (!mode || !cardReady()) return null;
  if (!why) return pk;
  console.warn(`stripe: STRIPE_PUBLISHABLE_KEY is a ${mode} key and STRIPE_SECRET_KEY is not; the Cart uses Stripe's own page`);
  return null;
}

// The publishable key as Vercel has it, and what is wrong with it: "no-key" (not set), "bad-key"
// (not a pk_live_ / pk_test_ key: a stray quote or space, or another key pasted in by mistake) or
// "mode-mismatch" (live with a test secret key, or the other way round). null: nothing wrong.
function pkCheck() {
  const pk = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  const mode = /^pk_(live|test)_\S+$/.exec(pk)?.[1];
  const why = !pk ? "no-key" : !mode ? "bad-key" : cardReady() && !key().includes(`_${mode}_`) ? "mode-mismatch" : null;
  return { pk, mode, why };
}

// The shop's own look at the card setup (op "card-setup"), without making a Stripe page: card
// payments on, the Cart's card form able to open inside fonkiart.com, and if not, why. Only
// these three answers: NEVER any part of a key (the answer goes to whoever asks).
export function cardSetup() {
  return { card: cardReady(), form: !!publishableKey(), why: pkCheck().why };
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
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe answered ${res.status}`, data?.error?.code || `http-${res.status}`, res.status);
  return data;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A payment page's id as Stripe makes them. Checked before it goes anywhere near a URL.
export const isSessionId = (id) => /^cs_(live|test)_[A-Za-z0-9]{10,250}$/.test(String(id || ""));

// Every payment page we make: one item, paid once, in dollars, by CARD ONLY. Cards only, so
// no slower method (a bank transfer) can come back "not paid yet" when the client returns.
// Apple Pay and Google Pay still show: Stripe counts them as cards.
// image: one picture shown beside the item (Stripe's product_data.images), or none.
function paymentPage({ cents, name, description, image, ...rest }) {
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name, description, images: image ? [image] : undefined } } }],
    ...rest,
  };
}

// The payment page for one invoice. Returns the address to send the client to.
// image: the artwork's picture (artworks.js cardPicture), or nothing. A picture never stops a
// payment: if Stripe refuses the page with it (a 400), the page is asked for again without it.
export async function createCheckout({ order, invNum, site, image }) {
  const cents = toCents(order.amount);
  if (cents < MIN_CENTS) throw new StripeError("This invoice is too small for a card payment", "too-small");
  const back = `${site}/?invoice=${encodeURIComponent(order.invoice_token)}`;
  const title = String(order.item_title || "Fonkiart artwork").slice(0, 200);
  const picture = typeof image === "string" && image.startsWith("https://") ? image : undefined;
  const page = (img) => paymentPage({
    cents, name: title, description: `Invoice ${invNum}`, image: img,
    customer_email: EMAIL_RE.test(order.client_email || "") ? order.client_email : undefined,
    client_reference_id: invNum,
    metadata: { invoice: invNum, invoice_token: order.invoice_token, order_id: order.id },
    // What Aliana sees on the payment in Stripe's own list.
    payment_intent_data: { description: `Fonkiart invoice ${invNum}: ${title}`, metadata: { invoice: invNum, order_id: order.id } },
    // Stripe swaps {CHECKOUT_SESSION_ID} for the real one when it sends the client back.
    success_url: `${back}&card={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  let session;
  try {
    session = await stripe("/checkout/sessions", page(picture));
  } catch (e) {
    if (!picture || !(e instanceof StripeError) || e.httpStatus !== 400) throw e;
    console.warn("stripe: Stripe refused the payment page with the picture; making it without:", e.code, e.message);
    session = await stripe("/checkout/sessions", page(undefined));
  }
  if (!session?.url) throw new StripeError("Stripe sent no payment page", "no-url");
  return session.url;
}

// The payment page for a Cart order (cartCheckout.js): one line per piece, each with its name,
// its picture and the price the SERVER found for it. The page carries the order's rows
// (metadata order_ids) and its reference (cart_ref), so the return and Stripe's own message
// find the order from Stripe's answer, never from the browser.
//  - embedded: the card form opens inside fonkiart.com (Stripe.js; ui_mode "embedded"), and
//    Stripe sends the buyer to return_url once paid. Returns { id, clientSecret }.
//  - otherwise Stripe's own page, reached by a same-tab redirect. Returns { id, url }.
// id: the page's own id, kept by the checkout so paying again re-opens THIS order (cart-again).
// lines: [{ title, amount, image }]. A picture never stops a payment: if Stripe refuses the
// page with pictures (a 400), it is asked for again without them.
export async function createCartCheckout({ ref, ids, lines, email, site, embedded }) {
  const cents = lines.map(l => toCents(l.amount));
  if (!lines.length || cents.some(c => c <= 0)) throw new StripeError("Every piece needs a price for a card payment", "no-price");
  if (cents.reduce((a, b) => a + b, 0) < MIN_CENTS) throw new StripeError("This order is too small for a card payment", "too-small");
  const back = `${site}/?cart=${encodeURIComponent(ref)}&card=`;
  const names = lines.map(l => String(l.title || "Fonkiart artwork").slice(0, 200));
  const tags = { cart_ref: ref, order_ids: ids.join(",") };
  const page = (withPictures) => ({
    mode: "payment",
    payment_method_types: ["card"], // as invoices: cards only, so nothing comes back "not paid yet"
    line_items: lines.map((l, n) => {
      const picture = withPictures && typeof l.image === "string" && l.image.startsWith("https://") ? [l.image] : undefined;
      return { quantity: 1, price_data: { currency: "usd", unit_amount: cents[n], product_data: { name: names[n], images: picture } } };
    }),
    customer_email: EMAIL_RE.test(email || "") ? email : undefined,
    client_reference_id: ref,
    metadata: tags,
    // What Aliana sees on the payment in Stripe's own list.
    payment_intent_data: { description: `Fonkiart order ${ref}: ${names.join(", ")}`.slice(0, 1000), metadata: tags },
    // Stripe swaps {CHECKOUT_SESSION_ID} for the real one when it sends the buyer back.
    ...(embedded
      ? { ui_mode: "embedded", return_url: `${back}{CHECKOUT_SESSION_ID}` }
      : { success_url: `${back}{CHECKOUT_SESSION_ID}`, cancel_url: `${back}cancelled` }),
  });
  let session;
  try {
    session = await stripe("/checkout/sessions", page(true));
  } catch (e) {
    if (!lines.some(l => l.image) || !(e instanceof StripeError) || e.httpStatus !== 400) throw e;
    console.warn("stripe: Stripe refused the Cart's payment page with the pictures; making it without:", e.code, e.message);
    session = await stripe("/checkout/sessions", page(false));
  }
  if (!isSessionId(session?.id)) throw new StripeError("Stripe sent no payment page", "no-id");
  if (embedded) {
    if (!session.client_secret) throw new StripeError("Stripe sent no card form", "no-client-secret");
    return { id: session.id, clientSecret: session.client_secret };
  }
  if (!session.url) throw new StripeError("Stripe sent no payment page", "no-url");
  return { id: session.id, url: session.url };
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

// Admin -> Settings -> Stripe: can this key take card payments?
//  - Quick (when the panel opens): a read. Proves Stripe accepts the key, NOT that it may
//    make payment pages.
//  - Deep ("Check again"): makes a real $0.50 payment page, the same kind an invoice makes,
//    and cancels it at once, so nobody can pay it and nothing is charged. Ready only if
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
