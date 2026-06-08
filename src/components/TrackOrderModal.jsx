import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function TrackOrderModal({ onClose }) {
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
