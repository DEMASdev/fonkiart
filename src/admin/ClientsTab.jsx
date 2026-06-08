import { useState, useEffect, Fragment } from "react";
import { supabase } from "../lib/supabase";
import { hashPassword } from "../utils/helpers";
export default function ClientsTab() {
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
    const payload = { ...form };
    if (form.password) {
      payload.password = await hashPassword(form.password);
    } else if (editClient) {
      delete payload.password; // keep existing hash if field left blank while editing
    }
    if (editClient) {
      await supabase.from("Clients").update(payload).eq("id", editClient.id);
    } else {
      await supabase.from("Clients").insert([payload]);
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
  const startEdit = (c) => { setEditClient(c); setForm({...blank,...c, password:""}); setAdding(true); };
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
          <div className="fld"><label>Collectors Password {editClient ? <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(leave blank to keep existing)</span> : ""}</label><input type="password" value={form.password||""} onChange={e=>f("password",e.target.value)} placeholder={editClient ? "Enter new password to change…" : "Set a password for this client"} autoComplete="new-password" /></div>
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

