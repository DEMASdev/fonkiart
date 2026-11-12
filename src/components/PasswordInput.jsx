import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password box with an eye button that shows what was typed.
export default function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false);
  const label = show ? "Hide password" : "Show password";
  return (
    <div style={{ position:"relative" }}>
      <input {...props} type={show ? "text" : "password"} style={{ ...style, paddingRight:46 }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={label} title={label}
        style={{ position:"absolute", right:0, top:"50%", transform:"translateY(-50%)", background:"none", border:"none",
          cursor:"pointer", color:"var(--muted)", padding:0, width:44, height:44, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {show ? <EyeOff size={22} /> : <Eye size={22} />}
      </button>
    </div>
  );
}
