import { useEffect, useRef, useState } from "react";
import { SHIP_FIELDS, shipFields } from "../lib/shipAddress";
import { neededFields, orderRef } from "../lib/orderRow";
import ArtThumb from "./ArtThumb";

// The shipping address pop-up of Admin -> Orders (Andy, 2026-11-18: "when click add shipping
// address a pop up should come up with prefilled info of the shipping information .... customer
// name , phone , etc if any and the blank spaces needed to be filled"). Built into the page, never
// a browser pop-up. The Add button beside the orange "Needs address" flag opens it, and so does
// Edit.
//  - It opens filled in with everything already known (shipPrefill, src/lib/orderRow.js), says
//    where that came from, and marks the required boxes still empty with "Needed".
//  - The cursor starts in the first empty box.
//  - Save checks it (shipFields) and hands it to onSave, which returns null once it is saved (the
//    page then closes this) or what went wrong. Enter in a box saves too.
//  - Cancel, Escape or a click outside close it without saving. Tab stays inside it.
// On a phone it fills the screen, with Save and Cancel always in reach at the bottom (index.css).
const WIDE = new Set(["ship_name", "ship_address"]);
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

export default function ShipAddressDialog({ order, art, prefill, clientName, busy, onSave, onClose }) {
  const [form, setForm] = useState(prefill.form);
  const [err, setErr] = useState("");
  const box = useRef(null);
  const downOnBg = useRef(false);
  const needed = neededFields(SHIP_FIELDS, form);
  const labelOf = (column) => SHIP_FIELDS.find(([c]) => c === column)?.[1] ?? column;

  // The cursor in the first empty box (the first box when all are filled in); back where it was
  // when the pop-up closes.
  useEffect(() => {
    const back = document.activeElement;
    const inputs = [...box.current.querySelectorAll("input")];
    (inputs.find(i => !i.value.trim()) || inputs[0])?.focus();
    return () => { if (back?.isConnected && typeof back.focus === "function") back.focus(); };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const items = [...box.current.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !box.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const { fields, problem } = shipFields(form);
    if (problem) {
      setErr(problem);
      box.current.querySelector(".is-needed input")?.focus();
      return;
    }
    const failed = await onSave(fields);
    if (failed) setErr(failed);
  };

  const sources = [];
  if (prefill.from.client) sources.push(`${clientName}'s saved details (Clients)`);
  if (prefill.from.orders.length === 1) sources.push(`their order of ${fmtDate(prefill.from.orders[0].created_at)}`);
  else if (prefill.from.orders.length > 1) sources.push("their earlier orders");
  const editing = !!String(order.ship_address || "").trim();

  return (
    <div className="ship-dlg-bg lock-scroll" onKeyDown={onKeyDown}
      onPointerDown={e => { downOnBg.current = e.target === e.currentTarget; }}
      onClick={e => { if (downOnBg.current && e.target === e.currentTarget) onClose(); }}>
      <div className="ship-dlg" role="dialog" aria-modal="true" aria-labelledby="ship-dlg-title" tabIndex={-1} ref={box}>
        <div className="ship-dlg-head">
          <ArtThumb key={art?.image || ""} art={art} size="big" />
          <div className="ship-dlg-head-text">
            <h2 id="ship-dlg-title" className="ship-dlg-title">{editing ? "Edit the shipping address" : "Add the shipping address"}</h2>
            <p className="ship-dlg-piece">{order.item_title || "Untitled"}</p>
            <p className="ship-dlg-who">
              <span>{orderRef(order)}</span>
              {clientName && <span>{clientName}</span>}
              {order.client_email && <span className="ship-dlg-email">{order.client_email}</span>}
            </p>
          </div>
        </div>
        {sources.length > 0 && <p className="ship-dlg-from">Filled in from {sources.join(" and ")}. Please check it.</p>}
        {needed.length > 0 && <p className="ship-dlg-todo">Still needed: {needed.map(labelOf).join(", ")}.</p>}
        <form className="ship-dlg-body" onSubmit={save} noValidate>
          <div className="ship-dlg-form">
            {SHIP_FIELDS.map(([column, label, , required]) => {
              const empty = needed.includes(column);
              return (
                <label key={column} className={`ship-dlg-field${WIDE.has(column) ? " wide" : ""}${empty ? " is-needed" : ""}`}>
                  <span className="ship-dlg-label">
                    <span className="ship-label-text">{label}</span>
                    {empty && <span className="ship-dlg-needed">Needed</span>}
                  </span>
                  <input type={column === "ship_phone" ? "tel" : "text"} value={form[column]} autoComplete="off" spellCheck={false}
                    aria-required={required || undefined}
                    onChange={e => { const v = e.target.value; setForm(f => ({ ...f, [column]: v })); setErr(""); }} />
                </label>
              );
            })}
          </div>
          {err && <p className="ship-dlg-err" role="alert">⚠ {err}</p>}
          <div className="ship-dlg-actions">
            <button type="submit" className="tap o-btn o-btn-ink" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
            <button type="button" className="tap o-btn" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
