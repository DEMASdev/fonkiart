import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import CheckoutModal from "../components/CheckoutModal";

export default function CollectorsRoomPage({ user, artworks, settings, onLogout, onBack, isAdmin, onAdminEnter }) {
  const exclusiveWorks = artworks.filter(a => a.isCollectorsOnly && !a.isSold);
  const earlyAccess    = artworks.filter(a => a.isEarlyAccess && !a.isSold);
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [commForm, setCommForm] = useState({ name:"", email:user?.email||"", idea:"", budget:"" });
  const [commSent, setCommSent] = useState(false);
  const [orders, setOrders]     = useState([]);
  const [tab, setTab]           = useState("room");

  useEffect(() => {
    if (!supabase || !user?.email) return;
    supabase.from("Orders").select("*").eq("client_email", user.email).order("created_at",{ascending:false})
      .then(({ data }) => setOrders(data || []));
  }, [user]);

  const sendCommission = async () => {
    if (!commForm.name || !commForm.idea) return;
    try {
      await supabase.from("Requests").insert([{ name:commForm.name, email:commForm.email, message:`[COLLECTORS COMMISSION] Budget: ${commForm.budget||"TBD"}\n\n${commForm.idea}`, status:"new" }]);
      setCommSent(true);
    } catch(e) { console.warn("Commission request:", e); }
  };

  const CR = { bg:"#0f0e0c", card:"#1a1816", border:"#2e2a24", gold:"#c9a96e", muted:"#7a6f63", text:"#f0ebe3" };

  return (
    <div style={{ minHeight:"100vh", background:CR.bg, color:CR.text, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ position:"sticky", top:0, zIndex:100, background:CR.bg, borderBottom:`1px solid ${CR.border}`, padding:"0 40px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, letterSpacing:".18em", textTransform:"uppercase", color:CR.gold, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:CR.gold }} />
          Private Collectors Room
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {isAdmin && <button onClick={onAdminEnter} style={{ background:"none", border:`1px solid ${CR.gold}`, color:CR.gold, padding:"6px 16px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase" }}>Admin Panel</button>}
          <span style={{ fontSize:12, color:CR.muted }}>{user?.email}</span>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:CR.muted, fontSize:12, letterSpacing:".08em" }}>← Back to Site</button>
          <button onClick={onLogout} style={{ background:"none", border:`1px solid ${CR.border}`, color:CR.muted, padding:"6px 14px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".08em", textTransform:"uppercase" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ padding:"0 40px", borderBottom:`1px solid ${CR.border}`, display:"flex" }}>
        {[["room","Private Collection"],["early","Early Access"],["commission","Commission"],["orders","My Collection"]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background:"none", border:"none", borderBottom:`2px solid ${tab===id?CR.gold:"transparent"}`, color:tab===id?CR.gold:CR.muted, padding:"16px 24px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase", transition:"all .2s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding:"48px 40px" }}>
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
                      {item.image && <img src={item.image} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform .4s" }} onMouseEnter={e=>e.target.style.transform="scale(1.04)"} onMouseLeave={e=>e.target.style.transform="scale(1)"} />}
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
                  <textarea value={commForm.idea} onChange={e=>setCommForm(f=>({...f,idea:e.target.value}))} placeholder="Describe the piece you have in mind…"
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
                    <div style={{ fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:o.status==="delivered"?"#2d6a4f":o.status==="shipped"?"#1e5a9c":CR.muted, border:`1px solid currentColor`, padding:"4px 10px" }}>{o.status}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.92)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} onClick={() => setSelected(null)}>
          <div style={{ background:CR.card, maxWidth:800, width:"100%", display:"grid", gridTemplateColumns:"1fr 1fr", maxHeight:"90vh", overflow:"hidden" }} onClick={e=>e.stopPropagation()}>
            <img src={selected.image} alt={selected.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <div style={{ padding:36, display:"flex", flexDirection:"column", overflowY:"auto" }}>
              <button onClick={() => setSelected(null)} style={{ alignSelf:"flex-end", background:"none", border:`1px solid ${CR.border}`, color:CR.muted, width:32, height:32, cursor:"pointer", borderRadius:"50%", fontSize:14, marginBottom:20 }}>✕</button>
              <p style={{ fontSize:11, letterSpacing:".2em", textTransform:"uppercase", color:CR.gold, marginBottom:8 }}>{selected.category}</p>
              <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, marginBottom:8, color:CR.text }}>{selected.title}</h2>
              {selected.medium && <p style={{ fontSize:13, color:CR.muted, marginBottom:6 }}>{selected.medium}{selected.dimensions?` · ${selected.dimensions}`:""}</p>}
              {selected.description && <p style={{ fontSize:14, color:CR.muted, lineHeight:1.75, flex:1, marginBottom:20 }}>{selected.description}</p>}
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:CR.gold, marginBottom:20 }}>{selected.price?`$${Number(selected.salePrice||selected.price).toLocaleString()}`:"Price on Request"}</div>
              <button onClick={() => { setCheckout(selected); setSelected(null); }} style={{ background:CR.gold, color:"#fff", border:"none", padding:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".14em", textTransform:"uppercase" }}>Acquire This Work →</button>
            </div>
          </div>
        </div>
      )}
      {checkout && <CheckoutModal item={checkout} settings={settings} onClose={() => setCheckout(null)} />}
    </div>
  );
}
