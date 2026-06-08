import { useState, useEffect, Fragment } from "react";
import { supabase } from "../lib/supabase";

export default function RequestsTab() {
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
      <div className="crm-header"><span className="crm-title">Requests ({requests.length})</span></div>
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
                    <select value={r.status||"new"} onChange={e=>updateStatus(r.id,e.target.value)} style={{border:"1px solid var(--border)",padding:"4px 8px",fontSize:12,background:"#fff",cursor:"pointer"}}>
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
                  <tr><td colSpan={6} style={{background:"#fffbf5",padding:"12px 14px 16px",borderTop:"none"}}>
                    <p style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:8}}>Full Message</p>
                    <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{r.message}</p>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
      }
    </div>
  );
}
