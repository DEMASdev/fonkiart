import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { adminDb as supabase } from "../lib/adminDb";
import AdminTasksWidget from "./AdminTasksWidget";
import { isPaid, ORDER_STATUSES, statusLook } from "../lib/orderStatus";

const Stat = ({ label, value, sub, color }) => (
  <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", borderTop:`3px solid ${color||"var(--gold)"}` }}>
    <div style={{ letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>{label}</div>
    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:42, fontWeight:600, fontVariantNumeric:"lining-nums", color:"var(--ink)", lineHeight:1 }}>{value}</div>
    {sub && <div style={{ color:"var(--muted)", marginTop:8 }}>{sub}</div>}
  </div>
);

export default function DashboardTab({ goToTab, goToSettings }) {
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
      const paidCount = orders.filter(o => o.status === "paid").length;
      const shipped   = orders.filter(o => o.status === "shipped").length;
      const delivered = orders.filter(o => o.status === "delivered").length;
      // Money is counted once the order is Paid (or later: shipped, delivered). Before 11-17 there
      // was no Paid step, so it waited for Shipped. "Confirmed" means the client approved the invoice:
      // NOT paid yet, so it shows apart as "Waiting for payment" (Andy, 2026-11-17).
      const sum = (list) => list.reduce((total, o) => total + Number(o.amount || 0), 0);
      const paid = orders.filter(o => isPaid(o.status));
      const revenue   = sum(paid);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const monthRevenue = sum(paid.filter(o => o.created_at >= monthStart));
      const awaiting  = sum(orders.filter(o => o.status === "confirmed"));
      const newRequests = (requestsRes.data || []).filter(r => r.status === "new").length;
      const collectorRequests = collectorsRes.data || [];
      setStats({ leads:leadsRes.count||0, orders:orders.length, clients:clientsRes.count||0, pending, confirmed, paidCount, shipped, delivered, revenue, monthRevenue, awaiting, newRequests, collectorRequests });
    }).catch(e => { console.error("Dashboard load:", e); setLoadErr(true); });
  }, [tick]);

  if (loadErr) return <div className="crm-wrap"><p className="crm-empty">Could not load dashboard. Check your connection and <button className="btn-s" style={{marginLeft:8}} onClick={()=>setTick(t=>t+1)}>retry</button></p></div>;
  if (!stats) return <div className="crm-wrap"><p className="crm-empty">Loading…</p></div>;

  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Dashboard</span>
        <button className="btn-s" style={{ display:"flex", alignItems:"center", gap:6 }} onClick={() => setTick(t => t+1)}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {stats.collectorRequests.length > 0 && (
        <div style={{ background:"#fffbf0", border:"2px solid var(--gold)", padding:"16px 22px", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20 }}>🔑</span>
            <div>
              <div style={{ fontWeight:600, color:"var(--ink)", marginBottom:2 }}>{stats.collectorRequests.length} Collector{stats.collectorRequests.length > 1 ? "s" : ""} Waiting for Access</div>
              <div style={{ color:"var(--muted)" }}>{stats.collectorRequests.slice(0,3).map(r => r.email).join(", ")}{stats.collectorRequests.length > 3 ? ` +${stats.collectorRequests.length - 3} more` : ""}</div>
            </div>
          </div>
          <button className="tap" onClick={() => goToTab("leads")} style={{ background:"var(--gold)", color:"#fff", border:"none", padding:"8px 18px", cursor:"pointer", letterSpacing:".1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>View in Leads →</button>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:2, marginBottom:2 }}>
        <Stat label="Revenue (All Time)" value={`$${stats.revenue.toLocaleString()}`} sub="Paid, shipped + delivered" color="var(--gold)" />
        <Stat label="Revenue (This Month)" value={`$${stats.monthRevenue.toLocaleString()}`} sub={`Paid, shipped + delivered · ${new Date().toLocaleString("default",{month:"long",year:"numeric"})}`} color="#a07a3a" />
        <Stat label="Waiting for Payment" value={`$${stats.awaiting.toLocaleString()}`} sub={`${stats.confirmed} client-approved, not paid yet`} color="#b5651d" />
        <Stat label="Total Orders" value={stats.orders} sub={`${stats.pending} pending · ${stats.confirmed} confirmed · ${stats.paidCount} paid`} color="#1e3a52" />
        <Stat label="Clients" value={stats.clients} color="var(--ok)" />
        <Stat label="Leads" value={stats.leads} sub="Email subscribers" color="#7a4f00" />
        {stats.newRequests > 0 && <Stat label="New Requests" value={stats.newRequests} sub="Need attention" color="#c0392b" />}
      </div>
      <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", marginTop:2 }}>
        <p style={{ letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:18 }}>Orders by Status</p>
        <div style={{ display:"flex", gap:32, flexWrap:"wrap" }}>
          {/* The five steps and their colours come from lib/orderStatus, as on My Account and Track my order. */}
          {ORDER_STATUSES.map(([s, label]) => (
            <div key={s} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:statusLook(s).dot, flexShrink:0, border:"1px solid rgba(0,0,0,.1)" }} />
              <span style={{ color:"var(--muted)" }}>{label}</span>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, fontVariantNumeric:"lining-nums", color:"var(--ink)" }}>{stats[s === "paid" ? "paidCount" : s]}</span>
            </div>
          ))}
        </div>
      </div>
      <AdminTasksWidget goToTab={goToTab} goToSettings={goToSettings} />
    </div>
  );
}
