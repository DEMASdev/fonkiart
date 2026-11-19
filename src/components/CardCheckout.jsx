import { useState, useEffect, useEffectEvent } from "react";
import PayArt from "./PayArt";

// Stripe allows one card form on a page at a time, so each one starts only after the one before
// it has gone (the panel closed and opened again, or React's development double start).
const forms = { turn: Promise.resolve() };

// The Cart's card payment INSIDE fonkiart.com (Andy: "can it be imbedded inside fonkiart instead
// of sending the customer away ?"), as the last step of buying a work of art: the pieces first
// (PayArt), then Stripe's own card form (Embedded Checkout, mounted with Stripe.js from
// js.stripe.com, src/lib/stripeJs.js). Once paid, Stripe brings the buyer back to fonkiart.com,
// where the server checks the payment (src/pages/CardReturnPage.jsx).
// pay: the server's answer (cart-card / cart-again): { ref, lines, total, clientSecret, publishableKey }.
// Leaving the panel (onBack, or the checkout closing) DESTROYS the form, so it opens clean again.
// onFail: the form couldn't open here; the checkout says so calmly, with Try Again and another
// way to pay (never Stripe's own page).
export default function CardCheckout({ pay, artworks, onBack, onFail }) {
  const [box, setBox] = useState(null); // the element the form goes into, once it is on the page
  const [ready, setReady] = useState(false);
  const failed = useEffectEvent((error) => onFail?.(error));
  useEffect(() => {
    if (!box) return undefined;
    let gone = false, form = null;
    const mine = forms.turn.then(async () => {
      if (gone) return;
      if (typeof window.Stripe !== "function") throw new Error("Stripe.js is not loaded");
      const made = await window.Stripe(pay.publishableKey).initEmbeddedCheckout({ fetchClientSecret: async () => pay.clientSecret });
      if (gone) { made.destroy(); return; }
      form = made;
      made.mount(box);
      setReady(true);
    });
    forms.turn = mine.catch(() => {});
    mine.catch((error) => { console.warn("Card form:", error); if (!gone) failed(error); });
    return () => { gone = true; form?.destroy(); };
  }, [box, pay.clientSecret, pay.publishableKey]);

  return (
    <div className="pay-card">
      <button type="button" className="tap pay-card-back" onClick={onBack}>← Choose another way to pay</button>
      <p className="pay-card-label">Your order <span className="pay-card-ref">{pay.ref}</span></p>
      <PayArt lines={pay.lines} total={pay.total} artworks={artworks} />
      {!ready && <p className="pay-card-wait" role="status">Opening the secure card form…</p>}
      <div ref={setBox} className="pay-card-form" />
      <p className="pay-card-note">Your card is handled by Stripe, in this secure form. Fonkiart never sees your card number.</p>
    </div>
  );
}
