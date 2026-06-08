import { useState } from "react";
import { supabase, BREVO_SENDER } from "../lib/supabase";
import { sendEmail } from "../utils/helpers";

export default function PriceInquiryModal({ item, onClose }) {
  const blank = { name:"", email:"", phone:"", message:"" };
  const [form, setForm] = useState(blank);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const f = (k,v) => setForm(fm=>({...fm,[k]:v}));
  const canSend = form.name.trim() && form.email.includes("@");

  const send = async () => {
    setSending(true);
    const details = [
      item.category && `Category: ${item.category}`,
      item.medium && `Medium: ${item.medium}`,
      item.dimensions && `Dimensions: ${item.dimensions}`,
    ].filter(Boolean).join("<br/>");
    try {
      await Promise.allSettled([
        supabase?.from("Requests").insert([{
          name: form.name, email: form.email,
          message: `Price inquiry for "${item.title}"${form.message ? ` — ${form.message}` : ""}. Phone: ${form.phone || "not provided"}.`,
          status: "new"
        }]),
        sendEmail({
          to: BREVO_SENDER,
          subject: `Enquiry about ${item.title}`,
          htmlContent: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;"><h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:4px;">Price Inquiry</h2><p style="font-family:monospace;font-size:13px;color:#c9a96e;margin-bottom:24px;">A customer is asking for pricing on one of your artworks.</p><div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:20px;"><p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Artwork</p><p style="font-size:20px;font-weight:500;color:#1c1a18;margin-bottom:8px;">${item.title}</p>${details ? `<p style="font-size:13px;color:#7a6f63;line-height:1.8;">${details}</p>` : ""}${item.description ? `<p style="font-size:13px;color:#7a6f63;margin-top:8px;font-style:italic;">"${item.description}"</p>` : ""}</div><div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:20px;"><p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Customer</p><p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Name:</strong> ${form.name}</p><p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Email:</strong> <a href="mailto:${form.email}" style="color:#c9a96e;">${form.email}</a></p>${form.phone ? `<p style="font-size:14px;color:#1c1a18;margin-bottom:6px;"><strong>Phone:</strong> ${form.phone}</p>` : ""}${form.message ? `<p style="font-size:14px;color:#1c1a18;margin-top:10px;"><strong>Message:</strong> ${form.message}</p>` : ""}</div><p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.com</p></div>`,
        }),
        sendEmail({
          to: form.email,
          subject: `Your inquiry — ${item.title} · Fonkiart`,
          htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:24px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Thank you, ${form.name.split(" ")[0]}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">We received your inquiry about <strong>${item.title}</strong> and will get back to you shortly with pricing and availability.</p><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Contact us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`,
        }),
      ]);
    } catch(e) { console.warn("Inquiry email:", e); }
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
