import { useState, useEffect, useRef } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { storeCall } from "../lib/store";
import { canApprove, paymentOptions, findArtwork, readInvoiceParams, paidCongrats, paidByLabel } from "../lib/invoiceView";
import { isPaid } from "../lib/orderStatus";
import { orderTracking, orderTrackingLink, carrierLabel, isPickup, PICKUP_LABEL } from "../lib/tracking";
import { SHIP_FIELDS, SHIP_AUTOFILL, hasShipAddress, shipLines, shipForm, shipFields } from "../lib/shipAddress";
import Pic from "../components/Pic";
import CopyButton from "../components/CopyButton";
import CardCheckout from "../components/CardCheckout";
import { invoiceNumber } from "../lib/invoiceNumber";
import { stripeJsReady } from "../lib/stripeJs";
import { CARD_FORM_DOWN } from "../lib/cartOrder";

// The shipping address fields that take a whole line of the form.
const SHIP_WIDE = new Set(["ship_name", "ship_address", "ship_phone"]);

// The card page this tab opened last for this invoice (card-checkout's `last`), kept for THIS tab
// (sessionStorage), so a reload still names it: the server then closes it before it makes a new
// one, or records it if it was paid after all. Storage blocked: this visit only.
const lastKey = (token) => `fonkiart-invoice-card:${token}`;
const readLast = (token) => { try { return sessionStorage.getItem(lastKey(token)) || null; } catch { return null; } };
const keepLast = (token, id) => {
  try { if (id) sessionStorage.setItem(lastKey(token), id); else sessionStorage.removeItem(lastKey(token)); } catch { /* blocked */ }
};
// Card payment answered, but not with the form: what the page says (the server's 409 words are
// the client's to read; anything else, this).
const CARD_LATER = "Card payment isn't working right now. Please try again in a moment, or choose another way to pay.";

// shopView: opened from the admin's "Open" button (?view=shop). The customer's page,
// read-only: no Approve button, so the shop can look without approving anything.
// embedded: shown inside the full site (App.jsx), with its menu, top bar and footer.
export default function InvoicePage({ token, shopView = false, embedded = false, artworks = [] }) {
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveFailed, setApproveFailed] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cardCheckFailed, setCardCheckFailed] = useState(false);
  // Pay by card, INSIDE this page (Andy, 2026-11-18: "i don't want to be making the user jump to
  // stripe then back"): pay, the card form's page while it is open (card-checkout's answer);
  // cardCheck, what was heard after paying in it ("checking", "unpaid", "error"); calm, the calm
  // word when the form can't open, with Try Again (retry); cardMsg, the server's own word (409).
  const [pay, setPay] = useState(null);
  const [cardCheck, setCardCheck] = useState(null);
  const [calm, setCalm] = useState("");
  const [retry, setRetry] = useState(false);
  const [cardMsg, setCardMsg] = useState("");
  // Set the moment a card button is tapped, so a double tap (or Check Again, twice) asks once.
  const cardBusy = useRef(false);
  const lastPage = useRef(null);
  const cardTop = useRef(null);
  const waysTop = useRef(null);
  // The shipping address form (null while closed), whether it is saving, and what the last save said.
  const [shipDraft, setShipDraft] = useState(null);
  const [shipSaving, setShipSaving] = useState(false);
  const [shipMsg, setShipMsg] = useState(null);
  // Set the moment Save is tapped, so a double tap saves once.
  const shipBusy = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        // Back from paying by card: Stripe added &card=<payment page id>. The server asks
        // Stripe itself whether it was paid before marking the order Paid.
        const { card } = readInvoiceParams(window.location.search);
        if (card && !shopView) {
          try {
            await storeCall("card-paid", { token, session: card });
          } catch (e) { console.warn("Card check:", e); setCardCheckFailed(true); }
          // Drop &card= from the address, so a reload doesn't ask again.
          const u = new URL(window.location.href);
          u.searchParams.delete("card");
          window.history.replaceState(window.history.state, "", u.toString());
        }
        const r = await storeCall("invoice", { token });
        setOrder(r.order);
        setApproved(!!r.order.invoice_approved);
        setSettings(r.settings || {});
        setCardReady(r.cardReady === true);
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    };
    load();
  }, [token, shopView]);

  // Paid: the paid invoice is its own thank-you, shown from its TOP. The server's own copy of the
  // order when it answers (it knows how it was paid); if not, Paid as the server just said.
  // method: "card" when it was paid in the card form.
  const paidNow = async (method) => {
    lastPage.current = null;
    keepLast(token, null);
    let fresh = null;
    try { fresh = (await storeCall("invoice", { token }))?.order || null; } catch { /* Paid all the same */ }
    setOrder(o => (fresh && isPaid(fresh.status) ? fresh : { ...o, status: "paid", paid_method: method || o.paid_method }));
    setPay(null); setCardCheck(null); setCalm(""); setRetry(false); setCardMsg("");
    requestAnimationFrame(() => cardTop.current?.scrollIntoView({ block: "start" }));
  };

  // "Pay by card": Stripe's card form, with this invoice's exact amount, opens RIGHT HERE in place
  // of the ways to pay, or not at all: the client is never sent to Stripe's own page. Stripe.js
  // comes first (src/lib/stripeJs.js); if it can't load, or the server can't offer the form
  // (409 CARD_FORM_DOWN), the calm word, with Try Again and the other ways to pay above. The card
  // page this tab opened before goes with it (last), so only one page can ever take the money.
  const handleCard = async () => {
    if (shopView || cardBusy.current) return;
    cardBusy.current = true;
    setPaying(true); setCalm(""); setRetry(false); setCardMsg("");
    try {
      if (!(await stripeJsReady())) { setRetry(true); setCalm(CARD_FORM_DOWN); return; }
      const last = lastPage.current || readLast(token);
      const r = await storeCall("card-checkout", { token, embedded: true, ...(last ? { last } : {}) });
      if (r?.paid) { await paidNow(null); return; }
      if (!r?.clientSecret) { setRetry(true); setCalm(CARD_FORM_DOWN); return; }
      lastPage.current = r.session;
      keepLast(token, r.session);
      setCardCheck(null);
      setPay(r);
    } catch (e) {
      console.warn("Card payment:", e);
      if (e.status === 409 && e.message !== CARD_FORM_DOWN) setCardMsg(e.message);
      else { setRetry(true); setCalm(e.status === 409 ? CARD_FORM_DOWN : CARD_LATER); }
    } finally {
      cardBusy.current = false;
      setPaying(false);
    }
  };
  // Paid in the form, and the client never left: the server asks Stripe itself (card-paid). Paid:
  // the paid invoice. Not yet, or out of reach: a calm word and Check Again, asked once a tap.
  const cardComplete = async (page) => {
    if (cardBusy.current) return;
    cardBusy.current = true;
    setCardCheck("checking");
    try {
      const r = await storeCall("card-paid", { token, session: page.session });
      if (r?.paid) { await paidNow("card"); return; }
      setCardCheck("unpaid");
    } catch (e) {
      console.warn("Card check:", e);
      setCardCheck("error");
    } finally {
      cardBusy.current = false;
    }
  };
  // Stripe.js wouldn't open the form: the calm word; Try Again asks for a new one.
  const cardFormFailed = () => { setPay(null); setRetry(true); setCalm(CARD_FORM_DOWN); };

  const handleApprove = async () => {
    if (!order || !canApprove({ approved, shopView })) return;
    setApproving(true);
    setApproveFailed(false);
    try {
      await storeCall("invoice-approve", { token });
      setApproved(true);
    } catch(e) { console.warn("Approve error:", e); setApproveFailed(true); }
    finally { setApproving(false); }
  };

  // Shipping address (Andy, 2026-11-17: "also make sure in the admin and for the user can add the
  // shipping address !"): the client adds or changes it here, before or after paying, until the
  // order has gone out. The server checks the link and every field (op "ship-address").
  const openShip = () => { setShipDraft(shipForm(order)); setShipMsg(null); };
  const saveShip = async () => {
    if (shopView || shipBusy.current || !shipDraft) return;
    const { fields, problem } = shipFields(shipDraft);
    if (problem) { setShipMsg({ ok: false, text: problem }); return; }
    shipBusy.current = true;
    setShipSaving(true);
    setShipMsg(null);
    try {
      const r = await storeCall("ship-address", { token, address: fields });
      setOrder(o => ({ ...o, ...(r?.address || fields) }));
      setShipDraft(null);
      setShipMsg({ ok: true, text: "✓ Saved. Thank you!" });
    } catch (e) {
      console.warn("Shipping address:", e);
      const said = e?.message && !/^Store \d+$/.test(e.message) ? e.message : "";
      setShipMsg({ ok: false, text: said || "Your address could not be saved. Please try again." });
    } finally { shipBusy.current = false; setShipSaving(false); }
  };

  const shell = (content) => <div className={embedded ? "inv-embed" : "invoice-page"}>{content}</div>;

  if (loading) return shell(<p style={{color:"var(--muted)",fontFamily:"'Cormorant Garamond',serif",fontSize:20}}>Loading…</p>);

  if (notFound) return shell(
    <div className="invoice-card" style={{textAlign:"center"}}>
      <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
      <p style={{marginTop:24,color:"var(--muted)",fontSize:"calc(var(--inv-text) + 1px)"}}>This invoice link is invalid or has expired.</p>
    </div>
  );

  const { zelle: payZelle, venmo: payVenmo, cashApp: payCashApp, card: payCard, any: hasAnyPayment } = paymentOptions(order, settings, { cardReady });
  const paid = isPaid(order.status);
  const congrats = paidCongrats(order.status);
  // Gone out by pickup / hand delivery (Andy, 2026-11-17): no tracking link; the page says so,
  // and a Shipped one says it is ready, like its email (src/lib/adminEmails.js).
  const pickup = (order.status === "shipped" || order.status === "delivered") && isPickup(order);
  // Paid, not shipped yet (Andy, 2026-11-17: "also we will be sending you a tracking number
  // or delivery updates if a shipping is needed !").
  const paidNote = order.status === "delivered" ? "Your order was delivered."
    : order.status === "shipped" ? (pickup ? "Your order is ready, and Fonkiart will arrange the pickup or hand delivery with you." : "Your order has shipped.")
    : "We will be sending you a tracking number or delivery updates if shipping is needed.";
  // Andy, 2026-11-17: "should say Thank you for your payment ! then under Paid by ... and the
  // method used". null (an older order, or "other"): just "Paid ✓".
  const paidBy = paidByLabel(order.paid_method);
  // Shipped or Delivered with tracking saved in the admin: "Track your package" (Andy, 2026-11-17:
  // "a live link to track the order"). The link is only ever https:// (src/lib/tracking.js).
  const trackHref = order.status === "shipped" || order.status === "delivered" ? orderTrackingLink(order) : null;
  const { carrier: trackCarrier, number: trackNumber } = orderTracking(order);
  const amountText = `$${Number(order.amount).toLocaleString()}`;
  const firstName = order.client_name ? order.client_name.split(" ")[0] : "there";
  const invNum  = invoiceNumber(order);
  const art     = findArtwork(artworks, order.item_title);
  const clientRow = order.client_name && (
    <div className="invoice-row">
      <span className="invoice-label">Client</span>
      <span className="invoice-value">{order.client_name}</span>
    </div>
  );
  // Beside the picture the notes stack under their label; without one, label left, notes right.
  const notesRow = (side) => order.notes && (
    <div className="invoice-row" style={{alignItems:"flex-start"}}>
      <span className="invoice-label">Notes</span>
      <span className="invoice-value" style={{fontSize:"var(--inv-text)",lineHeight:1.6,whiteSpace:"pre-wrap",...(side ? {} : {maxWidth:"60%",textAlign:"right"})}}>{order.notes}</span>
    </div>
  );
  const itemRow = (
    <div className="invoice-row">
      <span className="invoice-label">Artwork / Item</span>
      <span className="invoice-value">{order.item_title}</span>
    </div>
  );
  const shipGone = order.status === "shipped" || order.status === "delivered";
  const shipSaved = hasShipAddress(order);
  const invDate = order.created_at ? new Date(order.created_at).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : "";
  const dueDate = order.due_date ? new Date(order.due_date + "T00:00:00").toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : null;

  return shell(
    <div className="invoice-card" ref={cardTop}>
      {shopView && (
        <p style={{fontSize:"var(--inv-small)",lineHeight:1.5,color:"#7a5b14",background:"#fff8ec",border:"1px solid #e8d5a0",padding:"7px 14px",marginBottom:18,textAlign:"center"}}>
          Shop view, read-only. This is the page the customer sees; the Confirm order button is hidden here.
        </p>
      )}
      <div className="invoice-header">
        <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        <div className="invoice-tagline">Original Art &amp; Fine Art Prints</div>
        {congrats && (
          <div className="inv-congrats">
            <div className="inv-congrats-rule" aria-hidden="true"><div className="invoice-logo-dot"/></div>
            <p className="inv-congrats-title">{congrats.title}</p>
            <p className="inv-congrats-sub">{congrats.sub}</p>
          </div>
        )}
      </div>

      {/* Number left, dates right; on a phone the dates go under the number (index.css). */}
      <div className="inv-num-row">
        <div>
          <div style={{fontSize:"var(--inv-small)",letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:3}}>Invoice</div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontFamily:"monospace",fontSize:"clamp(16px,4.2vw,18px)",fontWeight:600,color:"var(--ink)",letterSpacing:".04em",whiteSpace:"nowrap"}}>{invNum}<CopyButton text={invNum} /></div>
        </div>
        <div className="inv-num-dates">
          {invDate && <div style={{fontSize:"var(--inv-small)",color:"var(--muted)"}}>Date: {invDate}</div>}
          <div style={{fontSize:"var(--inv-small)",color:dueDate?"var(--ink)":"var(--muted)",marginTop:2,fontWeight:dueDate?500:400}}>
            {dueDate ? `Due: ${dueDate}` : "Payment due upon receipt"}
          </div>
        </div>
      </div>

      {/* Ask for the click only while the Confirm order button is on the page: a paid or
          already-confirmed invoice has no such button (seen 2026-11-17 on a paid invoice). */}
      <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",lineHeight:1.6,marginBottom:16}}>Hi {firstName}, here is your invoice from Fonkiart.{!paid && !approved && <> Please review the details and click <em>Confirm order</em> when you&apos;re ready.</>}</p>

      {/* With a picture, Client and Artwork sit beside it (Andy, 2026-11-17: "compact it
          more, use the space next to the picture"). Without one, the plain rows. */}
      {art ? (
        <div className="inv-art-row">
          <figure className="inv-art">
            <Pic src={art.image} w={320} alt={art.title} />
          </figure>
          <div className="inv-art-info">{clientRow}{itemRow}{notesRow(true)}</div>
        </div>
      ) : (<>{clientRow}{itemRow}{notesRow(false)}</>)}
      <div className="invoice-total">
        <span className="invoice-label">{paid ? "Total Paid" : "Total Due"}</span>
        <span className="invoice-value">${Number(order.amount).toLocaleString()}</span>
      </div>

      {/* Paid: never ask for money again (Andy, 2026-11-17: a paid, shipped order's link
          still said "not paid yet, please send"). */}
      {paid ? (
        <div className="invoice-approved-banner">
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:29,fontWeight:600,color:"#2d6a4f",marginBottom:6,textWrap:"balance"}}>Thank you for your payment!</p>
          <p style={{fontSize:"var(--inv-text)",fontWeight:600,color:"#2d6a4f",marginBottom:6}}>{paidBy ? `Paid by ${paidBy} ✓` : "Paid ✓"}</p>
          <p style={{fontSize:"var(--inv-text)",color:"#4a8c6a",lineHeight:1.6}}>{paidNote}</p>
          {trackHref && (
            <div style={{marginTop:16}}>
              <a className="tap" href={trackHref} target="_blank" rel="noopener noreferrer"
                style={{display:"inline-block",background:"#2d6a4f",color:"#fff",padding:"12px 28px",fontSize:"var(--inv-text)",letterSpacing:".08em",fontFamily:"'DM Sans',sans-serif",textDecoration:"none"}}>
                Track your package →
              </a>
              {trackCarrier !== "other" && trackNumber && (
                <p style={{fontSize:"var(--inv-small)",color:"#4a8c6a",lineHeight:1.6,marginTop:8,overflowWrap:"anywhere"}}>{carrierLabel(trackCarrier)} tracking number: {trackNumber}</p>
              )}
            </div>
          )}
          {pickup && <p style={{fontSize:"var(--inv-text)",fontWeight:600,color:"#2d6a4f",marginTop:14}}>{PICKUP_LABEL}</p>}
        </div>
      ) : approved ? (<>
        <div className="invoice-approved-banner">
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:29,fontWeight:600,color:"#2d6a4f",marginBottom:8,textWrap:"balance"}}>Order Confirmed ✓</p>
          <p style={{fontSize:"var(--inv-text)",color:"#4a8c6a",lineHeight:1.6,marginBottom:hasAnyPayment&&!pay?20:0}}>
            {pay ? `Your order is confirmed. Pay ${amountText} by card, right here.`
              : hasAnyPayment
              ? `Your order is confirmed. It is not paid yet. Please send ${amountText} using one of these:`
              : "Your order is confirmed. It is not paid yet. Fonkiart will email you how to pay."}
          </p>
          {cardCheckFailed && (
            <p role="status" style={{fontSize:"var(--inv-text)",color:"#7a5b14",background:"#fff8ec",border:"1px solid #e8d5a0",padding:"10px 14px",lineHeight:1.6,marginBottom:16}}>
              We couldn't confirm your card payment just now. If you paid, Stripe emails you a receipt and Fonkiart will mark it paid.
            </p>
          )}
          {/* The card form, while open, takes the place of this list (below the banner). */}
          {hasAnyPayment && !pay && (
            <div ref={waysTop} style={{borderTop:"1px solid #a3d4b3",paddingTop:20}}>
              <p style={{fontSize:"var(--inv-small)",letterSpacing:".12em",textTransform:"uppercase",color:"#4a8c6a",marginBottom:14}}>Send Payment To</p>

              {/* Zelle */}
              {payZelle && (
                <div className="invoice-pay-option" style={{background:"#e8f5ee",border:"1px solid #a3d4b3",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:18}}>💚</span>
                    <div className="invoice-pay-title">Zelle</div>
                  </div>
                  <div className="invoice-pay-value">{payZelle}</div>
                  <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" or <span style={{whiteSpace:"nowrap"}}>"{invNum}"</span> in the memo.</p>
                  <CopyButton text={invNum} size={13} caption="Tap here to copy to your clipboard" />
                </div>
              )}

              {/* Venmo */}
              {payVenmo && (
                <div className="invoice-pay-option" style={{background:"#eef4ff",border:"1px solid #b3c9f0",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:18}}>🔵</span>
                    <div className="invoice-pay-title">Venmo</div>
                  </div>
                  <div className="invoice-pay-value">{payVenmo}</div>
                  <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" or <span style={{whiteSpace:"nowrap"}}>"{invNum}"</span> in the note.</p>
                  <CopyButton text={invNum} size={13} caption="Tap here to copy to your clipboard" />
                </div>
              )}

              {/* Cash App */}
              {payCashApp && (
                <div className="invoice-pay-option" style={{background:"#f0faf0",border:"1px solid #a3d4a3",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:18}}>💵</span>
                    <div className="invoice-pay-title">Cash App</div>
                  </div>
                  <div className="invoice-pay-value">{payCashApp}</div>
                  <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Include "{order.item_title}" or <span style={{whiteSpace:"nowrap"}}>"{invNum}"</span> in the note.</p>
                  <CopyButton text={invNum} size={13} caption="Tap here to copy to your clipboard" />
                </div>
              )}

              {/* Card: Stripe's card form, with this invoice's exact amount, opens right here. */}
              {payCard && (
                <div style={{textAlign:"center",marginTop:4}}>
                  {calm && <p className="pay-calm" role="status" style={{textAlign:"left"}}>{calm}</p>}
                  <button type="button" className="tap" onClick={handleCard} disabled={paying || shopView}
                    style={{display:"inline-block",background:"#635bff",color:"#fff",border:"none",padding:"13px 32px",fontSize:"var(--inv-text)",letterSpacing:".08em",fontFamily:"'DM Sans',sans-serif",cursor:paying||shopView?"default":"pointer",opacity:paying?0.7:1}}>
                    {paying ? "Opening the secure card form…" : retry ? "Try Again" : `💳 Pay ${amountText} by card →`}
                  </button>
                  <p style={{fontSize:"var(--inv-small)",color:"var(--muted)",marginTop:8,lineHeight:1.5}}>Secure card form by Stripe, right here on this page. The amount is already filled in.</p>
                  {retry && !paying && (payZelle || payVenmo || payCashApp) && (
                    <button type="button" className="tap pay-other" onClick={() => waysTop.current?.scrollIntoView({ block: "start", behavior: "smooth" })}>Choose Another Way to Pay ↑</button>
                  )}
                  {cardMsg && <p role="alert" style={{fontSize:"var(--inv-text)",color:"#c0392b",lineHeight:1.6,marginTop:10}}>{cardMsg}</p>}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Pay by card: the piece first, then Stripe's form, in place of the ways to pay
            (src/components/CardCheckout.jsx). "← Choose another way to pay" brings them back. */}
        {pay && (
          <div className="inv-card-panel">
            <CardCheckout pay={pay} artworks={artworks} noun="invoice" totalLabel="Total Due"
              onBack={() => { setPay(null); setCardCheck(null); }} onFail={cardFormFailed} onComplete={cardComplete} check={cardCheck} />
          </div>
        )}
      </>) : shopView ? (
        <div className="invoice-pay-section">
          <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",lineHeight:1.6,textAlign:"center"}}>Not approved by the customer yet.</p>
        </div>
      ) : (
        <div className="invoice-pay-section">
          <p style={{fontSize:"var(--inv-text)",color:"var(--muted)",lineHeight:1.6,marginBottom:20,textAlign:"center"}}>Step 1: confirm the invoice is right. No money is taken. Step 2: the ways to pay show right here.</p>
          <button onClick={handleApprove} disabled={approving}
            style={{width:"100%",background:"var(--sidebar-bg)",color:"#fff",border:"none",padding:"16px 32px",fontSize:"var(--inv-text)",letterSpacing:".1em",textTransform:"uppercase",cursor:approving?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:approving?0.7:1,transition:"opacity .2s"}}>
            {approving ? "Processing…" : "Confirm order →"}
          </button>
          {approveFailed && (
            <p role="alert" style={{fontSize:"var(--inv-text)",color:"#c0392b",lineHeight:1.6,marginTop:12,textAlign:"center"}}>
              Something went wrong and your order was not confirmed. Please try again, or email us at <a href={`mailto:${BREVO_SENDER}`} style={{color:"var(--gold)"}}>{BREVO_SENDER}</a>.
            </p>
          )}
        </div>
      )}

      {/* Shipping address: shown while it can still be added, and whenever one is saved. */}
      {(shipSaved || !shipGone) && (
        <div className="inv-ship">
          <p className="inv-ship-title">Shipping address</p>
          {shipDraft ? (<>
            <div className="inv-ship-form">
              {SHIP_FIELDS.map(([column, label, max]) => (
                <label key={column} className={`inv-ship-field${SHIP_WIDE.has(column) ? " wide" : ""}`}>
                  <span>{label}</span>
                  <input type={column === "ship_phone" ? "tel" : "text"} autoComplete={SHIP_AUTOFILL[column]} maxLength={max} value={shipDraft[column]}
                    onChange={e => { const v = e.target.value; setShipDraft(d => ({ ...d, [column]: v })); setShipMsg(null); }} />
                </label>
              ))}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginTop:16}}>
              <button type="button" className="tap inv-ship-btn" onClick={saveShip} disabled={shipSaving}>{shipSaving ? "Saving…" : "Save address"}</button>
              <button type="button" className="tap inv-ship-link" onClick={() => { setShipDraft(null); setShipMsg(null); }} disabled={shipSaving}>Cancel</button>
            </div>
          </>) : shipSaved ? (<>
            <div className="inv-ship-lines">{shipLines(order).map((line, i) => <div key={i}>{line}</div>)}</div>
            {!shopView && !shipGone && <button type="button" className="tap inv-ship-link" style={{marginTop:12}} onClick={openShip}>Change</button>}
          </>) : shopView ? (
            <p className="inv-ship-lines" style={{color:"var(--muted)"}}>No shipping address yet.</p>
          ) : (<>
            <p className="inv-ship-lines" style={{color:"var(--muted)",marginBottom:12}}>Where should Fonkiart send your order?</p>
            <button type="button" className="tap inv-ship-btn" onClick={openShip}>Add shipping address</button>
          </>)}
          {shipMsg && <p className={shipMsg.ok ? "inv-ship-ok" : "inv-ship-err"} role={shipMsg.ok ? "status" : "alert"}>{shipMsg.text}</p>}
        </div>
      )}

      <p style={{fontSize:"var(--inv-small)",color:"var(--muted)",textAlign:"center",marginTop:28,lineHeight:1.7}}>
        Questions? Contact us at <a href={`mailto:${BREVO_SENDER}`} style={{color:"var(--gold)"}}>{BREVO_SENDER}</a>
      </p>
    </div>
  );
}
