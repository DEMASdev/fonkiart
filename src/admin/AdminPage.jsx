import { useState, useEffect } from "react";
import { ADMIN_PASSWORD } from "../lib/supabase";
import AdminPanel from "./AdminPanel";

export default function AdminPage({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, autoAuth, onAutoAuthUsed, onViewRoom }) {
  const [authed, setAuthed] = useState(() => autoAuth || localStorage.getItem("fonkiart-admin-authed") === "1");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [countdown, setCountdown] = useState(60);

  const doAuth = () => { localStorage.setItem("fonkiart-admin-authed", "1"); setAuthed(true); };

  useEffect(() => {
    if (authed) return;
    if (countdown <= 0) { onBack(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [authed, countdown]);

  if (autoAuth && !authed) { doAuth(); if (onAutoAuthUsed) onAutoAuthUsed(); }

  if (!authed) return (
    <div className="login-wrap">
      <div className="login-box">
        <h2 className="login-title">Admin Login</h2>
        <div className="fld">
          <label>Password</label>
          <input type="password" value={pw} placeholder="Password" autoFocus
            onChange={e => { setPw(e.target.value); setErr(""); }}
            onKeyDown={e => { if(e.key==="Enter") pw===ADMIN_PASSWORD?doAuth():setErr("Incorrect password"); }} />
          {err && <p className="err">{err}</p>}
        </div>
        <button className="btn-p" style={{ width:"100%", marginBottom:12 }} onClick={() => pw===ADMIN_PASSWORD?doAuth():setErr("Incorrect password")}>Enter</button>
        <button onClick={onBack} style={{ width:"100%", background:"none", border:"1px solid var(--border)", padding:"10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", transition:"all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="var(--ink)"; e.currentTarget.style.color="var(--ink)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--muted)"; }}>
          ← Back to Site
        </button>
        <p style={{ textAlign:"center", fontSize:11, color:"var(--muted)", marginTop:14, letterSpacing:".06em" }}>
          Redirecting to site in {countdown}s…
        </p>
      </div>
    </div>
  );

  return <AdminPanel data={data} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={onBack} onViewRoom={onViewRoom}
    onLogout={() => { localStorage.removeItem("fonkiart-admin-authed"); localStorage.removeItem("fonkiart-admin-tab"); localStorage.setItem("fonkiart-page","home"); setAuthed(false); setPw(""); onBack(); }} />;
}
