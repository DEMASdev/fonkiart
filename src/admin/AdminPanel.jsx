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
import SettingsForm, { SETTINGS_SECTIONS as SETTINGS_FORM_SECTIONS } from "./SettingsForm";

export default function AdminPanel({ data, updateData, addArtwork, editArtwork, deleteArtwork, patchArtwork, loadArtworks, onBack, onLogout, onViewRoom, tab, setTab }) {
  const setTabAndSave = setTab;
  const [editItem, setEditItem] = useState(null);
  const [badges, setBadges] = useState({ orders:0, requests:0 });
  const [settingsHover, setSettingsHover] = useState(false);
  const [settingsJumpTo, setSettingsJumpTo] = useState(null);
  const [ordersHover, setOrdersHover] = useState(false);
  const [ordersAction, setOrdersAction] = useState(null);
  const isCRM = ["dashboard","leads","orders","requests","clients"].includes(tab);
  const SETTINGS_SECTIONS = [...SETTINGS_FORM_SECTIONS, ["tasks","✅ Pending Tasks"]];

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
          <button className="btn-s" onClick={onViewRoom}>🔑 Collectors Room</button>
          <button className="btn-s" onClick={onBack}>← Back to Site</button>
          <button className="btn-s" onClick={onLogout}>Logout</button>
        </div>
      </div>
      <div className="crm-tabs">
        {[["dashboard","Dashboard"],["items","Artworks"],["leads","Leads"]].map(([id,label]) => (
          <button key={id} className={`admin-tab${tab===id?" active":""}`} onClick={() => setTabAndSave(id)}>
            {label}
          </button>
        ))}
        <div style={{ position:"relative" }} onMouseEnter={() => setOrdersHover(true)} onMouseLeave={() => setOrdersHover(false)}>
          <button className={`admin-tab${tab==="orders"?" active":""}`} onClick={() => { setTabAndSave("orders"); setOrdersAction(null); }}>
            Orders<Badge n={badges.orders} />
          </button>
          {ordersHover && (
            <div style={{ position:"absolute", top:"100%", left:0, background:"#fff", border:"1px solid var(--border)", minWidth:180, zIndex:600, boxShadow:"0 4px 16px rgba(0,0,0,.1)", marginTop:1 }}>
              {[["view","📋 View Orders"],["invoice","✉ Send Invoice"],["add","+ Add Order"]].map(([k,label]) => (
                <button key={k} onClick={() => { setTabAndSave("orders"); setOrdersAction(k==="view" ? null : k); setOrdersHover(false); }}
                  style={{ display:"block", width:"100%", padding:"10px 16px", background:"none", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer", textAlign:"left", fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"var(--ink)", letterSpacing:".04em" }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--cream)"}
                  onMouseLeave={e => e.currentTarget.style.background="none"}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {[["requests","Requests"],["clients","Clients"]].map(([id,label]) => (
          <button key={id} className={`admin-tab${tab===id?" active":""}`} onClick={() => setTabAndSave(id)}>
            {label}
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
            {tab==="orders"   && <OrdersTab data={data} action={ordersAction} onActionHandled={() => setOrdersAction(null)} />}
            {tab==="requests" && <RequestsTab />}
            {tab==="clients"  && <ClientsTab />}
          </ErrorBoundary>
        </div>
      ) : (
        <div className="admin-body">
          <div className="admin-side">
            {tab==="items"
              ? <ItemForm data={data} updateData={updateData} addArtwork={addArtwork} editArtwork={editArtwork} editItem={editItem} setEditItem={setEditItem} />
              : <SettingsForm data={data} updateData={updateData} patchArtwork={patchArtwork} loadArtworks={loadArtworks} jumpTo={settingsJumpTo} onJumpHandled={() => setSettingsJumpTo(null)} />}
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
