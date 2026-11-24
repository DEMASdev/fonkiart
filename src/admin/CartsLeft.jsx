import { useEffect, useRef, useState } from "react";
import { adminAction } from "../lib/adminDb";
import { doneOpenList, wantsOpenList } from "../lib/adminLink";
import { agoWords } from "../lib/agoWords";
import ArtThumb from "./ArtThumb";
import CouponAsk from "./CouponAsk";

// "Left in the cart" (Andy, 2026-11-23, "all 8": nobody saw who left art in their cart), under "Didn't
// finish paying" on Admin -> Orders: everyone who gave their email or signed in, put art in their
// cart and has ordered nothing since (api/_lib/cartCoupon.js): who, their pieces, how long ago, and
// "Send a coupon", with how much off, asked on the row itself as on that list (CouponAsk.jsx). Only
// on Andy's tap, and ONE per person in 30 days: once it has gone, a plain line says when and how much;
// someone who asked for no more coupons ("Unsubscribe") has a plain line saying so.
//  search: what is typed in Orders' search box. show: false while the orders are loading, or the
//  page is filtered to another status. percent: the shop's %, as Admin has it. Opened from the
//  morning email's link (src/lib/adminLink.js): open, in sight.
const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// A long email may wrap, and it is easier to read broken just before the @.
const emailText = (email) => { const at = email.indexOf("@"); return at > 0 ? <>{email.slice(0, at)}<wbr />{email.slice(at)}</> : email; };

export default function CartsLeft({ search = "", show = true, percent }) {
  const [fromEmail] = useState(() => wantsOpenList("carts"));
  const [open, setOpen] = useState(fromEmail);
  const [list, setList] = useState(null); // { carts, choose, percent }, as the server says; null until it has
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(null); // the email being asked about
  const [busy, setBusy] = useState({});       // by email: its coupon is on its way
  const going = useRef(new Set());            // the same, known at once: two taps, one email
  const [notes, setNotes] = useState({});     // by email: what the last tap did, { ok, text }
  const box = useRef(null);
  const seen = useRef(false);

  useEffect(() => {
    let live = true;
    adminAction("carts-left")
      .then(r => { if (live) setList({ carts: r.carts || [], choose: r.choose === true, percent: r.percent }); })
      .catch(e => { console.warn("carts left:", e?.message || e); if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const ready = show && (!!list || failed);
  useEffect(() => {
    if (!fromEmail || !ready || seen.current) return;
    seen.current = true;
    doneOpenList();
    box.current?.scrollIntoView({ block: "start" });
  }, [fromEmail, ready]);

  if (!ready) return null;
  if (failed) return (
    <section className="o-unfinished" aria-label="Left in the cart" ref={box}>
      <p className="track-err" role="status">Couldn&apos;t load who left art in their cart. Reload the page to try again.</p>
    </section>
  );
  const q = search.trim().toLowerCase();
  const carts = list.carts.filter(c => !q || [c.email, c.name, ...c.pieces.map(p => p.title)].some(t => String(t || "").toLowerCase().includes(q)));
  if (!carts.length) return null;

  const note = (email, v) => setNotes(n => ({ ...n, [email]: v }));
  const mark = (email, v) => setList(l => ({ ...l, carts: l.carts.map(c => c.email === email ? { ...c, ...v } : c) }));
  const ask = (c) => { note(c.email, null); setAsking(c.email); };
  // choice: { percent } or { dollars }, or {} for what their code gives, the shop's % (CouponAsk.jsx).
  const send = async (c, choice) => {
    setAsking(null);
    if (going.current.has(c.email)) return;
    going.current.add(c.email);
    setBusy(b => ({ ...b, [c.email]: true }));
    try {
      const r = await adminAction("cart-coupon-send", { email: c.email, ...choice });
      if (r.sent) {
        mark(c.email, { sentAt: r.sentAt, said: r.said, used: false, code: r.code });
        note(c.email, r.noted
          ? { ok: true, text: `✓ Coupon ${r.code} (${r.said}) sent to ${r.to}.` }
          : { ok: false, text: `Sent to ${r.to}, but the shop could not save that it was sent. After a reload this row may show the button again: don't send a second one.` });
      } else if (r.why === "sent") {
        mark(c.email, { sentAt: r.sentAt, said: r.said });
        note(c.email, { ok: true, text: `A coupon already went to them on ${day(r.sentAt)}, so nothing more was sent.` });
      } else if (r.why === "used") {
        mark(c.email, { used: true, code: r.code });
        note(c.email, { ok: false, text: `Their coupon ${r.code} was already used, so nothing was sent.` });
      } else if (r.why === "less") {
        note(c.email, { ok: false, text: `Their coupon already gives ${r.now}, so it can't be less. Nothing was sent.` });
      } else if (r.why === "out") {
        mark(c.email, { out: true });
        note(c.email, { ok: false, text: "They asked not to get coupons, so nothing was sent." });
      } else {
        note(c.email, { ok: false, text: "Their cart has changed since (bought, emptied or sold), so nothing was sent." });
      }
    } catch (e) {
      note(c.email, { ok: false, text: `Could not send the coupon (${e?.message || "unknown error"}).` });
    } finally { going.current.delete(c.email); setBusy(b => ({ ...b, [c.email]: false })); }
  };
  const askBox = (c) => c.used ? (
    <div className="mark-paid-ask">
      <span>Their coupon {c.code} was already used, so there is nothing to send. To send it, reset it under Leads first.</span>
      <button className="tap mark-paid-no" onClick={() => setAsking(null)}>Close</button>
    </div>
  ) : <CouponAsk to={c.email} coupon={c} shop={list} percent={percent} onSend={choice => send(c, choice)} onCancel={() => setAsking(null)} />;
  // Its place on a row: the button, until their coupon has gone; then a plain line saying when and how
  // much (no button: never a second), or that they asked for no more. Their code already used: the
  // button says so, and its tap only explains.
  const couponCell = (c) => c.sentAt
    ? <span className="o-cart-sent">Coupon sent {day(c.sentAt)}{c.said && ` · ${c.said}`}</span>
    : c.out ? <span className="o-cart-sent">Asked not to get coupons</span>
    : (
      <button className="tap o-btn o-coupon" aria-expanded={asking === c.email} onClick={() => ask(c)} disabled={!!busy[c.email]}>
        {busy[c.email] ? "Sending…" : c.used ? "Coupon already used" : "✉ Send a coupon"}
      </button>
    );
  const row = (c) => {
    const said = notes[c.email];
    return (
      <li key={c.email} className="o-cart">
        <div className="o-cart-row">
          <div className="o-cart-who">
            {c.name && <div className="o-name">{c.name}</div>}
            <div className="o-email">{emailText(c.email)}</div>
            <div className="o-date">{agoWords(c.at)}</div>
          </div>
          <ul className="o-cart-pieces">
            {c.pieces.map(p => (
              <li key={p.id} className="o-art-in">
                <ArtThumb key={p.image || ""} art={p} />
                <div className="o-art-text">
                  <div className="o-title">{p.title || "Untitled"}</div>
                  {p.price ? <div className="o-money">{money(p.price)}</div> : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="o-cart-end">
            {c.pieces.length > 1 && c.pieces.every(p => p.price) && <div className="o-cart-total">Total <span className="o-money">{money(c.total)}</span></div>}
            {couponCell(c)}
          </div>
        </div>
        {asking === c.email && <div className="o-panel">{askBox(c)}</div>}
        {said && <p className={said.ok ? "o-cart-ok" : "track-err"} role="status">{said.text}</p>}
      </li>
    );
  };
  return (
    <section className="o-unfinished" aria-label="Left in the cart" ref={box}>
      <button className="tap o-unfinished-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="o-unfinished-title">Left in the cart</span>
        <span className="o-chip-n">{carts.length}</span>
        <span className="o-unfinished-arrow" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <p className="o-unfinished-note">They gave their email or signed in, put art in their cart and have not ordered. Each one shows here for 30 days.</p>
      {open && <ul className="o-cart-list">{carts.map(row)}</ul>}
    </section>
  );
}
