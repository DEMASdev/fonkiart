import { useState, useEffect } from "react";
import { adminAction } from "../lib/adminDb";

// Admin -> Settings -> Stripe (Andy, 2026-11-17: "why do i need to put a new link ? is it
// needed ?"). No link to paste any more: when a client taps "Pay by card", the website asks
// Stripe for a payment page with that invoice's exact amount. This box only shows whether
// that is working: the server checks the Stripe key with Stripe itself (a read, no charge).
export default function CardStatus() {
  const [status, setStatus] = useState(null); // null = checking
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    adminAction("card-check")
      .then(r => live && setStatus(r), e => live && setStatus({ ready: false, reason: e.message }));
    return () => { live = false; };
  }, [round]);
  const again = () => { setStatus(null); setRound(n => n + 1); };

  return (
    <div className="card-status">
      {!status ? (
        <p className="card-status-line">Checking with Stripe…</p>
      ) : status.ready ? (
        <>
          <p className="card-status-line is-on">✓ Card payments are ON{status.live ? "" : " (test mode, no real money)"}</p>
          <p className="card-status-help">Each invoice charges its exact amount. Nothing to paste. Tick 💳 Credit Card when you send an invoice.</p>
        </>
      ) : (
        <>
          <p className="card-status-line is-off">✗ Card payments are OFF</p>
          <p className="card-status-help">{status.reason}</p>
        </>
      )}
      <button type="button" className="btn-s" onClick={again} disabled={!status}>Check again</button>
    </div>
  );
}
