import { useState, useEffect, useRef, Fragment, Component } from "react";
import {
  Home, LayoutGrid, Star, Timer, Handshake, Mail,
  Info, Heart, Settings, ChevronRight, X, Menu, Sparkles, Tag, Archive, RefreshCw, Package, LogIn, KeyRound
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const BREVO_API_KEY   = import.meta.env.VITE_BREVO_API_KEY;
const BREVO_SENDER    = import.meta.env.VITE_BREVO_SENDER;
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL.startsWith("http") ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
const STORE_KEY = "fonkiart-v2";
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');`;
const DEFAULT_CATEGORIES = ["The Ladies", "Ocean", "Mountain", "Windows"];

function generateCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `FK-${part(4)}-${part(4)}`;
}

const NAV_ITEMS = [
  { id: "home",        label: "Home",             Icon: Home },
  { id: "catalog",     label: "Catalog",           Icon: LayoutGrid },
  { id: "new",         label: "New Collections",   Icon: Sparkles },
  { id: "specials",    label: "Specials",          Icon: Tag },
  { id: "archive",    label: "Past Works",         Icon: Archive },
  { id: "special",     label: "Special Orders",    Icon: Star },
  { id: "auctions",    label: "Auctions",          Icon: Timer },
  { id: "partners",    label: "Partners",          Icon: Handshake },
  { id: "contact",     label: "Contact Us",        Icon: Mail },
  { id: "about",       label: "About Us",          Icon: Info },
  { id: "children",    label: "Children Benefit",  Icon: Heart },
];

const css = `
* { box-sizing:border-box;margin:0;padding:0; }
body { font-family:'DM Sans',sans-serif;background:#fff;color:#1c1a18; }
:root { --cream:#fff;--white:#fff;--ink:#1c1a18;--muted:#9e7fa0;--accent:#b8923f;--border:#e8c97a;--gold:#b8923f;--label:#df88cc;--pink:#ffcdf4;--sidebar-bg:#DF88B7;--sidebar:240px;--topbar:58px;--marquee:30px; }

/* ── LAYOUT ── */
.layout { display:flex;min-height:100vh; }

/* ── SIDEBAR ── */
.sidebar {
  width:var(--sidebar);min-width:var(--sidebar);
  background:#fff;
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;height:100vh;
  z-index:200;transition:transform .3s ease;
  border-right:1px solid var(--border);
}
.sidebar-logo {
  padding:28px 24px 24px;
  border-bottom:2px solid var(--border);
}
.logo-text {
  font-family:'Cormorant Garamond',serif;
  font-size:22px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink);
  display:flex;align-items:center;gap:8px;
}
.logo-dot { width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0; }
.logo-sub { font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:4px; }

.sidebar-nav { flex:1;padding:16px 0;overflow-y:auto; }
.nav-item {
  display:flex;align-items:center;gap:12px;
  padding:11px 24px;cursor:pointer;
  font-size:13px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;
  color:var(--sidebar-bg);
  transition:all .18s;border:none;background:none;
  width:100%;text-align:left;position:relative;
}
.nav-item:hover { color:#fff;background:var(--gold); }
.nav-item.active {
  color:#fff;background:var(--gold);
}
.nav-item.active::before {
  content:'';position:absolute;left:0;top:0;bottom:0;
  width:3px;background:var(--border);border-radius:0 2px 2px 0;
}
.nav-item svg { flex-shrink:0;opacity:.75; }
.nav-item.active svg,.nav-item:hover svg { opacity:1; }

.sidebar-bottom {
  min-height:64px;border-top:2px solid var(--border);background:#fff;
}
.nav-item-admin { color:var(--muted);font-size:12px; }

/* ── TOP BAR ── */
.topbar {
  position:fixed;top:var(--marquee);left:var(--sidebar);right:0;
  height:var(--topbar);z-index:100;
  background:rgba(255,255,255,.96);backdrop-filter:blur(16px);
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
  color:var(--label);background:var(--pink);
  padding:4px 12px;border-radius:20px;
}
.hamburger {
  display:none;background:none;border:none;cursor:pointer;
  color:var(--ink);padding:4px;
}

/* ── CONTENT ── */
.content {
  margin-left:var(--sidebar);
  padding-top:calc(var(--topbar) + var(--marquee));
  flex:1;min-height:100vh;
}

/* ── HERO ── */
.hero { display:grid;grid-template-columns:1fr 3fr;min-height:22vh;overflow:hidden; }
.hero-left { background:var(--sidebar-bg);padding:18px 20px;display:flex;flex-direction:column;justify-content:flex-end;border:3px solid #d4a847; }
.hero-eyebrow { font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:12px; }
.hero-title { font-family:'Cormorant Garamond',serif;font-size:clamp(28px,4vw,58px);font-weight:300;line-height:1.05;color:#fff;margin-bottom:12px; }
.hero-title em { font-style:italic;color:#ffe066;font-weight:600;font-size:1.25em; }
.hero-sub { font-size:13px;color:#fff;line-height:1.6;max-width:320px; }
.hero-right { position:relative;overflow:hidden;background:#e8e2d9;border:3px solid #d4a847; }
.hero-shop-btn { position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10;background:rgba(10,8,6,.55);backdrop-filter:blur(6px);border:1px solid rgba(212,168,71,.6);color:#fff;padding:10px 20px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;transition:all .25s;white-space:nowrap; }
.hero-shop-btn:hover { background:#d4a847;border-color:#d4a847; }
.hero-panel { position:absolute;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.6); }
.hero-panel img { width:100%;height:100%;object-fit:cover;display:block; }
.hero-panel:nth-child(1) { width:48%;height:78%;top:4%;left:2%;transform:rotate(-3deg);z-index:1; }
.hero-panel:nth-child(2) { width:50%;height:82%;top:6%;left:26%;transform:rotate(1.5deg);z-index:3; }
.hero-panel:nth-child(3) { width:48%;height:78%;top:4%;left:51%;transform:rotate(-2deg);z-index:2; }
.hero-slide { display:none; }
.hero-slide-dot { display:none; }

/* ── MODAL GALLERY ── */
.modal-gallery-wrap { position:relative;overflow:hidden;background:var(--cream);display:flex;align-items:center;justify-content:center;padding:24px; }
.modal-thumbs { position:absolute;bottom:0;left:0;right:0;display:flex;gap:4px;padding:6px 10px;background:linear-gradient(transparent,rgba(10,8,6,.78));flex-wrap:nowrap;overflow-x:auto; }
.modal-thumb { width:52px;height:52px;border:2px solid rgba(255,255,255,.35);padding:0;background:none;cursor:pointer;flex-shrink:0;overflow:hidden;transition:border-color .2s; }
.modal-thumb.active { border-color:var(--gold); }
.modal-thumb img { width:100%;height:100%;object-fit:cover;display:block; }

/* ── SECTION PAGE ── */
.page { padding:48px; }
.page-hero {
  padding:52px 48px 44px;background:#fff;
  margin-bottom:0;border-bottom:3px solid var(--gold);
}
.page-hero-eyebrow { font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:14px; }
.page-hero-title { font-family:'Cormorant Garamond',serif;font-size:clamp(36px,4vw,56px);font-weight:300;color:var(--ink);line-height:1.1; }
.page-hero-sub { font-size:14px;color:var(--muted);margin-top:14px;max-width:480px;line-height:1.65; }

.placeholder-body { padding:52px 48px;max-width:720px; }
.placeholder-body p { font-size:15px;color:var(--muted);line-height:1.8;margin-bottom:20px; }
.placeholder-body h2 { font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;margin-bottom:16px;color:var(--ink); }

/* ── CATALOG ── */
.cats { display:flex;align-items:center;border-bottom:1px solid var(--border);padding:0 48px;overflow-x:auto;background:var(--white);scrollbar-width:none; }
.cats::-webkit-scrollbar { display:none; }
.cat-tab { padding:16px 24px;background:none;border:none;font-family:'DM Sans',sans-serif;font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s; }
.cat-tab:hover { color:var(--ink); }
.cat-tab.active { color:var(--ink);border-bottom-color:var(--gold);font-weight:500; }

.gallery { padding:40px 48px; }
.gallery-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:20px; }
.gallery-empty { text-align:center;padding:80px 0;color:var(--muted); }
.gallery-empty h3 { font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;margin-bottom:8px; }

/* ── CATALOG SEARCH ── */
.catalog-search-wrap { padding:12px 48px;background:var(--white);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px; }
.catalog-search { max-width:360px;width:100%;border:1px solid var(--border);padding:8px 14px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;background:var(--cream); }
.catalog-search:focus { border-color:var(--accent); }
.catalog-search-count { font-size:12px;color:var(--muted); }

/* ── PAGINATION ── */
.pagination { display:flex;align-items:center;justify-content:center;gap:6px;padding:32px 48px; }
.page-btn { background:none;border:1px solid var(--border);padding:7px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.06em;color:var(--muted);transition:all .2s; }
.page-btn:hover:not(:disabled) { background:var(--ink);color:#fff;border-color:var(--ink); }
.page-btn.active { background:var(--gold);color:#fff;border-color:var(--gold); }
.page-btn:disabled { opacity:.35;cursor:not-allowed; }

.card { position:relative;overflow:hidden;cursor:pointer;background:#fff;border-radius:0;box-shadow:0 2px 16px rgba(0,0,0,.09);transition:box-shadow .3s;border:1.5px solid var(--gold);padding:10px;display:flex;align-items:center;justify-content:center; }
.card:hover { box-shadow:0 8px 32px rgba(0,0,0,.16); }
.card img { width:100%;height:auto;display:block;background:#fff;transition:transform .7s cubic-bezier(.25,.46,.45,.94);object-fit:contain; }
.card:hover img { transform:scale(1.04); }
.card-over { position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,6,.86) 0%,transparent 48%);opacity:0;transition:opacity .3s;display:flex;flex-direction:column;justify-content:flex-end;padding:22px; }
.card:hover .card-over { opacity:1; }
.card-cat { font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:4px; }
.card-title { font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:300;color:#fff;margin-bottom:4px;line-height:1.2; }
.card-price { font-size:14px;color:var(--gold);font-weight:500;margin-bottom:14px; }
.card-btn { background:var(--sidebar-bg);color:#fff;border:none;padding:11px 0;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:500;width:100%;transition:background .2s;border-radius:4px; }
.card-btn:hover { background:var(--gold); }
.card-children { position:absolute;top:12px;right:12px;background:#e74c3c;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none; }
.card-badge { position:absolute;left:12px;font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:3px 9px;z-index:2;pointer-events:none;font-weight:500;border-radius:3px; }
.card-badge-sale { background:#c0392b;color:#fff; }
.card-badge-new  { background:var(--sidebar-bg);color:#fff; }

/* ── MODALS ── */
.modal-bg { position:fixed;inset:0;z-index:300;background:rgba(10,8,6,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;animation:fi .2s ease; }
@keyframes fi { from{opacity:0}to{opacity:1} }
.modal { background:var(--cream);max-width:900px;width:100%;display:grid;grid-template-columns:1.1fr 1fr;max-height:92vh;overflow:hidden;animation:su .3s cubic-bezier(.25,.46,.45,.94); }
@keyframes su { from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1} }
.modal-img { max-width:100%;max-height:75vh;object-fit:contain;background:#fff;border:1.5px solid var(--gold);padding:10px;display:block; }
.modal-info { padding:40px 36px;overflow-y:auto;display:flex;flex-direction:column; }
.modal-close { align-self:flex-end;width:32px;height:32px;border-radius:50%;background:var(--cream);border:1px solid var(--border);cursor:pointer;color:var(--muted);font-size:15px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;transition:all .2s;flex-shrink:0; }
.modal-close:hover { background:var(--ink);color:#fff;border-color:var(--ink); }
.modal-cat { font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:10px; }
.modal-title { font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:300;line-height:1.15;margin-bottom:18px; }
.modal-desc { font-size:14px;line-height:1.75;color:var(--muted);flex:1;margin-bottom:24px; }
.modal-price { font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:400;color:var(--ink);margin-bottom:20px; }
.buy-btn { background:var(--ink);color:#fff;border:none;padding:15px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;width:100%;transition:background .2s;margin-bottom:8px; }
.buy-btn:hover { background:var(--gold); }
.buy-note { font-size:12px;color:var(--muted);text-align:center; }

/* ── CHECKOUT ── */
.checkout { background:var(--white);max-width:540px;width:100%;padding:36px 44px;animation:su .3s cubic-bezier(.25,.46,.45,.94);position:relative;max-height:90vh;overflow-y:auto; }
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
.footer { border-top:1px solid var(--border);padding:28px 48px;display:flex;justify-content:space-between;align-items:center;background:var(--white);margin-top:48px;flex-wrap:wrap;gap:16px; }
.footer-logo { font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;letter-spacing:.12em;text-transform:uppercase; }
.footer-copy { font-size:12px;color:var(--muted); }
.footer-social { display:flex;align-items:center;gap:14px; }
.footer-social a { color:var(--muted);display:flex;align-items:center;transition:color .2s; }
.footer-social a:hover { color:var(--accent); }

/* ── COOKIE BANNER ── */
.cookie-banner { position:fixed;bottom:0;left:var(--sidebar);right:0;background:var(--pink);border-top:2px solid var(--label);padding:14px 36px;display:flex;align-items:center;justify-content:center;gap:24px;z-index:450;flex-wrap:wrap; }
.cookie-banner p { font-size:12px;color:var(--ink);line-height:1.65;margin:0;text-align:center; }
.cookie-banner a { color:var(--sidebar-bg);text-decoration:none;font-weight:500; }
.cookie-banner a:hover { text-decoration:underline; }
@media(max-width:900px) { .cookie-banner { left:0;padding:14px 20px; } }

/* ── ADMIN ── */
.admin-wrap { min-height:100vh;background:var(--cream); }
.admin-top { background:var(--sidebar-bg);padding:0 36px;height:56px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--label); }
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
.admin-item img { width:68px;height:68px;object-fit:cover;background:#e8e2d9; }
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

/* ── CRM ── */
.crm-wrap { padding:32px 36px; }
.crm-table { width:100%;border-collapse:collapse; }
.crm-table th { font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:10px 14px;text-align:left;border-bottom:2px solid var(--border);background:var(--cream); }
.crm-table td { padding:12px 14px;border-bottom:1px solid var(--border);font-size:13px;vertical-align:middle; }
.crm-table tr:hover td { background:rgba(201,169,110,.05); }
.crm-search { width:100%;border:1px solid var(--border);padding:9px 14px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;margin-bottom:20px; }
.crm-search:focus { border-color:var(--accent); }
.crm-empty { text-align:center;padding:60px 0;color:var(--muted);font-size:14px; }
.crm-add-form { background:#fff;border:1px solid var(--border);padding:24px;margin-bottom:24px;max-width:560px; }
.crm-add-form h3 { font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;margin-bottom:16px; }
.crm-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:20px; }
.crm-title { font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300; }
.crm-tabs { padding:0 36px;border-bottom:1px solid var(--border);background:#fff;display:flex;overflow:visible; }

/* ── CONTACT FORM ── */
.contact-grid { display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:48px; }
.contact-info h2 { font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;margin-bottom:16px; }
.contact-info p { font-size:14px;color:var(--muted);line-height:1.8;margin-bottom:24px; }
.contact-detail { display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted);margin-bottom:10px; }
.contact-detail svg { color:var(--gold); }
.contact-form-box { background:#fff;padding:36px;border:1px solid var(--border); }
.contact-form-box h3 { font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;margin-bottom:22px; }

/* ── WELCOME POPUP ── */
.welcome-modal { background:#fff;max-width:660px;width:100%;overflow:hidden;animation:su .3s cubic-bezier(.25,.46,.45,.94);position:relative;display:grid;grid-template-columns:230px 1fr; }
.welcome-gallery { position:relative;overflow:hidden;background:var(--sidebar-bg); }
.wg-item { position:absolute;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.5); }
.wg-item img { width:100%;height:100%;object-fit:cover;display:block; }
.wg-item:nth-child(1) { width:82%;height:46%;top:3%;left:6%;transform:rotate(-4deg);z-index:1; }
.wg-item:nth-child(2) { width:78%;height:44%;top:30%;left:16%;transform:rotate(3deg);z-index:2; }
.wg-item:nth-child(3) { width:80%;height:45%;top:54%;left:5%;transform:rotate(-2deg);z-index:3; }
.welcome-close-x { position:absolute;top:10px;right:12px;background:none;border:none;cursor:pointer;color:rgba(255,255,255,.5);font-size:18px;line-height:1;transition:color .2s;z-index:10; }
.welcome-close-x:hover { color:#fff; }
.welcome-form-side { display:flex;flex-direction:column; }
.welcome-top { background:var(--sidebar-bg);padding:22px 24px 18px;display:flex;align-items:center;gap:16px; }
.welcome-pct-wrap { flex-shrink:0; }
.welcome-pct { font-family:'Cormorant Garamond',serif;font-size:60px;font-weight:300;color:#fff;line-height:1; }
.welcome-pct-off { font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:500; }
.welcome-top-title { font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:#fff;line-height:1.2;margin-bottom:6px; }
.welcome-top-sub { font-size:15px;color:rgba(255,255,255,.55);line-height:1.5; }
.welcome-body { padding:22px 26px 26px;flex:1; }
.welcome-body p { font-size:17px;color:var(--muted);line-height:1.65;margin-bottom:16px; }
.coupon-box { background:var(--cream);border:2px dashed var(--gold);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:10px; }
.coupon-code { font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;letter-spacing:.08em;color:var(--ink); }
.coupon-copy { background:none;border:none;cursor:pointer;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-family:'DM Sans',sans-serif;padding:3px 6px;transition:all .2s;white-space:nowrap; }
.coupon-copy:hover { color:var(--ink); }
@media(max-width:600px){
  .welcome-modal { grid-template-columns:1fr; }
  .welcome-gallery { height:160px; }
  .wg-item:nth-child(1) { width:42%;height:80%;top:8%;left:2%;transform:rotate(-3deg); }
  .wg-item:nth-child(2) { width:42%;height:88%;top:3%;left:30%;transform:rotate(2.5deg); }
  .wg-item:nth-child(3) { width:42%;height:80%;top:10%;left:57%;transform:rotate(-2deg); }
}

/* ── MOBILE BOTTOM NAV ── */
.mobile-bottom-nav { display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid var(--border);box-shadow:0 -2px 16px rgba(0,0,0,.07);z-index:400;height:60px;align-items:stretch;padding-bottom:env(safe-area-inset-bottom,0px); }

/* ── MOBILE ── */
.sidebar-overlay { display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:190; }
@media(max-width:900px){
  :root { --sidebar:0px; }
  .sidebar { transform:translateX(-240px);width:240px; }
  .sidebar.open { transform:translateX(0); }
  .sidebar-overlay.open { display:block; }
  .topbar { left:0;padding:0 16px; }
  .topbar-right a { display:none; }
  .topbar-right { gap:10px; }
  .content { margin-left:0;padding-bottom:80px;overflow-x:hidden; }
  .hamburger { display:flex; }
  .marquee-wrap { left:0; }
  .mobile-bottom-nav { display:flex; }
  .cart-fab { bottom:88px;right:16px;width:48px;height:48px; }

  /* Sidebar — bigger touch targets */
  .nav-item { padding:14px 24px;min-height:48px; }

  /* Hero */
  .hero { grid-template-columns:1fr;min-height:auto; }
  .hero-left { padding:10px 14px 12px;min-height:0; }
  .hero-right { height:240px; }
  .hero-panel:nth-child(1) { width:60%;height:80%;top:8%;left:2%;transform:rotate(-2deg); }
  .hero-panel:nth-child(2) { width:62%;height:84%;top:5%;left:22%;transform:rotate(1deg); }
  .hero-panel:nth-child(3) { width:60%;height:80%;top:8%;left:42%;transform:rotate(-1.5deg); }
  .hero-title { font-size:clamp(18px,6vw,28px);margin-bottom:4px; }
  .hero-eyebrow { font-size:13px;margin-bottom:4px; }
  .hero-sub { display:none; }
  .hero-buttons { display:flex;flex-wrap:nowrap;gap:6px;margin-top:10px; }
  .hero-buttons .btn-p,.hero-buttons .btn-s { padding:8px 10px;font-size:10px;letter-spacing:.1em;white-space:nowrap; }

  /* Quick-links strip */
  .home-quicklinks { grid-template-columns:1fr 1fr!important; }

  /* Catalog */
  .cats { padding:0 12px; }
  .cat-tab { padding:10px 14px;font-size:11px; }
  .catalog-search-wrap { padding:10px 12px; }
  .gallery { padding:12px; }
  .gallery-grid { grid-template-columns:repeat(2,1fr);gap:10px; }

  /* Cards — always show info overlay on touch screens */
  .card-over { opacity:1;background:linear-gradient(to top,rgba(10,8,6,.85) 0%,transparent 55%);padding:12px; }
  .card-title { font-size:15px; }
  .card-price { font-size:12px;margin-bottom:8px; }
  .card-btn { padding:8px 0;font-size:10px; }

  /* Modal */
  .modal { grid-template-columns:1fr;max-height:96vh; }
  .modal-img { max-height:260px; }
  .modal-info { padding:20px 16px; }
  .modal-title { font-size:24px; }
  .modal-price { font-size:22px; }

  /* Checkout */
  .checkout { padding:20px 16px; }
  .pay-opts { grid-template-columns:1fr 1fr;gap:8px; }

  /* Contact */
  .contact-grid { grid-template-columns:1fr;gap:20px;padding:20px 16px; }

  /* Admin */
  .admin-body { grid-template-columns:1fr; }

  /* Footer */
  .footer { flex-direction:column;gap:10px;text-align:center;padding:24px 16px; }

  /* Pages */
  .page { padding:20px 16px; }
  .page-hero { padding:32px 16px; }
  .placeholder-body { padding:24px 16px; }

  /* Collectors */
  .collectors-section { grid-template-columns:1fr;gap:20px;padding:28px 16px; }
  .collectors-badge { font-size:clamp(24px,7vw,36px); }
  .collectors-form { max-width:100%; }
}

/* Bottom nav — thumb-friendly height + safe area */
.mobile-bottom-nav { height:60px;padding-bottom:env(safe-area-inset-bottom,0px); }
.mobile-bottom-nav-btn { min-height:48px;padding:6px 0 4px;font-size:9px; }

/* Very small phones (iPhone SE, etc.) */
@media(max-width:400px){
  .gallery-grid { grid-template-columns:1fr; }
  .hero-right { height:200px; }
  .hero-title { font-size:clamp(26px,9vw,36px); }
  .checkout { padding:16px 14px; }
  .pay-opts { grid-template-columns:1fr; }
}

/* ── MARQUEE STRIP ── */
.marquee-wrap { position:fixed;top:0;left:var(--sidebar);right:0;height:var(--marquee);background:var(--sidebar-bg);z-index:201;overflow:hidden;display:flex;align-items:center; }
@keyframes marqueeScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
.marquee-track { display:flex;white-space:nowrap;animation:marqueeScroll 26s linear infinite;will-change:transform; }
.marquee-item { font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.9);padding:0 32px; }
.marquee-sep { color:rgba(255,255,255,.35);margin:0 4px; }

/* ── FLOATING CART ── */
.cart-fab { position:fixed;bottom:28px;right:28px;z-index:500;background:var(--sidebar-bg);color:#fff;border:none;border-radius:50%;width:54px;height:54px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.18);transition:transform .2s,background .2s; }
.cart-fab:hover { transform:scale(1.08);background:var(--label); }
.cart-fab-badge { position:absolute;top:-3px;right:-3px;background:#c0392b;color:#fff;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff; }
.cart-overlay { position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:599;animation:fi .2s ease; }
.cart-drawer { position:fixed;right:0;top:0;bottom:0;width:360px;max-width:100vw;background:#fff;z-index:600;display:flex;flex-direction:column;animation:slideInRight .3s cubic-bezier(.25,.46,.45,.94); }
@keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
.cart-drawer-head { display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300; }
.cart-drawer-body { flex:1;overflow-y:auto;padding:8px 0; }
.cart-drawer-item { display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;padding:14px 24px;border-bottom:1px solid var(--border); }
.cart-drawer-item img { width:64px;height:64px;object-fit:cover;background:#e8e2d9;flex-shrink:0; }
.cart-drawer-title { font-size:14px;font-weight:500;margin-bottom:3px;line-height:1.3; }
.cart-drawer-price { font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--gold); }
.cart-drawer-foot { padding:20px 24px;border-top:1px solid var(--border);background:var(--cream); }
.cart-empty { text-align:center;padding:60px 24px;color:var(--muted); }
.cart-empty-icon { font-size:40px;margin-bottom:14px; }

/* ── COLLECTORS CLUB ── */
.collectors-section { background:var(--pink);padding:32px 48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;border-top:1px solid var(--label);border-bottom:1px solid var(--label); }
.collectors-badge { display:inline-block;font-family:'Cormorant Garamond',serif;font-size:clamp(28px,3.5vw,46px);font-weight:600;letter-spacing:.08em;color:var(--sidebar-bg);margin-bottom:8px;line-height:1; }
.collectors-title { font-family:'Cormorant Garamond',serif;font-size:clamp(16px,1.8vw,22px);font-weight:300;line-height:1.3;color:var(--ink);margin-bottom:8px;opacity:.8; }
.collectors-sub { font-size:13px;color:var(--ink);opacity:.55;line-height:1.65;max-width:380px; }
.collectors-form { display:flex;flex-direction:column;gap:8px;max-width:340px; }
.collectors-input { border:1px solid var(--label);padding:11px 14px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;color:var(--ink); }
.collectors-input:focus { border-color:var(--sidebar-bg); }
.collectors-submit { background:var(--sidebar-bg);color:#fff;border:none;padding:11px 22px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;transition:background .2s; }
.collectors-submit:hover { background:var(--label); }

/* ── MOBILE BOTTOM NAV ── */
.mobile-bottom-nav-btn { flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:none;cursor:pointer;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#bbb;transition:color .18s;padding:8px 0 4px;font-family:'DM Sans',sans-serif;position:relative; }
.mobile-bottom-nav-btn::before { content:'';position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:0;height:3px;background:var(--sidebar-bg);transition:width .2s ease;border-radius:0 0 4px 4px; }
.mobile-bottom-nav-btn.active { color:var(--sidebar-bg); }
.mobile-bottom-nav-btn.active::before { width:36px; }
.mobile-bottom-nav-btn svg { flex-shrink:0;transition:transform .18s; }
.mobile-bottom-nav-btn.active svg { transform:translateY(-2px); }
.mobile-bnav-badge { background:#c0392b;color:#fff;width:17px;height:17px;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;position:absolute;top:4px;right:calc(50% - 20px);border:2px solid #fff; }

/* ── PAYMENT LOGOS ── */
.payment-logos { display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px; }
.payment-logos svg { height:28px;width:auto;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.18); }

/* ── TRACK ORDER ── */
.track-order-btn { background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);transition:color .2s;padding:0;text-decoration:underline;text-underline-offset:3px; }
.track-order-btn:hover { color:var(--ink); }

.quicklink-item { padding:22px 28px;cursor:pointer;transition:background .18s; }
.quicklink-label { font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:500;color:var(--ink);margin-bottom:6px;line-height:1.1; }
.quicklink-desc { font-size:14px;color:var(--muted);margin-bottom:12px;line-height:1.5; }
.quicklink-cta { font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:500; }

/* ── COLLECTORS MOBILE ── */
@media(max-width:900px){
  .collectors-section { grid-template-columns:1fr;gap:28px;padding:36px 20px; }
  .home-quicklinks { grid-template-columns:1fr 1fr!important; }
  .quicklink-item { padding:14px 16px; }
  .quicklink-label { font-size:22px;margin-bottom:2px; }
  .quicklink-desc { font-size:12px;margin-bottom:6px;line-height:1.4; }
  .quicklink-cta { font-size:10px; }
}
@media(max-width:600px){ .cart-drawer { width:100vw; } }

/* ── INVOICE PAGE ── */
.invoice-page { min-height:100vh;background:#fdfcf8;display:flex;align-items:center;justify-content:center;padding:40px 20px; }
.invoice-card { background:#fff;border:1px solid var(--border);max-width:560px;width:100%;padding:48px; }
.invoice-header { text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--border); }
.invoice-logo { font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px; }
.invoice-logo-dot { width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0; }
.invoice-tagline { font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted); }
.invoice-row { display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--border); }
.invoice-label { font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted); }
.invoice-value { font-size:15px;color:var(--ink);font-weight:500; }
.invoice-total { display:flex;justify-content:space-between;align-items:baseline;padding:20px 0 0;margin-top:4px; }
.invoice-total .invoice-label { font-size:14px;color:var(--ink);font-weight:500; }
.invoice-total .invoice-value { font-family:'Cormorant Garamond',serif;font-size:32px;color:var(--gold);font-weight:600; }
.invoice-pay-section { margin-top:32px;padding-top:24px;border-top:1px solid var(--border); }
.invoice-pay-option { background:var(--cream);border:1px solid var(--border);padding:20px 24px;margin-bottom:12px; }
.invoice-pay-title { font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px; }
.invoice-pay-value { font-size:17px;color:var(--ink);font-weight:500; }
.invoice-approved-banner { background:#f0f9f4;border:1px solid #a3d4b3;padding:24px;text-align:center;margin-top:28px; }
@media(max-width:600px){ .invoice-card { padding:28px 20px; } }
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
  settings: { zelleContact: "fonkiart@gmail.com", zelleLabel: "email", stripeLink: "", couponDiscount: 15, instagram: "", facebook: "", tiktok: "", navVisible: {} }
};

// ─── URGENCY HINTS (stable per session, random per item) ────
const _urgencyCache = new Map();
function getUrgency(id) {
  if (!_urgencyCache.has(id)) {
    _urgencyCache.set(id, {
      inDemand:  Math.random() > 0.30,            // ~70% show "in demand"
      cartCount: Math.floor(Math.random() * 4),   // 0–3 fake cart count
    });
  }
  return _urgencyCache.get(id);
}

// ─── ERROR BOUNDARY ──────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { console.error("Fonkiart error:", e); }
  render() {
    if (this.state.error) return (
      <div style={{ padding:"52px 48px", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12, color:"#1c1a18" }}>Something went wrong</div>
        <p style={{ fontSize:13, color:"#8a8078", marginBottom:24, lineHeight:1.7 }}>{this.state.error?.message || "An unexpected error occurred."}</p>
        <button onClick={() => this.setState({ error:null })} style={{ background:"var(--sidebar-bg)", color:"#fff", border:"none", padding:"11px 28px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase" }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

// ─── INVOICE PAGE ────────────────────────────
function InvoicePage({ token }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) { setLoading(false); setNotFound(true); return; }
      try {
        const { data, error } = await supabase.from("Orders").select("*").eq("invoice_token", token).single();
        if (error || !data) { setNotFound(true); }
        else { setOrder(data); setApproved(!!data.invoice_approved); }
      } catch(e) { setNotFound(true); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  const handleApprove = async () => {
    if (!supabase || !order) return;
    setApproving(true);
    try {
      await supabase.from("Orders").update({ invoice_approved: true, status: "confirmed" }).eq("id", order.id);
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json" },
        body: JSON.stringify({
          sender: { name:"Fonkiart", email:BREVO_SENDER },
          to: [{ email:BREVO_SENDER }],
          subject: `Invoice approved — ${order.item_title}`,
          htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:16px;">Invoice Approved</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;"><strong>${order.client_name || order.client_email}</strong> approved the invoice for <strong>${order.item_title}</strong> — $${Number(order.amount).toLocaleString()}.</p></div>`
        })
      });
      setApproved(true);
    } catch(e) { console.warn("Approve error:", e); }
    finally { setApproving(false); }
  };

  const shell = (content) => (
    <>
      <style>{FONTS}{css}</style>
      <div className="invoice-page">{content}</div>
    </>
  );

  if (loading) return shell(<p style={{color:"var(--muted)",fontFamily:"'Cormorant Garamond',serif",fontSize:20}}>Loading…</p>);

  if (notFound) return shell(
    <div className="invoice-card" style={{textAlign:"center"}}>
      <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
      <p style={{marginTop:24,color:"var(--muted)",fontSize:15}}>This invoice link is invalid or has expired.</p>
    </div>
  );

  const payZelle = order.zelle_contact;
  const payStripe = order.stripe_link;
  const firstName = order.client_name ? order.client_name.split(" ")[0] : "there";

  return shell(
    <div className="invoice-card">
      <div className="invoice-header">
        <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        <div className="invoice-tagline">Original Art & Fine Art Prints</div>
      </div>

      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.7,marginBottom:24}}>Hi {firstName}, here is your invoice from Fonkiart. Please review the details and click <em>Approve & Pay</em> when you're ready.</p>

      {order.client_name && (
        <div className="invoice-row">
          <span className="invoice-label">Client</span>
          <span className="invoice-value">{order.client_name}</span>
        </div>
      )}
      <div className="invoice-row">
        <span className="invoice-label">Artwork / Item</span>
        <span className="invoice-value">{order.item_title}</span>
      </div>
      {order.notes && (
        <div className="invoice-row" style={{alignItems:"flex-start"}}>
          <span className="invoice-label">Notes</span>
          <span className="invoice-value" style={{fontSize:13,maxWidth:"60%",textAlign:"right",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{order.notes}</span>
        </div>
      )}
      <div className="invoice-total">
        <span className="invoice-label">Total Due</span>
        <span className="invoice-value">${Number(order.amount).toLocaleString()}</span>
      </div>

      {approved ? (
        <div className="invoice-approved-banner">
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:"#2d6a4f",marginBottom:8}}>Order Approved ✓</p>
          <p style={{fontSize:13,color:"#4a8c6a",lineHeight:1.7,marginBottom: (payZelle||payStripe) ? 20 : 0}}>
            Thank you! Fonkiart has been notified and will follow up shortly.
          </p>
          {(payZelle || payStripe) && (
            <div style={{borderTop:"1px solid #a3d4b3",paddingTop:20}}>
              <p style={{fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"#4a8c6a",marginBottom:14}}>Send Payment To</p>
              {payZelle && (
                <div className="invoice-pay-option" style={{background:"#e8f5ee",border:"1px solid #a3d4b3",marginBottom:12}}>
                  <div className="invoice-pay-title">Zelle</div>
                  <div className="invoice-pay-value">{payZelle}</div>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" in the memo.</p>
                </div>
              )}
              {payStripe && (
                <div style={{textAlign:"center",marginTop:4}}>
                  <a href={payStripe} target="_blank" rel="noreferrer"
                    style={{display:"inline-block",background:"#635bff",color:"#fff",padding:"13px 32px",fontSize:13,letterSpacing:".08em",textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>
                    Pay by Card (Stripe) →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="invoice-pay-section">
          <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:20,textAlign:"center"}}>Click below to confirm your order. Payment details will appear after you approve.</p>
          <button onClick={handleApprove} disabled={approving}
            style={{width:"100%",background:"var(--sidebar-bg)",color:"#fff",border:"none",padding:"16px 32px",fontSize:13,letterSpacing:".1em",textTransform:"uppercase",cursor:approving?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:approving?0.7:1,transition:"opacity .2s"}}>
            {approving ? "Processing…" : "Approve & Pay →"}
          </button>
        </div>
      )}

      <p style={{fontSize:11,color:"var(--muted)",textAlign:"center",marginTop:32,lineHeight:1.7}}>
        Questions? Contact us at <a href={`mailto:${BREVO_SENDER}`} style={{color:"var(--gold)"}}>{BREVO_SENDER}</a>
      </p>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────
const SESSION_ID = (() => {
  let id = localStorage.getItem("fonkiart-session-id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("fonkiart-session-id", id); }
  return id;
})();
const CART_TTL_HOURS = 2;

export default function App() {
  const [invoiceToken] = useState(() => new URLSearchParams(window.location.search).get("invoice"));
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
        // First time — push local settings up to Supabase
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

  useEffect(() => {
    localStorage.setItem("fonkiart-page", page);
  }, [page]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) setPage("collectors-room");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) setPage("collectors-room");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const titles = {
      home:     "Fonkiart — Original Art & Fine Art Prints | South Florida",
      catalog:  "Catalog — Fonkiart",
      new:      "New Collections — Fonkiart",
      specials: "Specials — Fonkiart",
      archive:  "Past Works — Fonkiart",
      special:  "Special Orders — Fonkiart",
      auctions: "Auctions — Fonkiart",
      partners: "Partners — Fonkiart",
      contact:  "Contact — Fonkiart",
      about:    "About Fonkiart",
      children: "Children Benefit — Fonkiart",
      admin:    "Admin — Fonkiart",
    };
    document.title = titles[page] || "Fonkiart";
  }, [page]);

  const updateData = async (patch) => {
    const { items: _, ...rest } = patch;
    const next = { ...data, ...rest };
    setData(next);
    await saveData(next);
    if (rest.settings || rest.categories) {
      await saveSettings(next.settings, next.categories);
    }
  };

  const cleanArtwork = (item) => {
    const imgs = Array.isArray(item.images) && item.images.length > 0 ? item.images : (item.image ? [item.image] : []);
    return {
      id: item.id,
      title: item.title || '',
      category: item.category || '',
      price: item.price !== '' && item.price != null ? Number(item.price) : null,
      salePrice: item.salePrice !== '' && item.salePrice != null ? Number(item.salePrice) : null,
      description: item.description || '',
      medium: item.medium || '',
      dimensions: item.dimensions || '',
      image: imgs[0] || '',
      images: imgs,
      isNew: !!item.isNew,
      isSold: !!item.isSold,
      isChildren: !!item.isChildren,
      stripeLink: item.stripeLink || '',
    };
  };

  const addArtwork = async (entry) => {
    if (!supabase) return;
    const { data: row } = await supabase.from("Artworks").insert([cleanArtwork(entry)]).select().single();
    setArtworks(prev => [row || entry, ...prev]);
  };

  const editArtwork = async (id, entry) => {
    if (!supabase) return;
    await supabase.from("Artworks").update(cleanArtwork(entry)).eq("id", id);
    setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...entry } : a));
  };

  const deleteArtwork = async (id) => {
    if (!supabase) return;
    await supabase.from("Artworks").delete().eq("id", id);
    setArtworks(prev => prev.filter(a => a.id !== id));
  };

  const patchArtwork = async (id, patch) => {
    if (!supabase) return;
    await supabase.from("Artworks").update(patch).eq("id", id);
    setArtworks(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  // Auto-migrate localStorage artworks to Supabase on first load
  useEffect(() => {
    if (!data || !supabase) return;
    if (artworks.length === 0 && data.items?.length > 0) {
      const cleaned = data.items.map(cleanArtwork);
      supabase.from("Artworks").insert(cleaned)
        .then(({ error }) => {
          if (error) console.error("Auto-migrate failed:", error);
          else loadArtworks();
        })
        .catch(e => console.error("Auto-migrate artworks:", e));
    }
  }, [data, artworks.length]);

  const mergedData = data ? { ...data, items: artworks.length > 0 ? artworks : (data.items || []) } : null;

  if (invoiceToken) return <InvoicePage token={invoiceToken} />;

  if (!mergedData) return (
    <>
      <style>{FONTS}{css}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"#8a8078" }}>
        Loading Fonkiart…
      </div>
    </>
  );

  if (page === "collectors" && collectorsClient) return (
    <>
      <style>{FONTS}{css}</style>
      <ExclusiveCollectorsPage client={collectorsClient} onLogout={() => { setCollectorsClient(null); setPage("home"); }} artworks={mergedData?.items ?? []} />
    </>
  );

  if (page === "collectors-room") return (
    <>
      <style>{FONTS}{css}</style>
      <CollectorsRoomPage
        user={user}
        artworks={mergedData?.items ?? []}
        settings={mergedData?.settings}
        onLogout={async () => { await supabase.auth.signOut(); setUser(null); setPage("home"); }}
        onBack={() => setPage("home")}
        isAdmin={user?.email?.toLowerCase() === "fonkiart@gmail.com"}
        onAdminEnter={() => setPage("admin")}
      />
    </>
  );

  if (page === "admin") return (
    <>
      <style>{FONTS}{css}</style>
      <AdminPage data={mergedData} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={() => setPage("home")} autoAuth={adminAuthed} onAutoAuthUsed={() => setAdminAuthed(false)} onViewRoom={() => setPage("collectors-room")} />
    </>
  );

  const currentNav = NAV_ITEMS.find(n => n.id === page) || NAV_ITEMS[0];

  return (
    <>
      <style>{FONTS}{css}</style>
      <div className="layout">
        <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-logo" style={{ cursor:"pointer" }} onClick={() => { setPage("home"); setSidebarOpen(false); }}>
            <div className="logo-text">
              <div className="logo-dot" />
              Fonkiart
            </div>
            <div className="logo-sub">Art & Fine Art Prints</div>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.filter(({ id }) => mergedData.settings.navVisible?.[id] !== false).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`nav-item${page === id ? " active" : ""}`}
                onClick={() => { setPage(id); setSidebarOpen(false); }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <div style={{ borderTop:"2px solid var(--border)", margin:"8px 0" }} />
            <button className="nav-item" onClick={() => { setTrackModal(true); setSidebarOpen(false); }}>
              <Package size={16} />
              Track My Order
            </button>
            <button className="nav-item" onClick={() => { setLoginModal(true); setSidebarOpen(false); }}>
              <LogIn size={16} />
              {collectorsClient ? collectorsClient.name?.split(" ")[0] || "My Account" : "Login"}
            </button>
            <button className="nav-item" onClick={() => { setAuthModal(true); setSidebarOpen(false); }}>
              <KeyRound size={16} />
              Request Access
            </button>
          </nav>

          <div className="sidebar-bottom" />
        </aside>

        <div className="content">
          <div className="topbar">
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
                <Menu size={20} />
              </button>
              {page !== "home" && (
                <div className="topbar-title">
                  <currentNav.Icon size={16} />
                  {currentNav.label}
                </div>
              )}
            </div>
            {page === "home" && (
              <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase", color:"var(--ink)", display:"flex", alignItems:"center", gap:8, pointerEvents:"none" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--gold)", flexShrink:0 }} />
                Fonkiart
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
              <button onClick={() => setLoginModal(true)} title="Collectors Login" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", display:"flex", alignItems:"center", transition:"color .2s", padding:0, position:"relative" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {user && <span style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:"50%", background:"#2d6a4f", border:"1px solid #fff" }} />}
              </button>
              {page !== "home" && (
                <button onClick={() => setPage("home")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", color:"var(--gold)", display:"flex", alignItems:"center", gap:5, padding:0 }}>← Home</button>
              )}
              {page === "home" && <button className="topbar-tag" onClick={() => setPage("catalog")} style={{ cursor:"pointer", border:"none" }}>Shop Now</button>}
            </div>
          </div>

          {showWelcome && <WelcomeModal onClose={() => { setShowWelcome(false); sessionStorage.setItem("fonkiart-welcome-seen","1"); }} discount={mergedData.settings.couponDiscount ?? 15} artworks={mergedData.items} />}
          {authModal && <AuthModal user={user} onClose={() => setAuthModal(false)} artworks={mergedData.items} />}
          {trackModal && <TrackOrderModal onClose={() => setTrackModal(false)} />}
          {loginModal && <UnifiedLoginModal onClose={() => setLoginModal(false)} onAdminLogin={() => { setAdminAuthed(true); setPage("admin"); setLoginModal(false); setSidebarOpen(false); }} onClientLogin={(client) => { setCollectorsClient(client); setPage("collectors"); setLoginModal(false); setSidebarOpen(false); }} />}
          <CookieBanner />
          <MarqueeStrip />
          {page === "home"     && <HomePage setPage={setPage} data={mergedData} addToCart={addToCart} cart={cart} />}
          {page === "catalog"  && <CatalogPage data={mergedData} addToCart={addToCart} cart={cart} goHome={() => setPage("home")} cartActivity={cartActivity} />}
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
          <MobileBottomNav page={page} setPage={setPage} cartCount={cart.length} onCart={() => setCartOpen(true)} onAccount={() => setLoginModal(true)} />
        </div>
      </div>
    </>
  );
}

function CookieBanner() {
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

function Footer({ settings, onTrackOrder }) {
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
            {/* Visa */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
              <rect width="48" height="30" rx="4" fill="#1A1F71"/>
              <text x="24" y="21" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="bold" fontStyle="italic" fill="#FFFFFF" textAnchor="middle">VISA</text>
            </svg>
            {/* Mastercard */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
              <rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/>
              <circle cx="18" cy="15" r="9" fill="#EB001B"/>
              <circle cx="30" cy="15" r="9" fill="#F79E1B"/>
              <path d="M24 7.7a9 9 0 0 1 0 14.6A9 9 0 0 1 24 7.7z" fill="#FF5F00"/>
            </svg>
            {/* Amex */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="American Express">
              <rect width="48" height="30" rx="4" fill="#2E77BC"/>
              <text x="24" y="19" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing="1">AMEX</text>
            </svg>
            {/* Discover */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Discover">
              <rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/>
              <text x="9" y="19" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#231F20" letterSpacing=".3">DISCOVER</text>
              <circle cx="38" cy="15" r="8" fill="#F76F20"/>
            </svg>
            {/* Zelle */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Zelle">
              <rect width="48" height="30" rx="4" fill="#6D1ED4"/>
              <text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="13" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">Zelle</text>
            </svg>
            {/* Venmo */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Venmo">
              <rect width="48" height="30" rx="4" fill="#3D95CE"/>
              <text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="11" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".5">Venmo</text>
            </svg>
            {/* Cash App */}
            <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Cash App">
              <rect width="48" height="30" rx="4" fill="#00D632"/>
              <text x="24" y="14" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">CASH</text>
              <text x="24" y="23" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">APP</text>
            </svg>
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

// ─── WELCOME POPUP ──────────────────────────
function WelcomeModal({ onClose, discount = 15, artworks = [] }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [returning, setReturning] = useState(false);
  const [alreadyUsed, setAlreadyUsed] = useState(false);

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) { setErr("Please enter a valid email."); return; }
    setLoading(true);
    try {
      let code = generateCouponCode();
      let isReturning = false;
      let isUsed = false;
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("coupon_code,coupon_used").eq("email", email.toLowerCase()).maybeSingle();
        if (existing) {
          code = existing.coupon_code;
          isReturning = true;
          isUsed = !!existing.coupon_used;
        } else {
          const { error: dbErr } = await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "welcome-popup", coupon_code: code, coupon_used: false }]);
          if (dbErr) { console.error("Supabase error:", dbErr); setErr("DB: " + dbErr.message); setLoading(false); return; }
        }
      }
      setGeneratedCode(code);
      setReturning(isReturning);
      setAlreadyUsed(isUsed);
      if (!isReturning) {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Fonkiart", email: BREVO_SENDER },
            to: [{ email }],
            subject: `Your ${discount}% Welcome Coupon — Fonkiart`,
            htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:28px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Welcome to Fonkiart</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">Thank you for joining. Here is your exclusive welcome coupon:</p><div style="background:#fff;border:2px dashed #c9a96e;padding:20px 24px;text-align:center;margin-bottom:24px;"><div style="font-size:28px;font-weight:600;letter-spacing:2px;color:#1c1a18;">${code}</div><div style="font-size:13px;color:#7a6f63;margin-top:6px;">${discount}% off your first purchase</div></div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Enter this code at checkout. Valid on original art and prints. One use per customer.</p><p style="color:#7a6f63;font-size:13px;">— Fonkiart</p></div>`
          })
        });
        if (!res.ok) { const t = await res.text(); console.error("Brevo error:", res.status, t); setErr("Email: " + res.status + " " + t); setLoading(false); return; }
      }
    } catch(e) { console.error("Error:", e); setErr("Error: " + e.message); setLoading(false); return; }
    setLoading(false);
    setSubmitted(true);
  };

  const copy = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const previewImgs = artworks.filter(a => a.image && !a.isSold).slice(0, 3);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
        <button className="welcome-close-x" onClick={onClose}>✕</button>

        {/* Left — 3 photos scattered at angles, like laid on a table */}
        <div className="welcome-gallery">
          {Array.from({ length: 3 }).map((_, i) => {
            const art = previewImgs[i];
            return (
              <div key={i} className="wg-item">
                {art
                  ? <img src={art.image} alt={art.title} />
                  : <div style={{ background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)",width:"100%",height:"100%" }} />
                }
              </div>
            );
          })}
        </div>

        {/* Right — form */}
        <div className="welcome-form-side">
          <div className="welcome-top">
            <div className="welcome-pct-wrap">
              <div className="welcome-pct">{discount}%</div>
              <div className="welcome-pct-off">OFF</div>
            </div>
            <div className="welcome-top-text">
              <div className="welcome-top-title">Your Welcome Gift</div>
              <div className="welcome-top-sub">Exclusive discount on your first original piece from Fonkiart.</div>
            </div>
          </div>
          <div className="welcome-body">
            {!submitted ? (
              <>
                <p>Enter your email and we'll send your unique coupon instantly.</p>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErr(""); }}
                  placeholder="your@email.com"
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  style={{ width:"100%", border:"1px solid var(--border)", padding:"11px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:16, outline:"none", marginBottom:8 }}
                />
                {err && <p style={{ color:"#c0392b", fontSize:14, marginBottom:6 }}>{err}</p>}
                <button className="btn-p" style={{ width:"100%", background:"var(--gold)", marginBottom:10, padding:"14px", fontSize:15 }} onClick={handleSubmit} disabled={loading}>
                  {loading ? "Sending…" : "Get My Coupon →"}
                </button>
                <p style={{ fontSize:13, color:"var(--muted)", textAlign:"center" }}>No spam. Unsubscribe anytime.</p>
              </>
            ) : (
              <>
                {alreadyUsed ? (
                  <>
                    <p>Your welcome coupon has already been redeemed — thank you for your purchase!</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15, marginTop:8 }} onClick={onClose}>Browse the Collection</button>
                  </>
                ) : (
                  <>
                    <p>{returning ? "Welcome back! Your coupon is still waiting for you:" : "Check your inbox! Your unique coupon is also right here:"}</p>
                    <div className="coupon-box">
                      <span className="coupon-code">{generatedCode}</span>
                      <button className="coupon-copy" onClick={copy}>{copied ? "✓ Copied!" : "Copy"}</button>
                    </div>
                    <p style={{ fontSize:15, color:"var(--muted)", marginBottom:10 }}>One use only · {discount}% off · tied to your email.</p>
                    <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15 }} onClick={onClose}>Browse the Collection</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HOME ───────────────────────────────────
function HomePage({ setPage, data, addToCart, cart }) {
  const slides = (data?.items || []).filter(i => i.image);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div>
      <div className="hero">
        <div className="hero-left">
          <p className="hero-eyebrow">Original Art & Fine Art Prints</p>
          <h1 className="hero-title">Where <em>art</em><br />meets the soul</h1>
          <p className="hero-sub">Curated works available for purchase. Each piece is original and ships worldwide.</p>
          <div className="hero-buttons" style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
            <button className="btn-p" onClick={() => setPage("catalog")} style={{ background:"var(--gold)", fontSize:13, letterSpacing:".18em", padding:"13px 28px" }}>Shop Now →</button>
            <button className="btn-s" onClick={() => setPage("catalog")} style={{ color:"rgba(255,255,255,.6)", borderColor:"rgba(255,255,255,.25)", fontSize:11 }}>Shop the Collection</button>
          </div>
        </div>
        <div className="hero-right">
          {slides.length === 0
            ? <div style={{ gridColumn:"1/-1", background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)" }} />
            : slides.slice(0, 3).map((item, i) => (
                <div key={item.id} className="hero-panel">
                  <img src={item.image} alt={item.title} />
                </div>
              ))
          }
          <button className="hero-shop-btn" onClick={() => setPage("catalog")}>Shop the Collection →</button>
        </div>
      </div>

      <div className="home-quicklinks" style={{ borderTop:"2px solid var(--border)", borderBottom:"1px solid var(--border)", display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
        {[
          { label:"Original Art",     desc:"One-of-a-kind pieces",  page:"catalog" },
          { label:"Fine Art Prints",  desc:"Art prints & editions",  page:"catalog" },
          { label:"Special Orders",   desc:"Custom commissions",     page:"special" },
          { label:"Children Benefit", desc:"Art for a cause",        page:"children" },
        ].map((c, i) => (
          <div key={c.label}
            onClick={() => setPage(c.page)}
            className="quicklink-item"
            style={{ borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}
            onMouseEnter={e => e.currentTarget.style.background="#fdf9f4"}
            onMouseLeave={e => e.currentTarget.style.background="transparent"}
          >
            <div className="quicklink-label">{c.label}</div>
            <div className="quicklink-desc">{c.desc}</div>
            <div className="quicklink-cta">Explore →</div>
          </div>
        ))}
      </div>

      <CollectorsSection />

    </div>
  );
}

// ─── CATALOG ────────────────────────────────
function CatalogPage({ data, addToCart, cart, goHome, cartActivity = {} }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [priceInquiry, setPriceInquiry] = useState(null);
  const PER_PAGE = 12;

  const tabs = ["All", ...data.categories];
  const base = (cat === "All" ? data.items : data.items.filter(i => i.category === cat))
    .filter(i => !i.isCollectorsOnly)
    .filter(i => !search.trim() ||
      i.title?.toLowerCase().includes(search.toLowerCase()) ||
      i.description?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase())
    );
  const filtered = sort === "price-asc"
    ? [...base].sort((a,b) => Number(a.salePrice||a.price||0) - Number(b.salePrice||b.price||0))
    : sort === "price-desc"
    ? [...base].sort((a,b) => Number(b.salePrice||b.price||0) - Number(a.salePrice||a.price||0))
    : base;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleCat = (c) => { setCat(c); setPage(1); };
  const handleSearch = (v) => { setSearch(v); setPage(1); };

  return (
    <div>
      <div className="cats">
        {tabs.map(c => (
          <button key={c} className={`cat-tab${cat === c ? " active" : ""}`} onClick={() => handleCat(c)}>{c}</button>
        ))}
      </div>
      <div className="catalog-search-wrap">
        <input
          className="catalog-search"
          placeholder="Search artworks…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          style={{ border:"1px solid var(--border)", padding:"8px 12px", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".06em", background:"var(--cream)", color:"var(--ink)", outline:"none", cursor:"pointer" }}
        >
          <option value="default">Sort: Default</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
        </select>
        {search.trim() && <span className="catalog-search-count">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>}
      </div>
      <div className="gallery">
        {paginated.length === 0
          ? <div className="gallery-empty">
              <h3>{search ? "No results found" : "No works in this collection yet"}</h3>
              <p style={{ fontSize:13 }}>{search ? `No artworks match "${search}"` : "Add pieces via the Admin panel."}</p>
            </div>
          : <div className="gallery-grid">
              {paginated.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && item.salePrice && <div className="card-badge card-badge-sale" style={{top:10}}>Sale</div>}
                  {!item.isSold && item.isNew && <div className="card-badge card-badge-new" style={{top: item.salePrice ? 34 : 10}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    <div className="card-price">{item.price ? `$${Number(item.price).toLocaleString()}` : <span style={{fontSize:11,letterSpacing:".1em",opacity:.75}}>Price on request</span>}</div>
                    {item.isSold
                      ? <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>
                      : <button className="card-btn" onClick={e => { e.stopPropagation(); item.price ? addToCart(item) : setPriceInquiry(item); }}>{item.price ? (cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →") : "Inquire"}</button>
                    }
                    {!item.isSold && (() => { const u = getUrgency(item.id); return (
                      <div style={{fontSize:10,color:"rgba(255,255,255,.8)",letterSpacing:".05em",marginTop:7,lineHeight:1.7,textAlign:"center"}}>
                        <div>🎨 Only 1 available</div>
                        {u.inDemand  && <div>🔥 This piece is in demand</div>}
                        {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
                      </div>
                    ); })()}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {selected && (
        <ArtworkModal item={selected} onClose={() => setSelected(null)}
          sold={!!selected.isSold}
          onBuy={selected.isSold ? undefined : s => { setSelected(null); s.price ? setCheckout(s) : setPriceInquiry(s); }} />
      )}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
      {priceInquiry && <PriceInquiryModal item={priceInquiry} onClose={() => setPriceInquiry(null)} />}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return (
    <div className="pagination">
      <button className="page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {pages.map((p, i) => p === "..."
        ? <span key={`e${i}`} style={{ color:"var(--muted)", padding:"0 4px" }}>…</span>
        : <button key={p} className={`page-btn${page === p ? " active" : ""}`} onClick={() => onChange(p)}>{p}</button>
      )}
      <button className="page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

// ─── ARTWORK MODAL ───────────────────────────
function ArtworkModal({ item, onClose, onBuy, sold }) {
  const allImages = (item.images?.length > 0) ? item.images : (item.image ? [item.image] : []);
  const [imgIdx, setImgIdx] = useState(0);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-gallery-wrap">
          <img className="modal-img" src={allImages[imgIdx] || item.image} alt={item.title} style={sold ? {filter:"grayscale(20%)"} : undefined} />
          {allImages.length > 1 && (
            <div className="modal-thumbs">
              {allImages.map((url, i) => (
                <button key={i} className={`modal-thumb${imgIdx===i?" active":""}`}
                  onClick={e => { e.stopPropagation(); setImgIdx(i); }}>
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-info">
          <button className="modal-close" onClick={onClose}>✕</button>
          <p className="modal-cat">{item.category}</p>
          <h2 className="modal-title">{item.title}</h2>
          <p className="modal-desc">{item.description || "Original work by Fonkiart."}</p>
          {(item.medium || item.dimensions) && (
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:18, lineHeight:1.8 }}>
              {item.medium && <div>{item.medium}</div>}
              {item.dimensions && <div>{item.dimensions}</div>}
            </div>
          )}
          {item.salePrice
            ? <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                <div className="modal-price" style={{color:"var(--gold)",marginBottom:0}}>${Number(item.salePrice).toLocaleString()}</div>
                {item.price && <div style={{fontSize:20,color:"var(--muted)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
              </div>
            : item.price
              ? <div className="modal-price">${Number(item.price).toLocaleString()}</div>
              : <div style={{ fontSize:13, color:"var(--muted)", letterSpacing:".08em", marginBottom:20 }}>Price on request — contact us</div>
          }
          {onBuy && (() => { const u = getUrgency(item.id); return (<>
            <div style={{fontSize:11,color:"var(--muted)",letterSpacing:".05em",lineHeight:1.9,marginBottom:14}}>
              <div>🎨 Only 1 available — original artwork</div>
              {u.inDemand  && <div>🔥 This piece is in demand</div>}
              {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
            </div>
            <button className="buy-btn" onClick={() => onBuy(item)}>
              {item.price || item.salePrice ? "Purchase This Piece" : "Request Pricing"}
            </button>
            <p className="buy-note">Ships worldwide · Secure payment</p>
          </>); })()}
          {sold && <>
            <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 16px", marginBottom:16 }}>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, letterSpacing:".18em", textTransform:"uppercase", color:"var(--muted)" }}>This piece has found its home</span>
            </div>
            <p className="buy-note">Commission a similar original piece via the Contact page.</p>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── CHECKOUT ───────────────────────────────
function PriceInquiryModal({ item, onClose }) {
  const blank = { name:"", email:"", phone:"", message:"" };
  const [form, setForm] = useState(blank);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const canSend = form.name.trim() && form.email.includes("@");

  const send = async () => {
    setSending(true);
    const details = [
      item.category && `Category: ${item.category}`,
      item.medium && `Medium: ${item.medium}`,
      item.dimensions && `Dimensions: ${item.dimensions}`,
    ].filter(Boolean).join("<br/>");
    try {
      await Promise.allSettled([
        supabase?.from("Requests").insert([{
          name: form.name, email: form.email,
          message: `Price inquiry for "${item.title}"${form.message ? ` — ${form.message}` : ""}. Phone: ${form.phone || "not provided"}.`,
          status: "new"
        }]),
        fetch("https://api.brevo.com/v3/smtp/email", {
          method:"POST",
          headers:{"accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json"},
          body: JSON.stringify({
            sender:{name:"Fonkiart",email:BREVO_SENDER},
            to:[{email:BREVO_SENDER}],
            subject:`Enquiry about ${item.title}`,
            htmlContent:`<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;">
              <h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:4px;">Price Inquiry</h2>
              <p style="font-family:monospace;font-size:13px;color:#c9a96e;margin-bottom:24px;">A customer is asking for pricing on one of your artworks.</p>
              <div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:20px;">
                <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Artwork</p>
                <p style="font-size:20px;font-weight:500;color:#1c1a18;margin-bottom:8px;">${item.title}</p>
                ${details ? `<p style="font-size:13px;color:#7a6f63;line-height:1.8;">${details}</p>` : ""}
                ${item.description ? `<p style="font-size:13px;color:#7a6f63;margin-top:8px;font-style:italic;">"${item.description}"</p>` : ""}
              </div>
              <div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:20px;">
                <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Customer</p>
                <p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Name:</strong> ${form.name}</p>
                <p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Email:</strong> <a href="mailto:${form.email}" style="color:#c9a96e;">${form.email}</a></p>
                ${form.phone ? `<p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Phone:</strong> ${form.phone}</p>` : ""}
                ${form.message ? `<p style="font-size:14px;color:#1c1a18;margin-top:10px;"><strong>Message:</strong> ${form.message}</p>` : ""}
              </div>
              <p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.com</p>
            </div>`
          })
        }),
        fetch("https://api.brevo.com/v3/smtp/email", {
          method:"POST",
          headers:{"accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json"},
          body: JSON.stringify({
            sender:{name:"Fonkiart",email:BREVO_SENDER},
            to:[{email:form.email}],
            subject:`Your inquiry — ${item.title} · Fonkiart`,
            htmlContent:`<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;">
              <h1 style="font-size:24px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Thank you, ${form.name.split(" ")[0]}!</h1>
              <p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">We received your inquiry about <strong>${item.title}</strong> and will get back to you shortly with pricing and availability.</p>
              <p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p>
              <p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p>
            </div>`
          })
        }),
      ]);
    } catch(e) { console.warn("Inquiry email:", e); }
    setSending(false);
    setDone(true);
  };

  if (done) return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:48, marginBottom:14 }}>✉️</div>
        <h2 style={{ marginBottom:10 }}>Inquiry Sent!</h2>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, marginBottom:24 }}>
          Thank you for your interest in <strong>{item.title}</strong>.<br />
          Aliana will reply to <strong>{form.email}</strong> shortly with pricing and availability.
        </p>
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Request Pricing</h2>
        <p className="checkout-sub">{item.title}{item.category ? ` · ${item.category}` : ""}</p>
        <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7, marginBottom:20 }}>
          This piece is available by request. Fill in your details and Aliana will get back to you with pricing and availability.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
          <div className="fld"><label>Name *</label><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Jane Smith" /></div>
          <div className="fld"><label>Email *</label><input value={form.email} onChange={e=>f("email",e.target.value)} placeholder="jane@email.com" /></div>
        </div>
        <div className="fld"><label>Phone <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></label><input value={form.phone} onChange={e=>f("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
        <div className="fld"><label>Message <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></label><textarea value={form.message} onChange={e=>f("message",e.target.value)} placeholder="I'm interested in this piece for my living room…" style={{ minHeight:70, resize:"vertical" }} /></div>
        <button className="btn-p" style={{ width:"100%", marginTop:8, opacity: canSend?1:.5, cursor:canSend?"pointer":"default" }} onClick={canSend&&!sending?send:undefined} disabled={!canSend||sending}>
          {sending ? "Sending…" : "Send Inquiry"}
        </button>
      </div>
    </div>
  );
}

function CheckoutModal({ item, settings, onClose }) {
  const [method, setMethod] = useState(null);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { name:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"" };
  const [customer, setCustomer] = useState(blank);
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState(null);
  const [couponData, setCouponData] = useState(null);
  const [orderRef, setOrderRef] = useState("");
  const cv = (k,v) => setCustomer(fm=>({...fm,[k]:v}));
  const discount = settings.couponDiscount ?? 15;
  const basePrice = Number(item.salePrice || item.price || 0);
  const effectivePrice = couponStatus === "valid" ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
  const canNext = method && customer.name.trim() && customer.email.includes("@");

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code || !supabase) return;
    if (!customer.email || !customer.email.includes("@")) { setCouponStatus("need-email"); return; }
    setCouponStatus("checking");
    const { data, error } = await supabase.from("Leads").select("*").eq("coupon_code", code).single();
    if (error || !data) { setCouponStatus("invalid"); return; }
    if (data.coupon_used) { setCouponStatus("used"); return; }
    if (data.email.toLowerCase() !== customer.email.trim().toLowerCase()) { setCouponStatus("wrong-email"); return; }
    setCouponData(data); setCouponStatus("valid");
  };

  const saveOrder = async () => {
    if (!supabase) return;
    const addr = [customer.address, customer.city, customer.state, customer.zip, customer.country].filter(Boolean).join(", ");
    const discountNote = couponStatus === "valid" ? ` · ${discount}% coupon applied` : "";
    const notes = [customer.name, customer.phone, addr].filter(Boolean).join(" · ") + discountNote;
    const sendMail = async (to, subject, html) => {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method:"POST",
          headers:{"accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json"},
          body:JSON.stringify({ sender:{name:"Fonkiart",email:BREVO_SENDER}, to:[{email:to}], subject, htmlContent:html })
        });
      } catch(e) { console.warn("Email:", e); }
    };
    const priceStr = effectivePrice ? `$${Number(effectivePrice).toLocaleString()}` : "";
    const { data: existingClient } = await supabase.from("Clients").select("id").eq("email", customer.email).maybeSingle();
    const { data: orderData } = await supabase.from("Orders")
      .insert([{ client_email:customer.email, item_title:item.title, amount:effectivePrice, status:"pending", notes }])
      .select("id").single();
    const ref = orderData ? `#${String(orderData.id).slice(0,8).toUpperCase()}` : "";
    setOrderRef(ref);
    await Promise.allSettled([
      existingClient
        ? Promise.resolve()
        : supabase.from("Clients").insert([{ name:customer.name, email:customer.email, phone:customer.phone||null, address:customer.address||null, city:customer.city||null, state:customer.state||null, zip:customer.zip||null, country:customer.country||null }]),
      couponStatus === "valid" && couponData ? supabase.from("Leads").update({ coupon_used:true }).eq("id", couponData.id) : Promise.resolve(),
      sendMail(customer.email, `Order Received — ${item.title} · Fonkiart`,
        `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:26px;font-weight:300;color:#1c1a18;margin-bottom:6px;">Thank you, ${customer.name.split(" ")[0]}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">Your order has been received. Fonkiart will confirm and reach out about shipping within 24–48 hours.</p><div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:24px;"><p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Order Summary</p>${ref?`<p style="font-size:11px;color:#8a8078;margin-bottom:8px;">Reference: <strong style="font-family:monospace;letter-spacing:.05em;">${ref}</strong></p>`:""}<p style="font-size:18px;font-weight:500;color:#1c1a18;margin-bottom:4px;">${item.title}</p>${effectivePrice?`<p style="font-size:22px;color:#c9a96e;font-family:Georgia,serif;">${priceStr}${couponStatus==="valid"?` &nbsp;<span style="font-size:12px;color:#2d6a4f;">✓ ${discount}% coupon applied</span>`:""}</p>`:""} ${addr?`<p style="font-size:13px;color:#7a6f63;margin-top:10px;"><strong>Ship to:</strong> ${addr}</p>`:""}</div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Reply to this email and quote your reference number. You can also reach us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`
      ),
      sendMail(BREVO_SENDER, `🎨 New Order ${ref}: ${item.title} — ${customer.name}`,
        `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;"><h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:4px;">New Order Received</h2>${ref?`<p style="font-family:monospace;font-size:14px;color:#c9a96e;margin-bottom:20px;">${ref}</p>`:""}<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Artwork:</strong> ${item.title}</p>${effectivePrice?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Amount:</strong> ${priceStr}${couponStatus==="valid"?` (${discount}% coupon applied)`:""}</p>`:""}<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Customer:</strong> ${customer.name}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Email:</strong> <a href="mailto:${customer.email}" style="color:#c9a96e;">${customer.email}</a></p>${customer.phone?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Phone:</strong> ${customer.phone}</p>`:""} ${addr?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Ship to:</strong> ${addr}</p>`:""}<p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.vercel.app</p></div>`
      ),
    ]);
  };

  const markSold = () => supabase?.from("Artworks").update({ isSold: true }).eq("id", item.id);
  const handleConfirmZelle   = async () => { setSaving(true); await saveOrder(); await markSold(); setSaving(false); setDone(true); };
  const handleConfirmVenmo   = async () => { setSaving(true); await saveOrder(); await markSold(); setSaving(false); setDone(true); };
  const handleConfirmCashApp = async () => { setSaving(true); await saveOrder(); await markSold(); setSaving(false); setDone(true); };
  const handleCard = async () => {
    setSaving(true); await saveOrder(); await markSold(); setSaving(false);
    const link = item.stripeLink || settings.stripeLink;
    if (link) { window.open(link, "_blank"); setDone(true); }
    else alert("Card payment is being set up. Please use Zelle or contact Fonkiart directly.");
  };

  if (done) return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:50, marginBottom:14 }}>🎨</div>
        <h2 style={{ marginBottom:10 }}>Thank you!</h2>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, marginBottom:16 }}>
          Your order for <strong>{item.title}</strong> has been received.<br />
          Fonkiart will confirm and reach out about shipping.
        </p>
        {orderRef && (
          <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 20px", marginBottom:24, display:"inline-block" }}>
            <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Reference</div>
            <div style={{ fontFamily:"monospace", fontSize:20, letterSpacing:".08em", color:"var(--ink)", fontWeight:600 }}>{orderRef}</div>
            <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Also in your confirmation email</div>
          </div>
        )}
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Purchase</h2>
        <p className="checkout-sub">
          {item.title}{effectivePrice ? ` · $${Number(effectivePrice).toLocaleString()}` : ""}
          {couponStatus === "valid" && basePrice !== effectivePrice ? <span style={{fontSize:11,color:"#2d6a4f",marginLeft:8}}>✓ {discount}% off</span> : null}
        </p>

        {step === 1 && (
          <>
            <div className="pay-opts" style={{ gridTemplateColumns:"1fr 1fr 1fr 1fr" }}>
              <button className={`pay-opt${method==="zelle"?" sel":""}`} onClick={() => setMethod("zelle")}>
                <span className="pay-opt-icon">💚</span>
                <div className="pay-opt-label">Zelle</div>
                <div className="pay-opt-sub">Instant · Free</div>
              </button>
              <button className={`pay-opt${method==="venmo"?" sel":""}`} onClick={() => setMethod("venmo")}>
                <span className="pay-opt-icon">🔵</span>
                <div className="pay-opt-label">Venmo</div>
                <div className="pay-opt-sub">Instant · Free</div>
              </button>
              <button className={`pay-opt${method==="cashapp"?" sel":""}`} onClick={() => setMethod("cashapp")}>
                <span className="pay-opt-icon">💵</span>
                <div className="pay-opt-label">Cash App</div>
                <div className="pay-opt-sub">Instant · Free</div>
              </button>
              <button className={`pay-opt${method==="card"?" sel":""}`} onClick={() => setMethod("card")}>
                <span className="pay-opt-icon">💳</span>
                <div className="pay-opt-label">Credit Card</div>
                <div className="pay-opt-sub">Stripe · Secure</div>
              </button>
            </div>
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:18, marginBottom:4 }}>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:14 }}>Your Information</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>Name *</label><input value={customer.name} onChange={e=>cv("name",e.target.value)} placeholder="Jane Smith" /></div>
                <div className="fld"><label>Email *</label><input value={customer.email} onChange={e=>cv("email",e.target.value)} placeholder="jane@email.com" /></div>
              </div>
              <div className="fld"><label>Phone</label><input value={customer.phone} onChange={e=>cv("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"12px 0 10px" }}>Shipping Address</p>
              <div className="fld"><label>Street</label><input value={customer.address} onChange={e=>cv("address",e.target.value)} placeholder="123 Main St" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>City</label><input value={customer.city} onChange={e=>cv("city",e.target.value)} placeholder="Miami" /></div>
                <div className="fld"><label>State</label><input value={customer.state} onChange={e=>cv("state",e.target.value)} placeholder="FL" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>ZIP</label><input value={customer.zip} onChange={e=>cv("zip",e.target.value)} placeholder="33101" /></div>
                <div className="fld"><label>Country</label><input value={customer.country} onChange={e=>cv("country",e.target.value)} placeholder="USA" /></div>
              </div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"14px 0 10px" }}>Coupon Code <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></p>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  value={couponCode}
                  onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); if(couponStatus!=="valid"){setCouponStatus(null);setCouponData(null);} }}
                  placeholder="FK-XXXX-XXXX"
                  disabled={couponStatus==="valid"}
                  style={{ flex:1, border:`1px solid ${couponStatus==="valid"?"#2d6a4f":couponStatus&&couponStatus!=="checking"?"#c0392b":"var(--border)"}`, padding:"9px 13px", fontFamily:"'DM Sans',sans-serif", fontSize:13, letterSpacing:".06em", outline:"none", background: couponStatus==="valid"?"#f0faf5":"#fff" }}
                />
                {couponStatus !== "valid" && (
                  <button className="btn-s" onClick={applyCoupon} disabled={couponStatus==="checking"||!couponCode.trim()} style={{whiteSpace:"nowrap"}}>
                    {couponStatus==="checking" ? "Checking…" : "Apply"}
                  </button>
                )}
                {couponStatus === "valid" && (
                  <button className="btn-s" onClick={()=>{setCouponStatus(null);setCouponData(null);setCouponCode("");}} style={{whiteSpace:"nowrap",color:"var(--muted)"}}>Remove</button>
                )}
              </div>
              {couponStatus==="valid"       && <p style={{fontSize:12,color:"#2d6a4f",marginTop:6}}>✓ {discount}% discount applied — you save ${(basePrice-effectivePrice).toLocaleString()}</p>}
              {couponStatus==="invalid"     && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>Code not found. Check the spelling and try again.</p>}
              {couponStatus==="used"        && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>This coupon has already been used.</p>}
              {couponStatus==="need-email"  && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>Enter your email address first, then apply the coupon.</p>}
              {couponStatus==="wrong-email" && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>This coupon is not linked to this email address.</p>}
            </div>
            <button className="confirm-btn" style={{ background:canNext?"var(--gold)":"var(--border)", cursor:canNext?"pointer":"not-allowed", marginTop:12 }} disabled={!canNext} onClick={() => canNext && setStep(2)}>Continue →</button>
          </>
        )}

        {step === 2 && (
          <>
            <button onClick={() => setStep(1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:16, padding:0 }}>← Back</button>
            {method === "zelle" && (
              <div className="pay-detail">
                <h4>Send via Zelle</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div style={{ fontSize:13, color:"var(--muted)", marginBottom:5 }}>Send to this {settings.zelleLabel}:</div>
                <div className="zelle-contact">{settings.zelleContact}</div>
                <div className="zelle-steps">
                  1. Open your bank app → Zelle<br />
                  2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong> to <strong>{settings.zelleContact}</strong><br />
                  3. Memo: <strong>"{item.title}"</strong><br />
                  4. Confirm below — we ship once payment clears ✓
                </div>
              </div>
            )}
            {method === "venmo" && (
              <div className="pay-detail">
                <h4>Send via Venmo</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-steps">
                  1. Open Venmo → Search <strong>@fonkiart</strong><br />
                  2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong><br />
                  3. Note: <strong>"{item.title}"</strong><br />
                  4. Confirm below — we ship once payment clears ✓
                </div>
              </div>
            )}
            {method === "cashapp" && (
              <div className="pay-detail">
                <h4>Send via Cash App</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-steps">
                  1. Open Cash App → Search <strong>$fonkiart</strong><br />
                  2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong><br />
                  3. Note: <strong>"{item.title}"</strong><br />
                  4. Confirm below — we ship once payment clears ✓
                </div>
              </div>
            )}
            {method === "card" && (
              <div className="pay-detail">
                <h4>Secure Credit Card via Stripe</h4>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7 }}>
                  You'll be redirected to our secure Stripe checkout to complete your purchase of <strong>{item.title}</strong>{effectivePrice ? ` for $${Number(effectivePrice).toLocaleString()}` : ""}.
                </p>
              </div>
            )}
            {method==="zelle"   && <button className="confirm-btn" onClick={handleConfirmZelle}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="venmo"   && <button className="confirm-btn" onClick={handleConfirmVenmo}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="cashapp" && <button className="confirm-btn" onClick={handleConfirmCashApp} disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="card"    && <button className="stripe-btn"  onClick={handleCard}           disabled={saving}>{saving?"Saving…":"Pay Securely with Card →"}</button>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── STATIC PAGES ───────────────────────────
function SpecialOrdersPage({ setPage }) {
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
        <button className="btn-p" onClick={() => setPage("contact")}>Request a Commission</button>
      </div>
    </div>
  );
}

function NewCollectionsPage({ data, addToCart, cart, cartActivity = {} }) {
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [priceInquiry, setPriceInquiry] = useState(null);
  const items = data.items.filter(i => i.isNew);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Just Arrived</p>
        <h1 className="page-hero-title">New Collections</h1>
        <p className="page-hero-sub">Fresh original works, just added to the gallery.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No new pieces yet</h3><p style={{fontSize:13}}>Mark artworks as "New" in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && <div className="card-badge card-badge-new" style={{top:10}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    <div className="card-price">{item.price ? `$${Number(item.price).toLocaleString()}` : <span style={{fontSize:11,letterSpacing:".1em",opacity:.75}}>Price on request</span>}</div>
                    {item.isSold
                      ? <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>
                      : <button className="card-btn" onClick={e=>{e.stopPropagation(); item.price ? addToCart(item) : setPriceInquiry(item);}}>{item.price ? (cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →") : "Inquire"}</button>
                    }
                    {!item.isSold && (() => { const u = getUrgency(item.id); return (
                      <div style={{fontSize:10,color:"rgba(255,255,255,.8)",letterSpacing:".05em",marginTop:7,lineHeight:1.7,textAlign:"center"}}>
                        <div>🎨 Only 1 available</div>
                        {u.inDemand  && <div>🔥 This piece is in demand</div>}
                        {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
                      </div>
                    ); })()}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && (
        <ArtworkModal item={selected} onClose={() => setSelected(null)}
          sold={!!selected.isSold}
          onBuy={selected.isSold ? undefined : s => { setSelected(null); s.price ? setCheckout(s) : setPriceInquiry(s); }} />
      )}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
      {priceInquiry && <PriceInquiryModal item={priceInquiry} onClose={() => setPriceInquiry(null)} />}
    </div>
  );
}

function SpecialsPage({ data, addToCart, cart, cartActivity = {} }) {
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const items = data.items.filter(i => i.salePrice);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Limited Time</p>
        <h1 className="page-hero-title">Specials</h1>
        <p className="page-hero-sub">Original works at special prices — for a limited time only.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No specials right now</h3><p style={{fontSize:13}}>Add a sale price to artworks in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && <div className="card-badge card-badge-sale" style={{top:10}}>Sale</div>}
                  {!item.isSold && item.isNew && <div className="card-badge card-badge-new" style={{top:34}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div className="card-price" style={{color:"var(--gold)"}}>${Number(item.salePrice).toLocaleString()}</div>
                      {item.price && <div style={{fontSize:13,color:"rgba(255,255,255,.5)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
                    </div>
                    {item.isSold
                      ? <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>
                      : <button className="card-btn" onClick={e=>{e.stopPropagation();addToCart(item);}}>{cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →"}</button>
                    }
                    {!item.isSold && (() => { const u = getUrgency(item.id); return (
                      <div style={{fontSize:10,color:"rgba(255,255,255,.8)",letterSpacing:".05em",marginTop:7,lineHeight:1.7,textAlign:"center"}}>
                        <div>🎨 Only 1 available</div>
                        {u.inDemand  && <div>🔥 This piece is in demand</div>}
                        {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
                      </div>
                    ); })()}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && (
        <ArtworkModal item={selected} onClose={() => setSelected(null)}
          sold={!!selected.isSold}
          onBuy={selected.isSold ? undefined : s => { setSelected(null); setCheckout(s); }} />
      )}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
    </div>
  );
}

function SoldPage({ data }) {
  const [selected, setSelected] = useState(null);
  const items = data.items.filter(i => i.isSold);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Archive</p>
        <h1 className="page-hero-title">Past Works</h1>
        <p className="page-hero-sub">A record of original pieces that have found their permanent homes.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No archived pieces yet</h3><p style={{fontSize:13}}>Mark artworks as "Sold" in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} style={{filter:"grayscale(30%)"}} />
                  <div style={{ position:"absolute", inset:0, background:"rgba(10,8,6,.45)", display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                    <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:".25em", textTransform:"uppercase", color:"rgba(255,255,255,.75)", border:"1px solid rgba(255,255,255,.3)", padding:"5px 16px" }}>Sold</span>
                  </div>
                  <div className="card-over" style={{cursor:"pointer"}}>
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    {item.price && <div className="card-price" style={{color:"rgba(255,255,255,.5)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && (
        <ArtworkModal item={selected} onClose={() => setSelected(null)} sold />
      )}
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

function PartnersPage({ setPage }) {
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
        <button className="btn-p" onClick={() => setPage("contact")}>Get in Touch</button>
      </div>
    </div>
  );
}

function ContactPage({ data }) {
  const [form, setForm] = useState({ name:"", email:"", message:"" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErr, setFormErr] = useState("");
  const f = (k,v) => { setForm(fm => ({ ...fm, [k]:v })); setFormErr(""); };

  const handleSend = async () => {
    if (!form.name || !form.email || !form.message) { setFormErr("Please fill in all fields."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormErr("Please enter a valid email address."); return; }
    setLoading(true);
    try { if (supabase) await supabase.from("Requests").insert([{ name:form.name, email:form.email, message:form.message, status:"new" }]); } catch(e) { console.warn("Supabase:", e); }
    const sendMail = async (to, subject, html, replyTo) => {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "accept":"application/json", "api-key":BREVO_API_KEY, "content-type":"application/json" },
          body: JSON.stringify({ sender:{name:"Fonkiart",email:BREVO_SENDER}, to:[{email:to}], ...(replyTo?{replyTo:{email:replyTo}}:{}), subject, htmlContent:html })
        });
      } catch(e) { console.warn("Brevo:", e); }
    };
    await Promise.allSettled([
      sendMail(BREVO_SENDER,
        "Contact Form Request",
        `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;"><h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:20px;">New Contact Form Request</h2><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Name:</strong> ${form.name}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Email:</strong> ${form.email}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:16px;"><strong>Message:</strong></p><div style="background:#fff;border-left:3px solid #c9a96e;padding:14px 18px;font-size:14px;color:#1c1a18;line-height:1.7;">${form.message}</div><p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.vercel.app</p></div>`,
        form.email
      ),
      sendMail(form.email,
        "We received your message — Fonkiart",
        `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:26px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Thank you, ${form.name.split(" ")[0]}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">We received your message and will get back to you within 24–48 hours.</p><div style="background:#fff;border:1px solid #ece7dd;padding:16px 20px;margin-bottom:24px;border-left:3px solid #c9a96e;"><p style="font-size:13px;color:#8a8078;margin-bottom:8px;font-style:italic;">Your message:</p><p style="font-size:14px;color:#1c1a18;line-height:1.7;">${form.message}</p></div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Reply to this email or reach us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`
      ),
    ]);
    setLoading(false);
    setSent(true);
  };

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
                {formErr && <div className="warn-msg" style={{marginBottom:12}}>{formErr}</div>}
                <button className="btn-p" style={{ width:"100%" }} onClick={handleSend} disabled={loading}>{loading ? "Sending…" : "Send Message"}</button>
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
        <p>Based in South Florida, Fonkiart creates original works across multiple disciplines — painting, fine art prints, and mixed media. Available for commissions, gallery shows, and collaborative projects worldwide.</p>
      </div>
    </div>
  );
}

function ChildrenPage({ setPage }) {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Art for a Cause</p>
        <h1 className="page-hero-title">Children Benefit</h1>
        <p className="page-hero-sub">A portion of every sale supports programs that bring art education to children in underserved communities.</p>
      </div>
      <div className="placeholder-body">
        <h2>Why It Matters</h2>
        <p>Art changes lives. For children who may not have access to creative education, it opens doors to self-expression, confidence, and new possibilities.</p>
        <p>Fonkiart donates a percentage of proceeds from designated works to local and national children's art programs. When you purchase a piece marked for this initiative, you're not just collecting art — you're investing in a child's future.</p>
        <p>Look for the ❤️ badge in the Catalog to find pieces that directly support the Children Benefit program.</p>
        <button className="btn-p" onClick={() => setPage("contact")}>Get Involved</button>
      </div>
    </div>
  );
}


function AdminTasksWidget({ goToTab, goToSettings }) {
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fonkiart-admin-tasks") || "{}"); } catch { return {}; }
  });
  const [tooltip, setTooltip] = useState(null);

  const toggle = (id) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    localStorage.setItem("fonkiart-admin-tasks", JSON.stringify(next));
  };

  const handleClick = (t) => {
    if (t.action) {
      if (t.action[0] === "tab") goToTab(t.action[1]);
      else if (t.action[0] === "settings") goToSettings(t.action[1]);
    } else {
      setTooltip(tooltip === t.id ? null : t.id);
    }
  };

  const remaining = ADMIN_TASKS.filter(t => !done[t.id]).length;

  return (
    <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", marginTop:2 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:0 }}>Pending Tasks</p>
        {remaining === 0
          ? <span style={{ fontSize:12, color:"#2d6a4f", fontWeight:500 }}>✓ All done!</span>
          : <span style={{ fontSize:12, color:"var(--muted)" }}>{remaining} remaining</span>}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {ADMIN_TASKS.map(t => (
          <div key={t.id} style={{ position:"relative" }}>
            <div
              style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background: done[t.id] ? "#f5f9f5" : "#fdfcf8", border:`1px solid ${done[t.id] ? "#c3ddc9" : "var(--border)"}`, cursor:"pointer", transition:"all .15s" }}
            >
              <div
                onClick={() => toggle(t.id)}
                style={{ width:18, height:18, border:`2px solid ${done[t.id] ? "#2d6a4f" : "var(--border)"}`, borderRadius:3, background: done[t.id] ? "#2d6a4f" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .15s" }}
              >
                {done[t.id] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span
                onClick={() => handleClick(t)}
                style={{ fontSize:13, color: done[t.id] ? "var(--muted)" : "var(--ink)", textDecoration: done[t.id] ? "line-through" : "none", flex:1, lineHeight:1.4 }}
              >
                {t.text}
              </span>
              {t.action && !done[t.id] && (
                <span onClick={() => handleClick(t)} style={{ fontSize:11, color:"var(--gold)", letterSpacing:".08em", whiteSpace:"nowrap" }}>Go →</span>
              )}
              {!t.action && !done[t.id] && (
                <span onClick={() => handleClick(t)} style={{ fontSize:11, color:"var(--muted)", letterSpacing:".08em", whiteSpace:"nowrap" }}>ℹ Info</span>
              )}
            </div>
            {tooltip === t.id && t.note && (
              <div style={{ background:"#1c1a18", color:"#fff", fontSize:12, padding:"8px 14px", lineHeight:1.5 }}>{t.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COLLECTORS ROOM ────────────────────────
function CollectorsRoomPage({ user, artworks, settings, onLogout, onBack, isAdmin, onAdminEnter }) {
  const exclusiveWorks = artworks.filter(a => a.isCollectorsOnly && !a.isSold);
  const earlyAccess    = artworks.filter(a => a.isEarlyAccess && !a.isSold);
  const [selected, setSelected]   = useState(null);
  const [checkout, setCheckout]   = useState(null);
  const [commForm, setCommForm]   = useState({ name:"", email: user?.email || "", idea:"", budget:"" });
  const [commSent, setCommSent]   = useState(false);
  const [orders, setOrders]       = useState([]);
  const [tab, setTab]             = useState("room");

  useEffect(() => {
    if (!supabase || !user?.email) return;
    supabase.from("Orders").select("*").eq("client_email", user.email).order("created_at",{ascending:false})
      .then(({ data }) => setOrders(data || []));
  }, [user]);

  const sendCommission = async () => {
    if (!commForm.name || !commForm.idea) return;
    try {
      await supabase.from("Requests").insert([{ name:commForm.name, email:commForm.email, message:`[COLLECTORS COMMISSION] Budget: ${commForm.budget || "TBD"}\n\n${commForm.idea}`, status:"new" }]);
      setCommSent(true);
    } catch(e) { console.warn("Commission request:", e); }
  };

  const CR = { bg:"#0f0e0c", card:"#1a1816", border:"#2e2a24", gold:"#c9a96e", muted:"#7a6f63", text:"#f0ebe3" };

  return (
    <div style={{ minHeight:"100vh", background:CR.bg, color:CR.text, fontFamily:"'DM Sans',sans-serif" }}>

      {/* Top bar */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:CR.bg, borderBottom:`1px solid ${CR.border}`, padding:"0 40px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, letterSpacing:".18em", textTransform:"uppercase", color:CR.gold, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:CR.gold }} />
          Private Collectors Room
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {isAdmin && (
            <button onClick={onAdminEnter} style={{ background:"none", border:`1px solid ${CR.gold}`, color:CR.gold, padding:"6px 16px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase" }}>
              Admin Panel
            </button>
          )}
          <span style={{ fontSize:12, color:CR.muted }}>{user?.email}</span>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:CR.muted, fontSize:12, letterSpacing:".08em" }}>← Back to Site</button>
          <button onClick={onLogout} style={{ background:"none", border:`1px solid ${CR.border}`, color:CR.muted, padding:"6px 14px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".08em", textTransform:"uppercase" }}>Sign Out</button>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{ padding:"0 40px", borderBottom:`1px solid ${CR.border}`, display:"flex", gap:0 }}>
        {[["room","Private Collection"],["early","Early Access"],["commission","Commission"],["orders","My Collection"]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background:"none", border:"none", borderBottom:`2px solid ${tab===id?CR.gold:"transparent"}`, color:tab===id?CR.gold:CR.muted, padding:"16px 24px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase", transition:"all .2s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding:"48px 40px" }}>

        {/* ── PRIVATE COLLECTION ── */}
        {tab === "room" && (
          <>
            <div style={{ marginBottom:40 }}>
              <p style={{ fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:CR.gold, marginBottom:10 }}>Exclusive · Members Only</p>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(36px,4vw,60px)", fontWeight:300, lineHeight:1.05, margin:0, marginBottom:12 }}>The Private Collection</h1>
              <p style={{ fontSize:14, color:CR.muted, lineHeight:1.75, maxWidth:560 }}>Works available exclusively to verified collectors. These pieces are not listed publicly.</p>
            </div>
            {exclusiveWorks.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0", color:CR.muted }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12 }}>Coming Soon</div>
                <p style={{ fontSize:14 }}>Exclusive works are being curated for this space. Check back soon.</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:24 }}>
                {exclusiveWorks.map(item => (
                  <div key={item.id} onClick={() => setSelected(item)} style={{ background:CR.card, border:`1px solid ${CR.border}`, cursor:"pointer", transition:"border-color .2s" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=CR.gold} onMouseLeave={e=>e.currentTarget.style.borderColor=CR.border}>
                    <div style={{ aspectRatio:"4/3", overflow:"hidden", background:"#0a0908" }}>
                      {item.image && <img src={item.image} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform .4s" }}
                        onMouseEnter={e=>e.target.style.transform="scale(1.04)"} onMouseLeave={e=>e.target.style.transform="scale(1)"} />}
                    </div>
                    <div style={{ padding:"18px 20px" }}>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, marginBottom:4 }}>{item.title}</div>
                      <div style={{ fontSize:12, color:CR.muted, marginBottom:12 }}>{item.category}</div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:CR.gold }}>{item.price ? `$${Number(item.salePrice||item.price).toLocaleString()}` : "Price on Request"}</div>
                        <button onClick={e=>{e.stopPropagation();setCheckout(item);}} style={{ background:CR.gold, color:"#fff", border:"none", padding:"8px 16px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase" }}>Acquire</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── EARLY ACCESS ── */}
        {tab === "early" && (
          <>
            <div style={{ marginBottom:40 }}>
              <p style={{ fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:CR.gold, marginBottom:10 }}>First Look · Before Public Release</p>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(36px,4vw,60px)", fontWeight:300, lineHeight:1.05, margin:0, marginBottom:12 }}>Early Access</h1>
              <p style={{ fontSize:14, color:CR.muted, lineHeight:1.75, maxWidth:560 }}>New works available to collectors 48 hours before they go public.</p>
            </div>
            {earlyAccess.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0", color:CR.muted }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12 }}>No Early Access Works Right Now</div>
                <p style={{ fontSize:14 }}>When new works drop, you'll see them here first.</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:24 }}>
                {earlyAccess.map(item => (
                  <div key={item.id} style={{ background:CR.card, border:`1px solid ${CR.gold}`, cursor:"pointer" }} onClick={() => setCheckout(item)}>
                    <div style={{ background:CR.gold, color:"#fff", padding:"6px 16px", fontSize:10, letterSpacing:".2em", textTransform:"uppercase", textAlign:"center" }}>Early Access · Collectors Only</div>
                    <div style={{ aspectRatio:"4/3", overflow:"hidden", background:"#0a0908" }}>
                      {item.image && <img src={item.image} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} />}
                    </div>
                    <div style={{ padding:"18px 20px" }}>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, marginBottom:4 }}>{item.title}</div>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:CR.gold }}>{item.price ? `$${Number(item.salePrice||item.price).toLocaleString()}` : "Price on Request"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── COMMISSION ── */}
        {tab === "commission" && (
          <div style={{ maxWidth:560 }}>
            <p style={{ fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:CR.gold, marginBottom:10 }}>Direct · Private</p>
            <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(32px,4vw,52px)", fontWeight:300, lineHeight:1.05, marginBottom:12 }}>Commission a Work</h1>
            <p style={{ fontSize:14, color:CR.muted, lineHeight:1.75, marginBottom:36 }}>Request a custom piece directly from Aliana. As a verified collector, your commission requests receive priority attention.</p>
            {commSent ? (
              <div style={{ background:CR.card, border:`1px solid ${CR.gold}`, padding:32, textAlign:"center" }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:CR.gold, marginBottom:10 }}>Request Received</div>
                <p style={{ fontSize:14, color:CR.muted, lineHeight:1.7 }}>Aliana will be in touch with you personally within 24–48 hours.</p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {[["name","Your Name","text",commForm.name,"name"],["email","Your Email","email",commForm.email,"email"],["budget","Budget (optional)","text",commForm.budget,"budget"]].map(([id,label,type,val,key]) => (
                  <div key={id}>
                    <label style={{ fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:CR.muted, display:"block", marginBottom:6 }}>{label}</label>
                    <input type={type} value={val} onChange={e=>setCommForm(f=>({...f,[key]:e.target.value}))}
                      style={{ width:"100%", background:CR.card, border:`1px solid ${CR.border}`, color:CR.text, padding:"12px 16px", fontFamily:"'DM Sans',sans-serif", fontSize:14, outline:"none", boxSizing:"border-box" }}
                      onFocus={e=>e.target.style.borderColor=CR.gold} onBlur={e=>e.target.style.borderColor=CR.border} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:CR.muted, display:"block", marginBottom:6 }}>Your Idea</label>
                  <textarea value={commForm.idea} onChange={e=>setCommForm(f=>({...f,idea:e.target.value}))} placeholder="Describe the piece you have in mind — subject, size, colors, mood…"
                    style={{ width:"100%", background:CR.card, border:`1px solid ${CR.border}`, color:CR.text, padding:"12px 16px", fontFamily:"'DM Sans',sans-serif", fontSize:14, outline:"none", minHeight:120, resize:"vertical", boxSizing:"border-box" }}
                    onFocus={e=>e.target.style.borderColor=CR.gold} onBlur={e=>e.target.style.borderColor=CR.border} />
                </div>
                <button onClick={sendCommission} disabled={!commForm.name||!commForm.idea} style={{ background:CR.gold, color:"#fff", border:"none", padding:"15px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, letterSpacing:".14em", textTransform:"uppercase", opacity:(!commForm.name||!commForm.idea)?0.5:1 }}>
                  Send Commission Request →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── MY COLLECTION ── */}
        {tab === "orders" && (
          <>
            <p style={{ fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:CR.gold, marginBottom:10 }}>Your Purchases</p>
            <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(32px,4vw,52px)", fontWeight:300, lineHeight:1.05, marginBottom:36 }}>My Collection</h1>
            {orders.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:CR.muted }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:300, marginBottom:10 }}>No purchases yet</div>
                <p style={{ fontSize:14 }}>Your acquired works will appear here.</p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {orders.map(o => (
                  <div key={o.id} style={{ background:CR.card, border:`1px solid ${CR.border}`, padding:"18px 24px", display:"grid", gridTemplateColumns:"1fr auto auto", gap:24, alignItems:"center" }}>
                    <div>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, marginBottom:3 }}>{o.item_title}</div>
                      <div style={{ fontSize:12, color:CR.muted }}>{new Date(o.created_at).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>
                    </div>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:CR.gold }}>{o.amount?`$${Number(o.amount).toLocaleString()}`:"—"}</div>
                    <div style={{ fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color: o.status==="delivered"?"#2d6a4f":o.status==="shipped"?"#1e5a9c":CR.muted, border:`1px solid currentColor`, padding:"4px 10px" }}>{o.status}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Artwork detail modal */}
      {selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.92)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} onClick={() => setSelected(null)}>
          <div style={{ background:CR.card, maxWidth:800, width:"100%", display:"grid", gridTemplateColumns:"1fr 1fr", maxHeight:"90vh", overflow:"hidden" }} onClick={e=>e.stopPropagation()}>
            <img src={selected.image} alt={selected.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <div style={{ padding:36, display:"flex", flexDirection:"column", overflowY:"auto" }}>
              <button onClick={() => setSelected(null)} style={{ alignSelf:"flex-end", background:"none", border:`1px solid ${CR.border}`, color:CR.muted, width:32, height:32, cursor:"pointer", borderRadius:"50%", fontSize:14, marginBottom:20 }}>✕</button>
              <p style={{ fontSize:11, letterSpacing:".2em", textTransform:"uppercase", color:CR.gold, marginBottom:8 }}>{selected.category}</p>
              <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, marginBottom:8, color:CR.text }}>{selected.title}</h2>
              {selected.medium && <p style={{ fontSize:13, color:CR.muted, marginBottom:6 }}>{selected.medium}{selected.dimensions ? ` · ${selected.dimensions}` : ""}</p>}
              {selected.description && <p style={{ fontSize:14, color:CR.muted, lineHeight:1.75, flex:1, marginBottom:20 }}>{selected.description}</p>}
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:CR.gold, marginBottom:20 }}>{selected.price ? `$${Number(selected.salePrice||selected.price).toLocaleString()}` : "Price on Request"}</div>
              <button onClick={() => { setCheckout(selected); setSelected(null); }} style={{ background:CR.gold, color:"#fff", border:"none", padding:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".14em", textTransform:"uppercase" }}>Acquire This Work →</button>
            </div>
          </div>
        </div>
      )}

      {checkout && <CheckoutModal item={checkout} settings={settings} onClose={() => setCheckout(null)} />}
    </div>
  );
}

// ─── ADMIN AUTH ─────────────────────────────
function AdminPage({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, autoAuth, onAutoAuthUsed, onViewRoom }) {
  const [authed, setAuthed] = useState(() => autoAuth || localStorage.getItem("fonkiart-admin-authed") === "1");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [countdown, setCountdown] = useState(60);

  const doAuth = () => {
    localStorage.setItem("fonkiart-admin-authed", "1");
    setAuthed(true);
  };

  useEffect(() => {
    if (authed) return;
    if (countdown <= 0) { onBack(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [authed, countdown]);

  if (autoAuth && !authed) { doAuth(); if (onAutoAuthUsed) onAutoAuthUsed(); }

  if (!authed) return (
    <div className="login-wrap">
      <div className="login-box">
        <h2 className="login-title">Admin Login</h2>
        <div className="fld">
          <label>Password</label>
          <input type="password" value={pw} placeholder="Password" autoFocus
            onChange={e => { setPw(e.target.value); setErr(""); }}
            onKeyDown={e => { if(e.key==="Enter") pw===ADMIN_PASSWORD?doAuth():setErr("Incorrect password"); }} />
          {err && <p className="err">{err}</p>}
        </div>
        <button className="btn-p" style={{ width:"100%", marginBottom:12 }} onClick={() => pw===ADMIN_PASSWORD?doAuth():setErr("Incorrect password")}>Enter</button>
        <button onClick={onBack} style={{ width:"100%", background:"none", border:"1px solid var(--border)", padding:"10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", transition:"all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="var(--ink)"; e.currentTarget.style.color="var(--ink)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--muted)"; }}
        >← Back to Site</button>
        <p style={{ textAlign:"center", fontSize:11, color:"var(--muted)", marginTop:14, letterSpacing:".06em" }}>
          Redirecting to site in {countdown}s…
        </p>
      </div>
    </div>
  );

  return <AdminPanel data={data} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} loadArtworks={loadArtworks} onBack={onBack} onViewRoom={onViewRoom} onLogout={() => { localStorage.removeItem("fonkiart-admin-authed"); localStorage.removeItem("fonkiart-admin-tab"); localStorage.setItem("fonkiart-page","home"); setAuthed(false); setPw(""); onBack(); }} />;
}

function AdminPanel({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, onLogout, onViewRoom }) {
  const [tab, setTab] = useState(() => localStorage.getItem("fonkiart-admin-tab") || "dashboard");
  const setTabAndSave = (t) => { localStorage.setItem("fonkiart-admin-tab", t); setTab(t); };
  const [editItem, setEditItem] = useState(null);
  const [badges, setBadges] = useState({ orders:0, requests:0 });
  const [settingsHover, setSettingsHover] = useState(false);
  const [settingsJumpTo, setSettingsJumpTo] = useState(null);
  const isCRM = ["dashboard","leads","orders","requests","clients"].includes(tab);
  const SETTINGS_SECTIONS = [
    ["zelle","💚 Zelle"],["coupon","🎟 Coupon Discount"],["stripe","💳 Stripe"],
    ["social","📱 Social Media"],["cats","🗂 Categories"],["nav","🔗 Navigation Links"],
    ["tasks","✅ Pending Tasks"],
  ];

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("Orders").select("id", { count:"exact", head:true }).eq("status","pending"),
      supabase.from("Requests").select("id", { count:"exact", head:true }).eq("status","new"),
    ]).then(([o, r]) => setBadges({ orders: o.count||0, requests: r.count||0 }));
  }, [tab]);

  const Badge = ({ n }) => n > 0
    ? <span style={{ background:"#c0392b", color:"#fff", borderRadius:10, fontSize:10, padding:"1px 6px", marginLeft:6, fontWeight:600 }}>{n}</span>
    : null;

  return (
    <div className="admin-wrap">
      <div className="admin-top">
        <span className="admin-top-title">Fonkiart · Admin Panel</span>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-s" style={{ color:"var(--gold)", borderColor:"var(--gold)", fontSize:11 }} onClick={onViewRoom}>🔑 Collectors Room</button>
          <button className="btn-s" style={{ color:"#fff", borderColor:"rgba(255,255,255,.25)" }} onClick={onBack}>← Back to Site</button>
          <button className="btn-s" style={{ color:"rgba(255,255,255,.5)", borderColor:"rgba(255,255,255,.15)", fontSize:11 }} onClick={onLogout}>Logout</button>
        </div>
      </div>
      <div className="crm-tabs">
        {[["dashboard","Dashboard"],["items","Artworks"],["leads","Leads"],["orders","Orders"],["requests","Requests"],["clients","Clients"]].map(([id,label]) => (
          <button key={id} className={`admin-tab${tab===id?" active":""}`} onClick={() => setTabAndSave(id)}>
            {label}
            {id==="orders"   && <Badge n={badges.orders} />}
            {id==="requests" && <Badge n={badges.requests} />}
          </button>
        ))}
        <div style={{ position:"relative" }} onMouseEnter={() => setSettingsHover(true)} onMouseLeave={() => setSettingsHover(false)}>
          <button className={`admin-tab${tab==="settings"?" active":""}`} onClick={() => setTabAndSave("settings")}>
            Settings
          </button>
          {settingsHover && (
            <div style={{ position:"absolute", top:"100%", left:0, background:"#fff", border:"1px solid var(--border)", minWidth:200, zIndex:600, boxShadow:"0 4px 16px rgba(0,0,0,.1)", marginTop:1 }}>
              {SETTINGS_SECTIONS.map(([k, label]) => (
                <button key={k} onClick={() => { if(k==="tasks"){ setTabAndSave("dashboard"); setSettingsHover(false); } else { setTabAndSave("settings"); setSettingsJumpTo(k); setSettingsHover(false); } }}
                  style={{ display:"block", width:"100%", padding:"10px 16px", background:"none", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer", textAlign:"left", fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"var(--ink)", letterSpacing:".04em" }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--cream)"}
                  onMouseLeave={e => e.currentTarget.style.background="none"}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {isCRM ? (
        <div>
          <ErrorBoundary key={tab}>
            {tab==="dashboard" && <DashboardTab goToTab={setTabAndSave} goToSettings={(section) => { setTabAndSave("settings"); setSettingsJumpTo(section); }} />}
            {tab==="leads"    && <LeadsTab discount={data.settings.couponDiscount ?? 15} />}
            {tab==="orders"   && <OrdersTab />}
            {tab==="requests" && <RequestsTab />}
            {tab==="clients"  && <ClientsTab />}
          </ErrorBoundary>
        </div>
      ) : (
        <div className="admin-body">
          <div className="admin-side">
            {tab==="items"
              ? <ItemForm data={data} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} editItem={editItem} setEditItem={setEditItem} />
              : <SettingsForm data={data} updateData={updateData} patchArtwork={patchArtwork} loadArtworks={loadArtworks} />}
          </div>
          <div className="admin-main">
            <h2>
              {data.items.filter(i => !i.isSold).length} Active
              {data.items.filter(i => i.isSold).length > 0 &&
                <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:300, color:"var(--muted)", marginLeft:10 }}>
                  · {data.items.filter(i => i.isSold).length} Sold
                </span>
              }
            </h2>
            <ItemList data={data} deleteArtwork={deleteArtwork} patchArtwork={patchArtwork} onEdit={item => { setTab("items"); setEditItem(item); }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CRM TABS ────────────────────────────────
const ADMIN_TASKS = [
  { id:"venmo",    text:"Update Venmo handle in checkout",          action: null,           note:"Contact your developer to update the @fonkiart placeholder" },
  { id:"cashapp",  text:"Update Cash App cashtag in checkout",      action: null,           note:"Contact your developer to update the $fonkiart placeholder" },
  { id:"zelle",    text:"Confirm Zelle contact is correct",         action: ["settings","zelle"],  note:null },
  { id:"stripe",   text:"Add your Stripe payment link",             action: ["settings","stripe"], note:null },
  { id:"social",   text:"Add Instagram, Facebook and TikTok links", action: ["settings","social"], note:null },
  { id:"photos",   text:"Upload real artwork photos to the catalog",action: ["tab","items"],       note:null },
  { id:"about",    text:"Write the About Us bio",                   action: null,           note:"Contact your developer to update the About page text" },
  { id:"ship-rate",  text:"Shipping & Tax: decide flat rate for orders under $75",       action: null, note:"e.g. $12.95 domestic flat rate — tell your developer once decided" },
  { id:"ship-tax",   text:"Shipping & Tax: decide which states you collect tax for",     action: null, note:"Options: Florida only (7% Broward), all US states, or none for now" },
  { id:"ship-intl",  text:"Shipping & Tax: decide if you ship internationally",          action: null, note:"If yes, what flat rate? If no, international orders will see 'US only'" },
  { id:"ship-scope", text:"Shipping & Tax: confirm if Stripe also needs to be updated",  action: null, note:"Manual checkout (Zelle/Venmo/Cash App) is ready. Stripe may need separate setup in Stripe dashboard." },
];

function DashboardTab({ goToTab, goToSettings }) {
  const [stats, setStats] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    setStats(null); setLoadErr(false);
    Promise.all([
      supabase.from("Leads").select("id", { count:"exact", head:true }),
      supabase.from("Orders").select("id,status,amount,created_at"),
      supabase.from("Clients").select("id", { count:"exact", head:true }),
      supabase.from("Requests").select("id,status"),
      supabase.from("Leads").select("id,email,created_at").eq("source","collectors-request").order("created_at",{ascending:false}),
    ]).then(([leadsRes, ordersRes, clientsRes, requestsRes, collectorsRes]) => {
      const orders = ordersRes.data || [];
      const pending   = orders.filter(o => o.status === "pending").length;
      const confirmed = orders.filter(o => o.status === "confirmed").length;
      const shipped   = orders.filter(o => o.status === "shipped").length;
      const delivered = orders.filter(o => o.status === "delivered").length;
      const paidStatuses = ["confirmed","shipped","delivered"];
      const revenue   = orders.filter(o => paidStatuses.includes(o.status))
                              .reduce((sum, o) => sum + Number(o.amount || 0), 0);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const monthRevenue = orders.filter(o => paidStatuses.includes(o.status) && o.created_at >= monthStart)
                                 .reduce((sum, o) => sum + Number(o.amount || 0), 0);
      const newRequests = (requestsRes.data || []).filter(r => r.status === "new").length;
      const collectorRequests = collectorsRes.data || [];
      setStats({ leads:leadsRes.count||0, orders:orders.length, clients:clientsRes.count||0, pending, confirmed, shipped, delivered, revenue, monthRevenue, newRequests, collectorRequests });
    }).catch(e => { console.error("Dashboard load:", e); setLoadErr(true); });
  }, [tick]);

  if (loadErr) return <div className="crm-wrap"><p className="crm-empty">Could not load dashboard. Check your connection and <button className="btn-s" style={{marginLeft:8}} onClick={()=>setTick(t=>t+1)}>retry</button></p></div>;
  if (!stats) return <div className="crm-wrap"><p className="crm-empty">Loading…</p></div>;

  const Stat = ({ label, value, sub, color }) => (
    <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", borderTop:`3px solid ${color||"var(--gold)"}` }}>
      <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>{label}</div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:42, fontWeight:300, color:"var(--ink)", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"var(--muted)", marginTop:8 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Dashboard</span>
        <button className="btn-s" style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }} onClick={() => setTick(t => t+1)}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {stats.collectorRequests.length > 0 && (
        <div style={{ background:"#fffbf0", border:"2px solid var(--gold)", padding:"16px 22px", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20 }}>🔑</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)", marginBottom:2 }}>
                {stats.collectorRequests.length} Collector{stats.collectorRequests.length > 1 ? "s" : ""} Waiting for Access
              </div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>
                {stats.collectorRequests.slice(0,3).map(r => r.email).join(", ")}{stats.collectorRequests.length > 3 ? ` +${stats.collectorRequests.length - 3} more` : ""}
              </div>
            </div>
          </div>
          <button onClick={() => goToTab("leads")} style={{ background:"var(--gold)", color:"#fff", border:"none", padding:"8px 18px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>
            View in Leads →
          </button>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:2, marginBottom:2 }}>
        <Stat label="Revenue (All Time)" value={`$${stats.revenue.toLocaleString()}`} sub="Confirmed + shipped + delivered" color="var(--gold)" />
        <Stat label="Revenue (This Month)" value={`$${stats.monthRevenue.toLocaleString()}`} sub={new Date().toLocaleString("default",{month:"long",year:"numeric"})} color="#a07a3a" />
        <Stat label="Total Orders" value={stats.orders} sub={`${stats.pending} pending · ${stats.confirmed} confirmed`} color="#1e3a52" />
        <Stat label="Clients" value={stats.clients} color="#2d6a4f" />
        <Stat label="Leads" value={stats.leads} sub="Email subscribers" color="#7a4f00" />
        {stats.newRequests > 0 && <Stat label="New Requests" value={stats.newRequests} sub="Need attention" color="#c0392b" />}
      </div>
      <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", marginTop:2 }}>
        <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:18 }}>Orders by Status</p>
        <div style={{ display:"flex", gap:32, flexWrap:"wrap" }}>
          {[
            { label:"Pending",   value:stats.pending,   color:"#f0d5a8" },
            { label:"Confirmed", value:stats.confirmed, color:"#1e3a52" },
            { label:"Shipped",   value:stats.shipped,   color:"#2d6a4f" },
            { label:"Delivered", value:stats.delivered, color:"var(--gold)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0, border:"1px solid rgba(0,0,0,.1)" }} />
              <span style={{ fontSize:13, color:"var(--muted)" }}>{label}</span>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:"var(--ink)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <AdminTasksWidget goToTab={goToTab} goToSettings={goToSettings} />
    </div>
  );
}

function LeadsTab({ discount = 15 }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [couponFilter, setCouponFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [createMsg, setCreateMsg] = useState(null);

  const reload = () => {
    if (!supabase) { setLoading(false); return; }
    supabase.from("Leads").select("*").order("created_at", { ascending:false })
      .then(({ data }) => { setLeads(data||[]); setLoading(false); })
      .catch(e => { console.error("Leads load:", e); setLoading(false); });
  };
  useEffect(() => { reload(); }, []);

  const deleteLead = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    await supabase.from("Leads").delete().eq("id", id);
    setLeads(leads.filter(l => l.id !== id));
  };

  const resetCoupon = async (lead) => {
    if (!window.confirm(`Reset coupon ${lead.coupon_code} for ${lead.email}? It can be used again.`)) return;
    await supabase.from("Leads").update({ coupon_used: false }).eq("id", lead.id);
    setLeads(leads.map(l => l.id === lead.id ? {...l, coupon_used: false} : l));
  };

  const createCoupon = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setCreateMsg({ type:"err", text:"Please enter a valid email." }); return; }
    setCreateMsg({ type:"loading", text:"Checking…" });
    const { data: existing } = await supabase.from("Leads").select("coupon_code").eq("email", email).maybeSingle();
    if (existing) { setCreateMsg({ type:"err", text:`This email already has coupon ${existing.coupon_code}.` }); return; }
    const code = generateCouponCode();
    setCreateMsg({ type:"loading", text:"Creating…" });
    const { error } = await supabase.from("Leads").insert([{ email, source:"manual", coupon_code:code, coupon_used:false }]);
    if (error) { setCreateMsg({ type:"err", text:error.message }); return; }
    if (sendEmail) {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method:"POST",
          headers:{"accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json"},
          body:JSON.stringify({
            sender:{name:"Fonkiart",email:BREVO_SENDER},
            to:[{email}],
            subject:"Your Exclusive Coupon — Fonkiart",
            htmlContent:`<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:28px;font-weight:300;color:#1c1a18;margin-bottom:8px;">A Gift From Fonkiart</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">We have a special offer just for you:</p><div style="background:#fff;border:2px dashed #c9a96e;padding:20px 24px;text-align:center;margin-bottom:24px;"><div style="font-size:28px;font-weight:600;letter-spacing:2px;color:#1c1a18;">${code}</div><div style="font-size:13px;color:#7a6f63;margin-top:6px;">${discount}% off your purchase</div></div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Enter this code at checkout. One use only.</p><p style="color:#7a6f63;font-size:13px;">— Fonkiart</p></div>`
          })
        });
      } catch(e) { console.warn("Email:", e); }
    }
    setCreateMsg({ type:"ok", text:`Coupon ${code} created${sendEmail ? " and emailed to " + email : ""}.` });
    setNewEmail(""); setCreating(false); setSendEmail(true);
    reload();
  };

  const unusedCount = leads.filter(l => !l.coupon_used).length;
  const usedCount   = leads.filter(l =>  l.coupon_used).length;
  const filtered = leads.filter(l =>
    (couponFilter === "all" || (couponFilter === "unused" ? !l.coupon_used : l.coupon_used)) &&
    l.email?.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Leads ({leads.length})</span>
        <button className="btn-p" onClick={() => { setCreating(c => !c); setCreateMsg(null); setNewEmail(""); }}>
          {creating ? "Cancel" : "+ Create Coupon"}
        </button>
      </div>
      {creating && (
        <div className="crm-add-form">
          <h3>Create a Coupon</h3>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>Generate a unique 15% off coupon code for any email. The code will appear in the leads list and can be shared manually or emailed directly.</p>
          <div className="fld"><label>Customer Email *</label>
            <input value={newEmail} onChange={e=>{setNewEmail(e.target.value);setCreateMsg(null);}} placeholder="customer@email.com" onKeyDown={e=>e.key==="Enter"&&createCoupon()} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <input type="checkbox" id="sendCouponEmail" checked={sendEmail} onChange={e=>setSendEmail(e.target.checked)} style={{width:"auto"}} />
            <label htmlFor="sendCouponEmail" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"var(--ink)"}}>Email the coupon to this customer</label>
          </div>
          {createMsg && (
            <div className={createMsg.type==="ok" ? "ok-msg" : createMsg.type==="err" ? "warn-msg" : "warn-msg"} style={{marginBottom:14}}>
              {createMsg.text}
            </div>
          )}
          <button className="btn-p" onClick={createCoupon} disabled={createMsg?.type==="loading"}>Generate & Save</button>
        </div>
      )}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <input className="crm-search" style={{marginBottom:0,flex:1,minWidth:200}} placeholder="Search by email…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {[["all",`All (${leads.length})`],["unused",`Unused (${unusedCount})`],["used",`Used (${usedCount})`]].map(([val,label])=>(
            <button key={val} onClick={()=>setCouponFilter(val)}
              style={{border:`1px solid ${couponFilter===val?"var(--ink)":"var(--border)"}`,background:couponFilter===val?"var(--ink)":"none",color:couponFilter===val?"#fff":"var(--muted)",padding:"5px 12px",fontSize:11,letterSpacing:".08em",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">{leads.length===0 ? "No leads yet. They appear here when customers submit the popup or you create a coupon." : "No leads match this filter."}</p>
        : <table className="crm-table">
            <thead><tr><th>Email</th><th>Coupon Code</th><th>Source</th><th>Used</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map((l) => (
              <tr key={l.id}>
                <td>{l.email}</td>
                <td style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,letterSpacing:".05em"}}>{l.coupon_code||"—"}</td>
                <td>{l.source||"—"}</td>
                <td>
                  {l.coupon_used
                    ? <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#2d6a4f",fontWeight:500}}>✓ Used</span>
                        <button className="btn-s" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>resetCoupon(l)}>Reset</button>
                      </div>
                    : <span style={{color:"var(--muted)"}}>No</span>
                  }
                </td>
                <td>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                <td><button className="btn-d" onClick={() => deleteLead(l.id)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table>
      }
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [clientMode, setClientMode] = useState("select");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientUpdate, setClientUpdate] = useState({});
  const blank = { client_email:"", item_title:"", amount:"", status:"pending", notes:"" };
  const [form, setForm] = useState(blank);
  const [manual, setManual] = useState({ first:"", last:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"" });
  const invBlank = { client_email:"", client_name:"", item_title:"", amount:"", notes:"", zelle_contact:"", stripe_link:"", newFirst:"", newLast:"", newEmail:"", newPhone:"", clientMode:"select" };
  const [inv, setInv] = useState(invBlank);
  const iv = (k,v) => setInv(x=>({...x,[k]:v}));
  const [invSending, setInvSending] = useState(false);
  const [invSent, setInvSent] = useState("");
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const m = (k,v) => setManual(fm=>({...fm,[k]:v}));
  const cu = (k,v) => setClientUpdate(fm=>({...fm,[k]:v}));
  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const [ordersRes, clientsRes] = await Promise.all([
        supabase.from("Orders").select("*").order("created_at",{ascending:false}),
        supabase.from("Clients").select("*").order("name",{ascending:true})
      ]);
      setOrders(ordersRes.data||[]); setClients(clientsRes.data||[]);
    } catch(e) { console.error("Orders load:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const sendInvoice = async () => {
    const email = inv.clientMode === "new" ? inv.newEmail : inv.client_email;
    const name  = inv.clientMode === "new" ? `${inv.newFirst} ${inv.newLast}`.trim() : (clients.find(c=>c.email===inv.client_email)?.name || "");
    if (!email || !inv.item_title || !inv.amount) return;
    setInvSending(true); setInvSent("");
    try {
      if (inv.clientMode === "new" && inv.newFirst && inv.newEmail) {
        await supabase.from("Clients").insert([{ name, email:inv.newEmail, phone:inv.newPhone }]);
      }
      const token = crypto.randomUUID();
      const link = `${window.location.origin}/?invoice=${token}`;
      await supabase.from("Orders").insert([{
        client_email: email,
        client_name: name,
        item_title: inv.item_title,
        amount: Number(inv.amount),
        notes: inv.notes,
        status: "pending",
        invoice_token: token,
        invoice_approved: false,
        zelle_contact: inv.zelle_contact,
        stripe_link: inv.stripe_link,
      }]);
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json" },
        body: JSON.stringify({
          sender: { name:"Fonkiart", email:BREVO_SENDER },
          to: [{ email }],
          subject: `Your Fonkiart Invoice — ${inv.item_title}`,
          htmlContent: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 32px;background:#fdfcf8;"><div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #ece7dd;"><h1 style="font-family:'Georgia',serif;font-size:26px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#1c1a18;margin:0 0 4px;">Fonkiart</h1><p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a8078;margin:0;">Original Art & Fine Art Prints</p></div><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:8px;">Hi ${name ? name.split(" ")[0] : "there"},</p><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:28px;">You have a new invoice from Fonkiart. Click below to review the details and approve your order.</p><table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Artwork / Item</td><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:15px;color:#1c1a18;text-align:right;">${inv.item_title}</td></tr>${inv.notes?`<tr><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Notes</td><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:13px;color:#1c1a18;text-align:right;">${inv.notes}</td></tr>`:""}<tr><td style="padding:14px 0 0;font-size:14px;font-weight:600;color:#1c1a18;">Total Due</td><td style="padding:14px 0 0;font-size:24px;color:#c9a96e;font-weight:600;text-align:right;">$${Number(inv.amount).toLocaleString()}</td></tr></table><div style="text-align:center;margin:32px 0;"><a href="${link}" style="display:inline-block;background:#1e3a52;color:#fff;padding:15px 40px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;font-family:Georgia,serif;">Review & Approve →</a></div><p style="color:#8a8078;font-size:12px;line-height:1.7;text-align:center;">Questions? Reply to this email or contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a></p></div>`
        })
      });
      await load();
      setInv(invBlank);
      setSendingInvoice(false);
      setInvSent(`Invoice sent to ${email}`);
    } catch(e) { console.warn("Send invoice:", e); setInvSent("Error sending invoice. Please try again."); }
    finally { setInvSending(false); }
  };

  const missingFields = selectedClient ? ["phone","address","city","state","zip","country"].filter(k => !selectedClient[k]) : [];
  const save = async () => {
    let email = form.client_email;
    if (clientMode==="manual") {
      if (!manual.email||!manual.first) return;
      email = manual.email;
      await supabase.from("Clients").insert([{ name:`${manual.first} ${manual.last}`.trim(), email:manual.email, phone:manual.phone, address:manual.address, city:manual.city, state:manual.state, zip:manual.zip, country:manual.country }]);
    } else if (selectedClient && missingFields.length > 0 && Object.keys(clientUpdate).length > 0) {
      await supabase.from("Clients").update(clientUpdate).eq("id", selectedClient.id);
    }
    if (!email||!form.item_title) return;
    await supabase.from("Orders").insert([{...form, client_email:email}]);
    setForm(blank); setManual({first:"",last:"",email:"",phone:"",address:"",city:"",state:"",zip:"",country:""}); setSelectedClient(null); setClientUpdate({}); setAdding(false); setClientMode("select"); load();
  };
  const sendStatusEmail = async (order, status) => {
    const client = clients.find(c => c.email === order.client_email);
    const name = client?.name?.split(" ")[0] || "there";
    const msgs = {
      confirmed: { sub:`Your order is confirmed — ${order.item_title}`, body:`Great news! Your order for <strong>${order.item_title}</strong> has been confirmed. We'll notify you once it ships.` },
      shipped:   { sub:`Your order has shipped — ${order.item_title}`,   body:`Your order for <strong>${order.item_title}</strong> is on its way! Fonkiart will follow up with any tracking details.` },
      delivered: { sub:`Order delivered — ${order.item_title}`,           body:`Your order for <strong>${order.item_title}</strong> has been marked as delivered. We hope you love it!` },
    };
    const m = msgs[status]; if (!m) return;
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method:"POST",
        headers:{"accept":"application/json","api-key":BREVO_API_KEY,"content-type":"application/json"},
        body:JSON.stringify({ sender:{name:"Fonkiart",email:BREVO_SENDER}, to:[{email:order.client_email}], subject:m.sub,
          htmlContent:`<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:24px;font-weight:300;color:#1c1a18;margin-bottom:6px;">Hi ${name}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">${m.body}</p><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`
        })
      });
    } catch(e) { console.warn("Status email:", e); }
  };
  const updateStatus = async (id, status) => {
    await supabase.from("Orders").update({status}).eq("id",id);
    const order = orders.find(o => o.id === id);
    setOrders(orders.map(o=>o.id===id?{...o,status}:o));
    if (order) sendStatusEmail(order, status);
  };
  const deleteOrder = async (id) => {
    if (!window.confirm("Delete this order?")) return;
    await supabase.from("Orders").delete().eq("id",id);
    setOrders(orders.filter(o=>o.id!==id));
  };
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(prev => ({...prev,[id]:!prev[id]}));
  const clientName = (email) => clients.find(c => c.email === email)?.name;
  const filtered = orders.filter(o =>
    (statusFilter === "all" || o.status === statusFilter) &&
    (o.client_email?.toLowerCase().includes(search.toLowerCase()) ||
     o.item_title?.toLowerCase().includes(search.toLowerCase()) ||
     clientName(o.client_email)?.toLowerCase().includes(search.toLowerCase()))
  );
  const statusCounts = { all:orders.length, pending:0, confirmed:0, shipped:0, delivered:0 };
  orders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Orders ({orders.length})</span>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-s" onClick={()=>{ setSendingInvoice(i=>!i); setAdding(false); setInvSent(""); }}
            style={{background:sendingInvoice?"#1e3a52":undefined,color:sendingInvoice?"#fff":undefined}}>
            {sendingInvoice?"Cancel":"✉ Send Invoice"}
          </button>
          <button className="btn-p" onClick={()=>{ setAdding(a=>!a); setSendingInvoice(false); }}>{adding?"Cancel":"+ Add Order"}</button>
        </div>
      </div>

      {invSent && <div className="ok-msg" style={{marginBottom:12}}>{invSent}</div>}

      {sendingInvoice && (
        <div className="crm-add-form" style={{maxWidth:"100%",borderTop:"3px solid var(--sidebar-bg)"}}>
          <h3 style={{marginBottom:4}}>Send Invoice to Client</h3>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:20}}>Client receives an email with a link to approve and pay.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32}}>

            {/* LEFT — Client */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
              <div className="fld">
                <label>Select Client</label>
                <select value={inv.clientMode==="new" ? "__new__" : inv.client_email}
                  onChange={e => {
                    if (e.target.value==="__new__") { iv("clientMode","new"); iv("client_email",""); iv("client_name",""); }
                    else {
                      const c = clients.find(c=>c.email===e.target.value);
                      iv("clientMode","select"); iv("client_email",e.target.value); iv("client_name",c?.name||"");
                    }
                  }}>
                  <option value="">— Select a client —</option>
                  {clients.map(c => <option key={c.id} value={c.email}>{c.name} — {c.email}</option>)}
                  <option value="__new__">+ New client</option>
                </select>
              </div>
              {inv.clientMode==="new" && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>First Name *</label><input value={inv.newFirst} onChange={e=>iv("newFirst",e.target.value)} placeholder="Jane" /></div>
                    <div className="fld"><label>Last Name</label><input value={inv.newLast} onChange={e=>iv("newLast",e.target.value)} placeholder="Smith" /></div>
                  </div>
                  <div className="fld"><label>Email *</label><input value={inv.newEmail} onChange={e=>iv("newEmail",e.target.value)} placeholder="jane@email.com" /></div>
                  <div className="fld"><label>Phone</label><input value={inv.newPhone} onChange={e=>iv("newPhone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                </>
              )}
            </div>

            {/* RIGHT — Invoice Details */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Invoice Details</p>
              <div className="fld"><label>Artwork / Item *</label><input value={inv.item_title} onChange={e=>iv("item_title",e.target.value)} placeholder="Lady in Blue" /></div>
              <div className="fld"><label>Amount (USD) *</label><input type="number" value={inv.amount} onChange={e=>iv("amount",e.target.value)} placeholder="350" /></div>
              <div className="fld"><label>Notes (optional)</label><textarea value={inv.notes} onChange={e=>iv("notes",e.target.value)} placeholder="Any notes visible to the client…" style={{minHeight:60}} /></div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"14px 0 10px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Payment Options (shown after client approves)</p>
              <div className="fld"><label>Zelle Contact</label><input value={inv.zelle_contact} onChange={e=>iv("zelle_contact",e.target.value)} placeholder="fonkiart@gmail.com" /></div>
              <div className="fld"><label>Stripe Link (optional)</label><input value={inv.stripe_link} onChange={e=>iv("stripe_link",e.target.value)} placeholder="https://buy.stripe.com/…" /></div>
            </div>
          </div>

          <div style={{borderTop:"1px solid var(--border)",marginTop:24,paddingTop:20,display:"flex",gap:12,alignItems:"center"}}>
            <button className="btn-p" style={{background:"var(--sidebar-bg)"}} onClick={sendInvoice} disabled={invSending}>
              {invSending ? "Sending…" : "Send Invoice →"}
            </button>
            <p style={{fontSize:12,color:"var(--muted)",margin:0}}>A payment link will be emailed to the client automatically.</p>
          </div>
        </div>
      )}

      {adding && (
        <div className="crm-add-form" style={{maxWidth:"100%"}}>
          <h3>New Order</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32,marginTop:8}}>

            {/* LEFT — Client */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
              <div className="fld">
                <label>Select Client</label>
                <select value={clientMode==="manual" ? "__manual__" : form.client_email}
                  onChange={e => {
                    if (e.target.value==="__manual__") { setClientMode("manual"); f("client_email",""); setSelectedClient(null); setClientUpdate({}); }
                    else {
                      const c = clients.find(c=>c.email===e.target.value);
                      setClientMode("select"); f("client_email",e.target.value); setSelectedClient(c||null); setClientUpdate({});
                    }
                  }}>
                  <option value="">— Select a client —</option>
                  {clients.map(c => <option key={c.id} value={c.email}>{c.name} — {c.email}</option>)}
                  <option value="__manual__">+ New client</option>
                </select>
              </div>
              {selectedClient && missingFields.length > 0 && (
                <div style={{background:"#fffbf0",border:"1px solid var(--border)",padding:"14px 16px",marginBottom:8}}>
                  <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>⚠ Some info is missing for this client. Fill in what you know:</p>
                  {missingFields.includes("phone") && <div className="fld"><label>Phone</label><input value={clientUpdate.phone||""} onChange={e=>cu("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>}
                  {missingFields.includes("address") && <div className="fld"><label>Street Address</label><input value={clientUpdate.address||""} onChange={e=>cu("address",e.target.value)} placeholder="123 Main St" /></div>}
                  {(missingFields.includes("city")||missingFields.includes("state")) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {missingFields.includes("city") && <div className="fld"><label>City</label><input value={clientUpdate.city||""} onChange={e=>cu("city",e.target.value)} placeholder="Miami" /></div>}
                      {missingFields.includes("state") && <div className="fld"><label>State</label><input value={clientUpdate.state||""} onChange={e=>cu("state",e.target.value)} placeholder="FL" /></div>}
                    </div>
                  )}
                  {(missingFields.includes("zip")||missingFields.includes("country")) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {missingFields.includes("zip") && <div className="fld"><label>ZIP Code</label><input value={clientUpdate.zip||""} onChange={e=>cu("zip",e.target.value)} placeholder="33101" /></div>}
                      {missingFields.includes("country") && <div className="fld"><label>Country</label><input value={clientUpdate.country||""} onChange={e=>cu("country",e.target.value)} placeholder="USA" /></div>}
                    </div>
                  )}
                </div>
              )}
              {clientMode==="manual" && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>First Name *</label><input value={manual.first} onChange={e=>m("first",e.target.value)} placeholder="Jane" /></div>
                    <div className="fld"><label>Last Name</label><input value={manual.last} onChange={e=>m("last",e.target.value)} placeholder="Smith" /></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>Email *</label><input value={manual.email} onChange={e=>m("email",e.target.value)} placeholder="jane@email.com" /></div>
                    <div className="fld"><label>Phone</label><input value={manual.phone} onChange={e=>m("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                  </div>
                  <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"12px 0 10px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Shipping Address</p>
                  <div className="fld"><label>Street Address</label><input value={manual.address} onChange={e=>m("address",e.target.value)} placeholder="123 Main St" /></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>City</label><input value={manual.city} onChange={e=>m("city",e.target.value)} placeholder="Miami" /></div>
                    <div className="fld"><label>State</label><input value={manual.state} onChange={e=>m("state",e.target.value)} placeholder="FL" /></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>ZIP Code</label><input value={manual.zip} onChange={e=>m("zip",e.target.value)} placeholder="33101" /></div>
                    <div className="fld"><label>Country</label><input value={manual.country} onChange={e=>m("country",e.target.value)} placeholder="USA" /></div>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT — Order Details */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Order Details</p>
              <div className="fld"><label>Artwork / Item *</label><input value={form.item_title} onChange={e=>f("item_title",e.target.value)} placeholder="Lady in Blue" /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="fld"><label>Amount (USD)</label><input type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="350" /></div>
                <div className="fld"><label>Status</label>
                  <select value={form.status} onChange={e=>f("status",e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
              <div className="fld"><label>Notes</label><textarea value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any notes about this order…" style={{minHeight:80}} /></div>
            </div>
          </div>

          <div style={{borderTop:"1px solid var(--border)",marginTop:24,paddingTop:20}}>
            <button className="btn-p" onClick={save}>Save Order</button>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <input className="crm-search" style={{marginBottom:0,flex:1,minWidth:200}} placeholder="Search by name, email or artwork…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {[["all","All"],["pending","Pending"],["confirmed","Confirmed"],["shipped","Shipped"],["delivered","Delivered"]].map(([val,label])=>(
            <button key={val} onClick={()=>setStatusFilter(val)}
              style={{border:`1px solid ${statusFilter===val?"var(--ink)":"var(--border)"}`,background:statusFilter===val?"var(--ink)":"none",color:statusFilter===val?"#fff":"var(--muted)",padding:"5px 12px",fontSize:11,letterSpacing:".08em",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              {label}{statusFilter!==val&&statusCounts[val]!==undefined?` (${statusCounts[val]})`:statusFilter===val?` (${statusCounts[val]})`:""}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No orders match this filter.</p>
        : <table className="crm-table">
            <thead><tr><th>Ref</th><th>Client</th><th>Artwork</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map(o=>(
              <Fragment key={o.id}>
                <tr>
                  <td style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>
                    <div>#{String(o.id).slice(0,8).toUpperCase()}</div>
                    {o.invoice_token && (
                      <div style={{fontSize:10,letterSpacing:".08em",marginTop:3,color:o.invoice_approved?"#2d6a4f":"#c9a96e",background:o.invoice_approved?"#e8f5ee":"#fff8ec",border:`1px solid ${o.invoice_approved?"#a3d4b3":"#e8d5a0"}`,padding:"1px 5px",display:"inline-block"}}>
                        {o.invoice_approved ? "✓ APPROVED" : "INVOICE SENT"}
                      </div>
                    )}
                  </td>
                  <td>
                    {(o.client_name || clientName(o.client_email)) && <div style={{fontWeight:500,fontSize:13}}>{o.client_name || clientName(o.client_email)}</div>}
                    <div style={{fontSize:11,color:"var(--muted)"}}>{o.client_email}</div>
                  </td>
                  <td>{o.item_title}</td>
                  <td>{o.amount?`$${Number(o.amount).toLocaleString()}`:"—"}</td>
                  <td>
                    <select value={o.status||"pending"} onChange={e=>updateStatus(o.id,e.target.value)}
                      style={{border:"1px solid var(--border)",padding:"4px 8px",fontSize:12,background:"#fff",cursor:"pointer"}}>
                      <option value="pending">Pending</option><option value="confirmed">Confirmed</option>
                      <option value="shipped">Shipped</option><option value="delivered">Delivered</option>
                    </select>
                  </td>
                  <td>{o.created_at?new Date(o.created_at).toLocaleDateString():"—"}</td>
                  <td>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {o.notes && <button onClick={()=>toggleExpand(o.id)} style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>{expanded[o.id]?"▲":"▼"}</button>}
                      {o.invoice_token && (
                        <button onClick={()=>{ const link=`${window.location.origin}/?invoice=${o.invoice_token}`; navigator.clipboard.writeText(link).then(()=>alert("Invoice link copied!")); }}
                          style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>
                          🔗 Link
                        </button>
                      )}
                      <button className="btn-d" onClick={()=>deleteOrder(o.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[o.id] && o.notes && (
                  <tr>
                    <td colSpan={7} style={{background:"#fffbf5",padding:"10px 14px 14px",borderTop:"none"}}>
                      <p style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:6}}>Order Details</p>
                      <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.7}}>{o.notes}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
      }
    </div>
  );
}

function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const toggleExpand = id => setExpanded(p => ({...p,[id]:!p[id]}));
  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data } = await supabase.from("Requests").select("*").order("created_at",{ascending:false});
      setRequests(data||[]);
    } catch(e) { console.error("Requests load:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const updateStatus = async (id,status) => {
    await supabase.from("Requests").update({status}).eq("id",id);
    setRequests(requests.map(r=>r.id===id?{...r,status}:r));
  };
  const deleteRequest = async (id) => {
    if (!window.confirm("Delete this request?")) return;
    await supabase.from("Requests").delete().eq("id",id);
    setRequests(requests.filter(r=>r.id!==id));
  };
  const filtered = requests.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.email?.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Requests ({requests.length})</span>
      </div>
      <input className="crm-search" placeholder="Search by name or email…" value={search} onChange={e=>setSearch(e.target.value)} />
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No requests yet.</p>
        : <table className="crm-table">
            <thead><tr><th>Name</th><th>Email</th><th>Message</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map(r=>(
              <Fragment key={r.id}>
                <tr>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--muted)",fontSize:12}}>{r.message}</td>
                  <td>
                    <select value={r.status||"new"} onChange={e=>updateStatus(r.id,e.target.value)}
                      style={{border:"1px solid var(--border)",padding:"4px 8px",fontSize:12,background:"#fff",cursor:"pointer"}}>
                      <option value="new">New</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                    </select>
                  </td>
                  <td>{r.created_at?new Date(r.created_at).toLocaleDateString():"—"}</td>
                  <td>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>toggleExpand(r.id)} style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>{expanded[r.id]?"▲":"▼"}</button>
                      <a href={`mailto:${r.email}?subject=Re: Your Request — Fonkiart&body=Hi ${r.name},%0A%0A`} className="btn-s" style={{fontSize:11,padding:"4px 10px",textDecoration:"none"}}>Reply</a>
                      <button className="btn-d" onClick={()=>deleteRequest(r.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[r.id] && (
                  <tr>
                    <td colSpan={6} style={{background:"#fffbf5",padding:"12px 14px 16px",borderTop:"none"}}>
                      <p style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:8}}>Full Message</p>
                      <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{r.message}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
      }
    </div>
  );
}

function ClientsTab() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [clientOrders, setClientOrders] = useState({});
  const blank = { name:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"", notes:"", password:"" };
  const [form, setForm] = useState(blank);
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data } = await supabase.from("Clients").select("*").order("created_at",{ascending:false});
      setClients(data||[]);
    } catch(e) { console.error("Clients load:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name||!form.email) return;
    if (editClient) {
      await supabase.from("Clients").update(form).eq("id", editClient.id);
    } else {
      await supabase.from("Clients").insert([form]);
    }
    setForm(blank); setAdding(false); setEditClient(null); load();
  };
  const toggleHistory = async (client) => {
    if (expandedClientId === client.id) { setExpandedClientId(null); return; }
    setExpandedClientId(client.id);
    if (!clientOrders[client.id]) {
      const { data } = await supabase.from("Orders").select("*").eq("client_email", client.email).order("created_at", { ascending:false });
      setClientOrders(prev => ({...prev, [client.id]: data || []}));
    }
  };
  const startEdit = (c) => { setEditClient(c); setForm({...blank,...c}); setAdding(true); };
  const cancelForm = () => { setAdding(false); setEditClient(null); setForm(blank); };
  const deleteClient = async (id) => {
    if (!window.confirm("Delete this client?")) return;
    await supabase.from("Clients").delete().eq("id",id);
    setClients(clients.filter(c=>c.id!==id));
  };
  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Clients ({clients.length})</span>
        <button className="btn-p" onClick={()=>{ if(adding){cancelForm();}else{setAdding(true);} }}>{adding?"Cancel":"+ Add Client"}</button>
      </div>
      {adding && (
        <div className="crm-add-form">
          <h3>{editClient ? "Edit Client" : "New Client"}</h3>
          <div className="fld"><label>Name *</label><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Jane Smith" /></div>
          <div className="fld"><label>Email *</label><input value={form.email} onChange={e=>f("email",e.target.value)} placeholder="jane@email.com" /></div>
          <div className="fld"><label>Phone</label><input value={form.phone||""} onChange={e=>f("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
          <div className="fld"><label>Street Address</label><input value={form.address||""} onChange={e=>f("address",e.target.value)} placeholder="123 Main St" /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="fld"><label>City</label><input value={form.city||""} onChange={e=>f("city",e.target.value)} placeholder="Miami" /></div>
            <div className="fld"><label>State</label><input value={form.state||""} onChange={e=>f("state",e.target.value)} placeholder="FL" /></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="fld"><label>ZIP Code</label><input value={form.zip||""} onChange={e=>f("zip",e.target.value)} placeholder="33101" /></div>
            <div className="fld"><label>Country</label><input value={form.country||""} onChange={e=>f("country",e.target.value)} placeholder="USA" /></div>
          </div>
          <div className="fld"><label>Notes</label><textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Any notes about this client…" /></div>
          <div className="fld"><label>Collectors Password</label><input type="text" value={form.password||""} onChange={e=>f("password",e.target.value)} placeholder="Password for Exclusive Collectors login" /></div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-p" onClick={save}>{editClient ? "Update Client" : "Save Client"}</button>
            <button className="btn-s" onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      )}
      <input className="crm-search" placeholder="Search by name or email…" value={search} onChange={e=>setSearch(e.target.value)} />
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No clients yet.</p>
        : <table className="crm-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Notes</th><th>Login</th><th>Date Added</th><th></th></tr></thead>
            <tbody>{filtered.map(c=>(
              <Fragment key={c.id}>
                <tr>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone||"—"}</td>
                  <td style={{maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notes||"—"}</td>
                  <td>{c.password ? <span style={{color:"#2d6a4f",fontSize:11,fontWeight:600}}>✓ Set</span> : <span style={{color:"#aaa",fontSize:11}}>—</span>}</td>
                  <td>{c.created_at?new Date(c.created_at).toLocaleDateString():"—"}</td>
                  <td>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button className="btn-s" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>toggleHistory(c)}>
                        {expandedClientId===c.id ? "▲ Hide" : "▼ Orders"}
                      </button>
                      <button className="btn-s" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>startEdit(c)}>Edit</button>
                      <button className="btn-d" onClick={()=>deleteClient(c.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expandedClientId===c.id && (
                  <tr>
                    <td colSpan={6} style={{background:"#fffbf5",padding:"12px 14px 16px",borderTop:"none"}}>
                      <p style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>Order History</p>
                      {!clientOrders[c.id]
                        ? <p style={{fontSize:13,color:"var(--muted)"}}>Loading…</p>
                        : clientOrders[c.id].length === 0
                          ? <p style={{fontSize:13,color:"var(--muted)"}}>No orders yet.</p>
                          : <table style={{width:"100%",borderCollapse:"collapse"}}>
                              <thead>
                                <tr>
                                  {["Artwork","Amount","Status","Date"].map(h=>(
                                    <th key={h} style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",padding:"4px 12px",textAlign:"left",borderBottom:"1px solid var(--border)"}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {clientOrders[c.id].map(o=>(
                                  <tr key={o.id}>
                                    <td style={{padding:"8px 12px",fontSize:13}}>{o.item_title}</td>
                                    <td style={{padding:"8px 12px",fontSize:13}}>{o.amount?`$${Number(o.amount).toLocaleString()}`:"—"}</td>
                                    <td style={{padding:"8px 12px",fontSize:13,textTransform:"capitalize"}}>{o.status||"pending"}</td>
                                    <td style={{padding:"8px 12px",fontSize:13}}>{o.created_at?new Date(o.created_at).toLocaleDateString():"—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                      }
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
      }
    </div>
  );
}

function ItemForm({ data, updateData, addArtwork, editArtwork, editItem, setEditItem }) {
  const blank = { title:"", description:"", medium:"", dimensions:"", category:data.categories[0]||"", price:"", salePrice:"", images:[], image:"", isNew:false, isSold:false, isChildren:false, isCollectorsOnly:false, isEarlyAccess:false, stripeLink:"" };
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [previewImg, setPreviewImg] = useState(null);
  const multiFileRef = useRef();

  useEffect(() => {
    if (editItem) {
      const imgs = editItem.images?.length ? editItem.images : (editItem.image ? [editItem.image] : []);
      setForm({ ...editItem, images: imgs });
    } else {
      setForm(blank);
    }
  }, [editItem]);

  const handleAddPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    if (!supabase) {
      const url = URL.createObjectURL(file);
      setForm(fm => { const imgs = [...fm.images, url]; return { ...fm, images: imgs, image: imgs[0] }; });
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase().replace("jpeg","jpg");
      const titleSlug = (form.title||"art").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);
      const catSlug  = (form.category||"general").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,20);
      const path = `${catSlug}/${titleSlug}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("artworks").upload(path, file, { upsert:false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("artworks").getPublicUrl(path);
      setForm(fm => { const imgs = [...fm.images, publicUrl]; return { ...fm, images: imgs, image: imgs[0] }; });
    } catch(err) {
      console.error("Photo upload:", err); setStatus("upload-error");
    }
    setUploading(false);
  };

  const handleRemovePhoto = (idx) => {
    setForm(fm => {
      const imgs = fm.images.filter((_, i) => i !== idx);
      return { ...fm, images: imgs, image: imgs[0]||"" };
    });
  };

  const handleSave = async () => {
    if (!form.title || form.images.length === 0) { setStatus("warn"); return; }
    setStatus("saving");
    const entry = { ...form, image: form.images[0]||"", images: form.images, id: editItem ? editItem.id : Date.now().toString() };
    if (editItem) { await editArtwork(editItem.id, entry); }
    else { await addArtwork(entry); }
    setForm(blank); setEditItem(null);
    setStatus("ok"); setTimeout(() => setStatus(""), 3000);
  };

  const f = (k,v) => setForm(fm => ({ ...fm,[k]:v }));

  return (
    <div>
      <h2>{editItem ? "Edit Artwork" : "Add Artwork"}</h2>
      {status==="ok"           && <div className="ok-msg">✓ {editItem?"Updated":"Added to gallery"}!</div>}
      {status==="warn"         && <div className="warn-msg">⚠ Title and at least one photo are required.</div>}
      {status==="saving"       && <div className="warn-msg" style={{background:"#f0f8ff",borderColor:"#b0d4f0",color:"#1a4a7a"}}>Saving…</div>}
      {status==="upload-error" && <div className="warn-msg">⚠ Upload failed. Check that the "artworks" bucket is public in Supabase Storage.</div>}

      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:9999,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"
        }}>
          <img src={previewImg} alt="Preview" style={{maxWidth:"90vw",maxHeight:"90vh",objectFit:"contain",border:"2px solid var(--gold)",boxShadow:"0 8px 48px rgba(0,0,0,.6)"}} />
          <button onClick={() => setPreviewImg(null)} style={{
            position:"fixed",top:24,right:28,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",
            color:"#fff",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"
          }}>✕</button>
        </div>
      )}

      <div style={{marginBottom:16}}>
        <label style={{display:"block",fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:8}}>
          Photos <span style={{fontWeight:300,textTransform:"none",letterSpacing:0,fontSize:11}}>(click to preview)</span>
        </label>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
          {form.images.map((url, i) => (
            <div key={i} style={{position:"relative",width:220,height:220,flexShrink:0,cursor:"zoom-in"}} onClick={() => setPreviewImg(url)}>
              <img src={url} style={{width:220,height:220,objectFit:"cover",border:"2px solid var(--border)",display:"block",transition:"border-color .2s"}}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}
                alt={`photo ${i+1}`} />
              <button onClick={e => { e.stopPropagation(); handleRemovePhoto(i); }} style={{
                position:"absolute",top:-8,right:-8,width:24,height:24,borderRadius:"50%",
                background:"#c0392b",color:"#fff",border:"2px solid #fff",cursor:"pointer",
                fontSize:11,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",padding:0,zIndex:2
              }}>✕</button>
              {i===0 && <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.55)",color:"#fff",fontSize:10,textAlign:"center",letterSpacing:".08em",padding:"4px 0",pointerEvents:"none"}}>MAIN</div>}
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .2s",pointerEvents:"none"}}
                className="img-hover-overlay">
                <span style={{color:"#fff",fontSize:11,letterSpacing:".1em",opacity:0,transition:"opacity .2s"}}>🔍 Preview</span>
              </div>
            </div>
          ))}
          {form.images.length < 6 && (
            <button onClick={() => multiFileRef.current.click()} disabled={uploading} style={{
              width:220,height:220,border:"2px dashed var(--border)",background:"none",
              cursor:uploading?"not-allowed":"pointer",color:"var(--muted)",fontSize:36,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              flexShrink:0,gap:8,transition:"border-color .2s"
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor="var(--gold)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}
            >
              {uploading ? <span style={{fontSize:28}}>⏳</span> : <>
                <span style={{fontSize:36,lineHeight:1}}>+</span>
                <span style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase"}}>Add Photo</span>
              </>}
            </button>
          )}
        </div>
        {uploading && <p style={{fontSize:12,color:"var(--muted)",marginTop:8}}>Uploading photo…</p>}
        {form.images.length > 1 && <p style={{fontSize:11,color:"var(--muted)",marginTop:8}}>First photo is the main gallery image. Remove and re-add to change order.</p>}
        <input ref={multiFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleAddPhoto} />
      </div>

      <div className="fld"><label>Title *</label><input value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Lady in Blue" /></div>
      <div className="fld"><label>Category</label>
        <select value={form.category === "__new__" ? "__new__" : form.category}
          onChange={e => { if (e.target.value === "__new__") { f("category","__new__"); setNewCatInput(""); } else f("category", e.target.value); }}>
          {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">＋ New Category…</option>
        </select>
        {form.category === "__new__" && (
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input value={newCatInput} onChange={e=>setNewCatInput(e.target.value)}
              placeholder="Category name…" autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const cat = newCatInput.trim();
                  if (!cat || data.categories.includes(cat)) return;
                  updateData({ categories: [...data.categories, cat] });
                  f("category", cat); setNewCatInput("");
                }
              }}
              style={{flex:1,border:"1px solid var(--border)",padding:"8px 12px",fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none"}} />
            <button className="btn-p" style={{padding:"8px 16px",flexShrink:0}} onClick={() => {
              const cat = newCatInput.trim();
              if (!cat || data.categories.includes(cat)) return;
              updateData({ categories: [...data.categories, cat] });
              f("category", cat); setNewCatInput("");
            }}>Add</button>
          </div>
        )}
      </div>
      <div className="fld"><label>Description</label><textarea value={form.description} onChange={e=>f("description",e.target.value)} placeholder="About this piece…" /></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div className="fld"><label>Medium</label><input value={form.medium||""} onChange={e=>f("medium",e.target.value)} placeholder="Oil on canvas" /></div>
        <div className="fld"><label>Dimensions</label><input value={form.dimensions||""} onChange={e=>f("dimensions",e.target.value)} placeholder="24 × 36 in." /></div>
      </div>
      <div className="fld"><label>Price (USD)</label><input type="number" value={form.price} onChange={e=>f("price",e.target.value)} placeholder="350" /></div>
      <div className="fld"><label>Sale Price (USD — leave blank if not on sale)</label><input type="number" value={form.salePrice||""} onChange={e=>f("salePrice",e.target.value)} placeholder="250" /></div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isNew" checked={!!form.isNew} onChange={e=>f("isNew",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isNew" style={{textTransform:"none",fontSize:13,letterSpacing:0}}>Mark as New Collection</label>
      </div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isSold" checked={!!form.isSold} onChange={e=>f("isSold",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isSold" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#c0392b"}}>Mark as Sold (shows "Sold Out" badge — stays visible until deleted)</label>
      </div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isChildren" checked={!!form.isChildren} onChange={e=>f("isChildren",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isChildren" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#e74c3c"}}>❤️ Children Benefit piece (shows heart badge in catalog)</label>
      </div>
      <div style={{borderTop:"1px solid var(--border)",margin:"12px 0 12px",paddingTop:12}}>
        <p style={{fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>🔑 Exclusive Collectors Room</p>
        <div className="fld" style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <input type="checkbox" id="isCollectorsOnly" checked={!!form.isCollectorsOnly} onChange={e=>f("isCollectorsOnly",e.target.checked)} style={{width:"auto",accentColor:"#b8923f"}} />
          <label htmlFor="isCollectorsOnly" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#b8923f",fontWeight:500}}>Private Collectors Room only (hidden from public)</label>
        </div>
        <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" id="isEarlyAccess" checked={!!form.isEarlyAccess} onChange={e=>f("isEarlyAccess",e.target.checked)} style={{width:"auto",accentColor:"#b8923f"}} />
          <label htmlFor="isEarlyAccess" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#b8923f"}}>Early Access — show to collectors before public release</label>
        </div>
      </div>
      <div className="fld"><label>Stripe Link (optional)</label><input value={form.stripeLink} onChange={e=>f("stripeLink",e.target.value)} placeholder="https://buy.stripe.com/…" /></div>
      <div className="row-btns">
        <button className="btn-p" onClick={handleSave}>{editItem?"Update":"Add to Gallery"}</button>
        {editItem && <button className="btn-s" onClick={() => { setForm(blank); setEditItem(null); }}>Cancel</button>}
      </div>
    </div>
  );
}

function ItemList({ data, deleteArtwork, patchArtwork, onEdit }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const handleDelete = async id => {
    if (!window.confirm("Delete this artwork?")) return;
    const item = data.items.find(i => i.id === id);
    if (item?.image && supabase) {
      const storageBase = `${SUPABASE_URL}/storage/v1/object/public/artworks/`;
      if (item.image.startsWith(storageBase)) {
        const path = item.image.slice(storageBase.length).split("?")[0];
        supabase.storage.from("artworks").remove([path]).catch(() => {});
      }
    }
    await deleteArtwork(id);
  };

  if (!data.items.length) return <p style={{ color:"var(--muted)", fontSize:14 }}>No artworks yet. Add your first piece.</p>;

  const q = search.toLowerCase();
  const filtered = q ? data.items.filter(i =>
    i.title?.toLowerCase().includes(q) ||
    i.category?.toLowerCase().includes(q)
  ) : data.items;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSearch = v => { setSearch(v); setPage(1); };

  return (
    <>
      <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
        <input
          type="text"
          placeholder="Search by title or category…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ flex:1, border:"1px solid var(--border)", padding:"7px 11px", fontFamily:"'DM Sans',sans-serif", fontSize:13, outline:"none" }}
        />
        {search && <button className="btn-s" onClick={() => handleSearch("")}>Clear</button>}
        <span style={{ fontSize:12, color:"var(--muted)", whiteSpace:"nowrap" }}>{filtered.length} result{filtered.length!==1?"s":""}</span>
      </div>
      {paged.map(item => (
        <div key={item.id} className="admin-item">
          <img src={item.image} alt={item.title} />
          <div>
            <div className="ai-title">{item.title}</div>
            <div className="ai-meta">{item.category}{item.price?` · $${item.price}`:""}{item.salePrice?` · SALE $${item.salePrice}`:""}{item.medium?` · ${item.medium}`:""}{item.dimensions?` · ${item.dimensions}`:""}{item.isNew?" · NEW":""}{item.isSold?" · SOLD":""}{item.isChildren?" · ❤️ Children":""}</div>
          </div>
          <div className="ai-btns" style={{ flexDirection:"column", alignItems:"flex-end" }}>
            <div style={{ display:"flex", gap:5, marginBottom:5 }}>
              <button
                onClick={async () => { await patchArtwork(item.id, { isNew: !item.isNew }); }}
                style={{ padding:"2px 8px", fontSize:10, letterSpacing:".08em", textTransform:"uppercase", border:"1px solid", borderColor:item.isNew?"var(--sidebar-bg)":"var(--border)", background:item.isNew?"var(--sidebar-bg)":"transparent", color:item.isNew?"var(--gold)":"var(--muted)", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .2s", borderRadius:2 }}
              >New</button>
              <button
                onClick={async () => { await patchArtwork(item.id, { isSold: !item.isSold }); }}
                style={{ padding:"2px 8px", fontSize:10, letterSpacing:".08em", textTransform:"uppercase", border:"1px solid", borderColor:item.isSold?"#c0392b":"var(--border)", background:item.isSold?"#c0392b":"transparent", color:item.isSold?"#fff":"var(--muted)", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .2s", borderRadius:2 }}
              >Sold</button>
            </div>
            <div style={{ display:"flex", gap:5 }}>
              <button className="btn-s" onClick={() => onEdit(item)}>Edit</button>
              <button className="btn-d" onClick={() => handleDelete(item.id)}>Del</button>
            </div>
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          <button className="btn-s" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:12, color:"var(--muted)", alignSelf:"center" }}>Page {page} of {totalPages}</span>
          <button className="btn-s" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>Next ›</button>
        </div>
      )}
    </>
  );
}

function SettingsForm({ data, updateData, patchArtwork, loadArtworks }) {
  const [s, setS] = useState({ ...data.settings });
  const [cats, setCats] = useState([...data.categories]);
  const [newCat, setNewCat] = useState("");
  const [ok, setOk] = useState(false);
  const [navVis, setNavVis] = useState({ ...(data.settings.navVisible || {}) });

  const toggleNav = (id) => setNavVis(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));

  const save = async () => {
    await updateData({ settings: { ...s, navVisible: navVis }, categories: cats });
    setOk(true); setTimeout(() => setOk(false), 3000);
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
        <h3>🎟 Coupon Discount</h3>
        <div className="fld">
          <label>Welcome Coupon Discount (%)</label>
          <input type="number" min="1" max="99" value={s.couponDiscount ?? 15} onChange={e=>setS({...s,couponDiscount:Number(e.target.value)})} style={{maxWidth:120}} />
        </div>
        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>Applied automatically when a customer uses a coupon code at checkout.</p>
      </div>
      <div className="settings-box">
        <h3>💳 Stripe (Credit Card)</h3>
        <div className="fld"><label>Default Stripe Payment Link</label><input value={s.stripeLink} onChange={e=>setS({...s,stripeLink:e.target.value})} placeholder="https://buy.stripe.com/…" /></div>
        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>Create links at <strong>dashboard.stripe.com → Payment Links</strong>.</p>
      </div>
      <div className="settings-box">
        <h3>📱 Social Media</h3>
        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7, marginBottom:14 }}>Links appear as icons in the top bar. Leave blank to hide.</p>
        <div className="fld"><label>Instagram URL</label><input value={s.instagram||""} onChange={e=>setS({...s,instagram:e.target.value})} placeholder="https://instagram.com/fonkiart" /></div>
        <div className="fld"><label>Facebook URL</label><input value={s.facebook||""} onChange={e=>setS({...s,facebook:e.target.value})} placeholder="https://facebook.com/fonkiart" /></div>
        <div className="fld"><label>TikTok URL</label><input value={s.tiktok||""} onChange={e=>setS({...s,tiktok:e.target.value})} placeholder="https://tiktok.com/@fonkiart" /></div>
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
      <div className="settings-box">
        <h3>🔗 Navigation Links</h3>
        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7, marginBottom:14 }}>Turn any link off to hide it from the sidebar.</p>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const on = navVis[id] !== false;
          return (
            <div key={id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Icon size={14} color="var(--muted)" />
                <span style={{ fontSize:13, color: on ? "var(--ink)" : "var(--muted)" }}>{label}</span>
              </div>
              <button onClick={() => toggleNav(id)} style={{ width:42, height:24, borderRadius:12, border:"none", cursor:"pointer", background: on ? "var(--sidebar-bg)" : "#ddd", transition:"background .2s", position:"relative", flexShrink:0, padding:0 }}>
                <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left: on ? 21 : 3, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)" }} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn-p" style={{ width:"100%" }} onClick={save}>Save All Settings</button>
    </div>
  );
}

// ─── MARQUEE STRIP ───────────────────────────
function MarqueeStrip() {
  const msgs = ["Free Shipping over $75", "Original Art & Fine Art Prints", "New Works Added Weekly", "Shop the Collection", "Secure Checkout", "Ships Worldwide"];
  const items = [...msgs, ...msgs];
  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {items.map((m, i) => (
          <span key={i} className="marquee-item">
            {m}<span className="marquee-sep"> ✦ </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── FLOATING CART ───────────────────────────
function FloatingCart({ cart, removeFromCart, settings, cartOpen, setCartOpen }) {
  const [checkout, setCheckout] = useState(null);
  return (
    <>
      <button className="cart-fab" onClick={() => setCartOpen(o => !o)} title="Shopping Cart">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        {cart.length > 0 && <span className="cart-fab-badge">{cart.length}</span>}
      </button>
      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-drawer-head">
              <span>Your Cart ({cart.length})</span>
              <button onClick={() => setCartOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:20, lineHeight:1, padding:0 }}>✕</button>
            </div>
            <div className="cart-drawer-body">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🛒</div>
                  <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:300, marginBottom:8 }}>Your cart is empty</p>
                  <p style={{ fontSize:13, color:"var(--muted)" }}>Browse the collection and add pieces you love.</p>
                </div>
              ) : cart.map(item => (
                <div key={item.id} className="cart-drawer-item">
                  <img src={item.image} alt={item.title} />
                  <div>
                    <div className="cart-drawer-title">{item.title}</div>
                    <div className="cart-drawer-price">
                      {item.salePrice ? `$${Number(item.salePrice).toLocaleString()}` : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request"}
                    </div>
                    <button onClick={() => setCheckout(item)} style={{ background:"none", border:"1px solid var(--gold)", color:"var(--gold)", cursor:"pointer", fontSize:10, letterSpacing:".12em", textTransform:"uppercase", padding:"4px 10px", fontFamily:"'DM Sans',sans-serif", marginTop:6, transition:"all .2s" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--gold)";e.currentTarget.style.color="#fff"}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="var(--gold)"}}>
                      Purchase Now
                    </button>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:18, lineHeight:1, padding:0, transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"} title="Remove">✕</button>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="cart-drawer-foot">
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Select an item above to purchase individually.</div>
                <button style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", textDecoration:"underline", textUnderlineOffset:3, padding:0 }} onClick={() => { cart.forEach(i => removeFromCart(i.id)); }}>Clear Cart</button>
              </div>
            )}
          </div>
          {checkout && <CheckoutModal item={checkout} settings={settings} onClose={() => setCheckout(null)} />}
        </>
      )}
    </>
  );
}

// ─── COLLECTORS CLUB SECTION ─────────────────
function CollectorsSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleJoin = async () => {
    if (!email || !email.includes("@")) { setErr("Enter a valid email."); return; }
    setLoading(true);
    try {
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("id").eq("email", email.toLowerCase()).maybeSingle();
        if (!existing) {
          await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "collectors-section", coupon_code: null, coupon_used: false }]);
        }
      }
    } catch(e) { console.warn("Collectors signup:", e); }
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="collectors-section">
      <div>
        <div className="collectors-badge">Collectors Club</div>
        <h2 className="collectors-title">Join the mailing list.<br />Get the key to the collection.</h2>
        <p className="collectors-sub">Become a Fonkiart Collector — get first access to new works, private sales, and exclusive buying access. No spam, ever.</p>
      </div>
      <div className="collectors-form">
        {submitted ? (
          <div style={{ background:"#fff", border:"2px solid var(--label)", padding:"24px", textAlign:"center" }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>Welcome to the Club</div>
            <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>You're on the list. We'll be in touch with exclusive access.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:13, color:"var(--ink)", opacity:.7, lineHeight:1.6 }}>Enter your email to join. Free, instant access.</p>
            <input className="collectors-input" type="email" placeholder="your@email.com" value={email}
              onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && handleJoin()} />
            {err && <p style={{ fontSize:12, color:"#c0392b", marginTop:-4 }}>{err}</p>}
            <button className="collectors-submit" onClick={handleJoin} disabled={loading}>
              {loading ? "Joining…" : "Join the Collectors Club →"}
            </button>
            <p style={{ fontSize:11, color:"var(--ink)", opacity:.45, letterSpacing:".08em" }}>No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── UNIFIED LOGIN MODAL ─────────────────────
function UnifiedLoginModal({ onClose, onAdminLogin, onClientLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleLogin = async () => {
    if (!email || !pw) { setErr("Enter your email and password."); return; }
    setErr(""); setLoading(true);
    if (email.trim().toLowerCase() === "fonkiart@gmail.com" && pw === ADMIN_PASSWORD) {
      onAdminLogin(); return;
    }
    try {
      if (supabase) {
        const { data } = await supabase.from("Clients").select("id,name,email,password").eq("email", email.trim().toLowerCase()).maybeSingle();
        if (data && data.password && data.password === pw) { onClientLogin(data); return; }
      }
    } catch(e) {}
    setErr("Incorrect email or password.");
    setLoading(false);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:6 }}>Login</h2>
        <p className="checkout-sub" style={{ marginBottom:24 }}>Exclusive Collectors &amp; Admin Access</p>
        <div className="fld">
          <label>Email</label>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
        </div>
        <div className="fld">
          <label>Password</label>
          <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} placeholder="Password" onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {err && <p style={{ color:"#c0392b", fontSize:12, marginBottom:10 }}>{err}</p>}
        <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)" }} onClick={handleLogin} disabled={loading}>
          {loading ? "Signing in…" : "Sign In →"}
        </button>
      </div>
    </div>
  );
}

// ─── EXCLUSIVE COLLECTORS PAGE ───────────────
function ExclusiveCollectorsPage({ client, onLogout, artworks }) {
  const available = artworks.filter(a => !a.isSold);
  const firstName = client.name ? client.name.split(" ")[0] : "";
  return (
    <div style={{ minHeight:"100vh", background:"var(--cream)", fontFamily:"'DM Sans',sans-serif" }}>
      <style>{FONTS}</style>
      <div style={{ background:"var(--sidebar-bg)", padding:"28px 48px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:"rgba(255,255,255,.55)", marginBottom:4 }}>Private Collectors Circle</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:300, color:"#fff" }}>Welcome{firstName ? `, ${firstName}` : ""} — Fonkiart</div>
        </div>
        <button onClick={onLogout} style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.3)", padding:"10px 20px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:"#fff" }}>
          Sign Out
        </button>
      </div>
      <div style={{ padding:"48px 48px 80px", maxWidth:1100, margin:"0 auto" }}>
        <div style={{ marginBottom:36 }}>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>The Full Collection</p>
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>As an exclusive collector you have first access to every available piece — including works not yet listed publicly.</p>
        </div>
        {available.length > 0 ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:3 }}>
            {available.map(a => (
              <div key={a.id} style={{ position:"relative", aspectRatio:"1", overflow:"hidden", background:"#e8e2d9" }}>
                {a.image && <img src={a.image} alt={a.title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />}
                <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(to top,rgba(10,8,6,.88) 0%,transparent 65%)", padding:"20px 14px 14px" }}>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, color:"#fff", marginBottom:3 }}>{a.title}</div>
                  {a.price && <div style={{ fontSize:12, color:"var(--gold)", letterSpacing:".04em" }}>${Number(a.price).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"80px 0", color:"var(--muted)" }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12 }}>New works arriving soon.</div>
            <p style={{ fontSize:13 }}>The collection is being updated. Check back shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AUTH MODAL ──────────────────────────────
function AuthModal({ user, onClose, artworks = [] }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sendOtp = async () => {
    if (!email || !email.includes("@")) { setErr("Enter a valid email."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) { setErr(error.message); setLoading(false); return; }
      if (supabase) {
        const { data: existing } = await supabase.from("Leads").select("id").eq("email", email.toLowerCase()).maybeSingle();
        if (!existing) {
          await supabase.from("Leads").insert([{ email: email.toLowerCase(), source: "collectors-request", coupon_code: null, coupon_used: false }]);
        }
      }
      setSent(true);
    } catch(e) { setErr("Could not send link."); }
    setLoading(false);
  };

  const logout = async () => { await supabase.auth.signOut(); onClose(); };

  const previewImgs = artworks.filter(a => a.image && !a.isSold).slice(0, 3);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>

        {/* Left — art gallery */}
        <div className="welcome-gallery">
          {Array.from({ length: 3 }).map((_, i) => {
            const art = previewImgs[i];
            return (
              <div key={i} className="wg-item">
                {art ? <img src={art.image} alt={art.title} /> : <div style={{ background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)",width:"100%",height:"100%" }} />}
              </div>
            );
          })}
        </div>

        {/* Right — form */}
        <div className="welcome-form-side">
          <div style={{ display:"flex", justifyContent:"flex-end", padding:"6px 10px 0" }}>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:"50%", background:"rgba(0,0,0,.12)", border:"none", cursor:"pointer", color:"var(--ink)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
          <div className="welcome-top" style={{ padding:"14px 20px 12px" }}>
            <div className="welcome-top-text" style={{ width:"100%" }}>
              <div className="welcome-top-title" style={{ fontSize:"clamp(32px,4vw,52px)" }}>Exclusive Collectors<br />Login Form</div>
              <div className="welcome-top-sub" style={{ fontSize:22, marginTop:6, lineHeight:1.4 }}>Private Collectors Showroom<br />Request Secure Access Now</div>
            </div>
          </div>
          <div className="welcome-body" style={{ padding:"14px 22px 18px" }}>
            {user ? (
              <>
                <div className="ok-msg" style={{ marginBottom:16 }}>✓ Signed in as {user.email}</div>
                <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.7, marginBottom:20 }}>You have full collector access. Enjoy exclusive first looks at new works and private sales.</p>
                <button className="btn-p" style={{ width:"100%" }} onClick={logout}>Sign Out</button>
              </>
            ) : !sent ? (
              <>
                <p style={{ fontSize:15 }}>Enter your email and we'll send a secure sign-in link. No password needed.</p>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && sendOtp()}
                  style={{ width:"100%", border:"1px solid var(--border)", padding:"11px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:15, outline:"none", marginBottom:8 }} />
                {err && <p style={{ color:"#c0392b", fontSize:13, marginBottom:6 }}>{err}</p>}
                <button className="btn-p" style={{ width:"100%", background:"var(--sidebar-bg)", marginBottom:10, padding:"14px", fontSize:15 }} onClick={sendOtp} disabled={loading}>
                  {loading ? "Sending…" : "Send Request →"}
                </button>
              </>
            ) : (
              <>
                <div className="ok-msg" style={{ marginBottom:16 }}>✓ Request sent!</div>
                <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.7 }}>We sent a secure access link to <strong>{email}</strong>. Click the link in your email to enter the Private Collectors Showroom.</p>
                <button className="btn-p" style={{ width:"100%", background:"var(--gold)", padding:"14px", fontSize:15, marginTop:12 }} onClick={onClose}>Close</button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── TRACK ORDER MODAL ───────────────────────
function TrackOrderModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const searchOrders = async () => {
    if (!email || !email.includes("@")) { setErr("Enter a valid email."); return; }
    if (!supabase) { setErr("Service not available."); return; }
    setLoading(true); setErr(""); setOrders(null);
    const { data, error } = await supabase.from("Orders").select("id,item_title,status,amount,created_at").eq("client_email", email.toLowerCase().trim()).order("created_at", { ascending:false });
    setLoading(false);
    if (error) { setErr("Could not load orders."); return; }
    setOrders(data || []);
  };

  const statusColor = { pending:"#f0d5a8", confirmed:"#1e3a52", shipped:"#2d6a4f", delivered:"var(--gold)" };
  const statusLabel = { pending:"Pending", confirmed:"Confirmed", shipped:"Shipped", delivered:"Delivered" };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Track My Order</h2>
        <p className="checkout-sub">Enter the email you used to place your order</p>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <input className="catalog-search" style={{ flex:1, maxWidth:"none" }} type="email" placeholder="your@email.com" value={email}
            onChange={e => { setEmail(e.target.value); setErr(""); setOrders(null); }} onKeyDown={e => e.key === "Enter" && searchOrders()} />
          <button className="btn-p" onClick={searchOrders} disabled={loading}>{loading ? "…" : "Search"}</button>
        </div>
        {err && <p style={{ color:"#c0392b", fontSize:13, marginBottom:12 }}>{err}</p>}
        {orders !== null && (orders.length === 0
          ? <p style={{ fontSize:14, color:"var(--muted)", padding:"16px 0" }}>No orders found for this email.</p>
          : orders.map(o => (
              <div key={o.id} style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"16px 20px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:500 }}>{o.item_title}</div>
                  <div style={{ background:statusColor[o.status]||"var(--border)", color:["confirmed","shipped","delivered"].includes(o.status)?"#fff":"var(--ink)", fontSize:10, letterSpacing:".12em", textTransform:"uppercase", padding:"3px 10px", borderRadius:12, flexShrink:0, marginLeft:10 }}>
                    {statusLabel[o.status] || o.status}
                  </div>
                </div>
                <div style={{ fontSize:12, color:"var(--muted)" }}>
                  {o.amount ? `$${Number(o.amount).toLocaleString()} · ` : ""}
                  {o.created_at ? new Date(o.created_at).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }) : ""}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

// ─── MOBILE BOTTOM NAV ───────────────────────
function MobileBottomNav({ page, setPage, cartCount, onCart, onAccount }) {
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
