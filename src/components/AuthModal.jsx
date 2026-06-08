import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthModal({ user, onClose, artworks = [] }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sendOtp = async () => {
    if (!email || !email.includes("@")) { setErr("Enter a valid email."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) { setErr(error.message); setLoading(false); return; }
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("id").eq("email", email.toLowerCase()).maybeSingle();
        if (!existing) {
          await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "collectors-request", coupon_code: null, coupon_used: false }]);
        }
      }
      setSent(true);
    } catch(e) { setErr("Could not send link."); }
    setLoading(false);
  };

  const logout = async () => { await supabase.auth.signOut(); onClose(); };
  const previewImgs = artworks.filter(a => a.image && !a.isSold).slice(0, 3);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
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
          <div style={{ display:"flex", justifyContent:"flex-end", padding:"6px 10px 0" }}>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:"50%", background:"rgba(0,0,0,.12)", border:"none", cursor:"pointer", color:"var(--ink)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
          <div className="welcome-top" style={{ padding:"14px 20px 12px" }}>
            <div className="welcome-top-text" style={{ width:"100%" }}>
              <div className="welcome-top-title" style={{ fontSize:"clamp(32px,4vw,52px)" }}>Exclusive Collectors<br />Login Form</div>
              <div className="welcome-top-sub" style={{ fontSize:22, marginTop:6, lineHeight:1.4 }}>Private Collectors Showroom<br />Request Secure Access Now</div>
            </div>
          </div>
          <div className="welcome-body" style={{ padding:"14px 22px 18px" }}>
            {user ? (
              <>
                <div className="ok-msg" style={{ marginBottom:16 }}>✓ Signed in as {user.email}</div>
                <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.7, marginBottom:20 }}>You have full collector access. Enjoy exclusive first looks at new works and private sales.</p>
                <button className="btn-p" style={{ width:"100%" }} onClick={logout}>Sign Out</button>
              </>
            ) : !sent ? (
              <>
                <p style={{ fontSize:15 }}>Enter your email and we'll send a secure sign-in link. No password needed.</p>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && sendOtp()}
                  style={{ width:"100%", border:"1px solid var(--border)", padding:"11px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:15, outline:"none", marginBottom:8 }} />
                {err && <p style={{ color:"#c0392b", fontSize:13, marginBottom:6 }}>{err}</p>}
                <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)", marginBottom:10, padding:"14px", fontSize:15 }} onClick={sendOtp} disabled={loading}>
                  {loading ? "Sending…" : "Send Request →"}
                </button>
              </>
            ) : (
              <>
                <div className="ok-msg" style={{ marginBottom:16 }}>✓ Request sent!</div>
                <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.7 }}>We sent a secure access link to <strong>{email}</strong>. Click the link in your email to enter the Private Collectors Showroom.</p>
                <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15, marginTop:12 }} onClick={onClose}>Close</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
