import { useState } from "react";
import { supabase } from "../lib/supabase";
import { generateCouponCode, sendEmail } from "../utils/helpers";

export default function WelcomeModal({ onClose, discount = 15, artworks = [] }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [returning, setReturning] = useState(false);
  const [alreadyUsed, setAlreadyUsed] = useState(false);

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) { setErr("Please enter a valid email."); return; }
    setLoading(true);
    try {
      let code = generateCouponCode();
      let isReturning = false;
      let isUsed = false;
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("coupon_code,coupon_used").eq("email", email.toLowerCase()).maybeSingle();
        if (existing) {
          code = existing.coupon_code;
          isReturning = true;
          isUsed = !!existing.coupon_used;
        } else {
          const { error: dbErr } = await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "welcome-popup", coupon_code: code, coupon_used: false }]);
          if (dbErr) { console.error("Supabase error:", dbErr); setErr("DB: " + dbErr.message); setLoading(false); return; }
        }
      }
      setGeneratedCode(code);
      setReturning(isReturning);
      setAlreadyUsed(isUsed);
      if (!isReturning) {
        await sendEmail({
          to: email,
          subject: `Your ${discount}% Welcome Coupon — Fonkiart`,
          htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:28px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Welcome to Fonkiart</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">Thank you for joining. Here is your exclusive welcome coupon:</p><div style="background:#fff;border:2px dashed #c9a96e;padding:20px 24px;text-align:center;margin-bottom:24px;"><div style="font-size:28px;font-weight:600;letter-spacing:2px;color:#1c1a18;">${code}</div><div style="font-size:13px;color:#7a6f63;margin-top:6px;">${discount}% off your first purchase</div></div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Enter this code at checkout. Valid on original art and prints. One use per customer.</p><p style="color:#7a6f63;font-size:13px;">— Fonkiart</p></div>`,
        });
      }
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
        <button className="welcome-close-x" onClick={onClose}>✕</button>
        <div className="welcome-gallery">
          {Array.from({ length: 3 }).map((_, i) => {
            const art = previewImgs[i];
            return (
              <div key={i} className="wg-item">
                {art ? <img src={art.image} alt={art.title} /> : <div style={{ background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)",width:"100%",height:"100%" }} />}
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
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  style={{ width:"100%", border:"1px solid var(--border)", padding:"11px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:16, outline:"none", marginBottom:8 }} />
                {err && <p style={{ color:"#c0392b", fontSize:14, marginBottom:6 }}>{err}</p>}
                <button className="btn-p" style={{ width:"100%", background:"var(--gold)", marginBottom:10, padding:"14px", fontSize:15 }} onClick={handleSubmit} disabled={loading}>
                  {loading ? "Sending…" : "Get My Coupon →"}
                </button>
                <p style={{ fontSize:13, color:"var(--muted)", textAlign:"center" }}>No spam. Unsubscribe anytime.</p>
              </>
            ) : (
              <>
                {alreadyUsed ? (
                  <>
                    <p>Your welcome coupon has already been redeemed — thank you for your purchase!</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15, marginTop:8 }} onClick={onClose}>Browse the Collection</button>
                  </>
                ) : (
                  <>
                    <p>{returning ? "Welcome back! Your coupon is still waiting for you:" : "Check your inbox! Your unique coupon is also right here:"}</p>
                    <div className="coupon-box">
                      <span className="coupon-code">{generatedCode}</span>
                      <button className="coupon-copy" onClick={copy}>{copied ? "✓ Copied!" : "Copy"}</button>
                    </div>
                    <p style={{ fontSize:15, color:"var(--muted)", marginBottom:10 }}>One use only · {discount}% off · tied to your email.</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15 }} onClick={onClose}>Browse the Collection</button>
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
