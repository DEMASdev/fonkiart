import { useState, useEffect, useEffectEvent, useRef } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { storeCall } from "../lib/store";
import { stripeJsReady } from "../lib/stripeJs";
import { readCardOrder, saveCardOrder, dropCardOrder, matchesCart, cardOrderBody, CARD_FORM_DOWN } from "../lib/cartOrder";
import CardCheckout from "./CardCheckout";
import PaidThanks from "./PaidThanks";
import Pic from "./Pic";

// onSuccess: an order placed to be paid by Zelle, Venmo or Cash App (the Cart page empties the
// cart then). onPaid(titles): a card payment is in (the Cart page empties those pieces). Card
// payments go through the server and Stripe (api/_lib/cartCheckout.js): ONE order per cart,
// however the buyer retries, and the card form opens inside fonkiart.com or not at all.
export default function CheckoutModal({ items, settings, onClose, onSuccess, onPaid, fullPage }) {
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
  // The card order this cart already saved and hasn't finished paying (src/lib/cartOrder.js).
  // With one, the checkout pays THAT order, by card again or another way, and saves no other.
  const [saved, setSaved] = useState(() => { const order = readCardOrder(); return matchesCart(order, items) ? order : null; });
  const [savedAtOpen] = useState(() => saved && cardOrderBody(saved, items));
  const [checked, setChecked] = useState(!savedAtOpen); // the server has said what became of it
  const [pay, setPay] = useState(null);                // the card form, open inside the page
  const [paidView, setPaidView] = useState(null);      // the card payment is in
  const [calm, setCalm] = useState("");                // the card form didn't open: said calmly
  const [retry, setRetry] = useState(false);           // ...with "Try Again" and another way to pay
  // Set the moment a pay button is tapped and cleared once the server has answered, so a double
  // tap counts once and two card calls never race (each would close the page before and open
  // its own, leaving one open that nobody pays).
  const busy = useRef(false);

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
  // A saved order shows its own reference and the amounts the server gave it.
  const savedAmount = (i) => saved?.lines.find(l => String(l.title).trim() === String(i.title).trim())?.amount;
  const shownAmount = (i) => (saved ? savedAmount(i) : undefined) ?? itemEffective(i);
  const amountDue = saved ? saved.total : effectivePrice;
  const refShown = saved ? saved.ref : orderRef;
  const canNext = method && (saved ? checked : fullName && customer.email.includes("@"));

  const handleContinue = () => {
    if (saved && !checked) return; // a moment: the server is saying what became of the saved order
    if (!method) { setCheckoutError("Please select a payment method."); return; }
    if (!saved && !fullName) { setCheckoutError("Please enter your first and last name."); return; }
    if (!saved && !customer.email.includes("@")) { setCheckoutError("Please enter a valid email address."); return; }
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

  // The order as the checkout sends it. For a card payment the server prices every piece itself.
  const orderPayload = () => ({
    customer,
    orderRef,
    total: effectivePrice,
    couponCode: couponStatus === "valid" ? couponCode.trim().toUpperCase() : "",
    items: items.map(i => ({ title: i.title, amount: itemEffective(i) })),
  });

  // The server saves the order, marks the coupon used and sends both emails.
  // Returns false (with a message the buyer can act on) if it could not be reached.
  const saveOrder = async () => {
    try {
      await storeCall("order", orderPayload());
      return true;
    } catch (e) {
      console.warn("Order:", e);
      setCheckoutError(`We couldn't save your order. Please email ${BREVO_SENDER || "us"} with your order number ${orderRef}.`);
      return false;
    }
  };

  // markSold intentionally removed — Andy marks sold manually in Admin after verifying payment received
  const finish = () => { setDone(true); onSuccess?.(); };
  // Zelle, Venmo, Cash App. A card order this cart already saved is the order: nothing is saved
  // or emailed again, it is simply paid another way.
  const confirmPaid = async () => {
    if (busy.current) return;
    if (saved) { dropCardOrder(); finish(); return; }
    busy.current = true;
    setSaving(true); const ok = await saveOrder(); setSaving(false);
    busy.current = false;
    if (ok) finish();
  };
  const handleConfirmZelle   = confirmPaid;
  const handleConfirmVenmo   = confirmPaid;
  const handleConfirmCashApp = confirmPaid;

  // The card payment is in: the saved order is done with, the thank-you shows, and the Cart page
  // empties those pieces.
  const paidNow = (order) => {
    dropCardOrder();
    setSaved(null); setPay(null); setPaidView(order); setDone(true);
    onPaid?.(order.lines.map(l => l.title));
  };
  // The saved order is gone from the shop (cancelled, or handled by hand): forget it and start afresh.
  const startAfresh = () => {
    dropCardOrder();
    setSaved(null); setPay(null); setRetry(false); setCalm(""); setStep(1);
  };

  // "Pay Securely with Card". The card form opens INSIDE fonkiart.com, or not at all: the buyer is
  // never sent to Stripe's own page (Andy, 2026-11-18: "i don't want to be making the user jump to
  // stripe then back , everything should and can happen in fonkiart.com seamlessly easily  and
  // intuitively"). So Stripe.js comes FIRST, before anything is saved: if it can't load (a
  // blocker, no network, 15 s gone: src/lib/stripeJs.js), nothing is saved or emailed, and a calm
  // word says so, with Try Again and another way to pay. The server refuses the same way, before
  // saving, whenever it can't offer the form (CARD_FORM_DOWN: no key, or a bad one).
  // ONE order per cart, however often it is tapped: a new order is saved (cart-card) only while
  // this cart has none waiting; after that every card attempt re-opens payment for that same order
  // (cart-again), naming the last payment page Stripe made for it. Card payments off: the server
  // says so and saves nothing. The cart is NOT emptied here, only once the payment is in.
  // site: this address, so Stripe brings the buyer back, once paid, to the cart they are paying
  // from (fonkiart.com and www.fonkiart.com each keep their own).
  const startCard = async () => {
    if (busy.current) return; // a double tap: the first one is already on its way
    busy.current = true;
    setSaving(true); setCheckoutError(""); setCalm(""); setRetry(false);
    try {
      if (!(await stripeJsReady())) { setRetry(true); setCalm(CARD_FORM_DOWN); return; }
      const site = window.location.origin;
      const order = saved
        ? await storeCall("cart-again", { ...cardOrderBody(saved, items), embedded: true, site })
        : await storeCall("cart-card", { ...orderPayload(), embedded: true, site });
      if (order.paid) { paidNow(order); return; }
      // Kept BEFORE the form opens, so the next attempt names this page.
      setSaved(saveCardOrder({
        ref: order.ref, ids: order.ids, email: saved ? saved.email : customer.email.trim(),
        lines: order.lines, total: order.total, session: order.session || saved?.session,
      }));
      if (order.clientSecret) { setPay(order); return; }
      // Saved, but no card form to open (Stripe failed as the order was saved): the calm word, and
      // Try Again re-opens THAT order (cart-again). Whatever the answer, this tab never leaves.
      setRetry(true);
      setCalm(order.cardError || CARD_FORM_DOWN);
    } catch (e) {
      console.warn("Card payment:", e);
      if (saved && e.status === 404) {
        // The shop no longer has that order as it was saved: start afresh.
        startAfresh();
        setCheckoutError("We couldn't find your saved order. Please enter your details again.");
      } else if (e.status === 409 && e.message === CARD_FORM_DOWN) {
        // The server can't offer the card form here: nothing was saved or sent.
        setRetry(true); setCalm(e.message);
      } else if (e.status === 409) setCheckoutError(e.message);
      else if (e.status === 502 || saved) {
        // The order is safe; only the card page didn't open.
        setRetry(true);
        setCalm(e.status === 502 ? e.message : "The card payment couldn't open right now. Please try again in a moment, or choose another way to pay.");
      } else setCheckoutError(`We couldn't save your order. Please email ${BREVO_SENDER || "us"} with your order number ${orderRef}.`);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const handleCard = () => startCard();
  // Stripe.js wouldn't open the form: the same calm word; Try Again re-opens this order's form.
  const cardFormFailed = () => { setPay(null); setRetry(true); setCalm(CARD_FORM_DOWN); };
  const otherWay = () => { setStep(1); setCalm(""); setRetry(false); };

  // Opening with a saved card order, the server is asked once what became of it ("cart-order"):
  // paid by now (paid, then the tab closed before coming back): the thank-you, and the cart
  // empties; still open: paid from here, by card again or another way; closed by the shop, or
  // unknown to it: forgotten, and the checkout starts afresh. Until it answers, Continue waits.
  // Out of reach: the saved order stands, and paying by card asks the server again anyway.
  const learned = useEffectEvent((order) => {
    setChecked(true);
    if (order === undefined) return;
    if (order?.state === "paid") { paidNow(order); return; }
    if (order?.state === "open") {
      const kept = readCardOrder();
      if (kept && kept.ref === order.ref) setSaved(saveCardOrder({ ...kept, lines: order.lines, total: order.total }));
      return;
    }
    startAfresh();
  });
  useEffect(() => {
    if (!savedAtOpen) return undefined;
    let gone = false;
    storeCall("cart-order", savedAtOpen)
      .then((order) => { if (!gone) learned(order); })
      .catch((e) => { console.warn("Saved order:", e); if (!gone) learned(e.status === 404 ? null : undefined); });
    return () => { gone = true; };
  }, [savedAtOpen]);

  // Paid by card: the same thank-you as on the way back from Stripe, the pieces first.
  if (done && paidView) {
    const thanks = <PaidThanks view={paidView} artworks={items}
      action={<button type="button" className="tap confirm-btn pay-return-go" onClick={onClose}>{fullPage ? "Continue Shopping →" : "Close"}</button>} />;
    return fullPage ? <div className="inv-embed pay-return">{thanks}</div> : (
      <div className="modal-bg" onClick={onClose}>
        <div className="inv-embed pay-return pay-thanks-modal" onClick={e => e.stopPropagation()}>{thanks}</div>
      </div>
    );
  }

  if (done) return (
    <div className={fullPage ? "checkout-page-bg" : "modal-bg"} onClick={fullPage ? undefined : onClose}>
      <div className={`checkout checkout-buy${fullPage ? " checkout-fullpage" : ""}`} style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:50, marginBottom:14 }}>🎨</div>
        <h2 style={{ marginBottom:10 }}>Thank you!</h2>
        <p style={{ color:"var(--muted)", fontSize:16, lineHeight:1.7, marginBottom:16 }}>
          Your order for <strong>{itemsLabel}</strong> has been received.<br />
          Fonkiart will confirm and reach out about shipping.
        </p>
        {refShown && (
          <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 20px", marginBottom:24, display:"inline-block" }}>
            <div style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Reference</div>
            <div style={{ fontFamily:"monospace", fontSize:20, letterSpacing:".08em", color:"var(--ink)", fontWeight:600 }}>{refShown}</div>
            <div style={{ fontSize:16, color:"var(--muted)", marginTop:4 }}>Also in your confirmation email</div>
          </div>
        )}
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className={fullPage ? "checkout-page-bg" : "modal-bg"} onClick={fullPage ? undefined : onClose}>
      <div className={`checkout checkout-buy${fullPage ? " checkout-fullpage" : ""}`} onClick={e => e.stopPropagation()}>
        <button className="modal-close" style={{ position:"absolute", top:18, right:22 }} onClick={onClose}>✕</button>
        <h2>Purchase</h2>
        {!pay && (
          <div className="checkout-items" style={{ marginBottom:24 }}>
            {items.map(i => (
              <div key={i.id} className="checkout-item-row">
                {i.image && <Pic src={i.image} w={320} alt={i.title} className="checkout-item-thumb" />}
                <p className="checkout-sub" style={{ margin:0 }}>
                  {i.title}{shownAmount(i) ? ` · $${Number(shownAmount(i)).toLocaleString()}` : ""}
                  {!saved && couponStatus === "valid" && itemPrice(i) !== itemEffective(i) ? <span style={{fontSize:16,color:"#2d6a4f",marginLeft:8}}>✓ {discount}% off</span> : null}
                </p>
              </div>
            ))}
            {items.length > 1 && (
              <p className="checkout-sub" style={{ marginTop:6, fontWeight:600 }}>
                Total{amountDue ? ` · $${Number(amountDue).toLocaleString()}` : ""}
                {!saved && couponStatus === "valid" && basePrice !== effectivePrice ? <span style={{fontSize:16,color:"#2d6a4f",marginLeft:8}}>✓ {discount}% off</span> : null}
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="pay-opts">
              {[["zelle","💚","Zelle","Instant · Free"],["venmo","🔵","Venmo","Instant · Free"],["cashapp","💵","Cash App","Instant · Free"],["card","💳","Credit Card","Stripe · Secure"]].map(([id,icon,label,sub]) => (
                <button key={id} className={`pay-opt${method===id?" sel":""}`} onClick={() => { setMethod(id); if (id === "card") stripeJsReady(); }}>
                  <span className="pay-opt-icon">{icon}</span>
                  <div className="pay-opt-label">{label}</div>
                  <div className="pay-opt-sub">{sub}</div>
                </button>
              ))}
            </div>
            {saved ? (
              <div className="pay-saved" aria-busy={!checked}>
                <p className="pay-saved-title">Your order <span className="pay-card-ref">{saved.ref}</span> is saved</p>
                <p className="pay-saved-text">Your details are saved with it, so just choose how you&apos;d like to pay.</p>
              </div>
            ) : (
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:18, marginBottom:4 }}>
              <p style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:14 }}>Your Information</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>First Name *</label><input autoComplete="given-name" value={customer.firstName} onChange={e=>cv("firstName",e.target.value)} placeholder="Jane" /></div>
                <div className="fld"><label>Last Name *</label><input autoComplete="family-name" value={customer.lastName} onChange={e=>cv("lastName",e.target.value)} placeholder="Smith" /></div>
              </div>
              <div className="fld"><label>Email *</label><input type="email" autoComplete="email" autoCapitalize="none" value={customer.email} onChange={e=>cv("email",e.target.value)} placeholder="jane@email.com" /></div>
              <div className="fld"><label>Phone</label><input type="tel" autoComplete="tel" value={customer.phone} onChange={e=>cv("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
              <p style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"12px 0 10px" }}>Shipping Address</p>
              <div className="fld"><label>Street</label><input autoComplete="street-address" value={customer.address} onChange={e=>cv("address",e.target.value)} placeholder="123 Main St" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>City</label><input autoComplete="address-level2" value={customer.city} onChange={e=>cv("city",e.target.value)} placeholder="Miami" /></div>
                <div className="fld"><label>State</label><input autoComplete="address-level1" value={customer.state} onChange={e=>cv("state",e.target.value)} placeholder="FL" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="fld"><label>ZIP</label><input autoComplete="postal-code" inputMode="numeric" value={customer.zip} onChange={e=>cv("zip",e.target.value)} placeholder="33101" /></div>
                <div className="fld"><label>Country</label><input autoComplete="country-name" value={customer.country} onChange={e=>cv("country",e.target.value)} placeholder="USA" /></div>
              </div>
              <p style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:"14px 0 10px" }}>Coupon Code <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(optional)</span></p>
              <div style={{ display:"flex", gap:8 }}>
                <input autoCapitalize="characters" autoComplete="off" value={couponCode} onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); if(couponStatus!=="valid"){setCouponStatus(null);} }}
                  placeholder="FK-XXXX-XXXX" disabled={couponStatus==="valid"}
                  style={{ flex:1, border:`1px solid ${couponStatus==="valid"?"#2d6a4f":couponStatus&&couponStatus!=="checking"?"#c0392b":"var(--border)"}`, padding:"9px 13px", fontFamily:"'DM Sans',sans-serif", fontSize:16, letterSpacing:".06em", outline:"none", background:couponStatus==="valid"?"#f0faf5":"#fff" }}
                />
                {couponStatus !== "valid"
                  ? <button className="btn-s" onClick={applyCoupon} disabled={couponStatus==="checking"||!couponCode.trim()} style={{whiteSpace:"nowrap"}}>{couponStatus==="checking"?"Checking…":"Apply"}</button>
                  : <button className="btn-s" onClick={()=>{setCouponStatus(null);setCouponCode("");}} style={{whiteSpace:"nowrap",color:"var(--muted)"}}>Remove</button>
                }
              </div>
              {couponStatus==="valid"       && <p style={{fontSize:16,color:"#2d6a4f",marginTop:6}}>✓ {discount}% discount applied — you save ${(basePrice-effectivePrice).toLocaleString()}</p>}
              {couponStatus==="invalid"     && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>Code not found. Check the spelling and try again.</p>}
              {couponStatus==="used"        && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>This coupon has already been used.</p>}
              {couponStatus==="need-email"  && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>Enter your email address first, then apply the coupon.</p>}
              {couponStatus==="wrong-email" && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>This coupon is not linked to this email address.</p>}
            </div>
            )}
            <button className="confirm-btn" style={{ background:canNext?"var(--gold)":"var(--border)", marginTop:12 }} onClick={handleContinue}>Continue →</button>
            {checkoutError && <p style={{ fontSize:16, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
          </>
        )}

        {step === 2 && (
          <>
            {!pay && !(method === "card" && saving) && <button className="tap" onClick={() => setStep(1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:16, padding:0 }}>← Back</button>}
            {method === "zelle" && (
              <div className="pay-detail">
                <h4>Send via Zelle</h4>
                <div className="zelle-amount">${Number(amountDue||0).toLocaleString()}</div>
                {!saved && couponStatus==="valid" && <p style={{fontSize:16,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div style={{ fontSize:16, color:"var(--muted)", marginBottom:5 }}>Send to this {settings.zelleLabel}:</div>
                <div className="zelle-contact">{settings.zelleContact}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{refShown}</div>
                </div>
                <div className="zelle-steps">1. Open your bank app → Zelle<br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong> to <strong>{settings.zelleContact}</strong><br />3. Memo: copy <strong>{refShown}</strong> and paste it into your Zelle transaction memo/note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "venmo" && (
              <div className="pay-detail">
                <h4>Send via Venmo</h4>
                <div className="zelle-amount">${Number(amountDue||0).toLocaleString()}</div>
                {!saved && couponStatus==="valid" && <p style={{fontSize:16,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-contact">{venmoHandle}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{refShown}</div>
                </div>
                <div className="zelle-steps">1. Open Venmo → Search <strong>{venmoHandle}</strong><br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong><br />3. Note: copy <strong>{refShown}</strong> and paste it into the Venmo note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "cashapp" && (
              <div className="pay-detail">
                <h4>Send via Cash App</h4>
                <div className="zelle-amount">${Number(amountDue||0).toLocaleString()}</div>
                {!saved && couponStatus==="valid" && <p style={{fontSize:16,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <div className="zelle-contact">{cashAppHandle}</div>
                <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"10px 14px", margin:"12px 0" }}>
                  <div style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Number</div>
                  <div style={{ fontFamily:"monospace", fontSize:18, letterSpacing:".06em", color:"var(--ink)", fontWeight:600 }}>{refShown}</div>
                </div>
                <div className="zelle-steps">1. Open Cash App → Search <strong>{cashAppHandle}</strong><br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong><br />3. Note: copy <strong>{refShown}</strong> and paste it into the Cash App note<br />4. Confirm below — we ship once payment clears ✓</div>
              </div>
            )}
            {method === "card" && pay && (
              <CardCheckout pay={pay} artworks={items} onBack={() => setPay(null)} onFail={cardFormFailed} />
            )}
            {method === "card" && !pay && (
              <div className="pay-detail">
                <h4>Secure Credit Card via Stripe</h4>
                {!saved && couponStatus==="valid" && <p style={{fontSize:16,color:"#2d6a4f",marginBottom:8}}>✓ {discount}% coupon applied</p>}
                <p style={{ fontSize:16, color:"var(--muted)", lineHeight:1.7 }}>Pay for <strong>{itemsLabel}</strong>{amountDue ? ` ($${Number(amountDue).toLocaleString()})` : ""} securely by card, through Stripe.</p>
              </div>
            )}
            {method==="zelle"   && <button className="confirm-btn" onClick={handleConfirmZelle}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="venmo"   && <button className="confirm-btn" onClick={handleConfirmVenmo}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="cashapp" && <button className="confirm-btn" onClick={handleConfirmCashApp} disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
            {method==="card" && calm && <p className="pay-calm" role="status">{calm}</p>}
            {method==="card" && !pay && (saving
              ? <p className="pay-card-wait" role="status">Opening the secure card form…</p>
              : <button className="stripe-btn" onClick={handleCard}>{retry ? "Try Again" : "Pay Securely with Card →"}</button>)}
            {method==="card" && !pay && retry && !saving && <button type="button" className="tap pay-other" onClick={otherWay}>Choose Another Way to Pay</button>}
            {checkoutError && <p role="alert" style={{ fontSize:16, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
