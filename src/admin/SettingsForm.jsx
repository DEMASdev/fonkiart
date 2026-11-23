import { useState, useEffect } from "react";
import { NAV_ITEMS } from "../constants";
import CardStatus from "./CardStatus";

export const SETTINGS_SECTIONS = [
  ["zelle",   "💜 Zelle"],
  ["venmo",   "🔵 Venmo"],
  ["cashapp", "💰 Cash App"],
  ["coupon",  "🎟 Coupon Discount"],
  ["stripe",  "💳 Stripe"],
  ["social",  "📱 Social Media"],
  ["cats",    "🗂 Categories"],
  ["nav",     "🔗 Navigation Links"],
];

export default function SettingsForm({ data, updateData, jumpTo, onJumpHandled }) {
  const [s, setS] = useState({ ...data.settings });
  const [cats, setCats] = useState([...data.categories]);
  const [newCat, setNewCat] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [navVis, setNavVis] = useState({ ...(data.settings.navVisible || {}) });
  const [section, setSection] = useState(SETTINGS_SECTIONS[0][0]);

  useEffect(() => {
    if (jumpTo) {
      setSection(jumpTo);
      onJumpHandled?.();
    }
  }, [jumpTo]);

  const toggleNav = (id) => setNavVis(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  // The Klarna offer's two numbers (Stripe section): saved as dollars, or none (empty: no offer).
  // They can be saved only once the Settings table has their columns (db/2026-11-22-klarna-offer.sql):
  // until then the row the shop loaded has neither, and a save holding them would be refused whole.
  const klarnaReady = "klarnaMax" in data.settings && "klarnaMostOff" in data.settings;
  const dollarsOrNone = (v) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  const save = async () => {
    setErr("");
    try {
      await updateData({ settings: { ...s, navVisible: navVis }, categories: cats });
      setOk(true); setTimeout(() => setOk(false), 3000);
    } catch (e) {
      console.error("Settings save:", e);
      setErr("Error saving settings. Please try again.");
      setTimeout(() => setErr(""), 5000);
    }
  };

  return (
    <div>
      <h2>Settings</h2>
      {ok && <div className="ok-msg">✓ Settings saved.</div>}
      {err && <div className="err" style={{marginBottom:12}}>{err}</div>}

      <div className="fld" style={{ maxWidth: 320, marginBottom: 18 }}>
        <label>Section</label>
        <select value={section} onChange={e => setSection(e.target.value)}
          style={{ border:"1px solid var(--border)", padding:"10px 12px", letterSpacing:".04em", background:"#fff", color:"var(--ink)", outline:"none", cursor:"pointer", width:"100%" }}>
          {SETTINGS_SECTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {section === "zelle" && (
        <div className="settings-box">
          <h3>💜 Zelle</h3>
          <div className="fld"><label>Zelle Email or Phone</label><input value={s.zelleContact} onChange={e=>setS({...s,zelleContact:e.target.value})} /></div>
          <div className="fld"><label>Contact Type</label>
            <select value={s.zelleLabel} onChange={e=>setS({...s,zelleLabel:e.target.value})}>
              <option value="email">Email</option>
              <option value="phone number">Phone number</option>
            </select>
          </div>
        </div>
      )}

      {section === "venmo" && (
        <div className="settings-box">
          <h3>🔵 Venmo</h3>
          <div className="fld"><label>Venmo Handle</label><input value={s.venmoHandle||""} onChange={e=>setS({...s,venmoHandle:e.target.value})} placeholder="@fonkiart" /></div>
          <p style={{color:"var(--muted)",lineHeight:1.7}}>Leave blank to hide Venmo as a payment option on checkout and invoices.</p>
        </div>
      )}

      {section === "cashapp" && (
        <div className="settings-box">
          <h3>💰 Cash App</h3>
          <div className="fld"><label>Cash App Cashtag</label><input value={s.cashAppHandle||""} onChange={e=>setS({...s,cashAppHandle:e.target.value})} placeholder="$fonkiart" /></div>
          <p style={{color:"var(--muted)",lineHeight:1.7}}>Leave blank to hide Cash App as a payment option on checkout and invoices.</p>
        </div>
      )}

      {section === "coupon" && (
        <div className="settings-box">
          <h3>🎟 Coupon Discount</h3>
          <div className="fld">
            <label>Welcome Coupon Discount (%)</label>
            <input type="number" min="1" max="99" value={s.couponDiscount ?? 15} onChange={e=>setS({...s,couponDiscount:Number(e.target.value)})} style={{maxWidth:120}} />
          </div>
          <p style={{ color:"var(--muted)", lineHeight:1.7 }}>Applied automatically when a customer uses a coupon code at checkout.</p>
        </div>
      )}

      {section === "stripe" && (
        <div className="settings-box">
          <h3>💳 Stripe (Credit Card)</h3>
          <CardStatus />
          {/* The Klarna offer (Andy, 2026-11-22, "build"): api/_lib/klarnaOffer.js. Both empty: no offer. */}
          <div className="klarna-offer-box">
            <h4 className="klarna-offer-title">Klarna offer</h4>
            <div className="fld">
              <label>Klarna&apos;s highest price ($)</label>
              <input type="number" min="1" step="1" inputMode="decimal" value={s.klarnaMax ?? ""} disabled={!klarnaReady} onChange={e=>setS({...s,klarnaMax:dollarsOrNone(e.target.value)})} placeholder="Empty: no offer" style={{maxWidth:180}} />
            </div>
            <p style={{color:"var(--muted)",lineHeight:1.7}}>The highest price Klarna takes, as your Stripe settings show it.</p>
            <div className="fld" style={{marginTop:14}}>
              <label>Most we&apos;ll take off so Klarna fits ($)</label>
              <input type="number" min="1" step="1" inputMode="decimal" value={s.klarnaMostOff ?? ""} disabled={!klarnaReady} onChange={e=>setS({...s,klarnaMostOff:dollarsOrNone(e.target.value)})} placeholder="Empty: no offer" style={{maxWidth:180}} />
            </div>
            <p style={{color:"var(--muted)",lineHeight:1.7}}>When a piece is just over that price, the checkout offers up to this much off to pay with Klarna.</p>
            {!klarnaReady && <p className="klarna-offer-wait" role="status">These two can be saved once the shop&apos;s database has its Klarna update (db/2026-11-22-klarna-offer.sql). Until then there is no offer.</p>}
          </div>
        </div>
      )}

      {section === "social" && (
        <div className="settings-box">
          <h3>📱 Social Media</h3>
          <p style={{ color:"var(--muted)", lineHeight:1.7, marginBottom:14 }}>Links appear as icons in the top bar. Leave blank to hide.</p>
          <div className="fld"><label>Instagram URL</label><input value={s.instagram||""} onChange={e=>setS({...s,instagram:e.target.value})} placeholder="https://instagram.com/fonkiart" /></div>
          <div className="fld"><label>Facebook URL</label><input value={s.facebook||""} onChange={e=>setS({...s,facebook:e.target.value})} placeholder="https://facebook.com/fonkiart" /></div>
          <div className="fld"><label>TikTok URL</label><input value={s.tiktok||""} onChange={e=>setS({...s,tiktok:e.target.value})} placeholder="https://tiktok.com/@fonkiart" /></div>
        </div>
      )}

      {section === "cats" && (
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
              style={{ flex:1, border:"1px solid var(--border)", padding:"8px 12px", outline:"none" }} />
            <button className="btn-s" onClick={()=>{ const c=newCat.trim();if(c&&!cats.includes(c)){setCats([...cats,c]);setNewCat("");} }}>Add</button>
          </div>
        </div>
      )}

      {section === "nav" && (
        <div className="settings-box">
          <h3>🔗 Navigation Links</h3>
          <p style={{ color:"var(--muted)", lineHeight:1.7, marginBottom:14 }}>Turn any link off to hide it from the sidebar.</p>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const on = navVis[id] !== false;
            return (
              <div key={id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Icon size={17} color="var(--muted)" />
                  <span style={{ color:on?"var(--ink)":"var(--muted)" }}>{label}</span>
                </div>
                <button onClick={() => toggleNav(id)} style={{ width:42, height:24, borderRadius:12, border:"none", cursor:"pointer", background:on?"var(--sidebar-bg)":"#ddd", transition:"background .2s", position:"relative", flexShrink:0, padding:0 }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:on?21:3, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)" }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn-p" style={{ width:"100%" }} onClick={save}>Save All Settings</button>
    </div>
  );
}
