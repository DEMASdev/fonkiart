import { useRef, useState } from "react";
import { storeCall } from "../lib/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // as the server's own check

export default function CollectorsSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const going = useRef(false); // Enter pressed again while it is on its way is still one
  const handleJoin = async () => {
    if (going.current) return;
    if (!EMAIL_RE.test(email.trim())) { setErr("Enter a valid email."); return; }
    going.current = true;
    setLoading(true);
    setErr("");
    // "You're on the list" only once they are. If not, their email stays in the box.
    try {
      await storeCall("collectors", { email, source: "collectors-section" });
      setSubmitted(true);
    } catch (e) {
      console.warn("Collectors signup:", e?.message || e);
      setErr("That didn't go through. Please try again.");
    }
    going.current = false;
    setLoading(false);
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
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>Welcome to the Club</div>
            <p style={{ fontSize:17, color:"var(--muted)", lineHeight:1.6 }}>You're on the list. We'll be in touch with exclusive access.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:16, color:"var(--ink)", opacity:.7, lineHeight:1.5 }}>Enter your email to join. Free, instant access.</p>
            <input className="collectors-input" type="email" placeholder="your@email.com" value={email}
              onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && handleJoin()} />
            {err && <p role="alert" style={{ fontSize:16, color:"#a8281c", marginTop:-4 }}>{err}</p>}
            <button className="collectors-submit" onClick={handleJoin} disabled={loading}>
              {loading ? "Joining…" : "Join the Collectors Club →"}
            </button>
            <p style={{ fontSize:16, color:"var(--ink)", opacity:.45, letterSpacing:".03em" }}>No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}
