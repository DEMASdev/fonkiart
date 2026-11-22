// The 5-minute box (src/components/CartEmailBox.jsx; Andy, 2026-11-22): someone not known yet,
// with pieces in the cart for about 5 minutes and no checkout, is offered the welcome gift for
// their email. Its two dials live HERE and nowhere else, as he may want a bigger % for this box:
//  - BOX_AFTER_MS: about 5 minutes with pieces in the cart;
//  - boxPercent: the welcome gift's own %, because the box gives the welcome gift's own code (the
//    store action "welcome": the same Leads code, the same %, the same email). A bigger % here
//    alone would promise more than that code gives: the server would have to give it too.
export const BOX_AFTER_MS = 5 * 60 * 1000;
export const boxPercent = (settings) => settings?.couponDiscount ?? 15;

const SINCE = "fonkiart-cart-since"; // this visit: since when the cart has held pieces
const SHOWN = "fonkiart-cart-box";   // this visit: the box was shown (once per visit)

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* keeps nothing */ } };

// Since when this visit's cart has held pieces (ms): set when it gets its first, cleared when empty.
// A browser that keeps nothing starts it again each time, so its box never comes: no bother.
export function cartSince(count, now = Date.now()) {
  if (!count) { write(SINCE, null); return null; }
  const was = Number(read(SINCE));
  if (Number.isFinite(was) && was > 0) return was;
  write(SINCE, String(now));
  return now;
}
export const boxShown = () => read(SHOWN) === "1";
export const markBoxShown = () => write(SHOWN, "1");

const RECHECK_MS = 3000; // due, but the checkout or another window is open: looked at again this often

// What the box does now: { show: true }, { wait: ms } (look again then), or {} (never, this
// visit: no pieces, already known, or already shown). busy: the checkout is open, or another
// window is; the box waits for it to close, never shows on top of it.
export function boxPlan({ count, since, now, known, shown, busy }) {
  if (!count || known || shown || since == null) return {};
  const due = since + BOX_AFTER_MS;
  if (now < due) return { wait: due - now };
  return busy ? { wait: RECHECK_MS } : { show: true };
}
