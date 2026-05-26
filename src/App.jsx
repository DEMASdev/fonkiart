import { useState, useEffect, useRef } from "react";
import {
  Home, LayoutGrid, Star, Timer, Handshake, Mail,
  Info, Heart, Settings, ChevronRight, X, Menu
} from "lucide-react";

const ADMIN_PASSWORD = "Fonki1717";
const STORE_KEY = "fonkiart-v2";
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');`;
const DEFAULT_CATEGORIES = ["The Ladies", "Ocean", "Mountain", "Windows"];

const NAV_ITEMS = [
  { id: "home",     label: "Home",             Icon: Home },
  { id: "catalog",  label: "Catalog",           Icon: LayoutGrid },
  { id: "special",  label: "Special Orders",    Icon: Star },
  { id: "auctions", label: "Auctions",          Icon: Timer },
  { id: "partners", label: "Partners",          Icon: Handshake },
  { id: "contact",  label: "Contact Us",        Icon: Mail },
  { id: "about",    label: "About Us",          Icon: Info },
  { id: "children", label: "Children Benefit",  Icon: Heart },
];

const css = `
* { box-sizing:border-box;margin:0;padding:0; }
body { font-family:'DM Sans',sans-serif;background:#fdfcf8;color:#1c1a18; }
:root { --cream:#fdfcf8;--white:#fff;--ink:#1c1a18;--muted:#8a8078;--accent:#c9a96e;--border:#ece7dd;--gold:#c9a96e;--sidebar-bg:#1e3a52;--sidebar:240px;--topbar:58px; }

/* ── LAYOUT ── */
.layout { display:flex;min-height:100vh; }

/* ── SIDEBAR ── */
.sidebar {
  width:var(--sidebar);min-width:var(--sidebar);
  background:var(--sidebar-bg);
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;height:100vh;
  z-index:200;transition:transform .3s ease;
}
.sidebar-logo {
  padding:28px 24px 24px;
  border-bottom:1px solid rgba(255,255,255,.08);
}
.logo-text {
  font-family:'Cormorant Garamond',serif;
  font-size:22px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:#fff;
  display:flex;align-items:center;gap:8px;
}
.logo-dot { width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0; }
.logo-sub { font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-top:4px; }

.sidebar-nav { flex:1;padding:16px 0;overflow-y:auto; }
.nav-item {
  display:flex;align-items:center;gap:12px;
  padding:11px 24px;cursor:pointer;
  font-size:13px;letter-spacing:.06em;
  color:rgba(255,255,255,.55);
  transition:all .18s;border:none;background:none;
  width:100%;text-align:left;position:relative;
}
.nav-item:hover { color:#fff;background:rgba(255,255,255,.06); }
.nav-item.active {
  color:#fff;background:rgba(255,255,255,.1);
}
.nav-item.active::before {
  content:'';position:absolute;left:0;top:0;bottom:0;
  width:3px;background:var(--gold);border-radius:0 2px 2px 0;
}
.nav-item svg { flex-shrink:0;opacity:.75; }
.nav-item.active svg,.nav-item:hover svg { opacity:1; }

.sidebar-bottom {
  padding:16px 0;border-top:1px solid rgba(255,255,255,.08);
}
.nav-item-admin { color:rgba(255,255,255,.4);font-size:12px; }

/* ── TOP BAR ── */
.topbar {
  position:fixed;top:0;left:var(--sidebar);right:0;
  height:var(--topbar);z-index:100;
  background:rgba(253,252,248,.96);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 40px;
}
.topbar-title {
  font-family:'Cormorant Garamond',serif;
  font-size:18px;font-weight:300;letter-spacing:.06em;color:var(--ink);
  display:flex;align-items:center;gap:8px;
}
.topbar-title svg { color:var(--gold); }
.topbar-right { display:flex;align-items:center;gap:20px; }
.topbar-tag {
  font-size:11px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--gold);background:rgba(201,169,110,.12);
  padding:4px 12px;border-radius:20px;
}
.hamburger {
  display:none;background:none;border:none;cursor:pointer;
  color:var(--ink);padding:4px;
}

/* ── CONTENT ── */
.content {
  margin-left:var(--sidebar);
  padding-top:var(--topbar);
  flex:1;min-height:100vh;
}

/* ── HERO ── */
.hero { display:grid;grid-template-columns:1.1fr 1fr;min-height:56vh;overflow:hidden; }
.hero-left { background:var(--sidebar-bg);padding:56px 48px;display:flex;flex-direction:column;justify-content:flex-end; }
.hero-eyebrow { font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-bottom:18px; }
.hero-title { font-family:'Cormorant Garamond',serif;font-size:clamp(40px,4.5vw,64px);font-weight:300;line-height:1.05;color:#fff;margin-bottom:18px; }
.hero-title em { font-style:italic;color:var(--accent); }
.hero-sub { font-size:14px;color:rgba(255,255,255,.45);line-height:1.65;max-width:340px; }
.hero-right { background:linear-gradient(135deg,#e8e2d9 0%,#d4cdc4 100%);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:88px;color:rgba(255,255,255,.38);letter-spacing:-.05em;user-select:none; }

/* ── SECTION PAGE ── */
.page { padding:48px; }
.page-hero {
  padding:52px 48px;background:var(--sidebar-bg);
  margin-bottom:0;
}
.page-hero-eyebrow { font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:14px; }
.page-hero-title { font-family:'Cormorant Garamond',serif;font-size:clamp(36px,4vw,56px);font-weight:300;color:#fff;line-height:1.1; }
.page-hero-sub { font-size:14px;color:rgba(255,255,255,.45);margin-top:14px;max-width:480px;line-height:1.65; }

.placeholder-body { padding:52px 48px;max-width:720px; }
.placeholder-body p { font-size:15px;color:var(--muted);line-height:1.8;margin-bottom:20px; }
.placeholder-body h2 { font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;margin-bottom:16px;color:var(--ink); }

/* ── CATALOG ── */
.cats { display:flex;align-items:center;border-bottom:1px solid var(--border);padding:0 48px;overflow-x:auto;background:var(--white); }
.cat-tab { padding:16px 24px;background:none;border:none;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s; }
.cat-tab:hover { color:var(--ink); }
.cat-tab.active { color:var(--ink);border-bottom-color:var(--gold);font-weight:500; }

.gallery { padding:40px 48px; }
.gallery-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:3px; }
.gallery-empty { text-align:center;padding:80px 0;color:var(--muted); }
.gallery-empty h3 { font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;margin-bottom:8px; }

.card { position:relative;overflow:hidden;cursor:pointer;aspect-ratio:3/4;background:#e8e2d9; }
.card img { width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.25,.46,.45,.94);display:block; }
.card:hover img { transform:scale(1.06); }
.card-over { position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,6,.78) 0%,transparent 55%);opacity:0;transition:opacity .35s;display:flex;flex-direction:column;justify-content:flex-end;padding:24px; }
.card:hover .card-over { opacity:1; }
.card-cat { font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:5px; }
.card-title { font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:#fff;margin-bottom:5px; }
.card-price { font-size:14px;color:var(--accent);font-weight:500;margin-bottom:12px; }
.card-btn { background:#fff;color:var(--ink);border:none;padding:9px 0;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500;width:100%;transition:background .2s; }
.card-btn:hover { background:var(--gold);color:#fff; }

/* ── MODALS ── */
.modal-bg { position:fixed;inset:0;z-index:300;background:rgba(10,8,6,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;animation:fi .2s ease; }
@keyframes fi { from{opacity:0}to{opacity:1} }
.modal { background:var(--cream);max-width:900px;width:100%;display:grid;grid-template-columns:1.1fr 1fr;max-height:92vh;overflow:hidden;animation:su .3s cubic-bezier(.25,.46,.45,.94); }
@keyframes su { from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1} }
.modal-img { width:100%;height:100%;object-fit:cover;max-height:92vh; }
.modal-info { padding:40px 36px;overflow-y:auto;display:flex;flex-direction:column; }
.modal-close { align-self:flex-end;background:none;border:none;cursor:pointer;color:var(--muted);font-size:22px;line-height:1;margin-bottom:24px;transition:color .2s; }
.modal-close:hover { color:var(--ink); }
.modal-cat { font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:10px; }
.modal-title { font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:300;line-height:1.15;margin-bottom:18px; }
.modal-desc { font-size:14px;line-height:1.75;color:var(--muted);flex:1;margin-bottom:24px; }
.modal-price { font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:400;color:var(--ink);margin-bottom:20px; }
.buy-btn { background:var(--ink);color:#fff;border:none;padding:15px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;width:100%;transition:background .2s;margin-bottom:8px; }
.buy-btn:hover { background:var(--gold); }
.buy-note { font-size:12px;color:var(--muted);text-align:center; }

/* ── CHECKOUT ── */
.checkout { background:var(--white);max-width:460px;width:100%;padding:44px;animation:su .3s cubic-bezier(.25,.46,.45,.94);position:relative; }
.checkout h2 { font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;margin-bottom:6px; }
.checkout-sub { font-size:13px;color:var(--muted);margin-bottom:28px; }
.pay-opts { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px; }
.pay-opt { border:2px solid var(--border);padding:18px 14px;cursor:pointer;text-align:center;transition:all .2s;background:none;width:100%; }
.pay-opt:hover { border-color:var(--accent); }
.pay-opt.sel { border-color:var(--ink);background:var(--ink);color:#fff; }
.pay-opt-icon { font-size:24px;margin-bottom:7px;display:block; }
.pay-opt-label { font-size:13px;font-weight:500;letter-spacing:.05em; }
.pay-opt-sub { font-size:11px;color:var(--muted);margin-top:2px; }
.pay-opt.sel .pay-opt-sub { color:rgba(255,255,255,.55); }
.pay-detail { background:var(--cream);padding:20px;margin-bottom:20px;border:1px solid var(--border); }
.pay-detail h4 { font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:14px; }
.zelle-amount { font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--gold);margin-bottom:6px; }
.zelle-contact { font-size:17px;font-weight:500;color:var(--ink);margin-bottom:12px; }
.zelle-steps { font-size:13px;color:var(--muted);line-height:1.85; }
.confirm-btn { background:var(--gold);color:#fff;border:none;padding:14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;width:100%;transition:background .2s; }
.confirm-btn:hover { background:#a07a3a; }
.stripe-btn { background:#635bff;color:#fff;border:none;padding:14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;letter-spacing:.08em;width:100%;transition:background .2s; }
.stripe-btn:hover { background:#4b44cc; }

/* ── FOOTER ── */
.footer { border-top:1px solid var(--border);padding:32px 48px;display:flex;justify-content:space-between;align-items:center;background:var(--white);margin-top:48px; }
.footer-logo { font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;letter-spacing:.12em;text-transform:uppercase; }
.footer-copy { font-size:12px;color:var(--muted); }

/* ── ADMIN ── */
.admin-wrap { min-height:100vh;background:var(--cream); }
.admin-top { background:var(--sidebar-bg);padding:0 36px;height:56px;display:flex;align-items:center;justify-content:space-between; }
.admin-top-title { font-family:'Cormorant Garamond',serif;font-size:18px;color:#fff;letter-spacing:.1em; }
.admin-body { display:grid;grid-template-columns:380px 1fr;min-height:calc(100vh - 56px); }
.admin-side { padding:32px 28px;border-right:1px solid var(--border);overflow-y:auto; }
.admin-side h2 { font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:400;margin-bottom:22px; }
.admin-main { padding:32px 28px;overflow-y:auto; }
.admin-main h2 { font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:400;margin-bottom:18px; }
.fld { margin-bottom:16px; }
.fld label { display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:6px; }
.fld input,.fld textarea,.fld select { width:100%;border:1px solid var(--border);background:#fff;padding:9px 13px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);outline:none;transition:border-color .2s; }
.fld input:focus,.fld textarea:focus,.fld select:focus { border-color:var(--accent); }
.fld textarea { resize:vertical;min-height:76px; }
.img-drop { width:100%;height:170px;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;margin-bottom:14px;transition:border-color .2s;color:var(--muted);font-size:13px; }
.img-drop:hover { border-color:var(--accent); }
.img-prev { width:100%;height:170px;object-fit:cover;margin-bottom:14px;display:block;border:1px solid var(--border);cursor:pointer; }
.btn-p { background:var(--ink);color:#fff;border:none;padding:11px 24px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;transition:background .2s; }
.btn-p:hover { background:#333; }
.btn-s { background:transparent;color:var(--muted);border:1px solid var(--border);padding:9px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;transition:all .2s; }
.btn-s:hover { border-color:var(--ink);color:var(--ink); }
.btn-d { background:transparent;color:#c0392b;border:1px solid #e8c0bd;padding:6px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;transition:all .2s; }
.btn-d:hover { background:#c0392b;color:#fff;border-color:#c0392b; }
.ok-msg { background:#f0faf5;border:1px solid #b7e4c7;color:#2d6a4f;padding:9px 14px;font-size:13px;margin-bottom:14px; }
.warn-msg { background:#fff8f0;border:1px solid #f0d5a8;color:#7a4f00;padding:9px 14px;font-size:13px;margin-bottom:14px; }
.row-btns { display:flex;gap:10px;flex-wrap:wrap;align-items:center; }
.admin-item { display:grid;grid-template-columns:68px 1fr auto;gap:14px;align-items:center;padding:13px;border:1px solid var(--border);background:#fff;margin-bottom:9px; }
.admin-item img { width:68px;height:68px;object-fit:cover; }
.ai-title { font-size:14px;font-weight:500;margin-bottom:2px; }
.ai-meta { font-size:12px;color:var(--muted); }
.ai-btns { display:flex;gap:7px; }
.settings-box { background:#fff;border:1px solid var(--border);padding:22px;margin-bottom:20px; }
.settings-box h3 { font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px; }
.cat-list { display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px; }
.cat-chip { display:flex;align-items:center;gap:5px;background:var(--cream);border:1px solid var(--border);padding:5px 11px;font-size:13px; }
.cat-chip-del { background:none;border:none;cursor:pointer;color:var(--muted);font-size:17px;line-height:1;transition:color .2s; }
.cat-chip-del:hover { color:#c0392b; }
.admin-tabs { display:flex;border-bottom:1px solid var(--border);margin-bottom:24px; }
.admin-tab { padding:11px 22px;background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s; }
.admin-tab.active { color:var(--ink);border-bottom-color:var(--gold); }
.login-wrap { min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--cream); }
.login-box { width:340px;padding:48px;border:1px solid var(--border);background:#fff; }
.login-title { font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;margin-bottom:28px; }
.err { color:#c0392b;font-size:13px;margin-top:5px; }

/* ── CONTACT FORM ── */
.contact-grid { display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:48px; }
.contact-info h2 { font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;margin-bottom:16px; }
.contact-info p { font-size:14px;color:var(--muted);line-height:1.8;margin-bottom:24px; }
.contact-detail { display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted);margin-bottom:10px; }
.contact-detail svg { color:var(--gold); }
.contact-form-box { background:#fff;padding:36px;border:1px solid var(--border); }
.contact-form-box h3 { font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;margin-bottom:22px; }

/* ── MOBILE ── */
.sidebar-overlay { display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:190; }
@media(max-width:900px){
  :root { --sidebar:0px; }
  .sidebar { transform:translateX(-240px);width:240px; }
  .sidebar.open { transform:translateX(0); }
  .sidebar-overlay.open { display:block; }
  .topbar { left:0; }
  .content { margin-left:0; }
  .hamburger { display:flex; }
  .hero { grid-template-columns:1fr; }
  .hero-right { display:none; }
  .cats { padding:0 20px; }
  .gallery { padding:24px 20px; }
  .contact-grid { grid-template-columns:1fr; }
  .modal { grid-template-columns:1fr; }
  .modal-img { max-height:260px; }
  .admin-body { grid-template-columns:1fr; }
  .footer { flex-direction:column;gap:10px;text-align:center; }
  .page,.page-hero,.placeholder-body { padding-left:20px;padding-right:20px; }
}
`;

// ─── STORAGE (uses localStorage instead of window.storage) ──
async function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
async function saveData(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}

const DEFAULT_STATE = {
  items: [],
  categories: DEFAULT_CATEGORIES,
  settings: { zelleContact: "fonkiart@gmail.com", zelleLabel: "email", stripeLink: "" }
};

// ─── ROOT ────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [data, setData] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadData().then(d => setData(d || JSON.parse(JSON.stringify(DEFAULT_STATE))));
  }, []);

  const updateData = async (patch) => {
    const next = { ...data, ...patch };
    setData(next);
    await saveData(next);
  };

  if (!data) return (
    <>
      <style>{FONTS}{css}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"#8a8078" }}>
        Loading Fonkiart…
      </div>
    </>
  );

  if (page === "admin") return (
    <>
      <style>{FONTS}{css}</style>
      <AdminPage data={data} updateData={updateData} onBack={() => setPage("home")} />
    </>
  );

  const currentNav = NAV_ITEMS.find(n => n.id === page) || NAV_ITEMS[0];

  return (
    <>
      <style>{FONTS}{css}</style>
      <div className="layout">
        <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-logo">
            <div className="logo-text">
              <div className="logo-dot" />
              Fonkiart
            </div>
            <div className="logo-sub">Art & Photography</div>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`nav-item${page === id ? " active" : ""}`}
                onClick={() => { setPage(id); setSidebarOpen(false); }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <button className="nav-item nav-item-admin" onClick={() => setPage("admin")}>
              <Settings size={15} />
              Admin Panel
            </button>
          </div>
        </aside>

        <div className="content">
          <div className="topbar">
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
                <Menu size={20} />
              </button>
              <div className="topbar-title">
                <currentNav.Icon size={16} />
                {currentNav.label}
              </div>
            </div>
            <div className="topbar-right">
              <span className="topbar-tag">Original Works</span>
            </div>
          </div>

          {page === "home"     && <HomePage setPage={setPage} />}
          {page === "catalog"  && <CatalogPage data={data} />}
          {page === "special"  && <SpecialOrdersPage />}
          {page === "auctions" && <AuctionsPage />}
          {page === "partners" && <PartnersPage />}
          {page === "contact"  && <ContactPage data={data} />}
          {page === "about"    && <AboutPage />}
          {page === "children" && <ChildrenPage />}
        </div>
      </div>
    </>
  );
}

// ─── HOME ───────────────────────────────────
function HomePage({ setPage }) {
  return (
    <div>
      <div className="hero">
        <div className="hero-left">
          <p className="hero-eyebrow">Original Art & Photography</p>
          <h1 className="hero-title">Where <em>art</em><br />meets the soul</h1>
          <p className="hero-sub">Curated works available for purchase. Each piece is original and ships worldwide.</p>
          <div style={{ display:"flex", gap:12, marginTop:32 }}>
            <button className="btn-p" onClick={() => setPage("catalog")} style={{ background:"var(--gold)" }}>Browse Catalog</button>
            <button className="btn-s" onClick={() => setPage("special")} style={{ color:"rgba(255,255,255,.6)", borderColor:"rgba(255,255,255,.2)" }}>Special Orders</button>
          </div>
        </div>
        <div className="hero-right">FK</div>
      </div>

      <div style={{ padding:"52px 48px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:2 }}>
        {[
          { icon:"🎨", label:"Original Art", desc:"One-of-a-kind pieces" },
          { icon:"📸", label:"Photography", desc:"Fine art prints" },
          { icon:"✨", label:"Special Orders", desc:"Custom commissions" },
          { icon:"❤️", label:"Children Benefit", desc:"Art for a cause" },
        ].map(c => (
          <div key={c.label} style={{ background:"#fff", padding:"32px 28px", borderBottom:"3px solid var(--gold)" }}>
            <div style={{ fontSize:28, marginBottom:14 }}>{c.icon}</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:13, color:"var(--muted)" }}>{c.desc}</div>
          </div>
        ))}
      </div>

      <footer className="footer">
        <div className="footer-logo">Fonkiart</div>
        <div className="footer-copy">© {new Date().getFullYear()} Fonkiart · All rights reserved</div>
      </footer>
    </div>
  );
}

// ─── CATALOG ────────────────────────────────
function CatalogPage({ data }) {
  const [cat, setCat] = useState("All");
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);

  const tabs = ["All", ...data.categories];
  const filtered = cat === "All" ? data.items : data.items.filter(i => i.category === cat);

  return (
    <div>
      <div className="cats">
        {tabs.map(c => (
          <button key={c} className={`cat-tab${cat === c ? " active" : ""}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="gallery">
        {filtered.length === 0
          ? <div className="gallery-empty">
              <h3>No works in this collection yet</h3>
              <p style={{ fontSize:13 }}>Add pieces via the Admin panel.</p>
            </div>
          : <div className="gallery-grid">
              {filtered.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} />
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    {item.price && <div className="card-price">${Number(item.price).toLocaleString()}</div>}
                    <button className="card-btn" onClick={e => { e.stopPropagation(); setCheckout(item); }}>Purchase</button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {selected && (
        <div className="modal-bg" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <img className="modal-img" src={selected.image} alt={selected.title} />
            <div className="modal-info">
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
              <p className="modal-cat">{selected.category}</p>
              <h2 className="modal-title">{selected.title}</h2>
              <p className="modal-desc">{selected.description || "Original work by Fonkiart."}</p>
              {selected.price && <div className="modal-price">${Number(selected.price).toLocaleString()}</div>}
              <button className="buy-btn" onClick={() => { setSelected(null); setCheckout(selected); }}>Purchase This Piece</button>
              <p className="buy-note">Ships worldwide · Secure payment</p>
            </div>
          </div>
        </div>
      )}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
    </div>
  );
}

// ─── CHECKOUT ───────────────────────────────
function CheckoutModal({ item, settings, onClose }) {
  const [method, setMethod] = useState(null);
  const [done, setDone] = useState(false);

  if (done) return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:50, marginBottom:14 }}>🎨</div>
        <h2 style={{ marginBottom:10 }}>Thank you!</h2>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, marginBottom:28 }}>
          Your order for <strong>{item.title}</strong> has been received.<br />
          Fonkiart will confirm and reach out about shipping.
        </p>
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const handleCard = () => {
    const link = item.stripeLink || settings.stripeLink;
    if (link) { window.open(link, "_blank"); setDone(true); }
    else alert("Card payment is being set up. Please use Zelle for now or contact Fonkiart directly.");
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Purchase</h2>
        <p className="checkout-sub">{item.title}{item.price ? ` · $${Number(item.price).toLocaleString()}` : ""}</p>
        <div className="pay-opts">
          <button className={`pay-opt${method==="zelle"?" sel":""}`} onClick={() => setMethod("zelle")}>
            <span className="pay-opt-icon">💚</span>
            <div className="pay-opt-label">Zelle</div>
            <div className="pay-opt-sub">Instant · Free</div>
          </button>
          <button className={`pay-opt${method==="card"?" sel":""}`} onClick={() => setMethod("card")}>
            <span className="pay-opt-icon">💳</span>
            <div className="pay-opt-label">Credit Card</div>
            <div className="pay-opt-sub">Stripe · Secure</div>
          </button>
        </div>
        {method === "zelle" && (
          <div className="pay-detail">
            <h4>Send via Zelle</h4>
            <div className="zelle-amount">${Number(item.price||0).toLocaleString()}</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:5 }}>Send to this {settings.zelleLabel}:</div>
            <div className="zelle-contact">{settings.zelleContact}</div>
            <div className="zelle-steps">
              1. Open your bank app → Zelle<br />
              2. Send <strong>${Number(item.price||0).toLocaleString()}</strong> to <strong>{settings.zelleContact}</strong><br />
              3. Memo: <strong>"{item.title}"</strong><br />
              4. Confirm below — we ship once payment clears ✓
            </div>
          </div>
        )}
        {method === "card" && (
          <div className="pay-detail">
            <h4>Secure Credit Card via Stripe</h4>
            <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7 }}>
              You'll be redirected to our secure Stripe checkout to complete your purchase of <strong>{item.title}</strong>{item.price ? ` for $${Number(item.price).toLocaleString()}` : ""}.
            </p>
          </div>
        )}
        {method==="zelle" && <button className="confirm-btn" onClick={() => setDone(true)}>✓ I've Sent the Payment</button>}
        {method==="card"  && <button className="stripe-btn" onClick={handleCard}>Pay Securely with Card →</button>}
        {!method && <p style={{ textAlign:"center", fontSize:13, color:"var(--muted)" }}>Choose a payment method above</p>}
      </div>
    </div>
  );
}

// ─── STATIC PAGES ───────────────────────────
function SpecialOrdersPage() {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Bespoke Creations</p>
        <h1 className="page-hero-title">Special Orders</h1>
        <p className="page-hero-sub">Have something specific in mind? Fonkiart accepts custom commissions — from personal portraits to large-scale installations.</p>
      </div>
      <div className="placeholder-body">
        <h2>How It Works</h2>
        <p>Every special order begins with a conversation. Describe your vision — the subject, size, medium, and timeline — and Fonkiart will create a piece made exclusively for you.</p>
        <p>Custom commissions typically take 2–6 weeks depending on complexity. A deposit is required to begin, with the balance due upon completion.</p>
        <p>To get started, reach out via the <strong>Contact Us</strong> page or send a direct message. We'll respond within 48 hours.</p>
        <button className="btn-p">Request a Commission</button>
      </div>
    </div>
  );
}

function AuctionsPage() {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Live & Online</p>
        <h1 className="page-hero-title">Auctions</h1>
        <p className="page-hero-sub">Bid on exclusive works and rare pieces. Auctions are held periodically — check back for upcoming events.</p>
      </div>
      <div className="placeholder-body">
        <h2>Upcoming Auctions</h2>
        <p>No live auctions at the moment. Follow Fonkiart on social media or check back soon to be the first to know about upcoming auction events.</p>
        <p>Past auction highlights and available prints from previous events can be found in the <strong>Catalog</strong>.</p>
      </div>
    </div>
  );
}

function PartnersPage() {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Collaborations</p>
        <h1 className="page-hero-title">Partners</h1>
        <p className="page-hero-sub">Fonkiart collaborates with galleries, brands, and organizations that share a passion for meaningful art.</p>
      </div>
      <div className="placeholder-body">
        <h2>Partner With Us</h2>
        <p>We're open to collaborations with interior designers, hotels, event planners, non-profits, and corporate clients looking to enrich their spaces with original art.</p>
        <p>If you're interested in becoming a partner or featuring Fonkiart's work in your venue or platform, please reach out through the Contact page.</p>
        <button className="btn-p">Get in Touch</button>
      </div>
    </div>
  );
}

function ContactPage({ data }) {
  const [form, setForm] = useState({ name:"", email:"", message:"" });
  const [sent, setSent] = useState(false);
  const f = (k,v) => setForm(fm => ({ ...fm, [k]:v }));

  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Get In Touch</p>
        <h1 className="page-hero-title">Contact Us</h1>
      </div>
      <div className="contact-grid">
        <div className="contact-info">
          <h2>We'd love to hear from you</h2>
          <p>Whether you're interested in purchasing a piece, placing a special order, or just want to say hello — Fonkiart is always happy to connect.</p>
          <div className="contact-detail"><Mail size={16} />{data.settings.zelleContact}</div>
          <div className="contact-detail"><Heart size={16} />Open to commissions & collaborations</div>
        </div>
        <div className="contact-form-box">
          <h3>Send a Message</h3>
          {sent
            ? <div className="ok-msg" style={{ fontSize:15 }}>✓ Message sent! We'll be in touch soon.</div>
            : <>
                <div className="fld"><label>Name</label><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Your name" /></div>
                <div className="fld"><label>Email</label><input value={form.email} onChange={e=>f("email",e.target.value)} placeholder="your@email.com" /></div>
                <div className="fld"><label>Message</label><textarea value={form.message} onChange={e=>f("message",e.target.value)} placeholder="Tell us what you have in mind…" style={{ minHeight:120 }} /></div>
                <button className="btn-p" style={{ width:"100%" }} onClick={() => { if(form.name&&form.email&&form.message) setSent(true); }}>Send Message</button>
              </>
          }
        </div>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">The Story</p>
        <h1 className="page-hero-title">About Fonkiart</h1>
      </div>
      <div className="placeholder-body">
        <h2>Vision & Mission</h2>
        <p>Fonkiart was born from a deep love of capturing life's most intimate and powerful moments — through paint, lens, and light. Every piece is created with intention, emotion, and craftsmanship.</p>
        <p>The name "Fonkiart" reflects a belief that art should feel <em>alive</em> — vibrant, personal, and full of character. Whether it's a sweeping ocean landscape or a quiet portrait, the goal is always the same: to create something that resonates.</p>
        <h2>The Artist</h2>
        <p>Based in South Florida, Fonkiart creates original works across multiple disciplines — painting, photography, and mixed media. Available for commissions, gallery shows, and collaborative projects worldwide.</p>
      </div>
    </div>
  );
}

function ChildrenPage() {
  return (
    <div>
      <div className="page-hero" style={{ background:"linear-gradient(135deg,#1e3a52 60%,#2a4d3e 100%)" }}>
        <p className="page-hero-eyebrow">Art for a Cause</p>
        <h1 className="page-hero-title">Children Benefit</h1>
        <p className="page-hero-sub">A portion of every sale supports programs that bring art education to children in underserved communities.</p>
      </div>
      <div className="placeholder-body">
        <h2>Why It Matters</h2>
        <p>Art changes lives. For children who may not have access to creative education, it opens doors to self-expression, confidence, and new possibilities.</p>
        <p>Fonkiart donates a percentage of proceeds from designated works to local and national children's art programs. When you purchase a piece marked for this initiative, you're not just collecting art — you're investing in a child's future.</p>
        <p>Look for the ❤️ badge in the Catalog to find pieces that directly support the Children Benefit program.</p>
        <button className="btn-p">Learn More</button>
      </div>
    </div>
  );
}

// ─── ADMIN AUTH ─────────────────────────────
function AdminPage({ data, updateData, onBack }) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  if (!authed) return (
    <div className="login-wrap">
      <div className="login-box">
        <h2 className="login-title">Admin · Fonkiart</h2>
        <div className="fld">
          <label>Password</label>
          <input type="password" value={pw} placeholder="Password"
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter") pw===ADMIN_PASSWORD?setAuthed(true):setErr("Incorrect password"); }} />
          {err && <p className="err">{err}</p>}
        </div>
        <button className="btn-p" style={{ width:"100%" }} onClick={() => pw===ADMIN_PASSWORD?setAuthed(true):setErr("Incorrect password")}>Enter</button>
      </div>
    </div>
  );

  return <AdminPanel data={data} updateData={updateData} onBack={onBack} />;
}

function AdminPanel({ data, updateData, onBack }) {
  const [tab, setTab] = useState("items");
  const [editItem, setEditItem] = useState(null);
  return (
    <div className="admin-wrap">
      <div className="admin-top">
        <span className="admin-top-title">Fonkiart · Admin Panel</span>
        <button className="btn-s" style={{ color:"#fff", borderColor:"rgba(255,255,255,.25)" }} onClick={onBack}>← Back to Site</button>
      </div>
      <div className="admin-body">
        <div className="admin-side">
          <div className="admin-tabs">
            <button className={`admin-tab${tab==="items"?" active":""}`} onClick={() => setTab("items")}>Artworks</button>
            <button className={`admin-tab${tab==="settings"?" active":""}`} onClick={() => setTab("settings")}>Settings</button>
          </div>
          {tab==="items"
            ? <ItemForm data={data} updateData={updateData} editItem={editItem} setEditItem={setEditItem} />
            : <SettingsForm data={data} updateData={updateData} />}
        </div>
        <div className="admin-main">
          <h2>{data.items.length} Artwork{data.items.length!==1?"s":""}</h2>
          <ItemList data={data} updateData={updateData} onEdit={item => { setTab("items"); setEditItem(item); }} />
        </div>
      </div>
    </div>
  );
}

function ItemForm({ data, updateData, editItem, setEditItem }) {
  const blank = { title:"", description:"", category:data.categories[0]||"", price:"", image:"", stripeLink:"" };
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState("");
  const fileRef = useRef();

  useEffect(() => { editItem ? setForm({ ...editItem }) : setForm(blank); }, [editItem]);

  const handleFile = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => setForm(fm => ({ ...fm, image:ev.target.result }));
    r.readAsDataURL(f);
  };

  const handleSave = async () => {
    if (!form.title || !form.image) { setStatus("warn"); return; }
    const entry = { ...form, id: editItem ? editItem.id : Date.now().toString() };
    const items = editItem ? data.items.map(i => i.id===editItem.id?entry:i) : [entry,...data.items];
    await updateData({ items });
    setForm(blank); setEditItem(null);
    setStatus("ok"); setTimeout(() => setStatus(""), 3000);
  };

  const f = (k,v) => setForm(fm => ({ ...fm,[k]:v }));

  return (
    <div>
      <h2>{editItem ? "Edit Artwork" : "Add Artwork"}</h2>
      {status==="ok"   && <div className="ok-msg">✓ {editItem?"Updated":"Added to gallery"}!</div>}
      {status==="warn" && <div className="warn-msg">⚠ Title and image are required.</div>}
      <div onClick={() => fileRef.current.click()}>
        {form.image ? <img src={form.image} className="img-prev" alt="preview" /> : <div className="img-drop">📷 Click to upload image</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
      <div className="fld"><label>Title *</label><input value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Lady in Blue" /></div>
      <div className="fld"><label>Category</label>
        <select value={form.category} onChange={e=>f("category",e.target.value)}>
          {data.categories.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="fld"><label>Description</label><textarea value={form.description} onChange={e=>f("description",e.target.value)} placeholder="About this piece…" /></div>
      <div className="fld"><label>Price (USD)</label><input type="number" value={form.price} onChange={e=>f("price",e.target.value)} placeholder="350" /></div>
      <div className="fld"><label>Stripe Link (optional)</label><input value={form.stripeLink} onChange={e=>f("stripeLink",e.target.value)} placeholder="https://buy.stripe.com/…" /></div>
      <div className="row-btns">
        <button className="btn-p" onClick={handleSave}>{editItem?"Update":"Add to Gallery"}</button>
        {editItem && <button className="btn-s" onClick={() => { setForm(blank); setEditItem(null); }}>Cancel</button>}
      </div>
    </div>
  );
}

function ItemList({ data, updateData, onEdit }) {
  const handleDelete = async id => {
    if (!window.confirm("Delete this artwork?")) return;
    await updateData({ items: data.items.filter(i => i.id!==id) });
  };
  if (!data.items.length) return <p style={{ color:"var(--muted)", fontSize:14 }}>No artworks yet. Add your first piece.</p>;
  return data.items.map(item => (
    <div key={item.id} className="admin-item">
      <img src={item.image} alt={item.title} />
      <div>
        <div className="ai-title">{item.title}</div>
        <div className="ai-meta">{item.category}{item.price?` · $${item.price}`:""}</div>
      </div>
      <div className="ai-btns">
        <button className="btn-s" onClick={() => onEdit(item)}>Edit</button>
        <button className="btn-d" onClick={() => handleDelete(item.id)}>Del</button>
      </div>
    </div>
  ));
}

function SettingsForm({ data, updateData }) {
  const [s, setS] = useState({ ...data.settings });
  const [cats, setCats] = useState([...data.categories]);
  const [newCat, setNewCat] = useState("");
  const [ok, setOk] = useState(false);

  const save = async () => {
    await updateData({ settings:s, categories:cats });
    setOk(true); setTimeout(()=>setOk(false),3000);
  };

  return (
    <div>
      <h2>Settings</h2>
      {ok && <div className="ok-msg">✓ Settings saved.</div>}
      <div className="settings-box">
        <h3>💚 Zelle</h3>
        <div className="fld"><label>Zelle Email or Phone</label><input value={s.zelleContact} onChange={e=>setS({...s,zelleContact:e.target.value})} /></div>
        <div className="fld"><label>Contact Type</label>
          <select value={s.zelleLabel} onChange={e=>setS({...s,zelleLabel:e.target.value})}>
            <option value="email">Email</option>
            <option value="phone number">Phone number</option>
          </select>
        </div>
      </div>
      <div className="settings-box">
        <h3>💳 Stripe (Credit Card)</h3>
        <div className="fld"><label>Default Stripe Payment Link</label><input value={s.stripeLink} onChange={e=>setS({...s,stripeLink:e.target.value})} placeholder="https://buy.stripe.com/…" /></div>
        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>Create links at <strong>dashboard.stripe.com → Payment Links</strong>.</p>
      </div>
      <div className="settings-box">
        <h3>🗂 Categories</h3>
        <div className="cat-list">
          {cats.map(c => (
            <div key={c} className="cat-chip">{c}
              <button className="cat-chip-del" onClick={() => setCats(cats.filter(x=>x!==c))}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="New category…"
            onKeyDown={e=>e.key==="Enter"&&(()=>{ const c=newCat.trim();if(c&&!cats.includes(c)){setCats([...cats,c]);setNewCat("");}})()}
            style={{ flex:1, border:"1px solid var(--border)", padding:"8px 12px", fontFamily:"inherit", fontSize:13, outline:"none" }} />
          <button className="btn-s" onClick={()=>{ const c=newCat.trim();if(c&&!cats.includes(c)){setCats([...cats,c]);setNewCat("");} }}>Add</button>
        </div>
      </div>
      <button className="btn-p" style={{ width:"100%" }} onClick={save}>Save All Settings</button>
    </div>
  );
}
