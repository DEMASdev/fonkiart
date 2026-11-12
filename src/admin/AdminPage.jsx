import { useState, useEffect } from "react";
import { adminLogin, adminVerify, adminLogout, adminHasToken, requestAdminReset } from "../lib/adminAuth";
import PasswordInput from "../components/PasswordInput";
import AdminPanel from "./AdminPanel";
import { mouseHover } from "../utils/hover";

const ADMIN_EMAIL = "fonkiart@gmail.com";
const linkBtn = { background:"none", border:"none", cursor:"pointer", color:"var(--gold)", fontSize:12, fontFamily:"'DM Sans',sans-serif", textDecoration:"underline", textUnderlineOffset:3, padding:0 };

export default function AdminPage({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, autoAuth, onAutoAuthUsed, onViewRoom, tab, setTab }) {
  const [authed, setAuthed] = useState(() => autoAuth || adminHasToken());
  const [checking, setChecking] = useState(true);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [reset, setReset] = useState(""); // "" | "sending" | "sent" | an error message

  // "Forgot password?" — the same one-time link the sign-in box sends to the admin inbox.
  const forgot = async () => {
    setReset("sending");
    try { await requestAdminReset(ADMIN_EMAIL); setReset("sent"); }
    catch (e) { setReset(e.message); }
  };

  const doAuth = async () => {
    if (loggingIn) return;
    setLoggingIn(true); setErr("");
    const ok = await adminLogin(pw);
    setLoggingIn(false);
    if (ok) setAuthed(true);
    else setErr("Incorrect password");
  };

  // If we got here via the auto-login shortcut, BuyerAuthModal already
  // verified the password with the server and stored the token — just
  // clear the one-shot flag on the parent.
  useEffect(() => {
    if (autoAuth && onAutoAuthUsed) onAutoAuthUsed();
  }, []);

  // Re-check the stored token against the server on every visit — a token
  // that's expired, forged, or left over from a rotated password fails
  // here even though it's still sitting in localStorage.
  useEffect(() => {
    let cancelled = false;
    adminVerify().then(valid => {
      if (cancelled) return;
      setChecking(false);
      if (!valid) setAuthed(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authed || checking) return;
    if (countdown <= 0) { onBack(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [authed, checking, countdown]);

  if (checking) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"#8a8078" }}>Loading Admin…</div>;

  if (!authed) return (
    <div className="login-wrap">
      <div className="login-box">
        <h2 className="login-title">Admin Login</h2>
        <div className="fld">
          <label>Password</label>
          <PasswordInput value={pw} placeholder="Password" autoFocus
            onChange={e => { setPw(e.target.value); setErr(""); }}
            onKeyDown={e => { if(e.key==="Enter") doAuth(); }} />
          {err && <p className="err">{err}</p>}
        </div>
        <p style={{ fontSize:12, color:"var(--muted)", marginTop:-6, marginBottom:12, textAlign:"right" }}>
          {reset === "sent"
            ? <span style={{ color:"#2d6a4f" }}>✓ Reset link sent to {ADMIN_EMAIL}. It works once, for 30 minutes.</span>
            : <button className="tap" onClick={forgot} disabled={reset === "sending"} style={linkBtn}>
                {reset === "sending" ? "Sending…" : "Forgot password?"}
              </button>}
          {reset && reset !== "sending" && reset !== "sent" && <span style={{ display:"block", color:"#c0392b", marginTop:6 }}>{reset}</span>}
        </p>
        <button className="btn-p" style={{ width:"100%", marginBottom:12 }} onClick={doAuth} disabled={loggingIn}>
          {loggingIn ? "Checking…" : "Enter"}
        </button>
        <button onClick={onBack} style={{ width:"100%", background:"none", border:"1px solid var(--border)", padding:"10px", cursor:"pointer", letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", transition:"all .2s" }}
          {...mouseHover({ borderColor:"var(--ink)", color:"var(--ink)" }, { borderColor:"var(--border)", color:"var(--muted)" })}>
          ← Back to Site
        </button>
        <p style={{ textAlign:"center", color:"var(--muted)", marginTop:14, letterSpacing:".06em" }}>
          Redirecting to site in {countdown}s…
        </p>
      </div>
    </div>
  );

  return <AdminPanel data={data} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={onBack} onViewRoom={onViewRoom} tab={tab} setTab={setTab}
    onLogout={() => { adminLogout(); localStorage.removeItem("fonkiart-admin-tab"); localStorage.setItem("fonkiart-page","home"); setTab("dashboard"); setAuthed(false); setPw(""); onBack(); }} />;
}
