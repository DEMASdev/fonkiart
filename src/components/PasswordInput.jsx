import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password box with an eye button that shows what was typed.
export default function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false);
  const label = show ? "Hide password" : "Show password";
  return (
    <div style={{ position:"relative" }}>
      <input {...props} type={show ? "text" : "password"} style={{ ...style, paddingRight:42 }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={label} title={label}
        style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none",
          cursor:"pointer", color:"var(--muted)", padding:4, display:"flex", alignItems:"center" }}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
