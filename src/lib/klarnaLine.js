// Klarna's "pay in 4" line under the price on a piece's page (Andy, 2026-11-21: "Yes, add it"),
// e.g. "or 4 interest-free payments of $300.00 with Klarna." It is Stripe's Payment Method
// Messaging Element: Stripe and Klarna write the words and the amount, and it shows nothing where
// Klarna doesn't take that price (about $35 to $2,000). src/components/KlarnaLine.jsx draws it in
// ArtworkModal, under the price and above ADD TO CART, on computer and phone.
//
// Asked for only once a piece's page opens, never on the home page or the shop grid: first the
// shop's PUBLIC key (server op "klarna-line", answered only while the card form can open), then
// Stripe.js, loaded the way the card form loads it (src/lib/stripeJs.js). No key, no Stripe.js, a
// Stripe.js that refuses, or a price Klarna doesn't take: NOTHING shows, no gap, no error, and the
// page and ADD TO CART work exactly as before. The key never goes in a log.
//
// No imports on purpose: the page hands in how to ask the server (storeCall) and how to load
// Stripe.js (stripeJsReady), so tests/klarnaLine.test.js runs this very file with stand-ins.

// What Stripe is asked to show: Klarna only, in dollars, for a buyer in the US, with Klarna's own
// pink badge (logoColor "color"; Stripe's default is a plain black logo).
export const KLARNA_LINE = { currency: "USD", paymentMethodTypes: ["klarna"], countryCode: "US", logoColor: "color" };

// The site's look inside Stripe's frame, which can't read the page's own CSS: DM Sans (from Google
// Fonts, as the page has it), the site's muted text colour (--muted in src/index.css; the test keeps
// the two the same), 17px like the page's text and nothing under 16px (Andy's floor), on white.
export const LINE_FONTS = [{ cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" }];
export const LINE_LOOK = {
  variables: {
    fontFamily: "DM Sans, sans-serif",
    colorText: "#9e7fa0",
    colorBackground: "#ffffff",
    fontSizeBase: "17px",
    fontSizeSm: "17px",
    fontSizeXs: "16px",
    fontSize2Xs: "16px",
    fontSize3Xs: "16px",
  },
};

// The price the piece's page shows, in cents: its sale price when it has one, else its price (as
// ArtworkModal shows it and the checkout counts it, CheckoutModal itemPrice). 0 when neither is an
// amount above zero ("Price on request"): no line.
export function priceCents(item) {
  const n = Number(item?.salePrice || item?.price || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// The server's answer, asked once per page load (the page always hands in the same storeCall): the
// key, or null when the card form isn't set up. A question that FAILS (no network, the server down)
// isn't kept, so the next piece opened asks again.
const asked = new WeakMap();
function shopKey(ask) {
  if (!asked.has(ask)) {
    asked.set(ask, Promise.resolve().then(() => ask("klarna-line")).then(
      (answer) => (typeof answer?.publishableKey === "string" && answer.publishableKey.trim()) || null,
      () => { asked.delete(ask); return null; },
    ));
  }
  return asked.get(ask);
}

// One Stripe.js instance for the page (Stripe's advice), made the first time a line needs it.
let made = null;
function stripeFor(key) {
  if (!made || made.key !== key || made.from !== window.Stripe) made = { key, from: window.Stripe, stripe: window.Stripe(key) };
  return made.stripe;
}

// Shows the line in box (an empty element under the price) for a price in cents.
// ask: how the page asks the server (storeCall); ready: how it loads Stripe.js (stripeJsReady).
// onRoom(true / false): whether the line should take room on the page now. True only while
// Klarna's words are there (box is exactly as tall as what Stripe draws in it, which is nothing
// for a price Klarna doesn't take), so the page leaves no gap where there is no line.
// Returns stop(): the line goes (the piece's page closed, or another price).
export function showKlarnaLine(box, cents, { ask, ready, onRoom = () => {} }) {
  let stopped = false, line = null, watch = null;
  const stop = () => {
    stopped = true;
    watch?.disconnect();
    try { line?.destroy(); } catch { /* gone already */ }
    line = watch = null;
    onRoom(false);
  };
  if (!box || !(cents > 0) || typeof ResizeObserver !== "function") return stop;
  (async () => {
    const key = await shopKey(ask);
    if (stopped || !key) return;
    if (!(await ready()) || stopped || typeof window.Stripe !== "function") return;
    const elements = stripeFor(key).elements({ fonts: LINE_FONTS, appearance: LINE_LOOK });
    line = elements.create("paymentMethodMessaging", { amount: cents, ...KLARNA_LINE });
    line.mount(box);
    watch = new ResizeObserver(() => { if (!stopped) onRoom(box.offsetHeight > 0); });
    watch.observe(box);
  })().catch((e) => {
    // Stripe.js refused (a key or an option it won't take): no line, and the page carries on. Only
    // the kind of error is logged, never its words, which could carry the key.
    const kind = /^[A-Za-z]{1,40}$/.test(String(e?.name)) ? e.name : "error";
    console.warn(`Klarna line: not shown (${kind})`);
    stop();
  });
  return stop;
}
