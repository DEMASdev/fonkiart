import { useState } from "react";
import { Mail, Heart } from "lucide-react";
import { storeCall } from "../lib/store";

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
    try { await storeCall("request", { kind: "contact", name: form.name, email: form.email, message: form.message }); }
    catch (e) { console.warn("Contact:", e); }
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
