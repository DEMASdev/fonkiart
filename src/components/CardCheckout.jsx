import { useState, useEffect, useEffectEvent } from "react";
import PayArt from "./PayArt";

// Stripe allows one card form on a page at a time, so each one starts only after the one before
// it has gone (the panel closed and opened again, or React's development double start).
const forms = { turn: Promise.resolve() };

// The card payment INSIDE fonkiart.com, for the Cart (CheckoutModal) and for an invoice
// (InvoicePage) (Andy: "can it be imbedded inside fonkiart instead of sending the customer
// away ?"), as the last step of buying a work of art: the pieces first
// (PayArt), then Stripe's own card form (Embedded Checkout, mounted with Stripe.js from
// js.stripe.com, src/lib/stripeJs.js). Paid by card, the buyer STAYS here (Andy: "i don't want to be
// making the user jump to stripe then back"): Stripe.js says so (onComplete), the form goes, and
// the checkout asks the server whether the payment is in, then shows the thank-you right here.
// 3-D Secure, when a bank asks for it, opens inside Stripe's own form, not on another page.
// The form also offers Klarna (Andy, 2026-11-20), the one way to pay that leaves: Klarna's own
// site, which brings the buyer back to the page's way back (api/_lib/stripe.js waysToPay: the
// Cart's ?cart=...&card=..., CardReturnPage; an invoice's ?invoice=...&card=..., InvoicePage).
// pay: the server's answer (cart-card / cart-again, or an invoice's card-checkout):
// { ref, session, lines, total, clientSecret, publishableKey }. noun: what pay.ref names, "order"
// (the Cart: its order is saved) or "invoice"; totalLabel: the line above the total.
// Leaving the panel (onBack, or the checkout closing) DESTROYS the form, so it opens clean again.
// onFail: the form couldn't open here; the checkout says so calmly, with Try Again and another
// way to pay (never Stripe's own page).
// onComplete(pay): paid in the form. check: what the checkout has heard since: "checking",
// "unpaid" or "error" (each of the last two with Check Again, which asks again).
export default function CardCheckout({ pay, artworks, onBack, onFail, onComplete, check, noun = "order", totalLabel = "Total" }) {
  const [box, setBox] = useState(null); // the element the form goes into, once it is on the page
  const [ready, setReady] = useState(false);
  const failed = useEffectEvent((error) => onFail?.(error));
  const completed = useEffectEvent(() => onComplete?.(pay));
  // The form lives while its box is on the page and nothing is paid yet. Paid, it is destroyed,
  // as Stripe asks once a page is complete.
  const paid = !!check;
  useEffect(() => {
    if (!box || paid) return undefined;
    let gone = false, form = null;
    const mine = forms.turn.then(async () => {
      if (gone) return;
      if (typeof window.Stripe !== "function") throw new Error("Stripe.js is not loaded");
      const made = await window.Stripe(pay.publishableKey).initEmbeddedCheckout({
        fetchClientSecret: async () => pay.clientSecret,
        onComplete: () => { if (!gone) completed(); },
      });
      if (gone) { made.destroy(); return; }
      form = made;
      made.mount(box);
      setReady(true);
    });
    forms.turn = mine.catch(() => {});
    mine.catch((error) => { console.warn("Card form:", error); if (!gone) failed(error); });
    return () => { gone = true; form?.destroy(); };
  }, [box, paid, pay.clientSecret, pay.publishableKey]);

  // Paid in the form: the form leaves the page, and so does the way back, since there is
  // nothing left to choose.
  return (
    <div className="pay-card">
      {!paid && <button type="button" className="tap pay-card-back" onClick={onBack}>← Choose another way to pay</button>}
      <p className="pay-card-label">Your {noun} <span className="pay-card-ref">{pay.ref}</span></p>
      <PayArt lines={pay.lines} total={pay.total} artworks={artworks} totalLabel={totalLabel} />
      {!paid && (
        <>
          {!ready && <p className="pay-card-wait" role="status">Opening the secure card form…</p>}
          <div ref={setBox} className="pay-card-form" />
          <p className="pay-card-note">Your card is handled by Stripe, in this secure form. Fonkiart never sees your card number.</p>
        </>
      )}
      {check === "checking" && <p className="pay-card-wait" role="status">Confirming your payment…</p>}
      {(check === "unpaid" || check === "error") && (
        <>
          <p className="pay-calm" role="status">
            {check === "unpaid"
              ? "We haven't received this payment yet. Please give it a moment, then check again."
              : "We couldn't check your payment right now. Please check again in a moment."}
            {noun === "order" && <>{" "}Your order <strong>{pay.ref}</strong> is saved.</>}
          </p>
          <button type="button" className="tap confirm-btn" onClick={() => onComplete?.(pay)}>Check Again</button>
        </>
      )}
    </div>
  );
}
