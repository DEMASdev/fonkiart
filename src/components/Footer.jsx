export default function Footer({ settings, onTrackOrder }) {
  const SocialLink = ({ href, title, children }) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}>{children}</a>
  ) : null;
  return (
    <footer className="footer" style={{ flexDirection:"column", alignItems:"flex-start", gap:20 }}>
      <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
        <div className="footer-logo">Fonkiart</div>
        <div className="footer-social">
          <SocialLink href={settings.instagram} title="Instagram">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </SocialLink>
          <SocialLink href={settings.facebook} title="Facebook">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </SocialLink>
          <SocialLink href={settings.tiktok} title="TikTok">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.79a8.18 8.18 0 004.78 1.52V6.84a4.86 4.86 0 01-1.01-.15z"/></svg>
          </SocialLink>
        </div>
      </div>
      <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Accepted Payments</div>
          <div className="payment-logos">
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Visa"><rect width="48" height="30" rx="4" fill="#1A1F71"/><text x="24" y="21" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="bold" fontStyle="italic" fill="#FFFFFF" textAnchor="middle">VISA</text></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard"><rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/><circle cx="18" cy="15" r="9" fill="#EB001B"/><circle cx="30" cy="15" r="9" fill="#F79E1B"/><path d="M24 7.7a9 9 0 0 1 0 14.6A9 9 0 0 1 24 7.7z" fill="#FF5F00"/></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="American Express"><rect width="48" height="30" rx="4" fill="#2E77BC"/><text x="24" y="19" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing="1">AMEX</text></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Discover"><rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/><text x="9" y="19" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#231F20" letterSpacing=".3">DISCOVER</text><circle cx="38" cy="15" r="8" fill="#F76F20"/></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Zelle"><rect width="48" height="30" rx="4" fill="#6D1ED4"/><text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="13" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">Zelle</text></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Venmo"><rect width="48" height="30" rx="4" fill="#3D95CE"/><text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="11" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".5">Venmo</text></svg>
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Cash App"><rect width="48" height="30" rx="4" fill="#00D632"/><text x="24" y="14" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">CASH</text><text x="24" y="23" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">APP</text></svg>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <button className="track-order-btn" onClick={onTrackOrder}>Track my order</button>
          <div className="footer-copy">© {new Date().getFullYear()} Fonkiart · All rights reserved</div>
        </div>
      </div>
    </footer>
  );
}
