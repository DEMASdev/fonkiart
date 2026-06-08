import { useState, useEffect } from "react";
import {
  Home, LayoutGrid, Star, Timer, Handshake, Mail,
  Info, Heart, Settings, ChevronRight, X, Menu, Sparkles, Tag, Archive, Package, LogIn, KeyRound
} from "lucide-react";

import { supabase, ADMIN_PASSWORD } from "./lib/supabase";
import { loadData, saveData, SESSION_ID, CART_TTL_HOURS } from "./utils/helpers";
import { NAV_ITEMS, DEFAULT_CATEGORIES, DEFAULT_STATE } from "./constants";

import ErrorBoundary from "./components/ErrorBoundary";
import CookieBanner from "./components/CookieBanner";
import Footer from "./components/Footer";
import MarqueeStrip from "./components/MarqueeStrip";
import FloatingCart from "./components/FloatingCart";
import MobileBottomNav from "./components/MobileBottomNav";
import WelcomeModal from "./components/WelcomeModal";
import AuthModal from "./components/AuthModal";
import ArtworkModal from "./components/ArtworkModal";
import CheckoutModal from "./components/CheckoutModal";
import PriceInquiryModal from "./components/PriceInquiryModal";
import TrackOrderModal from "./components/TrackOrderModal";
import BuyerAuthModal from "./components/BuyerAuthModal";

import InvoicePage from "./pages/InvoicePage";
import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import NewCollectionsPage from "./pages/NewCollectionsPage";
import SpecialsPage from "./pages/SpecialsPage";
import SoldPage from "./pages/SoldPage";
import SpecialOrdersPage from "./pages/SpecialOrdersPage";
import AuctionsPage from "./pages/AuctionsPage";
import PartnersPage from "./pages/PartnersPage";
import ContactPage from "./pages/ContactPage";
import AboutPage from "./pages/AboutPage";
import ChildrenPage from "./pages/ChildrenPage";
import CollectorsRoomPage from "./pages/CollectorsRoomPage";
import ExclusiveCollectorsPage from "./pages/ExclusiveCollectorsPage";
import BuyerDashboard from "./pages/BuyerDashboard";

import AdminPage from "./admin/AdminPage";

export default function App() {
  const [invoiceToken] = useState(() => new URLSearchParams(window.location.search).get("invoice"));
  const [deepLinkId]   = useState(() => new URLSearchParams(window.location.search).get("artwork"));
  const [deepModal, setDeepModal] = useState(null);
  const [deepCheckout, setDeepCheckout] = useState(null);
  const [deepPriceInquiry, setDeepPriceInquiry] = useState(null);
  const [page, setPage] = useState(() => localStorage.getItem("fonkiart-page") || "home");
  const [data, setData] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authModal, setAuthModal] = useState(false);
  const [trackModal, setTrackModal] = useState(false);
  const [loginModal, setLoginModal] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(() => localStorage.getItem("fonkiart-admin-authed") === "1");
  const [collectorsClient, setCollectorsClient] = useState(null);
  const [cartActivity, setCartActivity] = useState({});

  const loadCartActivity = async () => {
    if (!supabase) return;
    try {
      const cutoff = new Date(Date.now() - CART_TTL_HOURS * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase.from("cart_activity").select("artwork_id").gte("added_at", cutoff);
      if (!rows) return;
      const counts = {};
      rows.forEach(r => { counts[r.artwork_id] = (counts[r.artwork_id] || 0) + 1; });
      setCartActivity(counts);
    } catch(e) { /* table may not exist yet */ }
  };

  const addToCart = (item) => {
    setCart(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]);
    if (supabase) supabase.from("cart_activity").upsert({ artwork_id: item.id, session_id: SESSION_ID, added_at: new Date().toISOString() }, { onConflict: "artwork_id,session_id" }).then(() => loadCartActivity());
  };
  const removeFromCart = (id) => {
    setCart(prev => prev.filter(i => i.id !== id));
    if (supabase) supabase.from("cart_activity").delete().match({ artwork_id: id, session_id: SESSION_ID }).then(() => loadCartActivity());
  };

  const loadArtworks = async () => {
    if (!supabase) return;
    try {
      const { data: rows } = await supabase.from("Artworks").select("*").order("created_at", { ascending: false });
      setArtworks(rows || []);
      if (deepLinkId && rows) {
        const found = rows.find(a => String(a.id) === String(deepLinkId));
        if (found) setDeepModal(found);
      }
    } catch(e) { console.error("Artworks load:", e); }
  };

  const loadSettings = async () => {
    if (!supabase) return null;
    try {
      const { data: row } = await supabase.from("Settings").select("*").eq("id", 1).single();
      if (!row) return null;
      const { id, categories, ...settings } = row;
      try { settings.navVisible = JSON.parse(localStorage.getItem("fonkiart-nav-visible") || "{}"); } catch { settings.navVisible = {}; }
      return { settings, categories: Array.isArray(categories) ? categories : DEFAULT_CATEGORIES };
    } catch(e) { console.error("Settings load:", e); return null; }
  };

  const saveSettings = async (settings, categories) => {
    const { navVisible, ...supabaseSettings } = settings;
    if (navVisible !== undefined) localStorage.setItem("fonkiart-nav-visible", JSON.stringify(navVisible));
    if (!supabase) return;
    try {
      await supabase.from("Settings").upsert({ id: 1, ...supabaseSettings, categories }, { onConflict: "id" });
    } catch(e) { console.error("Settings save:", e); }
  };

  useEffect(() => {
    const init = async () => {
      const local = await loadData();
      const remote = await loadSettings();
      const base = local || JSON.parse(JSON.stringify(DEFAULT_STATE));
      if (remote) {
        setData({ ...base, settings: remote.settings, categories: remote.categories });
      } else {
        setData(base);
        if (supabase) saveSettings(base.settings, base.categories);
      }
    };
    init();
    loadArtworks();
    loadCartActivity();
    const cartPoll = setInterval(loadCartActivity, 60000);
    if (!sessionStorage.getItem("fonkiart-welcome-seen")) {
      setTimeout(() => setShowWelcome(true), 1500);
    }
    return () => clearInterval(cartPoll);
  }, []);

  useEffect(() => { localStorage.setItem("fonkiart-page", page); }, [page]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) setPage(u.user_metadata?.role === "buyer" ? "buyer-dashboard" : "collectors-room");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) setPage(u.user_metadata?.role === "buyer" ? "buyer-dashboard" : "collectors-room");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const titles = {
      home:"Fonkiart — Original Art & Fine Art Prints | South Florida",
      catalog:"Catalog — Fonkiart", new:"New Collections — Fonkiart",
      specials:"Specials — Fonkiart", archive:"Past Works — Fonkiart",
      special:"Special Orders — Fonkiart", auctions:"Auctions — Fonkiart",
      partners:"Partners — Fonkiart", contact:"Contact — Fonkiart",
      about:"About Fonkiart", children:"Children Benefit — Fonkiart",
      admin:"Admin — Fonkiart", "buyer-dashboard":"My Account — Fonkiart",
    };
    document.title = titles[page] || "Fonkiart";
  }, [page]);

  const updateData = async (patch) => {
    const { items: _, ...rest } = patch;
    const next = { ...data, ...rest };
    setData(next);
    await saveData(next);
    if (rest.settings || rest.categories) await saveSettings(next.settings, next.categories);
  };

  const cleanArtwork = (item) => {
    const imgs = Array.isArray(item.images) && item.images.length > 0 ? item.images : (item.image ? [item.image] : []);
    return {
      id: item.id, title: item.title || '', category: item.category || '',
      price: item.price !== '' && item.price != null ? Number(item.price) : null,
      salePrice: item.salePrice !== '' && item.salePrice != null ? Number(item.salePrice) : null,
      description: item.description || '', medium: item.medium || '', dimensions: item.dimensions || '',
      image: imgs[0] || '', images: imgs,
      isNew: !!item.isNew, isSold: !!item.isSold, isChildren: !!item.isChildren,
      isCollectorsOnly: !!item.isCollectorsOnly, isEarlyAccess: !!item.isEarlyAccess,
      stripeLink: item.stripeLink || '',
    };
  };

  const addArtwork    = async (entry) => { if (!supabase) return; const { data: row } = await supabase.from("Artworks").insert([cleanArtwork(entry)]).select().single(); setArtworks(prev => [row || entry, ...prev]); };
  const editArtwork   = async (id, entry) => { if (!supabase) return; await supabase.from("Artworks").update(cleanArtwork(entry)).eq("id", id); setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...entry } : a)); };
  const deleteArtwork = async (id) => { if (!supabase) return; await supabase.from("Artworks").delete().eq("id", id); setArtworks(prev => prev.filter(a => a.id !== id)); };
  const patchArtwork  = async (id, patch) => { if (!supabase) return; await supabase.from("Artworks").update(patch).eq("id", id); setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a)); };

  const mergedData = data ? { ...data, items: artworks.length > 0 ? artworks : (data.items || []) } : null;

  if (invoiceToken) return <InvoicePage token={invoiceToken} />;
  if (!mergedData) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"#8a8078" }}>Loading Fonkiart…</div>;

  if (page === "buyer-dashboard" && user) return <BuyerDashboard user={user} onLogout={async () => { await supabase.auth.signOut(); setUser(null); setPage("home"); }} onBack={() => setPage("home")} />;

  if (page === "collectors" && collectorsClient) return <ExclusiveCollectorsPage client={collectorsClient} onLogout={() => { setCollectorsClient(null); setPage("home"); }} artworks={mergedData?.items ?? []} />;

  if (page === "collectors-room") return <CollectorsRoomPage user={user} artworks={mergedData?.items ?? []} settings={mergedData?.settings} onLogout={async () => { await supabase.auth.signOut(); setUser(null); setPage("home"); }} onBack={() => setPage("home")} isAdmin={user?.email?.toLowerCase() === "fonkiart@gmail.com"} onAdminEnter={() => setPage("admin")} />;

  if (page === "admin") return <AdminPage data={mergedData} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={() => setPage("home")} autoAuth={adminAuthed} onAutoAuthUsed={() => setAdminAuthed(false)} onViewRoom={() => setPage("collectors-room")} />;

  const currentNav = NAV_ITEMS.find(n => n.id === page) || NAV_ITEMS[0];

  return (
    <div className="layout">
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-logo" style={{ cursor:"pointer" }} onClick={() => { setPage("home"); setSidebarOpen(false); }}>
          <div className="logo-text"><div className="logo-dot" />Fonkiart</div>
          <div className="logo-sub">Art & Fine Art Prints</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(({ id }) => mergedData.settings.navVisible?.[id] !== false).map(({ id, label, Icon }) => (
            <button key={id} className={`nav-item${page === id ? " active" : ""}`} onClick={() => { setPage(id); setSidebarOpen(false); }}>
              <Icon size={16} />{label}
            </button>
          ))}
          <div style={{ borderTop:"2px solid var(--border)", margin:"8px 0" }} />
          <button className="nav-item" onClick={() => { setTrackModal(true); setSidebarOpen(false); }}><Package size={16} />Track My Order</button>
          <button className="nav-item" onClick={() => {
              if (user?.user_metadata?.role === "buyer") { setPage("buyer-dashboard"); setSidebarOpen(false); }
              else { setLoginModal(true); setSidebarOpen(false); }
            }}>
            <LogIn size={16} />
            {user?.user_metadata?.role === "buyer"
              ? user.user_metadata?.name?.split(" ")[0] || "My Account"
              : collectorsClient ? collectorsClient.name?.split(" ")[0] || "My Account"
              : "Login / Sign Up"}
          </button>
          <button className="nav-item" onClick={() => { setAuthModal(true); setSidebarOpen(false); }}><KeyRound size={16} />Request Access</button>
        </nav>
        <div className="sidebar-bottom" />
      </aside>

      <div className="content">
        <div className="topbar">
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}><Menu size={20} /></button>
            {page !== "home" && (
              <div className="topbar-title"><currentNav.Icon size={16} />{currentNav.label}</div>
            )}
          </div>
          {page === "home" && (
            <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase", color:"var(--ink)", display:"flex", alignItems:"center", gap:8, pointerEvents:"none" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--gold)", flexShrink:0 }} />Fonkiart
            </div>
          )}
          <div className="topbar-right">
            {data.settings.instagram && (
              <a href={data.settings.instagram} target="_blank" rel="noopener noreferrer" style={{ color:"var(--muted)", display:"flex", alignItems:"center", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"} title="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
            )}
            {data.settings.facebook && (
              <a href={data.settings.facebook} target="_blank" rel="noopener noreferrer" style={{ color:"var(--muted)", display:"flex", alignItems:"center", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"} title="Facebook">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
            )}
            {data.settings.tiktok && (
              <a href={data.settings.tiktok} target="_blank" rel="noopener noreferrer" style={{ color:"var(--muted)", display:"flex", alignItems:"center", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"} title="TikTok">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.79a8.18 8.18 0 004.78 1.52V6.84a4.86 4.86 0 01-1.01-.15z"/></svg>
              </a>
            )}
            <button onClick={() => user?.user_metadata?.role === "buyer" ? setPage("buyer-dashboard") : setLoginModal(true)} title="My Account" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", display:"flex", alignItems:"center", transition:"color .2s", padding:0, position:"relative" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {user && <span style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:"50%", background:"#2d6a4f", border:"1px solid #fff" }} />}
            </button>
            {page !== "home" && <button onClick={() => setPage("home")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", color:"var(--gold)", display:"flex", alignItems:"center", gap:5, padding:0 }}>← Home</button>}
            {page === "home" && <button className="topbar-tag" onClick={() => setPage("catalog")} style={{ cursor:"pointer", border:"none" }}>Shop Now</button>}
          </div>
        </div>

        {showWelcome && <WelcomeModal onClose={() => { setShowWelcome(false); sessionStorage.setItem("fonkiart-welcome-seen","1"); }} discount={mergedData.settings.couponDiscount ?? 15} artworks={mergedData.items} />}
        {authModal && <AuthModal user={user} onClose={() => setAuthModal(false)} artworks={mergedData.items} />}
        {trackModal && <TrackOrderModal onClose={() => setTrackModal(false)} />}
        {loginModal && <BuyerAuthModal onClose={() => setLoginModal(false)} onAdminLogin={() => { setAdminAuthed(true); setPage("admin"); setLoginModal(false); setSidebarOpen(false); }} onClientLogin={(client) => { setCollectorsClient(client); setPage("collectors"); setLoginModal(false); setSidebarOpen(false); }} />}
        <CookieBanner />
        <MarqueeStrip />

        {page === "home"     && <HomePage setPage={setPage} data={mergedData} />}
        {page === "catalog"  && <CatalogPage data={mergedData} addToCart={addToCart} cart={cart} cartActivity={cartActivity} />}
        {page === "special"  && <SpecialOrdersPage setPage={setPage} />}
        {page === "auctions" && <AuctionsPage />}
        {page === "partners" && <PartnersPage setPage={setPage} />}
        {page === "contact"  && <ContactPage data={mergedData} />}
        {page === "new"      && <NewCollectionsPage data={mergedData} addToCart={addToCart} cart={cart} cartActivity={cartActivity} />}
        {page === "specials" && <SpecialsPage data={mergedData} addToCart={addToCart} cart={cart} cartActivity={cartActivity} />}
        {page === "about"    && <AboutPage />}
        {page === "archive"  && <SoldPage data={mergedData} />}
        {page === "children" && <ChildrenPage setPage={setPage} />}

        <Footer settings={mergedData.settings} onTrackOrder={() => setTrackModal(true)} />
        <FloatingCart cart={cart} removeFromCart={removeFromCart} settings={mergedData.settings} cartOpen={cartOpen} setCartOpen={setCartOpen} />
        <MobileBottomNav page={page} setPage={setPage} cartCount={cart.length} onCart={() => setCartOpen(true)} onAccount={() => user?.user_metadata?.role === "buyer" ? setPage("buyer-dashboard") : setLoginModal(true)} />

        {deepModal && !deepCheckout && !deepPriceInquiry && (
          <ArtworkModal
            item={deepModal}
            sold={!!deepModal.isSold}
            onClose={() => setDeepModal(null)}
            onBuy={deepModal.isSold ? undefined : (s) => {
              setDeepModal(null);
              s.price || s.salePrice ? setDeepCheckout(s) : setDeepPriceInquiry(s);
            }}
          />
        )}
        {deepCheckout && (
          <CheckoutModal item={deepCheckout} onClose={() => setDeepCheckout(null)} settings={mergedData.settings} />
        )}
        {deepPriceInquiry && (
          <PriceInquiryModal item={deepPriceInquiry} onClose={() => setDeepPriceInquiry(null)} />
        )}
      </div>
    </div>
  );
}
