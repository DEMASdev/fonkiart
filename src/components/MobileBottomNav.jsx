import { Home, LayoutGrid, Sparkles } from "lucide-react";

export default function MobileBottomNav({ page, setPage, cartCount, onCart, onAccount }) {
  return (
    <nav className="mobile-bottom-nav">
      <button className={`mobile-bottom-nav-btn${page==="home"?" active":""}`} onClick={() => setPage("home")}>
        <Home size={20} />
        Home
      </button>
      <button className={`mobile-bottom-nav-btn${page==="catalog"?" active":""}`} onClick={() => setPage("catalog")}>
        <LayoutGrid size={20} />
        Shop
      </button>
      <button className={`mobile-bottom-nav-btn${["new","specials"].includes(page)?" active":""}`} onClick={() => setPage("new")}>
        <Sparkles size={20} />
        New
      </button>
      <button className="mobile-bottom-nav-btn" onClick={onCart} style={{ position:"relative" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        {cartCount > 0 && <span className="mobile-bnav-badge">{cartCount}</span>}
        Cart
      </button>
      <button className="mobile-bottom-nav-btn" onClick={onAccount}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Account
      </button>
    </nav>
  );
}
