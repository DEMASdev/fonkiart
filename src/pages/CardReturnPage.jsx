import { useState, useEffect, useEffectEvent } from "react";
import { storeCall } from "../lib/store";
import PaidThanks from "../components/PaidThanks";

// Back on fonkiart.com after paying a Cart order away from it: with Klarna, on Klarna's own site,
// or on Stripe's own page from before the card form (?cart=FA-...&card=cs_..., App.jsx). A card
// paid in the form never comes here: it is heard in the form (CardCheckout.jsx, onComplete).
// The server asks Stripe itself whether that payment page was paid ("cart-paid",
// api/_lib/cartCheckout.js). Only once it says paid do those pieces leave the cart (onPaid) and
// the thank-you show (src/components/PaidThanks.jsx). Until then the cart stays exactly as it was.
export default function CardReturnPage({ orderRef, session, artworks = [], onPaid, setPage }) {
  const [state, setState] = useState("checking"); // checking · paid · unpaid · missing · error
  const [view, setView] = useState(null);
  const [round, setRound] = useState(0); // "Check Again"
  const paid = useEffectEvent((order) => onPaid?.(order.lines.map(l => l.title)));
  useEffect(() => {
    let gone = false;
    storeCall("cart-paid", { ref: orderRef, session })
      .then((order) => {
        if (gone) return;
        setView(order);
        if (order.paid) paid(order);
        setState(order.paid ? "paid" : "unpaid");
      })
      .catch((e) => { console.warn("Card check:", e); if (!gone) setState(e.status === 404 ? "missing" : "error"); });
    return () => { gone = true; };
  }, [orderRef, session, round]);

  const checkAgain = () => { setState("checking"); setRound(n => n + 1); };
  const toCart = <button type="button" className="tap btn-s pay-return-btn" onClick={() => setPage("cart")}>Back to My Cart</button>;
  if (state === "paid" && view) return (
    <div className="inv-embed pay-return">
      <PaidThanks view={view} artworks={artworks}
        action={<button type="button" className="tap confirm-btn pay-return-go" onClick={() => setPage("catalog")}>Continue Shopping →</button>} />
    </div>
  );
  return (
    <div className="inv-embed pay-return">
      <div className="invoice-card">
        <div className="invoice-header">
          <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        </div>

        {state === "checking" && <p className="pay-return-wait" role="status">Checking your payment…</p>}

        {state === "unpaid" && (
          <>
            <p className="pay-return-title">We haven&apos;t received this payment yet</p>
            <p className="pay-return-text">If you just paid, give it a moment and check again. Your order <strong>{orderRef}</strong> is saved, and your cart is just as you left it.</p>
            <div className="pay-return-actions">
              <button type="button" className="tap confirm-btn pay-return-btn" onClick={checkAgain}>Check Again</button>
              {toCart}
            </div>
          </>
        )}

        {state === "missing" && (
          <>
            <p className="pay-return-title">We couldn&apos;t find this payment</p>
            <p className="pay-return-text">Your cart is just as you left it. If you did pay, please contact Fonkiart with your order number, <strong>{orderRef}</strong>.</p>
            <div className="pay-return-actions">{toCart}</div>
          </>
        )}

        {state === "error" && (
          <>
            <p className="pay-return-title">We couldn&apos;t check your payment right now</p>
            <p className="pay-return-text">Please check again in a moment. Your order <strong>{orderRef}</strong> is saved, and your cart is just as you left it.</p>
            <div className="pay-return-actions">
              <button type="button" className="tap confirm-btn pay-return-btn" onClick={checkAgain}>Check Again</button>
              {toCart}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
