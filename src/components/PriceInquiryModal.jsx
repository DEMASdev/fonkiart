import { useState } from "react";
import { storeCall } from "../lib/store";

export default function PriceInquiryModal({ item, onClose }) {
  const blank = { name:"", email:"", phone:"", message:"" };
  const [form, setForm] = useState(blank);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const canSend = form.name.trim() && form.email.includes("@");

  const send = async () => {
    setSending(true);
    try {
      await storeCall("request", { kind: "inquiry", artworkId: item.id, name: form.name, email: form.email, phone: form.phone, message: form.message });
    } catch(e) { console.warn("Inquiry:", e); }
    setSending(false);
    setDone(true);
  };

  if (done) return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:48, marginBottom:14 }}>✉️</div>
        <h2 style={{ marginBottom:10 }}>Inquiry Sent!</h2>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, marginBottom:24 }}>
          Thank you for your interest in <strong>{item.title}</strong>.<br />
          Aliana will reply to <strong>{form.email}</strong> shortly with pricing and availability.
        </p>
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="checkout" onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Request Pricing</h2>
        <p className="checkout-sub">{item.title}{item.category ? ` · ${item.category}` : ""}</p>
        <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7, marginBottom:20 }}>
          This piece is available by request. Fill in your details and Aliana will get back to you with pricing and availability.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
          <div className="fld"><label>Name *</label><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Jane Smith" /></div>
          <div className="fld"><label>Email *</label><input value={form.email} onChange={e=>f("email",e.target.value)} placeholder="jane@email.com" /></div>
        </div>
        <div className="fld"><label>Phone <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></label><input value={form.phone} onChange={e=>f("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
        <div className="fld"><label>Message <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></label><textarea value={form.message} onChange={e=>f("message",e.target.value)} placeholder="I'm interested in this piece for my living room…" style={{ minHeight:70, resize:"vertical" }} /></div>
        <button className="btn-p" style={{ width:"100%", marginTop:8, opacity:canSend?1:.5, cursor:canSend?"pointer":"default" }} onClick={canSend&&!sending?send:undefined} disabled={!canSend||sending}>
          {sending ? "Sending…" : "Send Inquiry"}
        </button>
      </div>
    </div>
  );
}
