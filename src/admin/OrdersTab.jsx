import { useState, useEffect, Fragment } from "react";
import { supabase, BREVO_SENDER } from "../lib/supabase";
import { sendEmail } from "../utils/helpers";
export default function OrdersTab({ data, action, onActionHandled }) {
  const catalog = data?.items || [];
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [clientMode, setClientMode] = useState("select");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientUpdate, setClientUpdate] = useState({});
  const blank = { client_email:"", item_title:"", amount:"", status:"pending", notes:"" };
  const [form, setForm] = useState(blank);
  const [manual, setManual] = useState({ first:"", last:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"" });
  const invBlank = { client_email:"", client_name:"", item_title:"", amount:"", notes:"", due_date:"", zelle_contact:"", stripe_link:"", pay_zelle:true, pay_venmo:false, pay_cashapp:false, pay_stripe:false, newFirst:"", newLast:"", newEmail:"", newPhone:"", clientMode:"select" };
  const [inv, setInv] = useState(invBlank);
  const iv = (k,v) => setInv(x=>({...x,[k]:v}));
  const [invSending, setInvSending] = useState(false);
  const [invSent, setInvSent] = useState("");
  const showMsg = (msg) => { setInvSent(msg); setTimeout(() => setInvSent(""), 4000); };
  const [resending, setResending] = useState({});

  const fmtInvNum = (id) => `INV-${String(id).replace(/-/g,"").slice(0,6).toUpperCase()}`;
  const fmtDate   = (iso) => iso ? new Date(iso).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : "";

  const buildInvoiceEmail = (order, link) => {
    const invNum  = fmtInvNum(order.id);
    const invDate = fmtDate(order.created_at || new Date().toISOString());
    const dueStr  = order.due_date ? `<tr><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Due Date</td><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:13px;color:#1c1a18;text-align:right;">${fmtDate(order.due_date + "T00:00:00")}</td></tr>` : "";
    const notesStr = order.notes ? `<tr><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Notes</td><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:13px;color:#1c1a18;text-align:right;">${order.notes}</td></tr>` : "";
    const firstName = order.client_name ? order.client_name.split(" ")[0] : "there";
    return `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 32px;background:#fdfcf8;">
<div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #ece7dd;">
  <h1 style="font-family:'Georgia',serif;font-size:26px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#1c1a18;margin:0 0 4px;">Fonkiart</h1>
  <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a8078;margin:0;">Original Art &amp; Fine Art Prints</p>
</div>
<div style="display:flex;justify-content:space-between;margin-bottom:24px;">
  <span style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Invoice ${invNum}</span>
  <span style="font-size:12px;color:#8a8078;">${invDate}</span>
</div>
<p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:8px;">Hi ${firstName},</p>
<p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:28px;">You have a new invoice from Fonkiart. Click below to review the details and approve your order.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
  <tr><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8078;">Artwork / Item</td><td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:15px;color:#1c1a18;text-align:right;">${order.item_title}</td></tr>
  ${notesStr}${dueStr}
  <tr><td style="padding:14px 0 0;font-size:14px;font-weight:600;color:#1c1a18;">Total Due</td><td style="padding:14px 0 0;font-size:24px;color:#c9a96e;font-weight:600;text-align:right;">$${Number(order.amount).toLocaleString()}</td></tr>
</table>
<div style="text-align:center;margin:32px 0;"><a href="${link}" style="display:inline-block;background:#1e3a52;color:#fff;padding:15px 40px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;font-family:Georgia,serif;">Review &amp; Approve →</a></div>
<p style="color:#8a8078;font-size:12px;line-height:1.7;text-align:center;">Questions? Reply to this email or contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a></p>
</div>`;
  };
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const m = (k,v) => setManual(fm=>({...fm,[k]:v}));
  const cu = (k,v) => setClientUpdate(fm=>({...fm,[k]:v}));
  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const [ordersRes, clientsRes] = await Promise.all([
        supabase.from("Orders").select("*").order("created_at",{ascending:false}),
        supabase.from("Clients").select("*").order("name",{ascending:true})
      ]);
      setOrders(ordersRes.data||[]); setClients(clientsRes.data||[]);
    } catch(e) { console.error("Orders load:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!action) return;
    if (action === "invoice") { setSendingInvoice(true); setAdding(false); }
    else if (action === "add") { setAdding(true); setSendingInvoice(false); }
    onActionHandled?.();
  }, [action]);

  const sendInvoice = async () => {
    const email = inv.clientMode === "new" ? inv.newEmail : inv.client_email;
    const name  = inv.clientMode === "new" ? `${inv.newFirst} ${inv.newLast}`.trim() : (clients.find(c=>c.email===inv.client_email)?.name || "");
    if (!email || !inv.item_title || !inv.amount) {
      showMsg("Please select a client and fill in Artwork/Item and Amount.");
      return;
    }
    setInvSending(true); setInvSent("");
    try {
      if (inv.clientMode === "new" && inv.newFirst && inv.newEmail) {
        const { error: clientErr } = await supabase.from("Clients").insert([{ name, email:inv.newEmail, phone:inv.newPhone }]);
        if (clientErr) throw clientErr;
      }
      const token = crypto.randomUUID();
      const link = `${window.location.origin}/?invoice=${token}`;
      const methods = ["zelle","venmo","cashapp","stripe"].filter(m => inv[`pay_${m}`]).join(",");
      const { data: orderData, error: orderErr } = await supabase.from("Orders").insert([{
        client_email: email, client_name: name,
        item_title: inv.item_title, amount: Number(inv.amount),
        notes: inv.notes, due_date: inv.due_date || null,
        status: "pending", invoice_token: token, invoice_approved: false,
        zelle_contact: inv.pay_zelle ? inv.zelle_contact : null,
        stripe_link: inv.pay_stripe ? inv.stripe_link : null,
        payment_methods: methods,
      }]).select().single();
      if (orderErr) throw orderErr;
      const order = { ...orderData, client_name: name, created_at: new Date().toISOString() };
      await sendEmail({ to: email, subject: `Invoice ${fmtInvNum(order.id)} — ${inv.item_title} · Fonkiart`, htmlContent: buildInvoiceEmail(order, link) });
      await load();
      setInv(invBlank); setSendingInvoice(false);
      showMsg(`Invoice sent to ${email}`);
    } catch(e) { console.warn("Send invoice:", e); showMsg("Error sending invoice. Please try again."); }
    finally { setInvSending(false); }
  };

  const resendInvoice = async (order) => {
    if (!order.invoice_token) return;
    setResending(r => ({...r, [order.id]: true}));
    try {
      const link = `${window.location.origin}/?invoice=${order.invoice_token}`;
      await sendEmail({ to: order.client_email, subject: `Invoice ${fmtInvNum(order.id)} — ${order.item_title} · Fonkiart`, htmlContent: buildInvoiceEmail(order, link) });
      showMsg(`Invoice resent to ${order.client_email}`);
    } catch(e) { showMsg("Error resending invoice."); }
    finally { setResending(r => ({...r, [order.id]: false})); }
  };

  const missingFields = selectedClient ? ["phone","address","city","state","zip","country"].filter(k => !selectedClient[k]) : [];
  const save = async () => {
    let email = form.client_email;
    if (clientMode==="manual") {
      if (!manual.email||!manual.first) return;
      email = manual.email;
      await supabase.from("Clients").insert([{ name:`${manual.first} ${manual.last}`.trim(), email:manual.email, phone:manual.phone, address:manual.address, city:manual.city, state:manual.state, zip:manual.zip, country:manual.country }]);
    } else if (selectedClient && missingFields.length > 0 && Object.keys(clientUpdate).length > 0) {
      await supabase.from("Clients").update(clientUpdate).eq("id", selectedClient.id);
    }
    if (!email||!form.item_title) return;
    await supabase.from("Orders").insert([{...form, client_email:email}]);
    setForm(blank); setManual({first:"",last:"",email:"",phone:"",address:"",city:"",state:"",zip:"",country:""}); setSelectedClient(null); setClientUpdate({}); setAdding(false); setClientMode("select"); load();
  };
  const sendStatusEmail = async (order, status) => {
    const client = clients.find(c => c.email === order.client_email);
    const name = client?.name?.split(" ")[0] || "there";
    const msgs = {
      confirmed: { sub:`Your order is confirmed — ${order.item_title}`, body:`Great news! Your order for <strong>${order.item_title}</strong> has been confirmed. We'll notify you once it ships.` },
      shipped:   { sub:`Your order has shipped — ${order.item_title}`,   body:`Your order for <strong>${order.item_title}</strong> is on its way! Fonkiart will follow up with any tracking details.` },
      delivered: { sub:`Order delivered — ${order.item_title}`,           body:`Your order for <strong>${order.item_title}</strong> has been marked as delivered. We hope you love it!` },
    };
    const m = msgs[status]; if (!m) return;
    try {
      await sendEmail({
        to: order.client_email,
        subject: m.sub,
        htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:24px;font-weight:300;color:#1c1a18;margin-bottom:6px;">Hi ${name}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">${m.body}</p><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`,
      });
    } catch(e) { console.warn("Status email:", e); }
  };
  const updateStatus = async (id, status) => {
    await supabase.from("Orders").update({status}).eq("id",id);
    const order = orders.find(o => o.id === id);
    setOrders(orders.map(o=>o.id===id?{...o,status}:o));
    if (order) sendStatusEmail(order, status);
  };
  const deleteOrder = async (id) => {
    if (!window.confirm("Delete this order?")) return;
    await supabase.from("Orders").delete().eq("id",id);
    setOrders(orders.filter(o=>o.id!==id));
  };
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(prev => ({...prev,[id]:!prev[id]}));
  const clientName = (email) => clients.find(c => c.email === email)?.name;
  const filtered = orders.filter(o =>
    (statusFilter === "all" || o.status === statusFilter) &&
    (o.client_email?.toLowerCase().includes(search.toLowerCase()) ||
     o.item_title?.toLowerCase().includes(search.toLowerCase()) ||
     clientName(o.client_email)?.toLowerCase().includes(search.toLowerCase()))
  );
  const statusCounts = { all:orders.length, pending:0, confirmed:0, shipped:0, delivered:0 };
  orders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
  return (
    <div className="crm-wrap">
      <div className="crm-header">
        <span className="crm-title">Orders ({orders.length})</span>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-s" onClick={()=>{ setSendingInvoice(i=>!i); setAdding(false); setInvSent(""); }}
            style={{background:sendingInvoice?"#1e3a52":undefined,color:sendingInvoice?"#fff":undefined}}>
            {sendingInvoice?"Cancel":"✉ Send Invoice"}
          </button>
          <button className="btn-p" onClick={()=>{ setAdding(a=>!a); setSendingInvoice(false); }}>{adding?"Cancel":"+ Add Order"}</button>
        </div>
      </div>

      {invSent && <div className="ok-msg" style={{marginBottom:12}}>{invSent}</div>}

      {sendingInvoice && (
        <div className="crm-add-form" style={{maxWidth:"100%",borderTop:"3px solid var(--sidebar-bg)"}}>
          <h3 style={{marginBottom:4}}>Send Invoice to Client</h3>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:20}}>Client receives an email with a link to approve and pay.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32}}>

            {/* LEFT — Client */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
              <div className="fld">
                <label>Select Client</label>
                <select value={inv.clientMode==="new" ? "__new__" : inv.client_email}
                  onChange={e => {
                    if (e.target.value==="__new__") { iv("clientMode","new"); iv("client_email",""); iv("client_name",""); }
                    else {
                      const c = clients.find(c=>c.email===e.target.value);
                      iv("clientMode","select"); iv("client_email",e.target.value); iv("client_name",c?.name||"");
                    }
                  }}>
                  <option value="">— Select a client —</option>
                  {clients.map(c => <option key={c.id} value={c.email}>{c.name} — {c.email}</option>)}
                  <option value="__new__">+ New client</option>
                </select>
              </div>
              {inv.clientMode==="new" && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>First Name *</label><input value={inv.newFirst} onChange={e=>iv("newFirst",e.target.value)} placeholder="Jane" /></div>
                    <div className="fld"><label>Last Name</label><input value={inv.newLast} onChange={e=>iv("newLast",e.target.value)} placeholder="Smith" /></div>
                  </div>
                  <div className="fld"><label>Email *</label><input value={inv.newEmail} onChange={e=>iv("newEmail",e.target.value)} placeholder="jane@email.com" /></div>
                  <div className="fld"><label>Phone</label><input value={inv.newPhone} onChange={e=>iv("newPhone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                </>
              )}
            </div>

            {/* RIGHT — Invoice Details */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Invoice Details</p>
              <div className="fld">
                <label>Artwork / Item *</label>
                <select value="" onChange={e => {
                  const it = catalog.find(i => String(i.id) === e.target.value);
                  if (it) { iv("item_title", it.title); if (it.salePrice || it.price) iv("amount", String(it.salePrice || it.price)); }
                }} style={{marginBottom:6}}>
                  <option value="">— Select from catalog —</option>
                  {catalog.map(it => <option key={it.id} value={it.id}>{it.title}{it.isSold?" (Sold)":""}</option>)}
                </select>
                <input value={inv.item_title} onChange={e=>iv("item_title",e.target.value)} placeholder="Or type a custom item title" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="fld"><label>Amount (USD) *</label><input type="number" value={inv.amount} onChange={e=>iv("amount",e.target.value)} placeholder="350" /></div>
                <div className="fld"><label>Due Date (optional)</label><input type="date" value={inv.due_date} onChange={e=>iv("due_date",e.target.value)} /></div>
              </div>
              <div className="fld"><label>Notes (optional)</label><textarea value={inv.notes} onChange={e=>iv("notes",e.target.value)} placeholder="Any notes visible to the client…" style={{minHeight:60}} /></div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"14px 0 12px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Payment Options (shown after client approves)</p>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* Zelle */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_zelle} onChange={e=>iv("pay_zelle",e.target.checked)} />
                    💚 Zelle
                  </label>
                  {inv.pay_zelle && (
                    <div className="fld" style={{marginTop:6,marginLeft:24}}>
                      <input value={inv.zelle_contact} onChange={e=>iv("zelle_contact",e.target.value)} placeholder="fonkiart@gmail.com" />
                    </div>
                  )}
                </div>
                {/* Venmo */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_venmo} onChange={e=>iv("pay_venmo",e.target.checked)} />
                    🔵 Venmo
                    <span style={{fontSize:11,color:"var(--muted)",fontWeight:400}}>(handle from Settings)</span>
                  </label>
                </div>
                {/* Cash App */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_cashapp} onChange={e=>iv("pay_cashapp",e.target.checked)} />
                    💵 Cash App
                    <span style={{fontSize:11,color:"var(--muted)",fontWeight:400}}>(cashtag from Settings)</span>
                  </label>
                </div>
                {/* Stripe */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_stripe} onChange={e=>iv("pay_stripe",e.target.checked)} />
                    💳 Credit Card (Stripe)
                  </label>
                  {inv.pay_stripe && (
                    <div className="fld" style={{marginTop:6,marginLeft:24}}>
                      <input value={inv.stripe_link} onChange={e=>iv("stripe_link",e.target.value)} placeholder="https://buy.stripe.com/…" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{borderTop:"1px solid var(--border)",marginTop:24,paddingTop:20,display:"flex",gap:12,alignItems:"center"}}>
            <button className="btn-p" onClick={sendInvoice} disabled={invSending}>
              {invSending ? "Sending…" : "Send Invoice →"}
            </button>
            <p style={{fontSize:12,color:"var(--muted)",margin:0}}>A payment link will be emailed to the client automatically.</p>
          </div>
        </div>
      )}

      {adding && (
        <div className="crm-add-form" style={{maxWidth:"100%"}}>
          <h3>New Order</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32,marginTop:8}}>

            {/* LEFT — Client */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
              <div className="fld">
                <label>Select Client</label>
                <select value={clientMode==="manual" ? "__manual__" : form.client_email}
                  onChange={e => {
                    if (e.target.value==="__manual__") { setClientMode("manual"); f("client_email",""); setSelectedClient(null); setClientUpdate({}); }
                    else {
                      const c = clients.find(c=>c.email===e.target.value);
                      setClientMode("select"); f("client_email",e.target.value); setSelectedClient(c||null); setClientUpdate({});
                    }
                  }}>
                  <option value="">— Select a client —</option>
                  {clients.map(c => <option key={c.id} value={c.email}>{c.name} — {c.email}</option>)}
                  <option value="__manual__">+ New client</option>
                </select>
              </div>
              {selectedClient && missingFields.length > 0 && (
                <div style={{background:"#fffbf0",border:"1px solid var(--border)",padding:"14px 16px",marginBottom:8}}>
                  <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>⚠ Some info is missing for this client. Fill in what you know:</p>
                  {missingFields.includes("phone") && <div className="fld"><label>Phone</label><input value={clientUpdate.phone||""} onChange={e=>cu("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>}
                  {missingFields.includes("address") && <div className="fld"><label>Street Address</label><input value={clientUpdate.address||""} onChange={e=>cu("address",e.target.value)} placeholder="123 Main St" /></div>}
                  {(missingFields.includes("city")||missingFields.includes("state")) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {missingFields.includes("city") && <div className="fld"><label>City</label><input value={clientUpdate.city||""} onChange={e=>cu("city",e.target.value)} placeholder="Miami" /></div>}
                      {missingFields.includes("state") && <div className="fld"><label>State</label><input value={clientUpdate.state||""} onChange={e=>cu("state",e.target.value)} placeholder="FL" /></div>}
                    </div>
                  )}
                  {(missingFields.includes("zip")||missingFields.includes("country")) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {missingFields.includes("zip") && <div className="fld"><label>ZIP Code</label><input value={clientUpdate.zip||""} onChange={e=>cu("zip",e.target.value)} placeholder="33101" /></div>}
                      {missingFields.includes("country") && <div className="fld"><label>Country</label><input value={clientUpdate.country||""} onChange={e=>cu("country",e.target.value)} placeholder="USA" /></div>}
                    </div>
                  )}
                </div>
              )}
              {clientMode==="manual" && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>First Name *</label><input value={manual.first} onChange={e=>m("first",e.target.value)} placeholder="Jane" /></div>
                    <div className="fld"><label>Last Name</label><input value={manual.last} onChange={e=>m("last",e.target.value)} placeholder="Smith" /></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>Email *</label><input value={manual.email} onChange={e=>m("email",e.target.value)} placeholder="jane@email.com" /></div>
                    <div className="fld"><label>Phone</label><input value={manual.phone} onChange={e=>m("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                  </div>
                  <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"12px 0 10px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Shipping Address</p>
                  <div className="fld"><label>Street Address</label><input value={manual.address} onChange={e=>m("address",e.target.value)} placeholder="123 Main St" /></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>City</label><input value={manual.city} onChange={e=>m("city",e.target.value)} placeholder="Miami" /></div>
                    <div className="fld"><label>State</label><input value={manual.state} onChange={e=>m("state",e.target.value)} placeholder="FL" /></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div className="fld"><label>ZIP Code</label><input value={manual.zip} onChange={e=>m("zip",e.target.value)} placeholder="33101" /></div>
                    <div className="fld"><label>Country</label><input value={manual.country} onChange={e=>m("country",e.target.value)} placeholder="USA" /></div>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT — Order Details */}
            <div>
              <p style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Order Details</p>
              <div className="fld">
                <label>Artwork / Item *</label>
                <select value="" onChange={e => {
                  const it = catalog.find(i => String(i.id) === e.target.value);
                  if (it) { f("item_title", it.title); if (it.salePrice || it.price) f("amount", String(it.salePrice || it.price)); }
                }} style={{marginBottom:6}}>
                  <option value="">— Select from catalog —</option>
                  {catalog.map(it => <option key={it.id} value={it.id}>{it.title}{it.isSold?" (Sold)":""}</option>)}
                </select>
                <input value={form.item_title} onChange={e=>f("item_title",e.target.value)} placeholder="Or type a custom item title" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="fld"><label>Amount (USD)</label><input type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="350" /></div>
                <div className="fld"><label>Status</label>
                  <select value={form.status} onChange={e=>f("status",e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
              <div className="fld"><label>Notes</label><textarea value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any notes about this order…" style={{minHeight:80}} /></div>
            </div>
          </div>

          <div style={{borderTop:"1px solid var(--border)",marginTop:24,paddingTop:20}}>
            <button className="btn-p" onClick={save}>Save Order</button>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <input className="crm-search" style={{marginBottom:0,flex:1,minWidth:200}} placeholder="Search by name, email or artwork…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {[["all","All"],["pending","Pending"],["confirmed","Confirmed"],["shipped","Shipped"],["delivered","Delivered"]].map(([val,label])=>(
            <button key={val} onClick={()=>setStatusFilter(val)}
              style={{border:`1px solid ${statusFilter===val?"var(--ink)":"var(--border)"}`,background:statusFilter===val?"var(--ink)":"none",color:statusFilter===val?"#fff":"var(--muted)",padding:"5px 12px",fontSize:11,letterSpacing:".08em",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              {label}{statusFilter!==val&&statusCounts[val]!==undefined?` (${statusCounts[val]})`:statusFilter===val?` (${statusCounts[val]})`:""}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No orders match this filter.</p>
        : <table className="crm-table">
            <thead><tr><th>Ref</th><th>Client</th><th>Artwork</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map(o=>(
              <Fragment key={o.id}>
                <tr>
                  <td style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>
                    <div>{o.invoice_token ? fmtInvNum(o.id) : `#${String(o.id).slice(0,8).toUpperCase()}`}</div>
                    {o.invoice_token && (
                      <div style={{fontSize:10,letterSpacing:".08em",marginTop:3,color:o.invoice_approved?"#2d6a4f":"#c9a96e",background:o.invoice_approved?"#e8f5ee":"#fff8ec",border:`1px solid ${o.invoice_approved?"#a3d4b3":"#e8d5a0"}`,padding:"1px 5px",display:"inline-block"}}>
                        {o.invoice_approved ? "✓ APPROVED" : "INVOICE SENT"}
                      </div>
                    )}
                  </td>
                  <td>
                    {(o.client_name || clientName(o.client_email)) && <div style={{fontWeight:500,fontSize:13}}>{o.client_name || clientName(o.client_email)}</div>}
                    <div style={{fontSize:11,color:"var(--muted)"}}>{o.client_email}</div>
                  </td>
                  <td>{o.item_title}</td>
                  <td>{o.amount?`$${Number(o.amount).toLocaleString()}`:"—"}</td>
                  <td>
                    <select value={o.status||"pending"} onChange={e=>updateStatus(o.id,e.target.value)}
                      style={{border:"1px solid var(--border)",padding:"4px 8px",fontSize:12,background:"#fff",cursor:"pointer"}}>
                      <option value="pending">Pending</option><option value="confirmed">Confirmed</option>
                      <option value="shipped">Shipped</option><option value="delivered">Delivered</option>
                    </select>
                  </td>
                  <td>{o.created_at?new Date(o.created_at).toLocaleDateString():"—"}</td>
                  <td>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {o.notes && <button onClick={()=>toggleExpand(o.id)} style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>{expanded[o.id]?"▲":"▼"}</button>}
                      {o.invoice_token && (<>
                        <button onClick={()=>{ const link=`${window.location.origin}/?invoice=${o.invoice_token}`; navigator.clipboard.writeText(link).then(()=>alert("Invoice link copied!")); }}
                          style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>
                          🔗 Link
                        </button>
                        <button onClick={()=>resendInvoice(o)} disabled={resending[o.id]}
                          style={{background:"none",border:"1px solid var(--border)",cursor:resending[o.id]?"not-allowed":"pointer",fontSize:11,padding:"3px 8px",color:"var(--muted)",fontFamily:"'DM Sans',sans-serif",opacity:resending[o.id]?0.5:1}}>
                          {resending[o.id] ? "…" : "✉ Resend"}
                        </button>
                      </>)}
                      <button className="btn-d" onClick={()=>deleteOrder(o.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[o.id] && o.notes && (
                  <tr>
                    <td colSpan={7} style={{background:"#fffbf5",padding:"10px 14px 14px",borderTop:"none"}}>
                      <p style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:6}}>Order Details</p>
                      <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.7}}>{o.notes}</p>
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

