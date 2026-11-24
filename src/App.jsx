import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Menu, Package, LogIn, KeyRound, ShoppingBag, MessageCircle, Receipt, Mail } from "lucide-react";

import { supabase } from "./lib/supabase";
import { adminHasToken, setAdminPassword } from "./lib/adminAuth";
import { storeCall } from "./lib/store";
import { useCartSaving } from "./lib/useCartSaving";
import { useSavedCart } from "./lib/useSavedCart";
import { adminDb } from "./lib/adminDb";
import { loadData, saveData } from "./utils/helpers";
import { NAV_ITEMS, DEFAULT_CATEGORIES, DEFAULT_STATE } from "./constants";

import CookieBanner from "./components/CookieBanner";
import Footer from "./components/Footer";
import MarqueeStrip from "./components/MarqueeStrip";
import SocialIcons from "./components/SocialIcons";
import FloatingCart from "./components/FloatingCart";
import MobileBottomNav from "./components/MobileBottomNav";
import WelcomeModal from "./components/WelcomeModal";
import CartMemory from "./components/CartMemory";
import CartRemembered from "./components/CartRemembered";
import AuthModal from "./components/AuthModal";
import ArtworkModal from "./components/ArtworkModal";
import PriceInquiryModal from "./components/PriceInquiryModal";
import TrackOrderModal from "./components/TrackOrderModal";
import BuyerAuthModal from "./components/BuyerAuthModal";
import NewPasswordModal from "./components/NewPasswordModal";

import InvoicePage from "./pages/InvoicePage";
import { readInvoiceParams } from "./lib/invoiceView";
import CardReturnPage from "./pages/CardReturnPage";
import { readCardReturn, dropCardOrder, withoutTitles } from "./lib/cartOrder";
import { firstEntry, newEntry, samePageAgain } from "./lib/backInside";
import { readAdminLink, withoutAdminLink, askOpenList } from "./lib/adminLink";
import { readUnsubscribe, withoutUnsubscribe } from "./lib/unsubscribeLink";
import ThreadPage from "./pages/ThreadPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import CollectionsPage from "./pages/CollectionsPage";
import CartPage from "./pages/CartPage";
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

// Pages that only exist while their link (?thread= / ?invoice= / ?unsubscribe=) is in the address bar,
// and the way back from a card payment on Stripe (?cart=FA-...&card=...), which is read once on arrival.
const LINK_PAGES = new Set(["conversation", "invoice", "unsubscribe", "card-return"]);
// Where the Collectors Room was opened from: "admin" (the Admin Panel), or "" (the site).
const ROOM_FROM = "fonkiart-room-from";

export default function App() {
  const [invoiceToken] = useState(() => new URLSearchParams(window.location.search).get("invoice"));
  const [invoiceShopView] = useState(() => readInvoiceParams(window.location.search).shopView);
  const [threadToken]  = useState(() => new URLSearchParams(window.location.search).get("thread"));
  // "Unsubscribe" in a coupon email (src/lib/unsubscribeLink.js): its own small page.
  const [unsubToken]   = useState(() => readUnsubscribe(window.location.search));
  const [deepLinkId]   = useState(() => new URLSearchParams(window.location.search).get("artwork"));
  // Back from paying a Cart order by card: { ref, session } once paid, { ref, cancelled } from
  // Stripe's own page without paying (src/lib/cartOrder.js readCardReturn).
  const [cardReturn]   = useState(() => readCardReturn(window.location.search));
  // The daily email's "Open in Admin → Orders" (?admin=unfinished or carts, src/lib/adminLink.js):
  // Admin -> Orders with the list it is about open. Read once (Admin's tab is set to Orders here, before
  // it is read below), then taken out of the address bar.
  const [adminLink]    = useState(() => { const link = readAdminLink(window.location.search); if (link) localStorage.setItem("fonkiart-admin-tab", "orders"); return link; });
  const [deepModal, setDeepModal] = useState(null);
  const [deepPriceInquiry, setDeepPriceInquiry] = useState(null);
  // "#admin-reset=<token>" / "#reset=<token>" are the links in the admin and customer
  // password reset emails. They open over the home page, and the hash is cleared so
  // the token doesn't linger.
  const [resetLink, setResetLink] = useState(() => {
    const m = window.location.hash.match(/^#(admin-reset|reset)=([A-Za-z0-9_-]{43})$/);
    return m ? { admin: m[1] === "admin-reset", token: m[2] } : null;
  });
  const [loginNotice, setLoginNotice] = useState(null);
  // "Sign in and your cart is saved too." (SignInLine): the sign-in window, with that email in it.
  const signInAs = (email) => { setLoginNotice({ email, text: "" }); setLoginModal(true); };
  // The link in our answers (?thread=<token>) opens the conversation INSIDE the full
  // site, with the menu, top bar and footer (Andy, 2026-11-13: "should go to the full
  // site not a chat site").
  // The invoice link (?invoice=<token>) does the same (Andy, 2026-11-17: "should go to
  // the site ... not to some lost page somewhere").
  const [page, setPage] = useState(() => (threadToken ? "conversation" : invoiceToken ? "invoice" : cardReturn ? "card-return" : unsubToken ? "unsubscribe" : resetLink ? "home" : adminLink ? "admin" : localStorage.getItem("fonkiart-page") || "home"));
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => {
    if (resetLink) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [resetLink]);
  // The way back from Stripe is read once (above), then taken out of the address bar, so a
  // reload or the next page never carries it.
  useEffect(() => {
    if (!cardReturn) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("cart"); q.delete("card");
    const rest = q.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  }, [cardReturn]);
  const [pendingCategory, setPendingCategory] = useState(null);
  const goToCategory = (cat) => { setPendingCategory(cat); setPage("catalog"); };
  const goToPage = (p) => { if (p === "catalog") setPendingCategory(null); setPage(p); };
  // The Cart page, opened afresh: on the cart itself ("View Cart", also from inside its checkout,
  // where it did nothing before), or straight on its checkout ("Checkout →" on a piece already in
  // the cart; Andy, 2026-11-23: "once a item is clicked ( the shop buttom ) , the button of that item
  // should be checkout !").
  const [cartView, setCartView] = useState({ n: 0, checkout: false });
  const openCart = (checkout) => { setCartView(v => ({ n: v.n + 1, checkout })); setPage("cart"); };
  const goCheckout = () => openCart(true);
  const [data, setData] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const cartSaving = useCartSaving(); // is cart saving on (its SQL has run)? Only then does the site say a cart is saved
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fonkiart-cart") || "[]"); } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authModal, setAuthModal] = useState(false);
  const [trackModal, setTrackModal] = useState(false);
  const [loginModal, setLoginModal] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(() => adminHasToken());
  const [adminTab, setAdminTabState] = useState(() => localStorage.getItem("fonkiart-admin-tab") || "dashboard");
  useEffect(() => {
    if (!adminLink) return;
    askOpenList(adminLink);
    window.history.replaceState(window.history.state, "", window.location.pathname + withoutAdminLink(window.location.search) + window.location.hash);
  }, [adminLink]);
  const setAdminTab = (t) => { localStorage.setItem("fonkiart-admin-tab", t); setAdminTabState(t); };
  // The Collectors Room leads back to where it was opened from (Andy: "when going to the collectors
  // room there's no way back to the orders page"): from Admin, "← Back to Orders". Kept beside the
  // page, so a reload in the room still knows.
  const [roomFrom, setRoomFromState] = useState(() => localStorage.getItem(ROOM_FROM) || "");
  const setRoomFrom = (from) => { localStorage.setItem(ROOM_FROM, from); setRoomFromState(from); };
  // "My Account" / mobile account icon — go straight back to admin if already logged in,
  // without re-prompting for the admin password. AdminPage still re-verifies the token
  // with the server on mount, so a stale/forged token doesn't get a free pass here.
  const goAccount = () => {
    if (user?.user_metadata?.role === "buyer") { setPage("buyer-dashboard"); return; }
    if (adminHasToken()) { setPage("admin"); return; }
    setLoginModal(true);
  };
  const [collectorsClient, setCollectorsClient] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fonkiart-collectors-client") || "null"); } catch { return null; }
  });

  const addToCart = (item) => {
    setCart(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]);
  };
  const removeFromCart = (id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };
  // A Cart order paid by card (back from Stripe, or the checkout or the cart finding it paid):
  // only its pieces leave the cart, each title once, and the order kept for paying again is
  // done with.
  const paidCart = (titles) => {
    dropCardOrder();
    setCart(prev => withoutTitles(prev, titles));
  };

  // Brief pulse on the cart icon whenever an item is added, so it's easier to spot.
  const prevCartLen = useRef(cart.length);
  const [cartPulse, setCartPulse] = useState(false);
  useEffect(() => {
    if (cart.length > prevCartLen.current) {
      setCartPulse(true);
      const t = setTimeout(() => setCartPulse(false), 600);
      prevCartLen.current = cart.length;
      return () => clearTimeout(t);
    }
    prevCartLen.current = cart.length;
  }, [cart.length]);

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
    const { error } = await adminDb.from("Settings").upsert({ id: 1, ...supabaseSettings, categories }, { onConflict: "id" });
    if (error) { console.error("Settings save:", error); throw error; }
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
        if (supabase) saveSettings(base.settings, base.categories).catch(() => {});
      }
    };
    init();
    loadArtworks();
    if (!threadToken && !invoiceToken && !cardReturn && !unsubToken && !sessionStorage.getItem("fonkiart-welcome-seen")) {
      setTimeout(() => setShowWelcome(true), 1500);
    }
  }, []);

  // Not the conversation, the invoice or Unsubscribe: they only exist while their link is in the address bar.
  useEffect(() => { if (!LINK_PAGES.has(page)) localStorage.setItem("fonkiart-page", page); }, [page]);
  // The Unsubscribe link stays in the address bar while its page is open (a reload opens it again)
  // and leaves with it.
  useEffect(() => {
    if (!unsubToken || page === "unsubscribe") return;
    window.history.replaceState(window.history.state, "", window.location.pathname + withoutUnsubscribe(window.location.search) + window.location.hash);
  }, [unsubToken, page]);
  useEffect(() => { localStorage.setItem("fonkiart-cart", JSON.stringify(cart)); }, [cart]);
  // After the line above: it counts on the cart being kept here first.
  useSavedCart({ cart, setCart, user, artworks, saving: cartSaving });
  useEffect(() => {
    if (collectorsClient) localStorage.setItem("fonkiart-collectors-client", JSON.stringify(collectorsClient));
    else localStorage.removeItem("fonkiart-collectors-client");
  }, [collectorsClient]);

  // Every page (and every admin section) opens at the top. Without this the
  // browser kept the old scroll position, so a menu tap from far down one page
  // landed far down the next — Andy, 2026-11-12: "big bug". Layout effect, so
  // the new page is never painted at the old position first.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [page, adminTab]);

  // Browser back/forward support — without this, navigating into a page
  // (e.g. Admin) never adds a history entry, so the back button leaves the
  // site entirely (or does nothing) instead of returning to the prior page.
  // Admin tab switches (Dashboard/Artworks/Leads/.../Settings) are tracked
  // too, so Back steps through admin sections before leaving Admin.
  // A checkout (or an invoice's card form) open on a page has Back step inside
  // it first: src/lib/backInside.js. A layout effect, so a page opened with its
  // checkout on it (goCheckout) has its own entry before the checkout adds its.
  const isFirstRender = useRef(true);
  const fromPopState = useRef(false);
  const shown = useRef({ page, adminTab });
  useLayoutEffect(() => {
    shown.current = { page, adminTab };
    if (isFirstRender.current) {
      isFirstRender.current = false;
      history.replaceState(firstEntry({ page, adminTab }), "", window.location.href);
      return;
    }
    if (fromPopState.current) { fromPopState.current = false; return; }
    history.pushState(newEntry({ page, adminTab }), "", window.location.href);
  }, [page, adminTab]);

  useEffect(() => {
    const onPopState = (e) => {
      if (samePageAgain(e.state)) { history.back(); return; }
      const to = e.state?.page || "home", tab = e.state?.adminTab || shown.current.adminTab;
      // Back on the same page (inside its checkout): no page change is coming to skip the entry of.
      if (to !== shown.current.page || tab !== shown.current.adminTab) fromPopState.current = true;
      setPage(to);
      if (e.state?.adminTab) setAdminTabState(e.state.adminTab);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    // A signed-in customer opening a conversation or invoice link stays on it. Anyone else signed
    // in: a buyer's own account, or the Collectors Room, which remembers where it was opened from.
    const land = (u) => {
      if (!u || LINK_PAGES.has(pageRef.current)) return;
      if (u.user_metadata?.role === "buyer") { setPage("buyer-dashboard"); return; }
      if (pageRef.current !== "collectors-room") {
        const from = pageRef.current === "admin" ? "admin" : "";
        localStorage.setItem(ROOM_FROM, from); setRoomFromState(from);
      }
      setPage("collectors-room");
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      land(u);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      land(u);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const titles = {
      home:"Fonkiart — Original Art & Fine Art Prints | Isla Morada, Florida Keys",
      catalog:"Original Art — Fonkiart", cart:"Your Cart — Fonkiart", collections:"Collections — Fonkiart", artprints:"Art Prints — Fonkiart", new:"New Collections — Fonkiart",
      specials:"Specials — Fonkiart", archive:"Past Works — Fonkiart",
      special:"Special Orders — Fonkiart", auctions:"Auctions — Fonkiart",
      partners:"Partners — Fonkiart", contact:"Contact — Fonkiart",
      about:"About Fonkiart", children:"Children Benefit — Fonkiart",
      admin:"Admin — Fonkiart", "buyer-dashboard":"My Account — Fonkiart",
      conversation:"Your Conversation — Fonkiart", invoice:"Your Invoice — Fonkiart",
      unsubscribe:"Coupon Emails — Fonkiart",
      "card-return": cardReturn?.cancelled ? "Your Cart — Fonkiart" : "Your Order — Fonkiart",
    };
    document.title = titles[page] || "Fonkiart";
  }, [page, cardReturn]);

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

  const addArtwork    = async (entry) => { if (!supabase) return; const { data: row } = await adminDb.from("Artworks").insert([cleanArtwork(entry)]).select().single(); setArtworks(prev => [row || entry, ...prev]); };
  const editArtwork   = async (id, entry) => { if (!supabase) return; await adminDb.from("Artworks").update(cleanArtwork(entry)).eq("id", id); setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...entry } : a)); };
  const deleteArtwork = async (id) => { if (!supabase) return; await adminDb.from("Artworks").delete().eq("id", id); setArtworks(prev => prev.filter(a => a.id !== id)); };
  const patchArtwork  = async (id, patch) => { if (!supabase) return; await adminDb.from("Artworks").update(patch).eq("id", id); setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a)); };

  const mergedData = data ? { ...data, items: artworks.length > 0 ? artworks : (data.items || []) } : null;

  if (!mergedData) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"#8a8078" }}>Loading Fonkiart…</div>;

  if (page === "buyer-dashboard" && user) return <BuyerDashboard user={user} onLogout={async () => { await supabase.auth.signOut(); setUser(null); setPage("home"); }} onBack={() => setPage("home")} />;

  if (page === "collectors" && collectorsClient) return <ExclusiveCollectorsPage client={collectorsClient} onLogout={() => { setCollectorsClient(null); setPage("home"); }} artworks={mergedData?.items ?? []} />;

  if (page === "collectors-room") return <CollectorsRoomPage user={user} artworks={mergedData?.items ?? []} settings={mergedData?.settings} onLogout={async () => { await supabase.auth.signOut(); setUser(null); setPage("home"); }} onBack={() => setPage("home")} isAdmin={user?.email?.toLowerCase() === "fonkiart@gmail.com"} onAdminEnter={() => setPage("admin")}
    onBackToOrders={roomFrom === "admin" ? () => { setAdminTab("orders"); setPage("admin"); } : undefined} />;

  if (page === "admin") return <AdminPage data={mergedData} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={() => setPage("home")} autoAuth={adminAuthed} onAutoAuthUsed={() => setAdminAuthed(false)} onViewRoom={() => { setRoomFrom("admin"); setPage("collectors-room"); }} tab={adminTab} setTab={setAdminTab} />;

  const currentNav = page === "cart" || (page === "card-return" && !cardReturn?.session) ? { label: "Your Cart", Icon: ShoppingBag }
    : page === "card-return" ? { label: "Your Order", Icon: Receipt }
    : page === "conversation" ? { label: "Your Conversation", Icon: MessageCircle }
    : page === "invoice" ? { label: "Your Invoice", Icon: Receipt }
    : page === "unsubscribe" ? { label: "Coupon Emails", Icon: Mail }
    : (NAV_ITEMS.find(n => n.id === page) || NAV_ITEMS[0]);

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
            <button key={id} className={`nav-item${page === id ? " active" : ""}`} onClick={() => { if (id === "catalog") setPendingCategory(null); setPage(id); setSidebarOpen(false); }}>
              <Icon size={19} />{label}
            </button>
          ))}
          <div style={{ borderTop:"2px solid var(--border)", margin:"8px 0" }} />
          <button className="nav-item" onClick={() => { setTrackModal(true); setSidebarOpen(false); }}><Package size={19} />Track My Order</button>
          <button className="nav-item" onClick={() => { goAccount(); setSidebarOpen(false); }}>
            <LogIn size={23} />
            {user?.user_metadata?.role === "buyer"
              ? user.user_metadata?.name?.split(" ")[0] || "My Account"
              : collectorsClient ? collectorsClient.name?.split(" ")[0] || "My Account"
              : "Login / Sign Up"}
          </button>
          <button className="nav-item" onClick={() => { setAuthModal(true); setSidebarOpen(false); }}><KeyRound size={19} />Request Access</button>
        </nav>
        <div className="sidebar-bottom" />
      </aside>

      <div className="content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="hamburger" aria-label="Menu" onClick={() => setSidebarOpen(o => !o)}><Menu size={24} /></button>
            <SocialIcons settings={data.settings} className="social-icons-desktop" />
            {page !== "home" && (
              <div className="topbar-title"><currentNav.Icon size={19} style={{ flexShrink:0 }} /><span className="topbar-title-text">{currentNav.label}</span></div>
            )}
          </div>
          {page === "home" && (
            <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase", color:"var(--ink)", display:"flex", alignItems:"center", gap:8, pointerEvents:"none" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--gold)", flexShrink:0 }} />Fonkiart
            </div>
          )}
          <div className="topbar-right">
            <button onClick={() => setCartOpen(o => !o)} title="Shopping Cart" aria-label="Shopping Cart" className={`topbar-icon-btn topbar-cart${cartPulse ? " cart-icon-pulse" : ""}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              {cart.length > 0 && <span className="cart-fab-badge" style={{ position:"absolute", top:"calc(50% - 21px)", right:"calc(50% - 24px)" }}>{cart.length}</span>}
            </button>
            <button onClick={goAccount} title="My Account" aria-label="My Account" className="topbar-icon-btn topbar-account">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {user && <span style={{ position:"absolute", bottom:"calc(50% - 11px)", right:"calc(50% - 11px)", width:8, height:8, borderRadius:"50%", background:"var(--ok)", border:"1px solid #fff" }} />}
            </button>
            {page !== "home" && <button className="topbar-home-btn" onClick={() => setPage("home")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:16, letterSpacing:".1em", color:"var(--gold)", display:"flex", alignItems:"center", gap:5, padding:0 }}>← Home</button>}
            {page === "home" && <button className="topbar-tag" onClick={() => goToPage("catalog")} style={{ cursor:"pointer", border:"none" }}>Shop Now</button>}
          </div>
        </div>

        {showWelcome && <WelcomeModal onClose={() => { setShowWelcome(false); sessionStorage.setItem("fonkiart-welcome-seen","1"); }} discount={mergedData.settings.couponDiscount ?? 15} artworks={mergedData.items} saving={cartSaving} onSignIn={user ? undefined : signInAs} />}
        {authModal && <AuthModal user={user} onClose={() => setAuthModal(false)} artworks={mergedData.items} />}
        <CartMemory cart={cart} user={user} settings={mergedData.settings} quiet={LINK_PAGES.has(page)} saving={cartSaving} onSignIn={user ? undefined : signInAs} />
        {trackModal && <TrackOrderModal onClose={() => setTrackModal(false)} />}
        {resetLink?.admin && <NewPasswordModal title="New Admin Password" subtitle="Choose the password you'll use to sign in to the admin."
          submitLabel="Save and open the admin →" onSubmit={(pw) => setAdminPassword(resetLink.token, pw)} onClose={() => setResetLink(null)}
          onDone={() => { setResetLink(null); setAdminAuthed(true); setPage("admin"); }} />}
        {resetLink && !resetLink.admin && <NewPasswordModal title="New Password" subtitle="Choose a new password for your Fonkiart account."
          submitLabel="Save my new password →" onClose={() => setResetLink(null)}
          onSubmit={async (pw) => { const r = await storeCall("reset-set", { token: resetLink.token, password: pw }); setLoginNotice({ email: r.email, text: "Password changed. Sign in with your new password." }); }}
          onDone={() => { setResetLink(null); setLoginModal(true); }} />}
        {loginModal && <BuyerAuthModal initialEmail={loginNotice?.email} notice={loginNotice?.text} onClose={() => { setLoginModal(false); setLoginNotice(null); }}onAdminLogin={() => { setAdminAuthed(true); setPage("admin"); setLoginModal(false); setSidebarOpen(false); }} onClientLogin={(client) => { setCollectorsClient(client); setPage("collectors"); setLoginModal(false); setSidebarOpen(false); }} />}
        <CookieBanner onContact={() => setPage("contact")} />
        <MarqueeStrip settings={data.settings} />

        {page === "home"     && <HomePage setPage={goToPage} data={mergedData} />}
        {page === "catalog"  && <CatalogPage data={mergedData} addToCart={addToCart} cart={cart} onCheckout={goCheckout} initialCategory={pendingCategory} key={pendingCategory || "all"} />}
        {page === "artprints" && <CatalogPage data={mergedData} addToCart={addToCart} cart={cart} onCheckout={goCheckout} initialCategory="Art Prints" key="artprints" />}
        {page === "collections" && <CollectionsPage data={mergedData} setPage={goToPage} goToCategory={goToCategory} />}
        {(page === "cart" || (page === "card-return" && !cardReturn?.session)) && <CartPage key={cartView.n} startCheckout={cartView.checkout} onStarted={() => setCartView(v => ({ ...v, checkout: false }))} cart={cart} removeFromCart={removeFromCart} addToCart={addToCart} items={mergedData.items} settings={mergedData.settings} setPage={goToPage} onPaid={paidCart} cancelledRef={page === "card-return" ? cardReturn?.ref : undefined} savedFor={<CartRemembered count={cart.length} user={user} saving={cartSaving} />} />}
        {page === "card-return" && cardReturn?.session && <CardReturnPage orderRef={cardReturn.ref} session={cardReturn.session} artworks={mergedData.items} onPaid={paidCart} setPage={goToPage} />}
        {page === "special"  && <SpecialOrdersPage setPage={goToPage} />}
        {page === "auctions" && <AuctionsPage />}
        {page === "partners" && <PartnersPage setPage={goToPage} />}
        {page === "contact"  && <ContactPage data={mergedData} />}
        {page === "new"      && <NewCollectionsPage data={mergedData} addToCart={addToCart} cart={cart} onCheckout={goCheckout} />}
        {page === "specials" && <SpecialsPage data={mergedData} addToCart={addToCart} cart={cart} onCheckout={goCheckout} />}
        {page === "about"    && <AboutPage />}
        {page === "archive"  && <SoldPage data={mergedData} />}
        {page === "children" && <ChildrenPage setPage={goToPage} />}
        {page === "conversation" && threadToken && <ThreadPage token={threadToken} embedded artworks={mergedData.items} />}
        {page === "invoice" && invoiceToken && <InvoicePage token={invoiceToken} shopView={invoiceShopView} embedded artworks={mergedData.items} />}
        {page === "unsubscribe" && unsubToken && <UnsubscribePage token={unsubToken} setPage={goToPage} />}

        <Footer settings={mergedData.settings} onTrackOrder={() => setTrackModal(true)} />
        <FloatingCart cart={cart} removeFromCart={removeFromCart} cartOpen={cartOpen} setCartOpen={setCartOpen} onView={setDeepModal} onViewCart={() => openCart(false)} />
        <MobileBottomNav page={page} setPage={goToPage} cartCount={cart.length} onCart={() => setCartOpen(true)} onAccount={goAccount} />

        {deepModal && !deepPriceInquiry && (
          <ArtworkModal
            item={deepModal}
            sold={!!deepModal.isSold}
            onClose={() => setDeepModal(null)}
            inCart={cart.some(i => i.id === deepModal.id)}
            onCheckout={() => { setDeepModal(null); setCartOpen(false); goCheckout(); }}
            onBuy={deepModal.isSold ? undefined : (s) => {
              setDeepModal(null);
              s.price || s.salePrice ? addToCart(s) : setDeepPriceInquiry(s);
            }}
          />
        )}
        {deepPriceInquiry && (
          <PriceInquiryModal item={deepPriceInquiry} onClose={() => setDeepPriceInquiry(null)} />
        )}
      </div>
    </div>
  );
}
