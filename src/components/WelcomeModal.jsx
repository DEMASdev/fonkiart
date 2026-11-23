import { useState } from "react";
import { storeCall } from "../lib/store";
import { remember } from "../lib/cartMemory";
import { ownSizes, sizesWords } from "../lib/couponSize";
import Pic from "./Pic";

// saving: whether cart saving is on (App.jsx). Only then does the small print say the cart is
// remembered, and only then is the email told so (src/lib/cartMemory.js remember).
export default function WelcomeModal({ onClose, discount = 15, artworks = [], saving = false }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [returning, setReturning] = useState(false);
  const [alreadyUsed, setAlreadyUsed] = useState(false);
  const [sizes, setSizes] = useState([]); // what their own code gives, when that is not the shop's % (src/lib/couponSize.js)

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) { setErr("Please enter a valid email."); return; }
    setLoading(true);
    try {
      const r = await storeCall("welcome", { email });
      remember(email, { told: saving }); // the cart is saved with it when the small print said so (src/lib/cartMemory.js)
      setGeneratedCode(r.code);
      setReturning(!!r.returning);
      setAlreadyUsed(!!r.used);
      setSizes(ownSizes(r.sizes));
    } catch(e) { console.error("Error:", e); setErr("Error: " + e.message); setLoading(false); return; }
    setLoading(false);
    setSubmitted(true);
  };

  const copy = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const previewImgs = artworks.filter(a => a.image && !a.isSold).slice(0, 3);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
        <button className="welcome-close-x" aria-label="Close" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <div className="welcome-gallery">
          {Array.from({ length: 3 }).map((_, i) => {
            const art = previewImgs[i];
            return (
              <div key={i} className="wg-item">
                {art ? <Pic src={art.image} w={640} alt={art.title} /> : <div style={{ background:"linear-gradient(135deg,#eeeeee,#dddddd)",width:"100%",height:"100%" }} />}
              </div>
            );
          })}
        </div>
        <div className="welcome-form-side">
          <div className="welcome-top">
            <div className="welcome-pct-wrap">
              <div className="welcome-pct">{discount}%</div>
              <div className="welcome-pct-off">OFF</div>
            </div>
            <div className="welcome-top-text">
              <div className="welcome-top-title">Your Welcome Gift</div>
              <div className="welcome-top-sub">Exclusive discount on your first original piece from Fonkiart.</div>
            </div>
          </div>
          <div className="welcome-body">
            {!submitted ? (
              <>
                <p>Enter your email and we'll send your unique coupon instantly.</p>
                <input type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  style={{ width:"100%", border:"1px solid var(--border)", padding:"11px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:16, outline:"none", marginBottom:8 }} />
                {err && <p style={{ color:"#c0392b", fontSize:16, marginBottom:6 }}>{err}</p>}
                <button className="btn-p" style={{ width:"100%", background:"var(--gold)", marginBottom:10, padding:"14px", fontSize:16 }} onClick={handleSubmit} disabled={loading}>
                  {loading ? "Sending…" : "Get My Coupon →"}
                </button>
                <p style={{ fontSize:16, color:"var(--muted)", textAlign:"center" }}>No spam. Unsubscribe anytime.{saving ? " We'll remember your cart with your email." : ""}</p>
              </>
            ) : (
              <>
                {alreadyUsed ? (
                  <>
                    <p>Your welcome coupon has already been redeemed — thank you for your purchase!</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:16, marginTop:8 }} onClick={onClose}>Browse the Collection</button>
                  </>
                ) : (
                  <>
                    <p>{returning ? "Welcome back! Your coupon is still waiting for you:" : "Check your inbox! Your unique coupon is also right here:"}</p>
                    <div className="coupon-box">
                      <span className="coupon-code">{generatedCode}</span>
                      <button className="coupon-copy" onClick={copy}>{copied ? "✓ Copied!" : "Copy"}</button>
                    </div>
                    <p style={{ fontSize:16, color:"var(--muted)", marginBottom:10 }}>One use only · {sizes.length ? sizesWords(sizes, { upTo: true }) : `${discount}% off`} · tied to your email.</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:16 }} onClick={onClose}>Browse the Collection</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
