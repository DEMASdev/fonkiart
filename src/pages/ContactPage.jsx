import { useState } from "react";
import { Mail, Heart } from "lucide-react";
import { supabase, BREVO_SENDER } from "../lib/supabase";
import { sendEmail } from "../utils/helpers";

export default function ContactPage({ data }) {
  const [form, setForm] = useState({ name:"", email:"", message:"" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErr, setFormErr] = useState("");
  const f = (k,v) => { setForm(fm => ({ ...fm, [k]:v })); setFormErr(""); };

  const handleSend = async () => {
    if (!form.name || !form.email || !form.message) { setFormErr("Please fill in all fields."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormErr("Please enter a valid email address."); return; }
    setLoading(true);
    try { if (supabase) await supabase.from("Requests").insert([{ name:form.name, email:form.email, message:form.message, status:"new" }]); } catch(e) { console.warn("Supabase:", e); }
    await Promise.allSettled([
      sendEmail({
        to: BREVO_SENDER,
        subject: "Contact Form Request",
        htmlContent: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;"><h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:20px;">New Contact Form Request</h2><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Name:</strong> ${form.name}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Email:</strong> ${form.email}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:16px;"><strong>Message:</strong></p><div style="background:#fff;border-left:3px solid #c9a96e;padding:14px 18px;font-size:14px;color:#1c1a18;line-height:1.7;">${form.message}</div><p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.com</p></div>`,
        replyTo: form.email,
      }),
      sendEmail({
        to: form.email,
        subject: "We received your message — Fonkiart",
        htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:26px;font-weight:300;color:#1c1a18;margin-bottom:8px;">Thank you, ${form.name.split(" ")[0]}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">We received your message and will get back to you within 24–48 hours.</p><div style="background:#fff;border:1px solid #ece7dd;padding:16px 20px;margin-bottom:24px;border-left:3px solid #c9a96e;"><p style="font-size:13px;color:#8a8078;margin-bottom:8px;font-style:italic;">Your message:</p><p style="font-size:14px;color:#1c1a18;line-height:1.7;">${form.message}</p></div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Reply to this email or reach us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`,
      }),
    ]);
    setLoading(false);
    setSent(true);
  };

  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Get In Touch</p>
        <h1 className="page-hero-title">Contact Us</h1>
      </div>
      <div className="contact-grid">
        <div className="contact-info">
          <h2>We'd love to hear from you</h2>
          <p>Whether you're interested in purchasing a piece, placing a special order, or just want to say hello — Fonkiart is always happy to connect.</p>
          <div className="contact-detail"><Mail size={16} />{data.settings.zelleContact}</div>
          <div className="contact-detail"><Heart size={16} />Open to commissions & collaborations</div>
        </div>
        <div className="contact-form-box">
          <h3>Send a Message</h3>
          {sent
            ? <div className="ok-msg" style={{ fontSize:15 }}>✓ Message sent! We'll be in touch soon.</div>
            : <>
                <div className="fld"><label>Name</label><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Your name" /></div>
                <div className="fld"><label>Email</label><input value={form.email} onChange={e=>f("email",e.target.value)} placeholder="your@email.com" /></div>
                <div className="fld"><label>Message</label><textarea value={form.message} onChange={e=>f("message",e.target.value)} placeholder="Tell us what you have in mind…" style={{ minHeight:120 }} /></div>
                {formErr && <div className="warn-msg" style={{marginBottom:12}}>{formErr}</div>}
                <button className="btn-p" style={{ width:"100%" }} onClick={handleSend} disabled={loading}>{loading ? "Sending…" : "Send Message"}</button>
              </>
          }
        </div>
      </div>
    </div>
  );
}
