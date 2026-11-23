import { useEffect, useRef, useState } from "react";
import { storeCall } from "../lib/store";
import { remember } from "../lib/cartMemory";
import Pic from "./Pic";
import "../cartBox.css";

// The 5-minute box (Andy, 2026-11-22: "ask the customer ... after X amount of time for a fabulous
// discount then we know who the person is"). Shown once a visit by CartMemory.jsx to someone not
// known yet, never during checkout. It gives the welcome gift: the same code, the same % and the
// same email as the welcome window (the store action "welcome"), whose email also carries "Verify
// my email". The email is remembered AT ONCE (src/lib/cartMemory.js). It says plainly that the code
// is sent, and, only while cart saving is on (saving: the store action "cart-saving"), that the
// pieces are remembered with the email; only then is the cart saved with it. Closed with the X,
// "No thanks", Escape or a tap outside it. The pieces are shown whole.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOWN = 4; // pieces shown; any more are counted

export default function CartEmailBox({ cart, percent, saving, onClose }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // { code, returning, used }
  const box = useRef(null);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { setErr("Please enter a valid email."); return; }
    setErr("");
    setSending(true);
    try {
      const r = await storeCall("welcome", { email: v });
      remember(v, { told: saving }); // told: the words above said the pieces are remembered
      setDone({ code: r.code, returning: !!r.returning, used: !!r.used });
    } catch {
      setErr("That didn't go through. Please try again.");
    }
    setSending(false);
  };

  const pieces = cart.slice(0, SHOWN);
  const more = cart.length - pieces.length;

  return (
    <div className="cart-box-bg" onClick={onClose}>
      <div ref={box} className="cart-box" role="dialog" aria-modal="true" aria-labelledby="cart-box-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cart-box-x" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <h2 id="cart-box-title" className="cart-box-title">
          {!done ? <>Leave your email and get <span className="cart-box-pct">{percent}%</span> off these pieces</>
            : done.used ? "Thank you for coming back" : done.returning ? "Welcome back" : "Your code is on its way"}
        </h2>
        <div className="cart-box-pieces">
          {pieces.map((p) => (
            <div key={p.id} className="cart-box-piece">
              {p.image ? <Pic src={p.image} w={240} alt={p.title || ""} /> : null}
            </div>
          ))}
          {more > 0 && <div className="cart-box-piece cart-box-more">+{more} more</div>}
        </div>

        {!done ? (
          <form onSubmit={send} noValidate>
            <p className="cart-box-text">We&apos;ll send your code to this email{saving && ", and remember the pieces in your cart with it"}.</p>
            <input className="cart-box-input" type="email" autoComplete="email" inputMode="email" aria-label="Your email"
              placeholder="your@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
              aria-invalid={err ? true : undefined} aria-describedby={err ? "cart-box-err" : undefined} />
            {err && <p id="cart-box-err" className="cart-box-err" role="alert">{err}</p>}
            <button type="submit" className="cart-box-send" disabled={sending}>{sending ? "Sending…" : "Send my code →"}</button>
            <button type="button" className="cart-box-later" onClick={onClose}>No thanks</button>
          </form>
        ) : <BoxSent done={done} saving={saving} onClose={onClose} />}
      </div>
    </div>
  );
}

// After sending: the code (or that it was used), "Verify my email" for someone new, and, only
// while cart saving is on, that the pieces are saved with the email.
export function BoxSent({ done, saving, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(done.code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  return (
    <div role="status">
      {done.used ? (
        <p className="cart-box-text">Your welcome code has already been used.</p>
      ) : (
        <>
          {done.returning && <p className="cart-box-text">Your welcome code is still waiting for you:</p>}
          <div className="cart-box-code">
            <span className="cart-box-code-text">{done.code}</span>
            <button type="button" className="cart-box-copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          {!done.returning && <p className="cart-box-text">We sent it to your email, with a &ldquo;Verify my email&rdquo; button that signs you in. No password needed.</p>}
        </>
      )}
      {saving && <p className="cart-box-text">Your pieces are saved with your email.</p>}
      <button type="button" className="cart-box-send" onClick={onClose}>Keep shopping</button>
    </div>
  );
}
