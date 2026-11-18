// Stripe.js, loaded the way Stripe requires: a <script> from https://js.stripe.com/v3/, never
// bundled, copied or installed from npm. Only once a buyer chooses to pay by card
// (CheckoutModal). Resolves true once window.Stripe is there, false if it can't load in time (a
// blocker, no network): the Cart then sends the buyer to Stripe's own page instead of opening
// the card form inside fonkiart.com.
const SRC = "https://js.stripe.com/v3/";
let loading = null;

export function stripeJsReady(waitMs = 6000) {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (typeof window.Stripe === "function") return Promise.resolve(true);
  if (!loading) {
    loading = new Promise((resolve) => {
      const tag = document.createElement("script");
      tag.src = SRC;
      tag.async = true;
      tag.onload = () => resolve(typeof window.Stripe === "function");
      tag.onerror = () => { tag.remove(); loading = null; resolve(false); }; // the next card tap tries again
      document.head.appendChild(tag);
    });
  }
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(typeof window.Stripe === "function"), waitMs); });
  return Promise.race([loading, late]).finally(() => clearTimeout(timer));
}
