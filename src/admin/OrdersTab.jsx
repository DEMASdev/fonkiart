import { useState, useEffect, useRef, Fragment } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { adminDb as supabase } from "../lib/adminDb";
import { sendEmail } from "../utils/helpers";
import { invoiceEmail, statusEmailFor } from "../lib/adminEmails";
import { invoiceLink } from "../lib/invoiceView";
import { invoiceNumber } from "../lib/invoiceNumber";
import CopyButton from "../components/CopyButton";
import { ORDER_STATUSES, isPaid, canMarkPaid, markPaidChoices, asksPaidMethod, statusChange, resendQuestion, paidPick } from "../lib/orderStatus";
import { CARRIERS, NO_TRACKING, PICKUP_FIELDS, PICKUP_LABEL, isPickup, orderTrackingLink, hasTrackingSaved, trackingLabel, trackingFields, trackingSave } from "../lib/tracking";
import { SHIP_FIELDS, hasShipAddress, shipLines, shipForm, shipFields, shipFromClient, clientHasAddress } from "../lib/shipAddress";
// The id in `ask` while the "+ Add Order" form asks "Paid by:" (an order's own id otherwise).
const NEW_ORDER = "new-order";
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
  const [statusErr, setStatusErr] = useState("");
  // The one question open on this screen, or null; opening one closes any other. Never a
  // browser pop-up (Andy's standing rule): every question sits on the order itself.
  // { kind:"paid", id }: "Money arrived? Paid by:" for an order, or for + Add Order (id NEW_ORDER).
  // { kind:"resend", id }: "This invoice was sent already... Send it again?"
  // { kind:"ship", id }: "How did it go out?" (Carrier / Pickup / hand delivery), from the Status menu
  // { kind:"pickup", id }: "Pickup / hand delivery. Email <client>?" (Send / Not now)
  // { kind:"track", id }: "Email the tracking link to <client>?" (Send / Not now)
  // { kind:"untrack", id }: "Remove the tracking from this order?" (or the pickup / hand delivery)
  // { kind:"delete", id }: "Delete this order? This can't be undone."
  // { kind:"link", id }: the client's invoice link, with a copy button
  const [ask, setAsk] = useState(null);
  const asking = (kind, id) => ask?.kind === kind && ask?.id === id;
  // Tracking (Andy, 2026-11-17). track: the open tracking forms, by order id, each
  // { carrier, number, url, err, shipFrom }; shipFrom only when the form was opened by picking
  // Shipped in the Status menu. trackNote: what the last save did, by order id, { ok, text }.
  // trackBusy: the button working right now, by order id ("send", "save" or "clear").
  // saving: the same, read at once, so a second tap on Send can't send a second email.
  const [track, setTrack] = useState({});
  const [trackNote, setTrackNote] = useState({});
  const [trackBusy, setTrackBusy] = useState({});
  const saving = useRef(new Set());
  // Shipping address (Andy, 2026-11-17). shipEdit: the open address forms, by order id (the seven
  // fields, plus err). shipNote: what the last save did, by order id, { ok, text }.
  const [shipEdit, setShipEdit] = useState({});
  const [shipNote, setShipNote] = useState({});
  const [invAmountHint, setInvAmountHint] = useState("350");
  const [formAmountHint, setFormAmountHint] = useState("350");

  const fmtDate   = (iso) => iso ? new Date(iso).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : "";

  const buildInvoiceEmail = (order, link) => invoiceEmail({
    invNum: invoiceNumber(order),
    invDate: fmtDate(order.created_at || new Date().toISOString()),
    firstName: order.client_name ? order.client_name.split(" ")[0] : "there",
    itemTitle: order.item_title,
    notes: order.notes,
    dueDate: order.due_date ? fmtDate(order.due_date + "T00:00:00") : "",
    amount: order.amount,
    link,
    sender: BREVO_SENDER,
  });
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
        stripe_link: null, // card payments no longer use a pasted link (api/_lib/stripe.js)
        payment_methods: methods,
      }]).select().single();
      if (orderErr) throw orderErr;
      const order = { ...orderData, client_name: name, created_at: orderData?.created_at || new Date().toISOString() };
      await sendEmail({ to: email, subject: `Invoice ${invoiceNumber(order)} — ${inv.item_title} · Fonkiart`, ...buildInvoiceEmail(order, link) });
      await load();
      setInv(invBlank); setSendingInvoice(false);
      showMsg(`Invoice sent to ${email}`);
    } catch(e) {
      console.warn("Send invoice:", e);
      const detail = e?.message || e?.error_description || e?.details || e?.hint;
      showMsg(detail ? `Error sending invoice: ${detail}` : "Error sending invoice. Please try again.");
    }
    finally { setInvSending(false); }
  };

  const resendInvoice = async (order) => {
    if (!order.invoice_token) return;
    setResending(r => ({...r, [order.id]: true}));
    try {
      const link = `${window.location.origin}/?invoice=${order.invoice_token}`;
      await sendEmail({ to: order.client_email, subject: `Invoice ${invoiceNumber(order)} — ${order.item_title} · Fonkiart`, ...buildInvoiceEmail(order, link) });
      showMsg(`Invoice resent to ${order.client_email}`);
    } catch { showMsg("Error resending invoice."); }
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
    // paid_method only with Paid, once "Paid by:" was answered (statusChange); never empty.
    const { paid_method, ...rest } = form;
    await supabase.from("Orders").insert([{...rest, ...statusChange(form.status, paid_method), client_email:email}]);
    setForm(blank); setManual({first:"",last:"",email:"",phone:"",address:"",city:"",state:"",zip:"",country:""}); setSelectedClient(null); setClientUpdate({}); setAdding(false); setClientMode("select"); load();
    setAsk(a => a?.id === NEW_ORDER ? null : a);
  };
  // The client's email for a status (src/lib/adminEmails.js statusEmailFor). Shipped and
  // Delivered carry the live tracking link whenever the order has tracking, so picking Shipped
  // in the Status menu after saving the tracking sends the link too. true once it was sent.
  const sendStatusEmail = async (order, status) => {
    const client = clients.find(c => c.email === order.client_email);
    const name = client?.name?.split(" ")[0] || "there";
    const m = statusEmailFor({ status, order, name, sender: BREVO_SENDER });
    if (!m) return false;
    try {
      await sendEmail({ to: order.client_email, subject: m.subject, heading: m.heading, content: m.content });
      return true;
    } catch(e) { console.warn("Status email:", e); return false; }
  };
  // Only change the screen and email the client once the database has really saved it.
  // It used to ignore a failed save, so the client could be told something untrue.
  // paidMethod: how the money came, from "Paid by:" (the invoice then says "Paid by ...").
  const updateStatus = async (id, status, paidMethod, { email = true } = {}) => {
    setStatusErr("");
    const change = statusChange(status, paidMethod);
    const { error } = await supabase.from("Orders").update(change).eq("id",id);
    if (error) { setStatusErr(`Could not save the new status (${error.message || "unknown error"}). Nothing was emailed.`); return false; }
    setAsk(null);
    const order = orders.find(o => o.id === id);
    setOrders(orders.map(o=>o.id===id?{...o,...change}:o));
    if (order && email) sendStatusEmail(order, status);
  };
  // The Status menus. "Paid" first asks "Paid by:", like ✓ Mark paid, and an order's "Shipped"
  // asks how it went out (askShip, below); until that is answered nothing is saved or emailed,
  // and the menu keeps showing the status it had (Cancel leaves it there). Every other status
  // saves at once, as before. An order whose payment method is already known (a card payment
  // flipped Shipped -> Paid) goes back to Paid quietly: no question, no second receipt (paidPick).
  const pickStatus = (order, status) => {
    if (status === "shipped") return askShip(order);
    const pick = paidPick(order, status);
    if (pick === "save") return updateStatus(order.id, status);
    if (pick === "save-quietly") return updateStatus(order.id, status, undefined, { email:false });
    setStatusErr(""); setAsk({ kind:"paid", id:order.id });
  };
  const pickNewOrderStatus = (status) => asksPaidMethod(status) ? setAsk({ kind:"paid", id:NEW_ORDER }) : f("status", status);
  // The one "Money arrived? Paid by:" question: ✓ Mark paid, the Status menus and + Add Order.
  const paidByAsk = (paymentMethods, onPick) => (
    <div className="mark-paid-ask">
      <span>Money arrived? Paid by:</span>
      {markPaidChoices(paymentMethods).map(([method, label]) => (
        <button key={method} className="tap mark-paid-yes" onClick={()=>onPick(method)}>{label}</button>
      ))}
      <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
    </div>
  );
  // Resend asks first, in the same look: Andy, 2026-11-17, it should warn the invoice "was sent
  // already ... or ... was sent already and paid". "Send again" does exactly what Resend did.
  const resendAsk = (order) => (
    <div className="mark-paid-ask">
      <span>{resendQuestion(order.status)}</span>
      <button className="tap mark-paid-yes" onClick={()=>{ setAsk(null); resendInvoice(order); }}>Send again</button>
      <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
    </div>
  );
  // Delete asks first, on the order itself (it used to be a browser pop-up). The order leaves
  // the screen only once the database has really deleted it.
  const deleteAsk = (order) => (
    <div className="mark-paid-ask">
      <span>Delete this order? This can&apos;t be undone.</span>
      <button className="tap ask-danger" onClick={()=>deleteOrder(order.id)}>Delete</button>
      <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
    </div>
  );
  const deleteOrder = async (id) => {
    setAsk(null); setStatusErr("");
    const { error } = await supabase.from("Orders").delete().eq("id",id);
    if (error) { setStatusErr(`Could not delete the order (${error.message || "unknown error"}).`); return; }
    setOrders(list => list.filter(o=>o.id!==id));
  };
  // "🔗 Link": the client's invoice link, shown on the order with a copy button (it used to copy
  // and then pop up "Invoice link copied!"). Plain text, not a link: opening the client's own
  // link could confirm the invoice for them; "👁 Open" is the shop's read-only view.
  const linkAsk = (order) => {
    const link = invoiceLink(window.location.origin, order.invoice_token);
    return (
      <div className="mark-paid-ask ask-link">
        <span>The client&apos;s invoice link:</span>
        <span className="ask-link-url">{link}</span>
        <CopyButton text={link} label="Copy invoice link" caption="Copy link" />
        <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Close</button>
      </div>
    );
  };

  // ── Shipping and tracking (Andy, 2026-11-17: "if shipping was used ... check mark and activate
  // a box to enter the tracking number and should ask to send an email to the customer ... with
  // a live link to track the order", and "when marking an order as shipped it should ask for
  // tracking number or if it was a pickup delivery"). Two ways in, one save (saveShipping):
  //  - picking Shipped in an order's Status menu asks "How did it go out?": Carrier (the
  //    tracking form) or Pickup / hand delivery, then whether to email the client. The order
  //    becomes Shipped only then; Cancel leaves the status as it was, like "Paid by:".
  //  - the "Shipped with a carrier" tick box, on every order the money is in for (Paid, Shipped,
  //    Delivered), adds or edits the tracking.
  const clientLabel = (o) => o.client_name || clientName(o.client_email) || o.client_email || "the client";
  const editTrack = (id, patch) => setTrack(t => ({ ...t, [id]: { ...t[id], ...patch } }));
  const noteTrack = (id, note) => setTrackNote(n => ({ ...n, [id]: note }));
  // One save at a time per order: false when this order is already saving.
  const startBusy = (id, what) => {
    if (saving.current.has(id)) return false;
    saving.current.add(id); setTrackBusy(b => ({ ...b, [id]: what }));
    return true;
  };
  const endBusy = (id) => { saving.current.delete(id); setTrackBusy(b => { const next = { ...b }; delete next[id]; return next; }); };
  // The form, filled in with what the order has saved (a pickup has no carrier to show).
  const formFrom = (o) => ({ carrier: o.tracking_carrier && !isPickup(o) ? o.tracking_carrier : "", number: o.tracking_number || "", url: o.tracking_url || "", err: "" });
  const openTrack = (o) => { noteTrack(o.id, null); setTrack(t => ({ ...t, [o.id]: formFrom(o) })); };
  const closeTrack = (id) => {
    setTrack(t => { const next = { ...t }; delete next[id]; return next; });
    setAsk(a => a?.id === id && (a.kind === "track" || a.kind === "pickup") ? null : a);
  };
  // A form opened from the Status menu saves the order as Shipped. It counts only while the order
  // still has the status it had then: a status picked in the menu since ends it.
  const fromMenu = (o) => track[o.id]?.shipFrom === (o.status || "pending");
  const askShip = (o) => { setStatusErr(""); noteTrack(o.id, null); setAsk({ kind:"ship", id:o.id }); };
  // "Carrier": the tracking form (anything already typed in it stays).
  const shipByCarrier = (o) => {
    setTrack(t => ({ ...t, [o.id]: { ...(t[o.id] ?? formFrom(o)), err:"", shipFrom:o.status || "pending" } }));
    setAsk(null);
  };
  // Save: check what was typed, then ask before emailing anyone.
  const askTrack = (o) => {
    const { problem } = trackingFields(track[o.id]);
    editTrack(o.id, { err: problem || "" });
    if (!problem) { setStatusErr(""); setAsk({ kind:"track", id:o.id }); }
  };
  // Send (email: true) or Not now (false); what each one saves is trackingSave (src/lib/tracking.js).
  // The status goes in the same save, never through the Status menu's own save (that sends its
  // own email), so the client gets one email at most. showError: where a failed save is told.
  const saveShipping = async (o, fields, { email, ship }, showError) => {
    const { change, emailStatus } = trackingSave(o, fields, { email, ship });
    const what = isPickup(fields) ? PICKUP_LABEL : "the tracking";
    if (!startBusy(o.id, email ? "send" : "save")) return;
    try {
      const { error } = await supabase.from("Orders").update(change).eq("id", o.id);
      if (error) { setAsk(null); showError(`Could not save ${what} (${error.message || "unknown error"}). Nothing was emailed.`); return; }
      setOrders(list => list.map(x => x.id === o.id ? { ...x, ...change } : x));
      closeTrack(o.id);
      const saved = isPickup(fields) ? `Saved as ${PICKUP_LABEL}` : "Tracking saved";
      const marked = change.status ? " The order is now Shipped." : "";
      if (!emailStatus) { noteTrack(o.id, { ok: true, text: `✓ ${saved}. No email was sent.${marked}` }); return; }
      const sent = await sendStatusEmail({ ...o, ...change }, emailStatus);
      noteTrack(o.id, sent
        ? { ok: true, text: `✓ ${saved} and emailed to ${o.client_email}.${marked}` }
        : { ok: false, text: `⚠ ${saved}, but the email to ${o.client_email} could not be sent.${marked}` });
    } finally { endBusy(o.id); }
  };
  const saveTrack = (o, email) => {
    if (saving.current.has(o.id)) return;
    const { fields, problem } = trackingFields(track[o.id]);
    if (problem) { setAsk(null); editTrack(o.id, { err: problem }); return; }
    return saveShipping(o, fields, { email, ship: fromMenu(o) }, err => editTrack(o.id, { err }));
  };
  const savePickup = (o, email) => saveShipping(o, PICKUP_FIELDS, { email, ship: true }, err => noteTrack(o.id, { ok: false, text: `⚠ ${err}` }));
  // Clear: asks first, then removes all three. No email, and the status stays.
  const clearTrack = async (o) => {
    if (!startBusy(o.id, "clear")) return;
    const what = isPickup(o) ? PICKUP_LABEL : "Tracking";
    try {
      const { error } = await supabase.from("Orders").update(NO_TRACKING).eq("id", o.id);
      setAsk(null);
      if (error) { noteTrack(o.id, { ok: false, text: `⚠ Could not remove it (${error.message || "unknown error"}).` }); return; }
      setOrders(list => list.map(x => x.id === o.id ? { ...x, ...NO_TRACKING } : x));
      noteTrack(o.id, { ok: true, text: `✓ ${what} removed.` });
    } finally { endBusy(o.id); }
  };
  // The tracking shows on an order the money is in for, and on any order while picking Shipped
  // in its Status menu is still being answered.
  const showsTracking = (o) => isPaid(o.status) || asking("ship", o.id) || asking("pickup", o.id) || fromMenu(o);
  const trackCell = (o) => {
    const draft = track[o.id];
    const note = trackNote[o.id];
    const doing = trackBusy[o.id];
    const busy = !!doing;
    const link = orderTrackingLink(o);
    const pickup = isPickup(o);
    const tick = (checked, onChange) => (
      <label className="track-tick"><input type="checkbox" checked={checked} onChange={onChange} />Shipped with a carrier</label>
    );
    const sending = doing === "send" ? "Sending…" : "Send";
    const notNow = doing === "save" ? "Saving…" : "Not now";
    return (
      <div className="track">
        {asking("ship", o.id) ? (
          <div className="mark-paid-ask">
            <span>How did it go out?</span>
            <button className="tap mark-paid-yes" onClick={()=>shipByCarrier(o)}>Carrier</button>
            <button className="tap mark-paid-yes" onClick={()=>setAsk({ kind:"pickup", id:o.id })}>{PICKUP_LABEL}</button>
            <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
          </div>
        ) : asking("pickup", o.id) ? (
          <div className="mark-paid-ask">
            <span>{PICKUP_LABEL}. Email {clientLabel(o)}?</span>
            <button className="tap mark-paid-yes" onClick={()=>savePickup(o, true)} disabled={busy}>{sending}</button>
            <button className="tap mark-paid-no" onClick={()=>savePickup(o, false)} disabled={busy}>{notNow}</button>
            <button className="tap mark-paid-no" onClick={()=>setAsk(null)} disabled={busy}>Cancel</button>
          </div>
        ) : draft ? (<>
          {tick(true, () => closeTrack(o.id))}
          <div className="track-form">
            <select aria-label="Carrier" value={draft.carrier} onChange={e=>editTrack(o.id, { carrier:e.target.value, err:"" })}>
              <option value="">Carrier…</option>
              {CARRIERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            {draft.carrier === "other"
              ? <input type="url" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Tracking link" placeholder="Tracking link (https://…)"
                  value={draft.url} onChange={e=>editTrack(o.id, { url:e.target.value, err:"" })} />
              : <input type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Tracking number" placeholder="Tracking number"
                  value={draft.number} onChange={e=>editTrack(o.id, { number:e.target.value, err:"" })} />}
            <button className="tap track-save" onClick={()=>askTrack(o)} disabled={busy}>Save</button>
            <button className="tap track-btn" onClick={()=>closeTrack(o.id)} disabled={busy}>Cancel</button>
          </div>
          {draft.err && <p className="track-err" role="alert">⚠ {draft.err}</p>}
          {asking("track", o.id) && (
            <div className="mark-paid-ask">
              <span>Email the tracking link to {clientLabel(o)}?</span>
              <button className="tap mark-paid-yes" onClick={()=>saveTrack(o, true)} disabled={busy}>{sending}</button>
              <button className="tap mark-paid-no" onClick={()=>saveTrack(o, false)} disabled={busy}>{notNow}</button>
            </div>
          )}
        </>) : hasTrackingSaved(o) ? (
          <div className="track-saved">
            <span>{pickup ? "Went out by:" : "Tracking:"}</span>
            {link
              ? <a className="track-link" href={link} target="_blank" rel="noopener noreferrer">{trackingLabel(o)} ↗</a>
              : <span>{trackingLabel(o)}</span>}
            <button className="tap track-btn" onClick={()=>openTrack(o)}>Edit</button>
            <button className="tap track-btn" onClick={()=>{ noteTrack(o.id, null); setAsk({ kind:"untrack", id:o.id }); }}>Clear</button>
          </div>
        ) : tick(false, () => openTrack(o))}
        {!draft && asking("untrack", o.id) && (
          <div className="mark-paid-ask">
            <span>{pickup ? `Remove “${PICKUP_LABEL}” from this order?` : "Remove the tracking from this order?"}</span>
            <button className="tap ask-danger" onClick={()=>clearTrack(o)} disabled={busy}>{doing === "clear" ? "Removing…" : "Remove"}</button>
            <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
          </div>
        )}
        {note && <p className={note.ok ? "track-ok" : "track-err"} role="status">{note.text}</p>}
      </div>
    );
  };
  // ── Shipping address: "Ship to", on every order (Andy, 2026-11-17: "also make sure in the
  // admin and for the user can add the shipping address !"). Add or Edit it here, or, while the
  // order has none, copy the client's saved address (Admin -> Clients) in one tap. No email.
  // The client can also add it on their invoice page.
  const clientOf = (o) => clients.find(c => String(c.email || "").toLowerCase() === String(o.client_email || "").toLowerCase());
  const noteShip = (id, note) => setShipNote(n => ({ ...n, [id]: note }));
  const editShip = (id, patch) => setShipEdit(f => ({ ...f, [id]: { ...f[id], ...patch } }));
  const openShip = (o) => { noteShip(o.id, null); setShipEdit(f => ({ ...f, [o.id]: { ...shipForm(o), err: "" } })); };
  const closeShip = (id) => setShipEdit(f => { const next = { ...f }; delete next[id]; return next; });
  // Saves the address; null when it worked, or what went wrong.
  const saveShipTo = async (o, fields, done) => {
    if (!startBusy(o.id, "ship")) return null;
    try {
      const { error } = await supabase.from("Orders").update(fields).eq("id", o.id);
      if (error) return `Could not save the address (${error.message || "unknown error"}).`;
      setOrders(list => list.map(x => x.id === o.id ? { ...x, ...fields } : x));
      closeShip(o.id);
      noteShip(o.id, { ok: true, text: done });
      return null;
    } finally { endBusy(o.id); }
  };
  const saveShipForm = async (o) => {
    const { fields, problem } = shipFields(shipEdit[o.id]);
    if (problem) { editShip(o.id, { err: problem }); return; }
    const err = await saveShipTo(o, fields, "✓ Address saved.");
    if (err) editShip(o.id, { err });
  };
  const copyClientShip = async (o) => {
    noteShip(o.id, null);
    const err = await saveShipTo(o, shipFromClient(clientOf(o)), "✓ Copied the client's saved address.");
    if (err) noteShip(o.id, { ok: false, text: `⚠ ${err}` });
  };
  const shipCell = (o) => {
    const form = shipEdit[o.id];
    const note = shipNote[o.id];
    const busy = !!trackBusy[o.id];
    const saved = hasShipAddress(o);
    return (
      <div className="ship">
        {form ? (<>
          <span className="ship-head">Ship to</span>
          <div className="ship-form">
            {SHIP_FIELDS.map(([column, label]) => (
              <label key={column} className="ship-field">
                <span>{label}</span>
                <input type={column === "ship_phone" ? "tel" : "text"} autoComplete="off" value={form[column]}
                  onChange={e=>editShip(o.id, { [column]: e.target.value, err: "" })} />
              </label>
            ))}
          </div>
          <div className="ship-actions">
            <button className="tap track-save" onClick={()=>saveShipForm(o)} disabled={busy}>{trackBusy[o.id] === "ship" ? "Saving…" : "Save"}</button>
            <button className="tap track-btn" onClick={()=>closeShip(o.id)} disabled={busy}>Cancel</button>
          </div>
          {form.err && <p className="track-err" role="alert">⚠ {form.err}</p>}
        </>) : (
          <div className="track-saved">
            <span>Ship to:</span>
            {saved ? <span className="ship-lines">{shipLines(o).join(" · ")}</span> : <span className="ship-none">no address yet</span>}
            <button className="tap track-btn" onClick={()=>openShip(o)}>{saved ? "Edit" : "Add"}</button>
            {!saved && clientHasAddress(clientOf(o)) && (
              <button className="tap track-btn" onClick={()=>copyClientShip(o)} disabled={busy}>Use the client&apos;s saved address</button>
            )}
          </div>
        )}
        {note && <p className={note.ok ? "track-ok" : "track-err"} role="status">{note.text}</p>}
      </div>
    );
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
  const statusCounts = { all:orders.length, ...Object.fromEntries(ORDER_STATUSES.map(([v]) => [v, 0])) };
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
      {statusErr && <div className="warn-msg" role="alert" style={{marginBottom:12}}>⚠ {statusErr}</div>}

      {sendingInvoice && (
        <div className="crm-add-form" style={{maxWidth:"100%",borderTop:"3px solid var(--sidebar-bg)"}}>
          <h3 style={{marginBottom:4}}>Send Invoice to Client</h3>
          <p style={{color:"var(--muted)",marginBottom:20}}>Client receives an email with a link to the invoice. After they confirm it, the page shows the ways to pay you tick below.</p>
          <div className="crm-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32}}>

            {/* LEFT — Client */}
            <div>
              <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
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
                  <div className="fld"><label>Email *</label><input type="email" autoCapitalize="none" value={inv.newEmail} onChange={e=>iv("newEmail",e.target.value)} placeholder="jane@email.com" /></div>
                  <div className="fld"><label>Phone</label><input type="tel" value={inv.newPhone} onChange={e=>iv("newPhone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                </>
              )}
            </div>

            {/* RIGHT — Invoice Details */}
            <div>
              <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Invoice Details</p>
              <div className="fld">
                <label>Artwork / Item *</label>
                <select value="" onChange={e => {
                  const it = catalog.find(i => String(i.id) === e.target.value);
                  if (it) {
                    iv("item_title", it.title);
                    if (it.salePrice || it.price) { iv("amount", String(it.salePrice || it.price)); setInvAmountHint("350"); }
                    else { iv("amount", ""); setInvAmountHint("REQUEST — SET PRICE HERE"); }
                  }
                }} style={{marginBottom:6}}>
                  <option value="">— Select from catalog —</option>
                  {catalog.map(it => <option key={it.id} value={it.id}>{it.title}{!it.salePrice && !it.price ? " (No price set)" : ""}{it.isSold?" (Sold)":""}</option>)}
                </select>
                <input value={inv.item_title} onChange={e=>iv("item_title",e.target.value)} placeholder="Or type a custom item title" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="fld"><label>Amount (USD) *</label><input type="number" value={inv.amount} onChange={e=>iv("amount",e.target.value)} placeholder={invAmountHint} /></div>
                <div className="fld"><label>Due Date (optional)</label><input type="date" value={inv.due_date} onChange={e=>iv("due_date",e.target.value)} /></div>
              </div>
              <div className="fld"><label>Notes (optional)</label><textarea value={inv.notes} onChange={e=>iv("notes",e.target.value)} placeholder="Any notes visible to the client…" style={{minHeight:60}} /></div>
              <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"14px 0 12px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Payment Options (shown after client approves)</p>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* Zelle */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:500,color:"var(--ink)"}}>
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
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_venmo} onChange={e=>iv("pay_venmo",e.target.checked)} />
                    🔵 Venmo
                    <span style={{color:"var(--muted)",fontWeight:400}}>(handle from Settings)</span>
                  </label>
                </div>
                {/* Cash App */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_cashapp} onChange={e=>iv("pay_cashapp",e.target.checked)} />
                    💵 Cash App
                    <span style={{color:"var(--muted)",fontWeight:400}}>(cashtag from Settings)</span>
                  </label>
                </div>
                {/* Stripe */}
                <div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:500,color:"var(--ink)"}}>
                    <input type="checkbox" checked={inv.pay_stripe} onChange={e=>iv("pay_stripe",e.target.checked)} />
                    💳 Credit Card (Stripe)
                    <span style={{color:"var(--muted)",fontWeight:400}}>(client pays the exact amount, nothing to paste)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div style={{borderTop:"1px solid var(--border)",marginTop:24,paddingTop:20,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <button className="btn-p" onClick={sendInvoice} disabled={invSending}>
              {invSending ? "Sending…" : "Send Invoice →"}
            </button>
            <p style={{color:"var(--muted)",margin:0}}>Nothing is charged automatically. Check your accounts for the money.</p>
          </div>
        </div>
      )}

      {adding && (
        <div className="crm-add-form" style={{maxWidth:"100%"}}>
          <h3>New Order</h3>
          <div className="crm-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32,marginTop:8}}>

            {/* LEFT — Client */}
            <div>
              <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Client</p>
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
                  <p style={{color:"var(--muted)",marginBottom:12}}>⚠ Some info is missing for this client. Fill in what you know:</p>
                  {missingFields.includes("phone") && <div className="fld"><label>Phone</label><input type="tel" value={clientUpdate.phone||""} onChange={e=>cu("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>}
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
                    <div className="fld"><label>Email *</label><input type="email" autoCapitalize="none" value={manual.email} onChange={e=>m("email",e.target.value)} placeholder="jane@email.com" /></div>
                    <div className="fld"><label>Phone</label><input type="tel" value={manual.phone} onChange={e=>m("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
                  </div>
                  <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",margin:"12px 0 10px",borderBottom:"1px solid var(--border)",paddingBottom:8}}>Shipping Address</p>
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
              <p style={{letterSpacing:".14em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>Order Details</p>
              <div className="fld">
                <label>Artwork / Item *</label>
                <select value="" onChange={e => {
                  const it = catalog.find(i => String(i.id) === e.target.value);
                  if (it) {
                    f("item_title", it.title);
                    if (it.salePrice || it.price) { f("amount", String(it.salePrice || it.price)); setFormAmountHint("350"); }
                    else { f("amount", ""); setFormAmountHint("REQUEST — SET PRICE HERE"); }
                  }
                }} style={{marginBottom:6}}>
                  <option value="">— Select from catalog —</option>
                  {catalog.map(it => <option key={it.id} value={it.id}>{it.title}{!it.salePrice && !it.price ? " (No price set)" : ""}{it.isSold?" (Sold)":""}</option>)}
                </select>
                <input value={form.item_title} onChange={e=>f("item_title",e.target.value)} placeholder="Or type a custom item title" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="fld"><label>Amount (USD)</label><input type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder={formAmountHint} /></div>
                <div className="fld"><label>Status</label>
                  <select value={form.status} onChange={e=>pickNewOrderStatus(e.target.value)}>
                    {ORDER_STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
              </div>
              {asking("paid", NEW_ORDER) && (
                <div className="fld">{paidByAsk(null, method => { setForm(fm => ({...fm, status:"paid", paid_method:method})); setAsk(null); })}</div>
              )}
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
        <div className="chip-row" style={{display:"flex",gap:4,flexShrink:0}}>
          {[["all","All"], ...ORDER_STATUSES].map(([val,label])=>(
            <button key={val} className="tap" onClick={()=>setStatusFilter(val)}
              style={{border:`1px solid ${statusFilter===val?"var(--ink)":"var(--border)"}`,background:statusFilter===val?"var(--ink)":"none",color:statusFilter===val?"#fff":"var(--muted)",padding:"5px 12px",letterSpacing:".08em",cursor:"pointer"}}>
              {label}{statusFilter!==val&&statusCounts[val]!==undefined?` (${statusCounts[val]})`:statusFilter===val?` (${statusCounts[val]})`:""}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No orders match this filter.</p>
        : <table className="crm-table crm-cards orders-table">
            <thead><tr><th>Ref</th><th>Client</th><th>Artwork</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{filtered.map(o=>(
              <Fragment key={o.id}>
                <tr className="has-track">
                  <td data-label="Ref" className="crm-wide" style={{fontFamily:"monospace",color:"var(--muted)",whiteSpace:"nowrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>{o.invoice_token ? <>{invoiceNumber(o)}<CopyButton text={invoiceNumber(o)} /></> : `#${String(o.id).slice(0,8).toUpperCase()}`}</div>
                    {o.invoice_token && (isPaid(o.status) ? (
                      <div style={{fontSize:16,letterSpacing:".08em",marginTop:4,color:"#fff",background:"#2d6a4f",border:"1px solid #2d6a4f",padding:"2px 8px",display:"inline-block"}}>✓ PAID</div>
                    ) : (
                      <div style={{fontSize:16,letterSpacing:".08em",marginTop:4,color:o.invoice_approved?"#2d6a4f":"#7a5b14",background:o.invoice_approved?"#e8f5ee":"#fff8ec",border:`1px solid ${o.invoice_approved?"#a3d4b3":"#e8d5a0"}`,padding:"2px 8px",display:"inline-block"}}>
                        {o.invoice_approved ? "✓ CLIENT APPROVED" : "INVOICE SENT"}
                      </div>
                    ))}
                  </td>
                  <td data-label="Client" className="crm-wide">
                    {(o.client_name || clientName(o.client_email)) && <div style={{fontWeight:500}}>{o.client_name || clientName(o.client_email)}</div>}
                    <div style={{color:"var(--muted)"}}>{o.client_email}</div>
                  </td>
                  <td data-label="Artwork" className="crm-wide">{o.item_title}</td>
                  <td data-label="Amount">{o.amount?`$${Number(o.amount).toLocaleString()}`:"—"}</td>
                  <td data-label="Status">
                    <select value={o.status||"pending"} onChange={e=>pickStatus(o,e.target.value)} aria-label="Status"
                      style={{border:"1px solid var(--border)",padding:"4px 8px",background:"#fff",cursor:"pointer",fontSize:16,fontFamily:"inherit",color:"var(--ink)"}}>
                      {ORDER_STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    {/* Mark paid: two taps, because it emails the client a receipt. The second
                        tap says how the money came (Andy, 2026-11-17: the invoice says "Paid by ...").
                        Picking Paid in the menu above opens the same question, from any status. */}
                    {asking("paid", o.id) ? paidByAsk(o.payment_methods, method => updateStatus(o.id,"paid",method))
                      : canMarkPaid(o.status) && (
                      <button className="tap mark-paid" onClick={()=>pickStatus(o,"paid")}>✓ Mark paid</button>
                    )}
                  </td>
                  <td data-label="Date">{o.created_at?new Date(o.created_at).toLocaleDateString():"—"}</td>
                  <td className="crm-wide">
                    {/* The row's buttons at 16px, the same as its questions (they had no size of
                        their own, so the browser drew them at 13px). */}
                    <div className="order-btns" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {o.invoice_token && (<>
                        <a className="tap" href={invoiceLink(window.location.origin, o.invoice_token, { shopView: true })} target="_blank" rel="noopener noreferrer"
                          style={{background:"none",border:"1px solid var(--border)",padding:"3px 8px",color:"var(--muted)",textDecoration:"none",display:"inline-block"}}>
                          👁 Open
                        </a>
                        <button className="tap" onClick={()=>setAsk({ kind:"link", id:o.id })}
                          style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",padding:"3px 8px",color:"var(--muted)"}}>
                          🔗 Link
                        </button>
                        <button className="tap" onClick={()=>setAsk({ kind:"resend", id:o.id })} disabled={resending[o.id]}
                          style={{background:"none",border:"1px solid var(--border)",cursor:resending[o.id]?"not-allowed":"pointer",padding:"3px 8px",color:"var(--muted)",opacity:resending[o.id]?0.5:1}}>
                          {resending[o.id] ? "…" : "✉ Resend"}
                        </button>
                      </>)}
                      <button className="btn-d" onClick={()=>setAsk({ kind:"delete", id:o.id })}>Delete</button>
                      {/* Order details (notes) last, Open first: Andy, 2026-11-17 */}
                      {o.notes && <button className="tap" aria-label="Order details" onClick={()=>toggleExpand(o.id)} style={{background:"none",border:"1px solid var(--border)",cursor:"pointer",padding:"3px 8px",color:"var(--muted)"}}>{expanded[o.id]?"▲":"▼"}</button>}
                    </div>
                    {asking("resend", o.id) && resendAsk(o)}
                    {asking("link", o.id) && linkAsk(o)}
                    {asking("delete", o.id) && deleteAsk(o)}
                  </td>
                </tr>
                {/* Shipping, under the order it belongs to: where it goes (every order), then how it
                    went out (Paid, Shipped and Delivered, since the shop ships once the money is
                    in, and any order while Shipped is being picked). */}
                <tr className="crm-track">
                  <td colSpan={7} style={{background:"#fffbf5",padding:"10px 14px 14px"}}>
                    {shipCell(o)}
                    {showsTracking(o) && trackCell(o)}
                  </td>
                </tr>
                {expanded[o.id] && o.notes && (
                  <tr className="crm-detail">
                    <td colSpan={7} style={{background:"#fffbf5",padding:"10px 14px 14px",borderTop:"none"}}>
                      <p style={{letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:6}}>Order Details</p>
                      <p style={{color:"var(--ink)",lineHeight:1.7}}>{o.notes}</p>
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
