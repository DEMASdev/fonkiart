import { useState } from "react";
import { storeCall } from "../lib/store";

// Where "Unsubscribe" in a coupon email leads (Andy, 2026-11-23, "1bc yes"): one button, no sign-in.
// Opening it changes nothing (mail programs open links by themselves): only the button does (the store
// action "unsubscribe", api/_lib/unsubscribe.js). It says what stops and what still comes.
export default function UnsubscribePage({ token, setPage }) {
  const [state, setState] = useState("ask"); // ask · sending · done · bad (not a link of ours) · error

  const stop = async () => {
    setState("sending");
    try {
      await storeCall("unsubscribe", { token });
      setState("done");
    } catch (e) {
      console.warn("Unsubscribe:", e?.message || e);
      setState(e?.status === 404 ? "bad" : "error");
    }
  };

  const title = state === "done" ? "You're unsubscribed" : state === "bad" ? "This link didn't work" : "Stop coupon emails?";
  const text = state === "done" ? "We won't send you coupons again. Emails about your orders will still come."
    : state === "bad" ? "Please write to us and we'll stop the coupons for you."
    : "Tap the button and we won't send you coupons again. Emails about your orders will still come.";
  return (
    <div className="inv-embed pay-return unsub">
      <div className="invoice-card">
        <div className="invoice-header">
          <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        </div>
        <div role="status">
          <h1 className="pay-return-title">{title}</h1>
          <p className="pay-return-text">{text}</p>
          {state === "error" && <p className="pay-return-text unsub-err">That didn&apos;t go through. Please try again.</p>}
        </div>
        <div className="pay-return-actions">
          {state === "done" ? <button type="button" className="tap confirm-btn pay-return-btn" onClick={() => setPage("catalog")}>Back to the shop</button>
            : state === "bad" ? <button type="button" className="tap confirm-btn pay-return-btn" onClick={() => setPage("contact")}>Write to us</button>
            : <button type="button" className="tap confirm-btn pay-return-btn" onClick={stop} disabled={state === "sending"}>{state === "sending" ? "One moment…" : "Unsubscribe"}</button>}
        </div>
      </div>
    </div>
  );
}
