import { useState, useEffect } from "react";
import { adminAction } from "../lib/adminDb";

// Admin -> Settings -> Stripe (Andy, 2026-11-17: "why do i need to put a new link ? is it
// needed ?"). No link to paste any more: when a client taps "Pay by card", the website asks
// Stripe for a payment page with that invoice's exact amount. This box shows whether Stripe
// lets the shop's secret key do that, checked by the server with Stripe itself (cardCheck,
// api/_lib/stripe.js):
//  - when it opens: a quick read, which proves Stripe accepts the key;
//  - "Check again" (deep): the full check. It makes a real $0.50 payment page on Stripe's own
//    site, cards only (NOT the card form the Cart and invoices open inside fonkiart.com), and
//    cancels it at once (nobody can pay it, nothing is charged), which proves the key may make
//    payment pages. If Stripe says no, its own message is shown: it names what the key is missing.
//  Neither looks at the publishable key the card form also needs (store op "card-setup" does).
export default function CardStatus() {
  const [status, setStatus] = useState(null); // null = checking
  const [round, setRound] = useState(0);      // 0 = the quick check on open; 1+ = "Check again"
  useEffect(() => {
    let live = true;
    adminAction("card-check", round ? { deep: true } : {})
      .then(r => live && setStatus(r), e => live && setStatus({ ready: false, reason: e.message }));
    return () => { live = false; };
  }, [round]);
  const again = () => { setStatus(null); setRound(n => n + 1); };

  return (
    <div className="card-status">
      {!status ? (
        <p className="card-status-line">{round ? "Making a test payment page with Stripe…" : "Checking with Stripe…"}</p>
      ) : status.ready ? (
        <>
          <p className="card-status-line is-on">✓ Card payments are ON{status.live ? "" : " (test mode, no real money)"}</p>
          <p className="card-status-help">{status.deep
            ? "Full check passed: Stripe made a $0.50 test payment page and cancelled it at once. Nothing was charged."
            : "Stripe accepts the key. Tap Check again for the full check: it makes a $0.50 test payment page and cancels it at once."}</p>
          <p className="card-status-help">Each invoice charges its exact amount. Nothing to paste. Tick 💳 Credit Card when you send an invoice.</p>
        </>
      ) : (
        <>
          <p className="card-status-line is-off">✗ Card payments are OFF</p>
          <p className="card-status-help">{status.reason}</p>
        </>
      )}
      <button type="button" className="btn-s" onClick={again} disabled={!status}
        title="Makes a $0.50 test payment page with Stripe and cancels it at once. Nothing is charged.">Check again</button>
    </div>
  );
}
