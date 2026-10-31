import { useState } from "react";
import PasswordInput from "./PasswordInput";
import { setAdminPassword } from "../lib/adminAuth";

// Opens from the "Choose a new password" link in the admin reset email.
export default function AdminResetModal({ token, onDone, onClose }) {
  const [pw, setPw]         = useState("");
  const [pw2, setPw2]       = useState("");
  const [err, setErr]       = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2)    { setErr("The two passwords don't match."); return; }
    setErr(""); setSaving(true);
    try {
      await setAdminPassword(token, pw);
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>

        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:6 }}>New Admin Password</h2>
        <p className="checkout-sub" style={{ marginBottom:20 }}>Choose the password you'll use to sign in to the admin.</p>

        <div className="fld">
          <label>New Password <span style={{ fontWeight:300, textTransform:"none", letterSpacing:0 }}>(min. 8 chars)</span></label>
          <PasswordInput value={pw} onChange={e=>{ setPw(e.target.value); setErr(""); }} placeholder="New password" autoFocus />
        </div>
        <div className="fld">
          <label>Confirm Password</label>
          <PasswordInput value={pw2} onChange={e=>{ setPw2(e.target.value); setErr(""); }}
            placeholder="Type it again" onKeyDown={e=>e.key==="Enter"&&save()} />
        </div>
        {err && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{err}</p>}
        <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save and open the admin →"}
        </button>
      </div>
    </div>
  );
}
