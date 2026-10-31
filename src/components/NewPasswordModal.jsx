import { useState } from "react";
import PasswordInput from "./PasswordInput";
import PasswordRules from "./PasswordRules";
import { pwRulesMet } from "../lib/pwRules";

// Opens from a "Choose a new password" email link, for the admin or a customer.
// onSubmit saves the password (and throws with a readable message if it can't).
export default function NewPasswordModal({ title, subtitle, submitLabel, onSubmit, onDone, onClose }) {
  const [pw, setPw]         = useState("");
  const [pw2, setPw2]       = useState("");
  const [err, setErr]       = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!pwRulesMet(pw)) { setErr("That password does not meet all the requirements yet."); return; }
    if (pw !== pw2)      { setErr("Those two do not match."); return; }
    setErr(""); setSaving(true);
    try {
      await onSubmit(pw);
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

        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:6 }}>{title}</h2>
        <p className="checkout-sub" style={{ marginBottom:20 }}>{subtitle}</p>

        <div className="fld">
          <label>New Password</label>
          <PasswordInput value={pw} onChange={e=>{ setPw(e.target.value); setErr(""); }} placeholder="New password" autoFocus autoComplete="new-password" />
          <PasswordRules value={pw} />
        </div>
        <div className="fld">
          <label>Confirm Password</label>
          <PasswordInput value={pw2} onChange={e=>{ setPw2(e.target.value); setErr(""); }}
            placeholder="Type it again" autoComplete="new-password" onKeyDown={e=>e.key==="Enter"&&save()} />
        </div>
        {err && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{err}</p>}
        <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)" }} onClick={save} disabled={saving || !!(pw && !pwRulesMet(pw))}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
