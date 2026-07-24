import { useState, useEffect } from "react";
import { supabase, BREVO_SENDER } from "../lib/supabase";
import { sendEmail, formatOrderRef } from "../utils/helpers";

export default function CheckoutModal({ items, settings, onClose, onSuccess, fullPage }) {
  const venmoHandle   = settings.venmoHandle   || "@fonkiart";
  const cashAppHandle = settings.cashAppHandle || "$fonkiart";
  const [method, setMethod] = useState(null);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { firstName:"", lastName:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"" };
  const [customer, setCustomer] = useState(blank);
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState(null);
  const [couponData, setCouponData] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderRef, setOrderRef] = useState("");

  // Predict the next sequential order number (Orders.id is auto-incrementing).
  useEffect(() => {
    if (!supabase) return;
    supabase.from("Orders").select("id").order("id", { ascending:false }).limit(1).then(({ data }) => {
      const maxId = data && data.length ? data[0].id : 9;
      setOrderRef(formatOrderRef(maxId + 1));
    });
  }, []);

  const cv = (k,v) => setCustomer(fm=>({...fm,[k]:v}));
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  const discount = settings.couponDiscount ?? 15;
  const itemPrice = (i) => Number(i.salePrice || i.price || 0);
  const itemEffective = (i) => couponStatus === "valid" ? Math.round(itemPrice(i) * (1 - discount / 100)) : itemPrice(i);
  const basePrice = items.reduce((sum,i) => sum + itemPrice(i), 0);
  const effectivePrice = couponStatus === "valid" ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
  const itemsLabel = items.length === 1 ? items[0].title : `${items.length} items`;
  const canNext = method && fullName && customer.email.includes("@");

  const handleContinue = () => {
    if (!method) { setCheckoutError("Please select a payment method."); return; }
    if (!fullName) { setCheckoutError("Please enter your first and last name."); return; }
    if (!customer.email.includes("@")) { setCheckoutError("Please enter a valid email address."); return; }
    setCheckoutError("");
    setStep(2);
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code || !supabase) return;
    if (!customer.email || !customer.email.includes("@")) { setCouponStatus("need-email"); return; }
    setCouponStatus("checking");
    const { data, error } = await supabase.from("Leads").select("*").eq("coupon_code", code).single();
    if (error || !data) { setCouponStatus("invalid"); return; }
    if (data.coupon_used) { setCouponStatus("used"); return; }
    if (data.email.toLowerCase() !== customer.email.trim().toLowerCase()) { setCouponStatus("wrong-email"); return; }
    setCouponData(data); setCouponStatus("valid");
  };

  const saveOrder = async () => {
    if (!supabase) return;
    const addr = [customer.address, customer.city, customer.state, customer.zip, customer.country].filter(Boolean).join(", ");
    const discountNote = couponStatus === "valid" ? ` · ${discount}% coupon applied` : "";
    const notes = [`Order Ref: ${orderRef}`, fullName, customer.phone, addr].filter(Boolean).join(" · ") + discountNote;
    const sendMail = async (to, subject, html) => { try { await sendEmail({ to, subject, htmlContent: html }); } catch(e) { console.warn("Email:", e); } };
    const priceStr = effectivePrice ? `$${Number(effectivePrice).toLocaleString()}` : "";
    const ref = orderRef;
    const { data: existingClient } = await supabase.from("Clients").select("id").eq("email", customer.email).maybeSingle();
    const rows = items.map(i => ({ client_email:customer.email, item_title:i.title, amount:itemEffective(i), status:"pending", notes }));
    await supabase.from("Orders").insert(rows).select("id");
    const itemsRowsHtml = items.map(i => `<p style="font-size:16px;font-weight:500;color:#1c1a18;margin-bottom:4px;">${i.title}${itemEffective(i) ? ` — $${Number(itemEffective(i)).toLocaleString()}` : ""}</p>`).join("");
    const itemsRowsHtmlPlain = items.map(i => `<p style="font-size:14px;color:#7a6f63;margin-bottom:4px;">${i.title}${itemEffective(i) ? ` — $${Number(itemEffective(i)).toLocaleString()}` : ""}</p>`).join("");
    await Promise.allSettled([
      existingClient ? Promise.resolve() : supabase.from("Clients").insert([{ name:fullName, email:customer.email, phone:customer.phone||null, address:customer.address||null, city:customer.city||null, state:customer.state||null, zip:customer.zip||null, country:customer.country||null }]),
      couponStatus === "valid" && couponData ? supabase.from("Leads").update({ coupon_used:true }).eq("id", couponData.id) : Promise.resolve(),
      sendMail(customer.email, `Order Received — ${itemsLabel} · Fonkiart`,
        `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;"><h1 style="font-size:26px;font-weight:300;color:#1c1a18;margin-bottom:6px;">Thank you, ${customer.firstName}!</h1><p style="color:#7a6f63;font-size:15px;line-height:1.7;margin-bottom:24px;">Your order has been received. Fonkiart will confirm and reach out about shipping within 24–48 hours.</p><div style="background:#fff;border:1px solid #ece7dd;padding:20px 24px;margin-bottom:24px;"><p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;margin-bottom:12px;">Order Summary</p>${ref?`<p style="font-size:11px;color:#8a8078;margin-bottom:8px;">Reference: <strong style="font-family:monospace;letter-spacing:.05em;">${ref}</strong></p>`:""}${itemsRowsHtml}${effectivePrice?`<p style="font-size:22px;color:#c9a96e;font-family:Georgia,serif;margin-top:8px;">Total: ${priceStr}${couponStatus==="valid"?` &nbsp;<span style="font-size:12px;color:#2d6a4f;">✓ ${discount}% coupon applied</span>`:""}</p>`:""} ${addr?`<p style="font-size:13px;color:#7a6f63;margin-top:10px;"><strong>Ship to:</strong> ${addr}</p>`:""}</div><p style="color:#7a6f63;font-size:13px;line-height:1.7;">Questions? Reply to this email and quote your reference number. You can also reach us at <a href="mailto:${BREVO_SENDER}" style="color:#c9a96e;">${BREVO_SENDER}</a>.</p><p style="color:#7a6f63;font-size:13px;margin-top:16px;">— Fonkiart</p></div>`
      ),
      sendMail(BREVO_SENDER, `🎨 New Order ${ref}: ${itemsLabel} — ${fullName}`,
        `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;background:#fdfcf8;"><h2 style="font-size:22px;font-weight:300;color:#1c1a18;margin-bottom:4px;">New Order Received</h2>${ref?`<p style="font-family:monospace;font-size:14px;color:#c9a96e;margin-bottom:20px;">${ref}</p>`:""}${itemsRowsHtmlPlain}${effectivePrice?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;margin-top:6px;"><strong>Total:</strong> ${priceStr}${couponStatus==="valid"?` (${discount}% coupon applied)`:""}</p>`:""}<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Customer:</strong> ${fullName}</p><p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Email:</strong> <a href="mailto:${customer.email}" style="color:#c9a96e;">${customer.email}</a></p>${customer.phone?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Phone:</strong> ${customer.phone}</p>`:""} ${addr?`<p style="font-size:14px;color:#7a6f63;margin-bottom:6px;"><strong>Ship to:</strong> ${addr}</p>`:""}<p style="font-size:12px;color:#aaa;margin-top:24px;">Sent from fonkiart.com</p></div>`
      ),
    ]);
  };

  // markSold intentionally removed — Andy marks sold manually in Admin after verifying payment received
  const finish = () => { setDone(true); onSuccess?.(); };
  const handleConfirmZelle   = async () => { setSaving(true); await saveOrder(); setSaving(false); finish(); };
  const handleConfirmVenmo   = async () => { setSaving(true); await saveOrder(); setSaving(false); finish(); };
  const handleConfirmCashApp = async () => { setSaving(true); await saveOrder(); setSaving(false); finish(); };
  const handleCard = async () => {
    setSaving(true); await saveOrder(); setSaving(false);
    const link = (items.length === 1 && items[0].stripeLink) || settings.stripeLink;
    if (link) { window.open(link, "_blank"); finish(); }
    else alert("Card payment is being set up. Please use Zelle or contact Fonkiart directly.");
  };

  if (done) return (
    <div className={fullPage ? "checkout-page-bg" : "modal-bg"} onClick={fullPage ? undefined : onClose}>
      <div className={`checkout${fullPage ? " checkout-fullpage" : ""}`} style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:50, marginBottom:14 }}>🎨</div>
        <h2 style={{ marginBottom:10 }}>Thank you!</h2>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, marginBottom:16 }}>
          Your order for <strong>{itemsLabel}</strong> has been received.<br />
          Fonkiart will confirm and reach out about shipping.
        </p>
        {orderRef && (
          <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 20px", marginBottom:24, display:"inline-block" }}>
            <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Reference</div>
            <div style={{ fontFamily:"monospace", fontSize:20, letterSpacing:".08em", color:"var(--ink)", fontWeight:600 }}>{orderRef}</div>
            <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Also in your confirmation email</div>
          </div>
        )}
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className={fullPage ? "checkout-page-bg" : "modal-bg"} onClick={fullPage ? undefined : onClose}>
      <div className={`checkout${fullPage ? " checkout-fullpage" : ""}`} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Purchase</h2>
        <div className="checkout-items" style={{ marginBottom:24 }}>
          {items.map(i => (
            <div key={i.id} className="checkout-item-row">
              {i.image && <img src={i.image} alt={i.title} className="checkout-item-thumb" />}
              <p className="checkout-sub" style={{ margin:0 }}>
                {i.title}{itemEffective(i) ? ` · $${Number(itemEffective(i)).toLocaleString()}` : ""}
                {couponStatus === "valid" && itemPrice(i) !== itemEffective(i) ? <span style={{fontSize:11,color:"#2d6a4f",marginLeft:8}}>✓ {discount}% off</span> : null}
              </p>
            </div>
          ))}
          {items.length > 1 && (
            <p className="checkout-sub" style={{ marginTop:6, fontWeight:600 }}>
              Total{effectivePrice ? ` · $${Number(effectivePrice).toLocaleString()}` : ""}
              {couponStatus === "valid" && basePrice !== effectivePrice ? <span style={{fontSize:11,color:"#2d6a4f",marginLeft:8}}>✓ {discount}% off</span> : null}
            </p>
          )}
        </div>

        {step === 1 && (
          <>
            <div className="pay-opts">
              {[["zelle","💚","Zelle","Instant · Free"],["venmo","🔵","Venmo","Instant · Free"],["cashapp","💵","Cash App","Instant · Free"],["card","💳","Credit Card","Stripe · Secure"]].map(([id,icon,label,sub]) => (
                <button key={id} className={`pay-opt${method===id?" sel":""}`} onClick={() => setMethod(id)}>
                  <span className="pay-opt-icon">{icon}</span>
                  <div className="pay-opt-label">{label}</div>
                  <div className="pay-opt-sub">{sub}</div>
                </button>
              ))}
            </div>
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:18, marginBottom:4 }}>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:14 }}>Your Information</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>First Name *</label><input value={customer.firstName} onChange={e=>cv("firstName",e.target.value)} placeholder="Jane" /></div>
                <div className="fld"><label>Last Name *</label><input value={customer.lastName} onChange={e=>cv("lastName",e.target.value)} placeholder="Smith" /></div>
              </div>
              <div className="fld"><label>Email *</label><input value={customer.email} onChange={e=>cv("email",e.target.value)} placeholder="jane@email.com" /></div>
              <div className="fld"><label>Phone</label><input value={customer.phone} onChange={e=>cv("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"12px 0 10px" }}>Shipping Address</p>
              <div className="fld"><label>Street</label><input value={customer.address} onChange={e=>cv("address",e.target.value)} placeholder="123 Main St" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>City</label><input value={customer.city} onChange={e=>cv("city",e.target.value)} placeholder="Miami" /></div>
                <div className="fld"><label>State</label><input value={customer.state} onChange={e=>cv("state",e.target.value)} placeholder="FL" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>ZIP</label><input value={customer.zip} onChange={e=>cv("zip",e.target.value)} placeholder="33101" /></div>
                <div className="fld"><label>Country</label><input value={customer.country} onChange={e=>cv("country",e.target.value)} placeholder="USA" /></div>
              </div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"14px 0 10px" }}>Coupon Code <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></p>
              <div style={{ display:"flex", gap:8 }}>
                <input value={couponCode} onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); if(couponStatus!=="valid"){setCouponStatus(null);setCouponData(null);} }}
                  placeholder="FK-XXXX-XXXX" disabled={couponStatus==="valid"}
                  style={{ flex:1, border:`1px solid ${couponStatus==="valid"?"#2d6a4f":couponStatus&&couponStatus!=="checking"?"#c0392b":"var(--border)"}`, padding:"9px 13px", fontFamily:"'DM Sans',sans-serif", fontSize:13, letterSpacing:".06em", outline:"none", background:couponStatus==="valid"?"#f0faf5":"#fff" }}
                />
                {couponStatus !== "valid"
                  ? <button className="btn-s" onClick={applyCoupon} disabled={couponStatus==="checking"||!couponCode.trim()} style={{whiteSpace:"nowrap"}}>{couponStatus==="checking"?"Checking…":"Apply"}</button>
                  : <button className="btn-s" onClick={()=>{setCouponStatus(null);setCouponData(null);setCouponCode("");}} style={{whiteSpace:"nowrap",color:"var(--muted)"}}>Remove</button>
                }
              </div>
              {couponStatus==="valid"       && <p style={{fontSize:12,color:"#2d6a4f",marginTop:6}}>✓ {discount}% discount applied — you save ${(basePrice-effectivePrice).toLocaleString()}</p>}
              {couponStatus==="invalid"     && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>Code not found. Check the spelling and try again.</p>}
              {couponStatus==="used"        && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>This coupon has already been used.</p>}
              {couponStatus==="need-email"  && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>Enter your email address first, then apply the coupon.</p>}
              {couponStatus==="wrong-email" && <p style={{fontSize:12,color:"#c0392b",marginTop:6}}>This coupon is not linked to this email address.</p>}
            </div>
            <button className="confirm-btn" style={{ background:canNext?"var(--gold)":"var(--border)", marginTop:12 }} onClick={handleContinue}>Continue →</button>
            {checkoutError && <p style={{ fontSize:12, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <button onClick={() => setStep(1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:16, padding:0 }}>← Back</button>
            {method === "zelle" && (
              <div className="pay-detail">
                <h4>Send via Zelle</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div style={{ fontSize:13, color:"var(--muted)", marginBottom:5 }}>Send to this {settings.zelleLabel}:</div>
                <div className="zelle-contact">{settings.zelleContact}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{orderRef}</div>
                </div>
                <div className="zelle-steps">1. Open your bank app → Zelle<br />2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong> to <strong>{settings.zelleContact}</strong><br />3. Memo: copy <strong>{orderRef}</strong> and paste it into your Zelle transaction memo/note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "venmo" && (
              <div className="pay-detail">
                <h4>Send via Venmo</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-contact">{venmoHandle}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{orderRef}</div>
                </div>
                <div className="zelle-steps">1. Open Venmo → Search <strong>{venmoHandle}</strong><br />2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong><br />3. Note: copy <strong>{orderRef}</strong> and paste it into the Venmo note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "cashapp" && (
              <div className="pay-detail">
                <h4>Send via Cash App</h4>
                <div className="zelle-amount">${Number(effectivePrice||0).toLocaleString()}</div>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-contact">{cashAppHandle}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{orderRef}</div>
                </div>
                <div className="zelle-steps">1. Open Cash App → Search <strong>{cashAppHandle}</strong><br />2. Send <strong>${Number(effectivePrice||0).toLocaleString()}</strong><br />3. Note: copy <strong>{orderRef}</strong> and paste it into the Cash App note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "card" && (
              <div className="pay-detail">
                <h4>Secure Credit Card via Stripe</h4>
                {couponStatus==="valid" && <p style={{fontSize:12,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7 }}>You'll be redirected to our secure Stripe checkout to complete your purchase of <strong>{itemsLabel}</strong>{effectivePrice ? ` for $${Number(effectivePrice).toLocaleString()}` : ""}.</p>
              </div>
            )}
            {method==="zelle"   && <button className="confirm-btn" onClick={handleConfirmZelle}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="venmo"   && <button className="confirm-btn" onClick={handleConfirmVenmo}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="cashapp" && <button className="confirm-btn" onClick={handleConfirmCashApp} disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="card"    && <button className="stripe-btn"  onClick={handleCard}           disabled={saving}>{saving?"Saving…":"Pay Securely with Card →"}</button>}
          </>
        )}
      </div>
    </div>
  );
}
