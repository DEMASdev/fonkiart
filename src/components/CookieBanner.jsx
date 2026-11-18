import { useState, useEffect } from "react";

export default function CookieBanner({ onContact }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("fonkiart-cookie-ok")) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="cookie-banner">
      <p>
        Fonkiart uses cookies to remember your preferences and taste.
        By continuing to browse, you agree to this.{" "}
        <a href="#" onClick={e => { e.preventDefault(); onContact?.(); }}>Questions? Contact Us Here!</a>
      </p>
      <button
        className="btn-p"
        style={{ background:"var(--gold)", padding:"10px 22px", fontSize:16, letterSpacing:".1em", whiteSpace:"nowrap", flexShrink:0 }}
        onClick={() => { localStorage.setItem("fonkiart-cookie-ok","1"); setVisible(false); }}
      >
        Got it
      </button>
    </div>
  );
}
