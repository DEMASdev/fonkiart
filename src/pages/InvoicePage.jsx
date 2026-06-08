import { useState, useEffect } from "react";
import { supabase, BREVO_SENDER } from "../lib/supabase";
import { sendEmail } from "../utils/helpers";

export default function InvoicePage({ token }) {
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) { setLoading(false); setNotFound(true); return; }
      try {
        const [orderRes, settingsRes] = await Promise.all([
          supabase.from("Orders").select("*").eq("invoice_token", token).single(),
          supabase.from("Settings").select("*").eq("id", 1).single(),
        ]);
        if (orderRes.error || !orderRes.data) { setNotFound(true); }
        else { setOrder(orderRes.data); setApproved(!!orderRes.data.invoice_approved); }
        if (!settingsRes.error && settingsRes.data) setSettings(settingsRes.data);
      } catch(e) { setNotFound(true); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  const handleApprove = async () => {
    if (!supabase || !order) return;
    setApproving(true);
    try {
      await supabase.from("Orders").update({ invoice_approved: true, status: "confirmed" }).eq("id", order.id);
      await sendEmail({
        to: BREVO_SENDER,
        subject: `Invoice approved — ${order.item_title}`,
        htmlContent: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:16px;">Invoice Approved</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;"><strong>${order.client_name || order.client_email}</strong> approved the invoice for <strong>${order.item_title}</strong> — $${Number(order.amount).toLocaleString()}.</p></div>`,
      });
      setApproved(true);
    } catch(e) { console.warn("Approve error:", e); }
    finally { setApproving(false); }
  };

  const shell = (content) => <div className="invoice-page">{content}</div>;

  if (loading) return shell(<p style={{color:"var(--muted)",fontFamily:"'Cormorant Garamond',serif",fontSize:20}}>Loading…</p>);

  if (notFound) return shell(
    <div className="invoice-card" style={{textAlign:"center"}}>
      <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
      <p style={{marginTop:24,color:"var(--muted)",fontSize:15}}>This invoice link is invalid or has expired.</p>
    </div>
  );

  const methods     = order.payment_methods ? order.payment_methods.split(",") : null;
  const allowed     = (m) => !methods || methods.includes(m);
  const payZelle    = allowed("zelle")   ? order.zelle_contact          : null;
  const payVenmo    = allowed("venmo")   ? settings.venmoHandle          : null;
  const payCashApp  = allowed("cashapp") ? settings.cashAppHandle        : null;
  const payStripe   = allowed("stripe")  ? order.stripe_link             : null;
  const hasAnyPayment = payZelle || payStripe || payVenmo || payCashApp;
  const firstName = order.client_name ? order.client_name.split(" ")[0] : "there";
  const invNum  = `INV-${String(order.id).replace(/-/g,"").slice(0,6).toUpperCase()}`;
  const invDate = order.created_at ? new Date(order.created_at).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : "";
  const dueDate = order.due_date ? new Date(order.due_date + "T00:00:00").toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : null;

  return shell(
    <div className="invoice-card">
      <div className="invoice-header">
        <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        <div className="invoice-tagline">Original Art &amp; Fine Art Prints</div>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--border)"}}>
        <div>
          <div style={{fontSize:11,letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:3}}>Invoice</div>
          <div style={{fontFamily:"monospace",fontSize:16,fontWeight:600,color:"var(--ink)",letterSpacing:".06em"}}>{invNum}</div>
        </div>
        <div style={{textAlign:"right"}}>
          {invDate && <div style={{fontSize:12,color:"var(--muted)"}}>Date: {invDate}</div>}
          <div style={{fontSize:12,color:dueDate?"var(--ink)":"var(--muted)",marginTop:2,fontWeight:dueDate?500:400}}>
            {dueDate ? `Due: ${dueDate}` : "Payment due upon receipt"}
          </div>
        </div>
      </div>

      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.7,marginBottom:24}}>Hi {firstName}, here is your invoice from Fonkiart. Please review the details and click <em>Approve &amp; Pay</em> when you're ready.</p>

      {order.client_name && (
        <div className="invoice-row">
          <span className="invoice-label">Client</span>
          <span className="invoice-value">{order.client_name}</span>
        </div>
      )}
      <div className="invoice-row">
        <span className="invoice-label">Artwork / Item</span>
        <span className="invoice-value">{order.item_title}</span>
      </div>
      {order.notes && (
        <div className="invoice-row" style={{alignItems:"flex-start"}}>
          <span className="invoice-label">Notes</span>
          <span className="invoice-value" style={{fontSize:13,maxWidth:"60%",textAlign:"right",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{order.notes}</span>
        </div>
      )}
      <div className="invoice-total">
        <span className="invoice-label">Total Due</span>
        <span className="invoice-value">${Number(order.amount).toLocaleString()}</span>
      </div>

      {approved ? (
        <div className="invoice-approved-banner">
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:"#2d6a4f",marginBottom:8}}>Order Approved ✓</p>
          <p style={{fontSize:13,color:"#4a8c6a",lineHeight:1.7,marginBottom:hasAnyPayment?20:0}}>
            Thank you! Fonkiart has been notified and will follow up shortly.
          </p>
          {hasAnyPayment && (
            <div style={{borderTop:"1px solid #a3d4b3",paddingTop:20}}>
              <p style={{fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"#4a8c6a",marginBottom:14}}>Send Payment To</p>

              {/* Zelle */}
              {payZelle && (
                <div className="invoice-pay-option" style={{background:"#e8f5ee",border:"1px solid #a3d4b3",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:16}}>💚</span>
                    <div className="invoice-pay-title">Zelle</div>
                  </div>
                  <div className="invoice-pay-value">{payZelle}</div>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" in the memo.</p>
                </div>
              )}

              {/* Venmo */}
              {payVenmo && (
                <div className="invoice-pay-option" style={{background:"#eef4ff",border:"1px solid #b3c9f0",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:16}}>🔵</span>
                    <div className="invoice-pay-title">Venmo</div>
                  </div>
                  <div className="invoice-pay-value">{payVenmo}</div>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" in the note.</p>
                </div>
              )}

              {/* Cash App */}
              {payCashApp && (
                <div className="invoice-pay-option" style={{background:"#f0faf0",border:"1px solid #a3d4a3",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:16}}>💵</span>
                    <div className="invoice-pay-title">Cash App</div>
                  </div>
                  <div className="invoice-pay-value">{payCashApp}</div>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" in the note.</p>
                </div>
              )}

              {/* Stripe / Card */}
              {payStripe && (
                <div style={{textAlign:"center",marginTop:4}}>
                  <a href={payStripe} target="_blank" rel="noreferrer"
                    style={{display:"inline-block",background:"#635bff",color:"#fff",padding:"13px 32px",fontSize:13,letterSpacing:".08em",textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>
                    💳 Pay by Card (Stripe) →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="invoice-pay-section">
          <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:20,textAlign:"center"}}>Click below to confirm your order. Payment details will appear after you approve.</p>
          <button onClick={handleApprove} disabled={approving}
            style={{width:"100%",background:"var(--sidebar-bg)",color:"#fff",border:"none",padding:"16px 32px",fontSize:13,letterSpacing:".1em",textTransform:"uppercase",cursor:approving?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:approving?0.7:1,transition:"opacity .2s"}}>
            {approving ? "Processing…" : "Approve & Pay →"}
          </button>
        </div>
      )}

      <p style={{fontSize:11,color:"var(--muted)",textAlign:"center",marginTop:32,lineHeight:1.7}}>
        Questions? Contact us at <a href={`mailto:${BREVO_SENDER}`} style={{color:"var(--gold)"}}>{BREVO_SENDER}</a>
      </p>
    </div>
  );
}
