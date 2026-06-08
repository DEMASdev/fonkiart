import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const STATUS_COLOR = { pending:"#c9a96e", confirmed:"#1e3a52", shipped:"#2d6a4f", delivered:"var(--gold)" };
const STATUS_LABEL = { pending:"Pending", confirmed:"Confirmed", shipped:"Shipped", delivered:"Delivered" };

export default function BuyerDashboard({ user, onLogout, onBack }) {
  const [tab, setTab]       = useState("orders");
  const [orders, setOrders] = useState([]);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  const firstName = user?.user_metadata?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  useEffect(() => {
    if (!supabase || !user?.email) return;
    const email = user.email.toLowerCase();

    Promise.all([
      supabase.from("Orders").select("*").eq("client_email", email).order("created_at", { ascending: false }),
      supabase.from("Clients").select("*").eq("email", email).maybeSingle(),
    ]).then(([ordersRes, clientRes]) => {
      setOrders(ordersRes.data || []);
      setClient(clientRes.data || null);

      // Create Clients record if it doesn't exist yet (first login after signup)
      if (!clientRes.data && user.user_metadata?.name) {
        supabase.from("Clients").insert([{
          name: user.user_metadata.name,
          email,
        }]).then(() => {
          supabase.from("Clients").select("*").eq("email", email).maybeSingle()
            .then(({ data }) => setClient(data));
        });
      }

      setLoading(false);
    });
  }, [user]);

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      style={{ background:"none", border:"none", borderBottom:`2px solid ${tab===id?"var(--gold)":"transparent"}`, padding:"14px 24px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:tab===id?"var(--ink)":"var(--muted)", transition:"all .2s", whiteSpace:"nowrap" }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight:"100vh", background:"var(--cream)", fontFamily:"'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ background:"var(--sidebar-bg)", padding:"24px 40px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:"rgba(255,255,255,.6)", marginBottom:4 }}>My Account</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:300, color:"#fff" }}>Welcome back, {firstName}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:12, color:"rgba(255,255,255,.55)" }}>{user?.email}</span>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,.7)", fontSize:12, letterSpacing:".08em", fontFamily:"'DM Sans',sans-serif" }}>← Back to site</button>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.25)", padding:"7px 16px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:"#fff" }}>Sign Out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:"#fff", borderBottom:"1px solid var(--border)", padding:"0 40px", display:"flex" }}>
        <TabBtn id="orders"  label="My Orders" />
        <TabBtn id="profile" label="My Profile" />
      </div>

      {/* Content */}
      <div style={{ maxWidth:860, margin:"0 auto", padding:"40px 24px 80px" }}>

        {/* ── ORDERS TAB ── */}
        {tab === "orders" && (
          <>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, color:"var(--ink)", marginBottom:6 }}>Order History</h1>
              <p style={{ fontSize:13, color:"var(--muted)" }}>Track the status of your purchases from Fonkiart.</p>
            </div>

            {loading ? (
              <p style={{ color:"var(--muted)", fontSize:14 }}>Loading…</p>
            ) : orders.length === 0 ? (
              <div style={{ textAlign:"center", padding:"64px 0", background:"#fff", border:"1px solid var(--border)" }}>
                <div style={{ fontSize:40, marginBottom:16 }}>🎨</div>
                <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>No orders yet</p>
                <p style={{ fontSize:13, color:"var(--muted)", marginBottom:24 }}>When you purchase a piece, it will appear here.</p>
                <button className="btn-p" style={{ background:"var(--gold)" }} onClick={onBack}>Browse the Collection</button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {orders.map(o => (
                  <div key={o.id} style={{ background:"#fff", border:"1px solid var(--border)", padding:"20px 24px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:"var(--ink)", marginBottom:4 }}>{o.item_title}</div>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>
                          Placed {o.created_at ? new Date(o.created_at).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }) : "—"}
                          {o.id && <span style={{ fontFamily:"monospace", marginLeft:12, opacity:.6 }}>#{String(o.id).slice(0,8).toUpperCase()}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, flexShrink:0 }}>
                        {o.amount && (
                          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:"var(--gold)" }}>
                            ${Number(o.amount).toLocaleString()}
                          </div>
                        )}
                        <div style={{ fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:["confirmed","shipped","delivered"].includes(o.status)?"#fff":"var(--ink)", background:STATUS_COLOR[o.status]||"var(--border)", padding:"4px 12px", borderRadius:20 }}>
                          {STATUS_LABEL[o.status] || o.status}
                        </div>
                      </div>
                    </div>
                    {/* Status progress */}
                    <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:0 }}>
                      {["pending","confirmed","shipped","delivered"].map((s, i, arr) => {
                        const statuses = ["pending","confirmed","shipped","delivered"];
                        const orderIdx = statuses.indexOf(o.status);
                        const isActive = i <= orderIdx;
                        return (
                          <div key={s} style={{ display:"flex", alignItems:"center", flex: i < arr.length-1 ? 1 : "none" }}>
                            <div style={{ width:10, height:10, borderRadius:"50%", background:isActive?STATUS_COLOR[s]||"var(--border)":"#e0dbd5", flexShrink:0, border:`2px solid ${isActive?STATUS_COLOR[s]||"var(--border)":"#e0dbd5"}` }} />
                            {i < arr.length-1 && <div style={{ flex:1, height:2, background:i < orderIdx?"var(--border)":"#e0dbd5", margin:"0 2px" }} />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                      {["Pending","Confirmed","Shipped","Delivered"].map(l => (
                        <div key={l} style={{ fontSize:9, letterSpacing:".06em", textTransform:"uppercase", color:"var(--muted)", flex:1, textAlign: l==="Pending"?"left":l==="Delivered"?"right":"center" }}>{l}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, color:"var(--ink)", marginBottom:6 }}>My Profile</h1>
              <p style={{ fontSize:13, color:"var(--muted)" }}>Your account information at Fonkiart.</p>
            </div>

            <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"28px 32px" }}>
              {[
                ["Name",    client?.name  || user?.user_metadata?.name  || "—"],
                ["Email",   user?.email   || "—"],
                ["Phone",   client?.phone || "—"],
                ["Address", [client?.address, client?.city, client?.state, client?.zip, client?.country].filter(Boolean).join(", ") || "—"],
              ].map(([label, value]) => (
                <div key={label} style={{ display:"flex", alignItems:"baseline", padding:"14px 0", borderBottom:"1px solid var(--border)" }}>
                  <div style={{ fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:"var(--muted)", width:100, flexShrink:0 }}>{label}</div>
                  <div style={{ fontSize:14, color:"var(--ink)" }}>{value}</div>
                </div>
              ))}
              <p style={{ fontSize:12, color:"var(--muted)", marginTop:20, lineHeight:1.7 }}>
                To update your shipping address or phone number, contact us at{" "}
                <a href="mailto:support@fonkiart.com" style={{ color:"var(--gold)" }}>support@fonkiart.com</a> and we'll update it for you.
              </p>
            </div>

            <div style={{ marginTop:32, textAlign:"center" }}>
              <button className="btn-p" style={{ background:"var(--gold)", marginRight:12 }} onClick={onBack}>Browse the Collection</button>
              <button className="btn-s" onClick={onLogout}>Sign Out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
