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
// the browser sends is trusted on its own.
//
// Needs STRIPE_SECRET_KEY in Vercel (a restricted key with "Checkout Sessions: Write" is
// enough). NEVER in git: this repo is public. No key = no card option; nothing else breaks.

const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20"; // pinned: a change in Stripe's default can't change what we send
export const MIN_CENTS = 50;  // Stripe's smallest US card charge

export class StripeError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const key = () => String(process.env.STRIPE_SECRET_KEY || "").trim();
export const cardReady = () => /^(sk|rk)_(live|test)_\S+$/.test(key());

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
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Stripe-Version": VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? formBody(body).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe answered ${res.status}`, data?.error?.code || `http-${res.status}`);
  return data;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The payment page for one invoice. Returns the address to send the client to.
export async function createCheckout({ order, invNum, site }) {
  const cents = toCents(order.amount);
  if (cents < MIN_CENTS) throw new StripeError("This invoice is too small for a card payment", "too-small");
  const back = `${site}/?invoice=${encodeURIComponent(order.invoice_token)}`;
  const title = String(order.item_title || "Fonkiart artwork").slice(0, 200);
  const session = await stripe("/checkout/sessions", {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: title, description: `Invoice ${invNum}` } } }],
    customer_email: EMAIL_RE.test(order.client_email || "") ? order.client_email : undefined,
    client_reference_id: invNum,
    metadata: { invoice: invNum, invoice_token: order.invoice_token, order_id: order.id },
    // What Aliana sees on the payment in Stripe's own list.
    payment_intent_data: { description: `Fonkiart invoice ${invNum}: ${title}`, metadata: { invoice: invNum, order_id: order.id } },
    // Stripe swaps {CHECKOUT_SESSION_ID} for the real one when it sends the client back.
    success_url: `${back}&card={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  if (!session?.url) throw new StripeError("Stripe sent no payment page", "no-url");
  return session.url;
}

// Was this payment page really paid, for this invoice and this exact amount?
export async function checkoutPaidFor({ sessionId, order }) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,250}$/.test(String(sessionId || ""))) return false;
  const s = await stripe(`/checkout/sessions/${sessionId}`);
  return s.payment_status === "paid"
    && s.metadata?.invoice_token === order.invoice_token
    && s.amount_total === toCents(order.amount)
    && String(s.currency).toLowerCase() === "usd";
}

// Admin -> Settings -> Stripe: is the key there, and does Stripe accept it? (A read only.)
export async function cardCheck() {
  if (!cardReady()) return { ready: false, reason: "No Stripe key in Vercel yet (STRIPE_SECRET_KEY)." };
  try {
    await stripe("/checkout/sessions?limit=1");
    return { ready: true, live: key().includes("_live_") };
  } catch (e) {
    return { ready: false, reason: `Stripe refused the key: ${e.message}` };
  }
}
