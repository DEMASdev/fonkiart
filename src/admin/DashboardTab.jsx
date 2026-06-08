import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import AdminTasksWidget from "./AdminTasksWidget";

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
      const shipped   = orders.filter(o => o.status === "shipped").length;
      const delivered = orders.filter(o => o.status === "delivered").length;
      const paidStatuses = ["confirmed","shipped","delivered"];
      const revenue   = orders.filter(o => paidStatuses.includes(o.status)).reduce((sum, o) => sum + Number(o.amount || 0), 0);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const monthRevenue = orders.filter(o => paidStatuses.includes(o.status) && o.created_at >= monthStart).reduce((sum, o) => sum + Number(o.amount || 0), 0);
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
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)", marginBottom:2 }}>{stats.collectorRequests.length} Collector{stats.collectorRequests.length > 1 ? "s" : ""} Waiting for Access</div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>{stats.collectorRequests.slice(0,3).map(r => r.email).join(", ")}{stats.collectorRequests.length > 3 ? ` +${stats.collectorRequests.length - 3} more` : ""}</div>
            </div>
          </div>
          <button onClick={() => goToTab("leads")} style={{ background:"var(--gold)", color:"#fff", border:"none", padding:"8px 18px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>View in Leads →</button>
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
          {[{label:"Pending",value:stats.pending,color:"#f0d5a8"},{label:"Confirmed",value:stats.confirmed,color:"#1e3a52"},{label:"Shipped",value:stats.shipped,color:"#2d6a4f"},{label:"Delivered",value:stats.delivered,color:"var(--gold)"}].map(({ label, value, color }) => (
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
