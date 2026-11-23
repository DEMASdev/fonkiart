import { useState, useEffect, useRef, Fragment } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { adminDb as supabase } from "../lib/adminDb";
import { sendEmail } from "../utils/helpers";
import { invoiceEmail, statusEmailFor } from "../lib/adminEmails";
import { invoiceLink, findArtwork } from "../lib/invoiceView";
import { invoiceNumber } from "../lib/invoiceNumber";
import CopyButton from "../components/CopyButton";
import ArtThumb from "./ArtThumb";
import ShipAddressDialog from "./ShipAddressDialog";
import { ORDER_STATUSES, isPaid, canMarkPaid, markPaidChoices, asksPaidMethod, statusChange, resendQuestion, paidPick, statusOptions } from "../lib/orderStatus";
import { CARRIERS, NO_TRACKING, PICKUP_FIELDS, PICKUP_LABEL, isPickup, orderTracking, orderTrackingLink, hasTrackingSaved, carrierLabel, trackingFields, trackingSave, withNumber } from "../lib/tracking";
import { hasShipAddress, shipLines } from "../lib/shipAddress";
import { needsAddress, shipShort, shipPrefill, orderRef, approvalNote, unfinishedCard, unfinishedThisWeek } from "../lib/orderRow";
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
  // Shipping address (Andy, 2026-11-17). shipFor: the order whose address pop-up is open, or null
  // (ShipAddressDialog). shipNote: what the last save did, by order id, { ok, text }.
  const [shipFor, setShipFor] = useState(null);
  const [shipNote, setShipNote] = useState({});
  // The order whose "More" menu (Link, Resend, Delete) is open, or null.
  const [menuFor, setMenuFor] = useState(null);
  const menuRef = useRef(null);
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
  // The "More" menu closes on a tap anywhere else, or on Escape (back to its button).
  useEffect(() => {
    if (menuFor == null) return;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuFor(null); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      menuRef.current?.querySelector("button")?.focus();
      setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuFor]);

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
      await sendEmail({ to: email, subject: `Invoice ${invoiceNumber(order)} — ${inv.item_title} · Fonkiart`, ...buildInvoiceEmail(order, link), pieces: [order.item_title] });
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
      await sendEmail({ to: order.client_email, subject: `Invoice ${invoiceNumber(order)} — ${order.item_title} · Fonkiart`, ...buildInvoiceEmail(order, link), pieces: [order.item_title] });
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
      await sendEmail({ to: order.client_email, subject: m.subject, heading: m.heading, content: m.content, pieces: [order.item_title] });
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
  // Typing the number fills the carrier menu in from it (withNumber, src/lib/tracking.js).
  const typeNumber = (id, number) => setTrack(t => ({ ...t, [id]: withNumber(t[id], number) }));
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
  // ── Admin -> Orders, one clean line per order (Andy, 2026-11-18: "it's a mess it's too much it's
  // not intuitive — rethink dig deeper — should have an orange flag saying needs address, also the
  // add button should be there and the shipped with carrier should be in a column"). Each fact
  // shows once, in its own column: the artwork (picture, title, invoice number), the client, the
  // amount and date, the Status, "Ship to" (the orange "Needs address" flag and Add, or the short
  // address and Edit), "Shipping" (the "Shipped with a carrier" tick, or the carrier and its live
  // tracking link, or Pickup / hand delivery), then Open, More (Link, Resend, Delete) and Notes.
  // Every question and form opens on a panel under its own order, and only while it is open.

  // "Shipping": the tick box while the order still has to go out (the money is in, or Shipped is
  // being answered), the tracking once it is saved, a quiet dash before the money is in.
  const shippingCell = (o) => {
    const draft = track[o.id];
    const shipAsked = asking("ship", o.id) || asking("pickup", o.id);
    if (!draft && hasTrackingSaved(o)) {
      const link = orderTrackingLink(o);
      const { carrier, number } = orderTracking(o);
      // A web address may break after its dots (track.<wbr>example.<wbr>com), never inside a word.
      const shown = carrier === "other"
        ? (link ? new URL(link).hostname.split(".").flatMap((part, i) => i ? [".", <wbr key={i} />, part] : [part]) : "")
        : number;
      return (
        <div className="o-track">
          <span className="o-carrier">{isPickup(o) ? PICKUP_LABEL : carrier === "other" ? "Tracking link" : carrierLabel(carrier) || "Tracking"}</span>
          {!isPickup(o) && shown && (link
            ? <a className="track-link" href={link} target="_blank" rel="noopener noreferrer">{shown} ↗</a>
            : <span className="o-track-no">{shown}</span>)}
          <span className="o-inline-btns">
            <button className="tap o-link" onClick={()=>openTrack(o)}>Edit</button>
            <button className="tap o-link" onClick={()=>{ noteTrack(o.id, null); setAsk({ kind:"untrack", id:o.id }); }}>Remove</button>
          </span>
        </div>
      );
    }
    if (draft || isPaid(o.status) || shipAsked || fromMenu(o)) {
      // Ticking it while "How did it go out?" is open answers it: Carrier.
      const onTick = () => draft ? closeTrack(o.id) : shipAsked ? shipByCarrier(o) : openTrack(o);
      return <label className="track-tick"><input type="checkbox" checked={!!draft} onChange={onTick} />Shipped with a carrier</label>;
    }
    return <span className="o-quiet" title="Not paid yet">—</span>;
  };
  // The panel's shipping questions and the tracking form (the panel opens under the order).
  const trackPanel = (o) => {
    const draft = track[o.id];
    const doing = trackBusy[o.id];
    const busy = !!doing;
    const sending = doing === "send" ? "Sending…" : "Send";
    const notNow = doing === "save" ? "Saving…" : "Not now";
    return (<>
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
      ) : draft ? (
        <div className="track">
          <span className="o-panel-head">{hasTrackingSaved(o) && !fromMenu(o) ? "Edit the tracking" : "Shipped with a carrier"}</span>
          <div className="track-form">
            <select aria-label="Carrier" value={draft.carrier} onChange={e=>editTrack(o.id, { carrier:e.target.value, err:"", guessed:false })}>
              <option value="">Carrier…</option>
              {CARRIERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            {draft.carrier === "other"
              ? <input type="url" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Tracking link" placeholder="Tracking link (https://…)"
                  value={draft.url} onChange={e=>editTrack(o.id, { url:e.target.value, err:"" })} />
              : <input type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Tracking number" placeholder="Tracking number"
                  value={draft.number} onChange={e=>typeNumber(o.id, e.target.value)} />}
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
        </div>
      ) : null}
      {!draft && asking("untrack", o.id) && (
        <div className="mark-paid-ask">
          <span>{isPickup(o) ? `Remove “${PICKUP_LABEL}” from this order?` : "Remove the tracking from this order?"}</span>
          <button className="tap ask-danger" onClick={()=>clearTrack(o)} disabled={busy}>{doing === "clear" ? "Removing…" : "Remove"}</button>
          <button className="tap mark-paid-no" onClick={()=>setAsk(null)}>Cancel</button>
        </div>
      )}
    </>);
  };
  // ── Shipping address: "Ship to", on every order (Andy, 2026-11-17: "also make sure in the
  // admin and for the user can add the shipping address !"). Add or Edit opens the address pop-up,
  // filled in with what is known: the client's saved address (Admin -> Clients) or their other
  // orders (shipPrefill; this is what "Use the client's saved address" did in one tap). No email.
  // The client can also add it on their invoice page.
  const clientOf = (o) => clients.find(c => String(c.email || "").toLowerCase() === String(o.client_email || "").toLowerCase());
  const noteShip = (id, note) => setShipNote(n => ({ ...n, [id]: note }));
  const openShip = (o) => { noteShip(o.id, null); setMenuFor(null); setShipFor(o.id); };
  const closeShip = () => setShipFor(null);
  // Saves the address; null when it worked (the pop-up closes), or what went wrong.
  const saveShipTo = async (o, fields, done) => {
    if (!startBusy(o.id, "ship")) return null;
    try {
      const { error } = await supabase.from("Orders").update(fields).eq("id", o.id);
      if (error) return `Could not save the address (${error.message || "unknown error"}).`;
      setOrders(list => list.map(x => x.id === o.id ? { ...x, ...fields } : x));
      closeShip();
      noteShip(o.id, { ok: true, text: done });
      return null;
    } finally { endBusy(o.id); }
  };
  // "Ship to": the orange flag and Add while the order still has to go out and has no address
  // (needsAddress, src/lib/orderRow.js), else the short address and Edit (the whole address is in
  // the pop-up, and in the tooltip), else a quiet "No address" and Add.
  const shipToCell = (o) => needsAddress(o) ? (
    <div className="o-shipto o-shipto-flag">
      <span className="order-flag"><span className="order-flag-dot" aria-hidden="true" />Needs address</span>
      <button className="tap o-btn o-btn-add" aria-label="Add the shipping address" onClick={()=>openShip(o)}>Add</button>
    </div>
  ) : hasShipAddress(o) ? (
    <div className="o-shipto-text">
      <span className="o-ship-short" title={shipLines(o).join("\n")}>{shipShort(o)}</span>{" "}
      <button className="tap o-link" aria-label="Edit the shipping address" onClick={()=>openShip(o)}>Edit</button>
    </div>
  ) : (
    <div className="o-shipto-text">
      <span className="o-quiet">No address</span>{" "}
      <button className="tap o-link" aria-label="Add the shipping address" onClick={()=>openShip(o)}>Add</button>
    </div>
  );
  // 👁 Open stays in sight; Link, Resend and Delete (last, in red) wait in "More".
  const pickFromMenu = (kind, o) => { setMenuFor(null); setAsk({ kind, id:o.id }); };
  const actionsCell = (o) => (
    <div className="o-actions-in">
      {o.invoice_token && (
        <a className="tap o-btn" href={invoiceLink(window.location.origin, o.invoice_token, { shopView: true })} target="_blank" rel="noopener noreferrer">👁 Open</a>
      )}
      <span className="o-more" ref={menuFor === o.id ? menuRef : undefined}>
        <button className="tap o-btn o-more-btn" aria-expanded={menuFor === o.id} onClick={()=>setMenuFor(m => m === o.id ? null : o.id)}>More</button>
        {menuFor === o.id && (
          <span className="o-menu">
            {o.invoice_token && <button className="tap" onClick={()=>pickFromMenu("link", o)}>🔗 Link</button>}
            {o.invoice_token && <button className="tap" onClick={()=>pickFromMenu("resend", o)} disabled={resending[o.id]}>{resending[o.id] ? "Sending…" : "✉ Resend"}</button>}
            <button className="tap o-menu-danger" onClick={()=>pickFromMenu("delete", o)}>Delete</button>
          </span>
        )}
      </span>
      {/* Order details (notes) last, Open first: Andy, 2026-11-17 */}
      {o.notes && <button className="tap o-btn o-notes-btn" aria-expanded={!!expanded[o.id]} onClick={()=>toggleExpand(o.id)}>Notes</button>}
    </div>
  );
  // The panel under an order: open only while one of its questions, forms, notes or messages is.
  const panelOpen = (o) => ask?.id === o.id || !!track[o.id] || !!shipNote[o.id] || !!trackNote[o.id] || (!!expanded[o.id] && !!o.notes);
  const panel = (o) => {
    const notes = [shipNote[o.id], trackNote[o.id]].filter(Boolean);
    return (
      <div className="o-panel">
        {asking("paid", o.id) && paidByAsk(o.payment_methods, method => updateStatus(o.id, "paid", method))}
        {asking("resend", o.id) && resendAsk(o)}
        {asking("link", o.id) && linkAsk(o)}
        {asking("delete", o.id) && deleteAsk(o)}
        {trackPanel(o)}
        {notes.map((note, i) => <p key={i} className={note.ok ? "track-ok" : "track-err"} role="status">{note.text}</p>)}
        {expanded[o.id] && o.notes && (
          <div className="o-notes">
            <p className="o-panel-head">Order details</p>
            <p className="o-notes-text">{o.notes}</p>
          </div>
        )}
      </div>
    );
  };
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(prev => ({...prev,[id]:!prev[id]}));
  const clientName = (email) => clients.find(c => c.email === email)?.name;
  const matches = (o) => o.client_email?.toLowerCase().includes(search.toLowerCase()) ||
    o.item_title?.toLowerCase().includes(search.toLowerCase()) ||
    clientName(o.client_email)?.toLowerCase().includes(search.toLowerCase());
  // "Didn't finish paying" (Andy, 2026-11-20, "2am"): a Cart card checkout the buyer started and
  // never paid (unfinishedCard, src/lib/orderRow.js) is not in the main list, its counts or its
  // chips. It has its own small list under it for a week, so Andy can follow up with the buyer;
  // after that it shows in neither. Hidden only: nothing is deleted.
  const shop = orders.filter(o => !unfinishedCard(o));
  const filtered = shop.filter(o => (statusFilter === "all" || o.status === statusFilter) && matches(o));
  const unpaid = orders.filter(o => unfinishedThisWeek(o) && matches(o));
  const [showUnpaid, setShowUnpaid] = useState(false);
  const statusCounts = { all:shop.length, ...Object.fromEntries(ORDER_STATUSES.map(([v]) => [v, 0])) };
  shop.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
  const shipOrder = shipFor == null ? null : orders.find(o => o.id === shipFor) || null;
  const money = (o) => o.amount ? `$${Number(o.amount).toLocaleString()}` : "—";
  const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}) : "";
  // A long email may wrap, and it is easier to read broken just before the @.
  const emailText = (email) => { const s = String(email || ""), at = s.indexOf("@"); return at > 0 ? <>{s.slice(0, at)}<wbr />{s.slice(at)}</> : s; };
  // The orders' table: the main list, and the small "Didn't finish paying" list, in the same rows.
  const ordersTable = (list) => (
    <table className="crm-table crm-cards orders-table">
      <thead><tr><th>Artwork</th><th>Client</th><th>Amount</th><th>Status</th><th>Ship to</th><th>Shipping</th><th aria-label="Open, More and Notes"></th></tr></thead>
      <tbody>{list.map(o=>{
        const status = o.status || "pending";
        const name = o.client_name || clientName(o.client_email);
        const open = panelOpen(o);
        const art = findArtwork(catalog, o.item_title);
        return (
        <Fragment key={o.id}>
          <tr className={`order-row${open ? " is-open" : ""}`} data-order={o.id}>
            <td data-label="Artwork" className="crm-wide o-art">
              <div className="o-art-in">
                <ArtThumb key={art?.image || ""} art={art} />
                <div className="o-art-text">
                  <div className="o-title">{o.item_title || "Untitled"}</div>
                  <div className="o-ref">{orderRef(o)}{o.invoice_token && <CopyButton text={invoiceNumber(o)} />}</div>
                </div>
              </div>
            </td>
            <td data-label="Client" className="crm-wide o-client">
              {name && <div className="o-name">{name}</div>}
              <div className="o-email">{emailText(o.client_email)}</div>
            </td>
            <td data-label="Amount" className="o-amount">
              <div className="o-money">{money(o)}</div>
              {o.created_at && <div className="o-date">{shortDate(o.created_at)}</div>}
            </td>
            <td data-label="Status" className="o-status">
              <span className="o-pill" data-status={status}>
                <select value={status} onChange={e=>pickStatus(o,e.target.value)} aria-label="Status">
                  {statusOptions(status).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </span>
              {/* Mark paid: two taps, because it emails the client a receipt. The second
                  tap says how the money came (Andy, 2026-11-17: the invoice says "Paid by ...").
                  Picking Paid in the menu above opens the same question, from any status. */}
              {!asking("paid", o.id) && canMarkPaid(o.status) && (
                <button className="tap mark-paid" onClick={()=>pickStatus(o,"paid")}>✓ Mark paid</button>
              )}
              {approvalNote(o) && <div className="o-note">{approvalNote(o)}</div>}
            </td>
            <td data-label="Ship to" className="crm-wide o-shipto-cell">{shipToCell(o)}</td>
            <td data-label="Shipping" className="crm-wide o-shipping">{shippingCell(o)}</td>
            <td data-label="Actions" className="crm-wide o-actions">{actionsCell(o)}</td>
          </tr>
          {open && (
            <tr className="order-panel" data-order={o.id}>
              <td colSpan={7}>{panel(o)}</td>
            </tr>
          )}
        </Fragment>
        );
      })}</tbody>
    </table>
  );
  return (
    <div className="crm-wrap orders-tab">
      <div className="crm-header">
        <h2 className="crm-title">Orders <span className="o-count">({shop.length})</span></h2>
        <div className="o-head-btns">
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
                    💜 Zelle
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
                    💰 Cash App
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
      <div className="o-toolbar">
        <input className="crm-search" type="search" aria-label="Search orders" placeholder="Search by name, email or artwork…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div className="o-chips">
          {[["all","All"], ...ORDER_STATUSES].map(([val,label])=>(
            <button key={val} className="tap o-chip" aria-pressed={statusFilter===val} onClick={()=>setStatusFilter(val)}>
              {label}<span className="o-chip-n">{statusCounts[val] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="crm-empty">Loading…</p>
        : filtered.length===0 ? <p className="crm-empty">No orders match this filter.</p>
        : ordersTable(filtered)}
      {!loading && unpaid.length > 0 && (statusFilter === "all" || statusFilter === "pending") && (
        <section className="o-unfinished" aria-label="Didn't finish paying">
          <button className="tap o-unfinished-head" aria-expanded={showUnpaid} onClick={() => setShowUnpaid(v => !v)}>
            <span className="o-unfinished-title">Didn't finish paying</span>
            <span className="o-chip-n">{unpaid.length}</span>
            <span className="o-unfinished-arrow" aria-hidden="true">{showUnpaid ? "▴" : "▾"}</span>
          </button>
          <p className="o-unfinished-note">Started paying by card, Klarna or bank transfer and never finished. Each one shows here for a week, then is hidden. Nothing is deleted.</p>
          {showUnpaid && ordersTable(unpaid)}
        </section>
      )}
      {shipOrder && (
        <ShipAddressDialog key={shipOrder.id} order={shipOrder} art={findArtwork(catalog, shipOrder.item_title)}
          prefill={shipPrefill(shipOrder, { client: clientOf(shipOrder), orders })} clientName={clientLabel(shipOrder)}
          busy={!!trackBusy[shipOrder.id]} onSave={fields => saveShipTo(shipOrder, fields, "✓ Address saved.")} onClose={closeShip} />
      )}
    </div>
  );
}
