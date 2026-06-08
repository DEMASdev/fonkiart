import { useState, useEffect } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("fonkiart-cookie-ok")) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="cookie-banner">
      <p>
        Fonkiart uses cookies to remember your preferences and may collect your email to send exclusive offers and order updates.
        By continuing to browse, you agree to this.{" "}
        <a href="mailto:support@fonkiart.com">Questions? Contact us.</a>
      </p>
      <button
        className="btn-p"
        style={{ background:"var(--gold)", padding:"8px 20px", fontSize:11, letterSpacing:".1em", whiteSpace:"nowrap", flexShrink:0 }}
        onClick={() => { localStorage.setItem("fonkiart-cookie-ok","1"); setVisible(false); }}
      >
        Got it
      </button>
    </div>
  );
}
