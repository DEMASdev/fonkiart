import { useState } from "react";
import { supabase, ADMIN_PASSWORD } from "../lib/supabase";
import { hashPassword } from "../utils/helpers";

export default function UnifiedLoginModal({ onClose, onAdminLogin, onClientLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleLogin = async () => {
    if (!email || !pw) { setErr("Enter your email and password."); return; }
    setErr(""); setLoading(true);
    if (email.trim().toLowerCase() === "fonkiart@gmail.com" && pw === ADMIN_PASSWORD) {
      onAdminLogin(); return;
    }
    try {
      if (supabase) {
        const { data } = await supabase.from("Clients").select("id,name,email,password").eq("email", email.trim().toLowerCase()).maybeSingle();
        if (data?.password) {
          const hashed = await hashPassword(pw);
          if (data.password === hashed) { onClientLogin(data); return; }
          // Legacy: plaintext match → auto-upgrade to hash silently
          if (data.password === pw) {
            await supabase.from("Clients").update({ password: hashed }).eq("id", data.id);
            onClientLogin(data); return;
          }
        }
      }
    } catch(e) { console.warn("Login:", e); }
    setErr("Incorrect email or password.");
    setLoading(false);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:6 }}>Login</h2>
        <p className="checkout-sub" style={{ marginBottom:24 }}>Exclusive Collectors &amp; Admin Access</p>
        <div className="fld">
          <label>Email</label>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
        </div>
        <div className="fld">
          <label>Password</label>
          <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} placeholder="Password" onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {err && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{err}</p>}
        <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)" }} onClick={handleLogin} disabled={loading}>
          {loading ? "Signing in…" : "Sign In →"}
        </button>
      </div>
    </div>
  );
}
