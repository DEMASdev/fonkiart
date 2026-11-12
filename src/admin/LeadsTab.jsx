import { useState, useEffect } from "react";
import { adminDb as supabase } from "../lib/adminDb";
import { generateCouponCode, sendEmail } from "../utils/helpers";
import { couponEmail } from "../lib/adminEmails";

export default function LeadsTab({ discount = 15 }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [couponFilter, setCouponFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [couponEmailEnabled, setCouponEmailEnabled] = useState(true);
  const [createMsg, setCreateMsg] = useState(null);

  const reload = () => {
    if (!supabase) { setLoading(false); return; }
    supabase.from("Leads").select("*").order("created_at", { ascending:false })
      .then(({ data }) => { setLeads(data||[]); setLoading(false); })
      .catch(e => { console.error("Leads load:", e); setLoading(false); });
  };
  useEffect(() => { reload(); }, []);

  const deleteLead = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    await supabase.from("Leads").delete().eq("id", id);
    setLeads(leads.filter(l => l.id !== id));
  };

  const resetCoupon = async (lead) => {
    if (!window.confirm(`Reset coupon ${lead.coupon_code} for ${lead.email}? It can be used again.`)) return;
    await supabase.from("Leads").update({ coupon_used: false }).eq("id", lead.id);
    setLeads(leads.map(l => l.id === lead.id ? {...l, coupon_used: false} : l));
  };

  const createCoupon = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setCreateMsg({ type:"err", text:"Please enter a valid email." }); return; }
    setCreateMsg({ type:"loading", text:"Checking…" });
    const { data: existing } = await supabase.from("Leads").select("coupon_code").eq("email", email).maybeSingle();
    if (existing) { setCreateMsg({ type:"err", text:`This email already has coupon ${existing.coupon_code}.` }); return; }
    const code = generateCouponCode();
    setCreateMsg({ type:"loading", text:"Creating…" });
    const { error } = await supabase.from("Leads").insert([{ email, source:"manual", coupon_code:code, coupon_used:false }]);
    if (error) { setCreateMsg({ type:"err", text:error.message }); return; }
    if (couponEmailEnabled) {
      try {
        await sendEmail({
          to: email,
          subject: "Your Exclusive Coupon — Fonkiart",
          ...couponEmail({ code, discount }),
        });
      } catch(e) { console.warn("Email:", e); }
    }
    setCreateMsg({ type:"ok", text:`Coupon ${code} created${couponEmailEnabled ? " and emailed to " + email : ""}.` });
    setNewEmail(""); setCreating(false); setCouponEmailEnabled(true);
    reload();
  };

  const unusedCount = leads.filter(l => !l.coupon_used).length;
  const usedCount   = leads.filter(l =>  l.coupon_used).length;
  const filtered = leads.filter(l =>
    (couponFilter === "all" || (couponFilter === "unused" ? !l.coupon_used : l.coupon_used)) &&
    l.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Leads ({leads.length})</span>
        <button className="btn-p" onClick={() => { setCreating(c => !c); setCreateMsg(null); setNewEmail(""); }}>
          {creating ? "Cancel" : "+ Create Coupon"}
        </button>
      </div>
      {creating && (
        <div className="crm-add-form">
          <h3>Create a Coupon</h3>
          <p style={{color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>Generate a unique {discount}% off coupon code for any email. The code will appear in the leads list and can be shared manually or emailed directly.</p>
          <div className="fld"><label>Customer Email *</label>
            <input type="email" autoCapitalize="none" value={newEmail} onChange={e=>{setNewEmail(e.target.value);setCreateMsg(null);}} placeholder="customer@email.com" onKeyDown={e=>e.key==="Enter"&&createCoupon()} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <input type="checkbox" id="sendCouponEmail" checked={couponEmailEnabled} onChange={e=>setCouponEmailEnabled(e.target.checked)} style={{width:"auto"}} />
            <label htmlFor="sendCouponEmail" style={{textTransform:"none",letterSpacing:0,color:"var(--ink)"}}>Email the coupon to this customer</label>
          </div>
          {createMsg && <div className={createMsg.type==="ok"?"ok-msg":"warn-msg"} style={{marginBottom:14}}>{createMsg.text}</div>}
          <button className="btn-p" onClick={createCoupon} disabled={createMsg?.type==="loading"}>Generate & Save</button>
        </div>
      )}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <input className="crm-search" style={{marginBottom:0,flex:1,minWidth:200}} placeholder="Search by email…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div className="chip-row" style={{display:"flex",gap:4,flexShrink:0}}>
          {[["all",`All (${leads.length})`],["unused",`Unused (${unusedCount})`],["used",`Used (${usedCount})`]].map(([val,label])=>(
            <button key={val} className="tap" onClick={()=>setCouponFilter(val)}
              style={{border:`1px solid ${couponFilter===val?"var(--ink)":"var(--border)"}`,background:couponFilter===val?"var(--ink)":"none",color:couponFilter===val?"#fff":"var(--muted)",padding:"5px 12px",letterSpacing:".08em",cursor:"pointer",whiteSpace:"nowrap"}}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">{leads.length===0 ? "No leads yet. They appear here when customers submit the popup or you create a coupon." : "No leads match this filter."}</p>
        : <table className="crm-table crm-cards">
            <thead><tr><th>Email</th><th>Coupon Code</th><th>Source</th><th>Used</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map(l => (
              <tr key={l.id}>
                <td data-label="Email" className="crm-wide">{l.email}</td>
                <td data-label="Coupon Code" style={{letterSpacing:".05em"}}>{l.coupon_code||"—"}</td>
                <td data-label="Source">{l.source||"—"}</td>
                <td data-label="Used">
                  {l.coupon_used
                    ? <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#2d6a4f",fontWeight:500}}>✓ Used</span>
                        <button className="btn-s" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>resetCoupon(l)}>Reset</button>
                      </div>
                    : <span style={{color:"var(--muted)"}}>No</span>}
                </td>
                <td data-label="Date">{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                <td className="crm-wide"><button className="btn-d" onClick={() => deleteLead(l.id)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table>
      }
    </div>
  );
}
