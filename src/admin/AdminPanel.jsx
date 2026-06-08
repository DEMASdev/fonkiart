import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import ErrorBoundary from "../components/ErrorBoundary";
import DashboardTab from "./DashboardTab";
import LeadsTab from "./LeadsTab";
import OrdersTab from "./OrdersTab";
import RequestsTab from "./RequestsTab";
import ClientsTab from "./ClientsTab";
import ItemForm from "./ItemForm";
import ItemList from "./ItemList";
import SettingsForm from "./SettingsForm";

export default function AdminPanel({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, onLogout, onViewRoom }) {
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
    ]).then(([o, r]) => setBadges({ orders:o.count||0, requests:r.count||0 }));
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
          <button className={`admin-tab${tab==="settings"?" active":""}`} onClick={() => setTabAndSave("settings")}>Settings</button>
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
