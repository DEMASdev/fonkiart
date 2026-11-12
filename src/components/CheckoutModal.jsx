import { useState, useEffect } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { storeCall } from "../lib/store";
import Pic from "./Pic";

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
  const [checkoutError, setCheckoutError] = useState("");
  const [orderRef, setOrderRef] = useState("");

  // Predict the next sequential order number (Orders.id is auto-incrementing).
  useEffect(() => {
    storeCall("next-ref").then(r => setOrderRef(r.ref)).catch(e => console.warn("Order ref:", e));
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
    if (!code) return;
    if (!customer.email || !customer.email.includes("@")) { setCouponStatus("need-email"); return; }
    setCouponStatus("checking");
    try {
      const { status } = await storeCall("coupon", { code, email: customer.email });
      setCouponStatus(status);
    } catch { setCouponStatus("invalid"); }
  };

  // The server saves the order, marks the coupon used and sends both emails.
  // Returns false (with a message the buyer can act on) if it could not be reached.
  const saveOrder = async () => {
    try {
      await storeCall("order", {
        customer,
        orderRef,
        total: effectivePrice,
        couponCode: couponStatus === "valid" ? couponCode.trim().toUpperCase() : "",
        items: items.map(i => ({ title: i.title, amount: itemEffective(i) })),
      });
      return true;
    } catch (e) {
      console.warn("Order:", e);
      setCheckoutError(`We couldn't save your order. Please email ${BREVO_SENDER || "us"} with your order number ${orderRef}.`);
      return false;
    }
  };

  // markSold intentionally removed — Andy marks sold manually in Admin after verifying payment received
  const finish = () => { setDone(true); onSuccess?.(); };
  const confirmPaid = async () => { setSaving(true); const ok = await saveOrder(); setSaving(false); if (ok) finish(); };
  const handleConfirmZelle   = confirmPaid;
  const handleConfirmVenmo   = confirmPaid;
  const handleConfirmCashApp = confirmPaid;
  const handleCard = async () => {
    setSaving(true); const ok = await saveOrder(); setSaving(false);
    if (!ok) return;
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
              {i.image && <Pic src={i.image} w={320} alt={i.title} className="checkout-item-thumb" />}
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
                <div className="fld"><label>First Name *</label><input autoComplete="given-name" value={customer.firstName} onChange={e=>cv("firstName",e.target.value)} placeholder="Jane" /></div>
                <div className="fld"><label>Last Name *</label><input autoComplete="family-name" value={customer.lastName} onChange={e=>cv("lastName",e.target.value)} placeholder="Smith" /></div>
              </div>
              <div className="fld"><label>Email *</label><input type="email" autoComplete="email" autoCapitalize="none" value={customer.email} onChange={e=>cv("email",e.target.value)} placeholder="jane@email.com" /></div>
              <div className="fld"><label>Phone</label><input type="tel" autoComplete="tel" value={customer.phone} onChange={e=>cv("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"12px 0 10px" }}>Shipping Address</p>
              <div className="fld"><label>Street</label><input autoComplete="street-address" value={customer.address} onChange={e=>cv("address",e.target.value)} placeholder="123 Main St" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>City</label><input autoComplete="address-level2" value={customer.city} onChange={e=>cv("city",e.target.value)} placeholder="Miami" /></div>
                <div className="fld"><label>State</label><input autoComplete="address-level1" value={customer.state} onChange={e=>cv("state",e.target.value)} placeholder="FL" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>ZIP</label><input autoComplete="postal-code" inputMode="numeric" value={customer.zip} onChange={e=>cv("zip",e.target.value)} placeholder="33101" /></div>
                <div className="fld"><label>Country</label><input autoComplete="country-name" value={customer.country} onChange={e=>cv("country",e.target.value)} placeholder="USA" /></div>
              </div>
              <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"14px 0 10px" }}>Coupon Code <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></p>
              <div style={{ display:"flex", gap:8 }}>
                <input autoCapitalize="characters" autoComplete="off" value={couponCode} onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); if(couponStatus!=="valid"){setCouponStatus(null);} }}
                  placeholder="FK-XXXX-XXXX" disabled={couponStatus==="valid"}
                  style={{ flex:1, border:`1px solid ${couponStatus==="valid"?"#2d6a4f":couponStatus&&couponStatus!=="checking"?"#c0392b":"var(--border)"}`, padding:"9px 13px", fontFamily:"'DM Sans',sans-serif", fontSize:13, letterSpacing:".06em", outline:"none", background:couponStatus==="valid"?"#f0faf5":"#fff" }}
                />
                {couponStatus !== "valid"
                  ? <button className="btn-s" onClick={applyCoupon} disabled={couponStatus==="checking"||!couponCode.trim()} style={{whiteSpace:"nowrap"}}>{couponStatus==="checking"?"Checking…":"Apply"}</button>
                  : <button className="btn-s" onClick={()=>{setCouponStatus(null);setCouponCode("");}} style={{whiteSpace:"nowrap",color:"var(--muted)"}}>Remove</button>
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
            <button className="tap" onClick={() => setStep(1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:16, padding:0 }}>← Back</button>
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
            {checkoutError && <p style={{ fontSize:12, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
