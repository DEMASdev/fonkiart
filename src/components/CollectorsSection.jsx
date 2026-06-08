import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function CollectorsSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleJoin = async () => {
    if (!email || !email.includes("@")) { setErr("Enter a valid email."); return; }
    setLoading(true);
    try {
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("id").eq("email", email.toLowerCase()).maybeSingle();
        if (!existing) {
          await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "collectors-section", coupon_code: null, coupon_used: false }]);
        }
      }
    } catch(e) { console.warn("Collectors signup:", e); }
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="collectors-section">
      <div>
        <div className="collectors-badge">Collectors Club</div>
        <h2 className="collectors-title">Join the mailing list.<br />Get the key to the collection.</h2>
        <p className="collectors-sub">Become a Fonkiart Collector — get first access to new works, private sales, and exclusive buying access. No spam, ever.</p>
      </div>
      <div className="collectors-form">
        {submitted ? (
          <div style={{ background:"#fff", border:"2px solid var(--label)", padding:"24px", textAlign:"center" }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>Welcome to the Club</div>
            <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>You're on the list. We'll be in touch with exclusive access.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:13, color:"var(--ink)", opacity:.7, lineHeight:1.6 }}>Enter your email to join. Free, instant access.</p>
            <input className="collectors-input" type="email" placeholder="your@email.com" value={email}
              onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && handleJoin()} />
            {err && <p style={{ fontSize:12, color:"#c0392b", marginTop:-4 }}>{err}</p>}
            <button className="collectors-submit" onClick={handleJoin} disabled={loading}>
              {loading ? "Joining…" : "Join the Collectors Club →"}
            </button>
            <p style={{ fontSize:11, color:"var(--ink)", opacity:.45, letterSpacing:".08em" }}>No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}
