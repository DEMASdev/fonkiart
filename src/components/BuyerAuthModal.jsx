import { useState } from "react";
import { supabase, ADMIN_PASSWORD } from "../lib/supabase";
import { hashPassword } from "../utils/helpers";

export default function BuyerAuthModal({ onClose, onAdminLogin, onClientLogin }) {
  const [tab, setTab] = useState("login"); // "login" | "signup"

  // ── LOGIN STATE ────────────────────────────
  const [loginEmail, setLoginEmail]     = useState("");
  const [loginPw, setLoginPw]           = useState("");
  const [loginErr, setLoginErr]         = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── SIGNUP STATE ───────────────────────────
  const [name, setName]                 = useState("");
  const [signupEmail, setSignupEmail]   = useState("");
  const [signupPw, setSignupPw]         = useState("");
  const [signupPw2, setSignupPw2]       = useState("");
  const [signupErr, setSignupErr]       = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  // ── VERIFICATION STATE ─────────────────────
  const [step, setStep]                 = useState("form"); // "form" | "verify" | "success"
  const [verifyCode, setVerifyCode]     = useState("");
  const [verifyErr, setVerifyErr]       = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resending, setResending]       = useState(false);
  const [resent, setResent]             = useState(false);

  // ── LOGIN ──────────────────────────────────
  const handleLogin = async () => {
    if (!loginEmail || !loginPw) { setLoginErr("Enter your email and password."); return; }
    setLoginErr(""); setLoginLoading(true);

    // Admin shortcut
    if (loginEmail.trim().toLowerCase() === "fonkiart@gmail.com" && loginPw === ADMIN_PASSWORD) {
      onAdminLogin(); return;
    }

    // Supabase Auth (new buyer accounts)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPw,
      });
      if (!error) { onClose(); return; } // onAuthStateChange handles routing
    } catch(e) { /* fall through to legacy */ }

    // Legacy fallback: manually set Clients table passwords (backwards compat)
    try {
      const { data: client } = await supabase.from("Clients").select("id,name,email,password")
        .eq("email", loginEmail.trim().toLowerCase()).maybeSingle();
      if (client?.password) {
        const hashed = await hashPassword(loginPw);
        if (client.password === hashed) { onClientLogin(client); return; }
        if (client.password === loginPw) {
          await supabase.from("Clients").update({ password: hashed }).eq("id", client.id);
          onClientLogin(client); return;
        }
      }
    } catch(e) { console.warn("Legacy login:", e); }

    setLoginErr("Incorrect email or password.");
    setLoginLoading(false);
  };

  // ── SIGN UP ────────────────────────────────
  const handleSignup = async () => {
    if (!name.trim())                         { setSignupErr("Enter your name."); return; }
    if (!signupEmail.includes("@"))           { setSignupErr("Enter a valid email address."); return; }
    if (signupPw.length < 6)                  { setSignupErr("Password must be at least 6 characters."); return; }
    if (signupPw !== signupPw2)               { setSignupErr("Passwords don't match."); return; }

    setSignupErr(""); setSignupLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim().toLowerCase(),
      password: signupPw,
      options: { data: { name: name.trim(), role: "buyer" } },
    });

    if (error) { setSignupErr(error.message); setSignupLoading(false); return; }

    // Session returned immediately = email confirmation is disabled in Supabase
    if (data.session) { onClose(); return; }

    // Email confirmation required → show OTP entry
    setSignupLoading(false);
    setStep("verify");
  };

  // ── VERIFY OTP ─────────────────────────────
  const handleVerify = async () => {
    const token = verifyCode.trim();
    if (token.length < 4) { setVerifyErr("Enter the code from your email."); return; }
    setVerifyErr(""); setVerifyLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: signupEmail.trim().toLowerCase(),
      token,
      type: "signup",
    });

    if (error) {
      setVerifyErr("Invalid or expired code. Check your email and try again.");
      setVerifyLoading(false);
      return;
    }

    // Verified! onAuthStateChange will fire and route to buyer-dashboard
    setVerifyLoading(false);
    setStep("success");
    setTimeout(() => onClose(), 3000); // auto-close after celebration
  };

  // ── RESEND CODE ────────────────────────────
  const handleResend = async () => {
    setResending(true); setResent(false);
    await supabase.auth.resend({ type: "signup", email: signupEmail.trim().toLowerCase() });
    setResending(false); setResent(true);
    setTimeout(() => setResent(false), 4000);
  };

  const TabBtn = ({ id, label }) => (
    <button onClick={() => { setTab(id); setLoginErr(""); setSignupErr(""); setStep("form"); }}
      style={{ flex:1, background:"none", border:"none", borderBottom:`2px solid ${tab===id?"var(--ink)":"transparent"}`,
        padding:"12px 0", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12,
        letterSpacing:".12em", textTransform:"uppercase", color:tab===id?"var(--ink)":"var(--muted)",
        fontWeight:tab===id?500:400, transition:"all .2s" }}>
      {label}
    </button>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>

        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:6 }}>My Account</h2>
        <p className="checkout-sub" style={{ marginBottom:20 }}>Fonkiart · Original Art & Fine Art Prints</p>

        {/* ── TABS (only show during form step) ── */}
        {step === "form" && (
          <div style={{ display:"flex", borderBottom:"1px solid var(--border)", marginBottom:24 }}>
            <TabBtn id="login"  label="Sign In" />
            <TabBtn id="signup" label="Create Account" />
          </div>
        )}

        {/* ══════════════ LOGIN TAB ══════════════ */}
        {tab === "login" && step === "form" && (
          <>
            <div className="fld">
              <label>Email</label>
              <input type="email" value={loginEmail} onChange={e=>{ setLoginEmail(e.target.value); setLoginErr(""); }}
                placeholder="your@email.com" onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoFocus />
            </div>
            <div className="fld">
              <label>Password</label>
              <input type="password" value={loginPw} onChange={e=>{ setLoginPw(e.target.value); setLoginErr(""); }}
                placeholder="Password" onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
            </div>
            {loginErr && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{loginErr}</p>}
            <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)", marginBottom:12 }}
              onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? "Signing in…" : "Sign In →"}
            </button>
            <p style={{ fontSize:12, color:"var(--muted)", textAlign:"center" }}>
              No account?{" "}
              <button onClick={() => setTab("signup")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--gold)", fontSize:12, fontFamily:"'DM Sans',sans-serif", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}>Create one free</button>
            </p>
          </>
        )}

        {/* ══════════════ SIGN UP FORM ══════════════ */}
        {tab === "signup" && step === "form" && (
          <>
            <div className="fld">
              <label>Full Name</label>
              <input type="text" value={name} onChange={e=>{ setName(e.target.value); setSignupErr(""); }}
                placeholder="Jane Smith" autoFocus />
            </div>
            <div className="fld">
              <label>Email</label>
              <input type="email" value={signupEmail} onChange={e=>{ setSignupEmail(e.target.value); setSignupErr(""); }}
                placeholder="your@email.com" />
            </div>
            <div className="fld">
              <label>Password <span style={{ fontWeight:300, textTransform:"none", letterSpacing:0 }}>(min. 6 chars)</span></label>
              <input type="password" value={signupPw} onChange={e=>{ setSignupPw(e.target.value); setSignupErr(""); }}
                placeholder="Create a password" />
            </div>
            <div className="fld">
              <label>Confirm Password</label>
              <input type="password" value={signupPw2} onChange={e=>{ setSignupPw2(e.target.value); setSignupErr(""); }}
                placeholder="Repeat password" onKeyDown={e=>e.key==="Enter"&&handleSignup()} />
            </div>
            {signupErr && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{signupErr}</p>}
            <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)", marginBottom:12 }}
              onClick={handleSignup} disabled={signupLoading}>
              {signupLoading ? "Creating account…" : "Create Account →"}
            </button>
            <p style={{ fontSize:12, color:"var(--muted)", textAlign:"center" }}>
              Already have an account?{" "}
              <button onClick={() => setTab("login")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--gold)", fontSize:12, fontFamily:"'DM Sans',sans-serif", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}>Sign in</button>
            </p>
          </>
        )}

        {/* ══════════════ VERIFY OTP ══════════════ */}
        {step === "verify" && (
          <div>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📬</div>
              <h3 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>Check your inbox</h3>
              <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.75 }}>
                We sent a verification code to<br />
                <strong style={{ color:"var(--ink)" }}>{signupEmail}</strong>
              </p>
              <p style={{ fontSize:12, color:"var(--muted)", marginTop:8, lineHeight:1.65 }}>
                Enter the code below, or click the link in the email — either works.
              </p>
            </div>

            <div className="fld">
              <label style={{ textAlign:"center", display:"block" }}>Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                value={verifyCode}
                onChange={e => { setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 8)); setVerifyErr(""); }}
                placeholder="Enter your code"
                autoFocus
                style={{ textAlign:"center", fontSize:22, letterSpacing:"0.3em", fontFamily:"monospace" }}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
              />
            </div>

            {verifyErr && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10, textAlign:"center" }}>{verifyErr}</p>}

            <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)", marginBottom:14 }}
              onClick={handleVerify} disabled={verifyLoading}>
              {verifyLoading ? "Verifying…" : "Verify My Account →"}
            </button>

            <p style={{ fontSize:12, color:"var(--muted)", textAlign:"center" }}>
              Didn't get the email?{" "}
              <button onClick={handleResend} disabled={resending}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--gold)", fontSize:12, fontFamily:"'DM Sans',sans-serif", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}>
                {resending ? "Sending…" : resent ? "✓ Sent!" : "Resend code"}
              </button>
            </p>
          </div>
        )}

        {/* ══════════════ SUCCESS ══════════════ */}
        {step === "success" && (
          <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
            <h3 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:300, color:"var(--ink)", marginBottom:10 }}>Email Verified!</h3>
            <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.8, marginBottom:8 }}>
              Congratulations on your new account.
            </p>
            <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, color:"var(--gold)", lineHeight:1.7 }}>
              Welcome to Fonkiart —<br />
              Original Art & Fine Art Prints
            </p>
            <p style={{ fontSize:12, color:"var(--muted)", marginTop:16 }}>Taking you to your account…</p>
          </div>
        )}
      </div>
    </div>
  );
}
