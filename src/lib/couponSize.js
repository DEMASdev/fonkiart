// How much a coupon code takes off (Andy, 2026-11-22, on a buyer who didn't finish paying: "maybe we
// can discount $300 or something if we know the acquisition power of the person !!"). Andy chooses
// it, a % or a $ amount, when he sends the coupon (Admin -> Orders, api/_lib/couponMail.js);
// that buyer's own code then gives exactly that. Every other code gives the shop's % (Admin ->
// Settings), as before.
//
// Leads.coupon_size (db/2026-11-23-coupon-size.sql) holds a LIST of sizes, and a code gives the best
// one for the cart it is used on. A list, because it is the buyer's ONE code: if they already had
// one (a welcome email promised them 15%), sending them $300 off must never make it worse on another
// cart. A size is one of:
//  { percent: 20 }            20% off every piece, each rounded to whole dollars.
//  { dollars: 300, of: 950 }  $300 off the ORDER, made for pieces worth $950. Never more than $300 in
//                             all, however many pieces are added; on a smaller cart never more than
//                             the same share ($111 off $350). Split across the pieces in proportion.
// null (everyone before this) or anything that isn't a size: the shop's %.
//
// The site, Admin and the server all use this one file (it imports nothing), so what is shown, what
// is emailed and what is charged are worked out the same way. Prices are in dollars, as the shop
// keeps them; only splitOff counts in cents, so that shares add up exactly.

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const cents = (dollars) => Math.round(dollars * 100);
const add = (list) => list.reduce((sum, n) => sum + n, 0);
const inDollars = (size) => size?.dollars !== undefined;

// Money in words: $300, $1,200, or $7.99 when there are cents.
export function moneyWords(n) {
  const digits = cents(n) % 100 === 0 ? 0 : 2;
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// ── the sizes a code has ────────────────────────────────────────

function cleanSize(size) {
  if (!size || typeof size !== "object" || (size.percent === undefined) === (size.dollars === undefined)) return null;
  if (!inDollars(size)) return finite(size.percent) && size.percent > 0 && size.percent < 100 ? { percent: size.percent } : null;
  return Number.isSafeInteger(size.dollars) && size.dollars >= 1 && finite(size.of) && size.of > size.dollars ? { dollars: size.dollars, of: size.of } : null;
}

// The sizes a code has of its own (Leads.coupon_size as it is saved: a list, or one size alone),
// and only real ones: none for most codes.
export const ownSizes = (value) => (Array.isArray(value) ? value : [value]).map(cleanSize).filter(Boolean);

// What a code gives: its own sizes, else the shop's %.
export function sizesOf(value, shopPercent) {
  const own = ownSizes(value);
  return own.length ? own : [{ percent: shopPercent }];
}

// The list to save when `next` is sent on a code that gave `before` (its own sizes or the shop's %;
// [] for a new code): what it gave stays, so it never gets worse. Only the largest % is kept, an exact
// repeat counts once, and the one just sent is last (a tie goes to it: couponPrices).
export function addSize(before, next) {
  const list = [...ownSizes(before), ...ownSizes(next)];
  const most = Math.max(0, ...list.filter(s => !inDollars(s)).map(s => s.percent));
  const kept = list.filter(s => inDollars(s) || s.percent === most);
  const same = (a, b) => a.percent === b.percent && a.dollars === b.dollars && a.of === b.of;
  return kept.filter((s, n) => !kept.slice(n + 1).some(later => same(s, later)));
}

// ── what they take off ──────────────────────────────────────────

// `off` split across an order's pieces (amounts: each piece's cents, in the order's own order), in
// proportion to their amounts, so the shares add up to exactly `off`: in whole dollars when `off`
// and every piece are whole dollars, else in cents (the largest remainders take the spare units, the
// first piece first on a tie). unit: 1 for cents in any case. null when a piece would be left at $0
// or less. All of it in CENTS, whole numbers, so nothing is lost to rounding.
export function splitOff(off, amounts, unit = null) {
  if (!Number.isSafeInteger(off) || off <= 0 || !Array.isArray(amounts) || !amounts.length) return null;
  if (!amounts.every(a => Number.isSafeInteger(a) && a > 0)) return null;
  const total = add(amounts);
  if (off >= total) return null;
  const per = unit ?? (off % 100 === 0 && amounts.every(a => a % 100 === 0) ? 100 : 1);
  const units = off / per;
  const parts = amounts.map(a => units * a); // exact: whole numbers well under 2^53
  const shares = parts.map(p => (p - (p % total)) / total);
  let left = units - add(shares);
  const order = parts.map((p, n) => [p % total, n]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  for (const [, n] of order) { if (left <= 0) break; shares[n] += 1; left -= 1; }
  const split = shares.map(s => s * per);
  return split.every((s, n) => s < amounts[n]) ? split : null;
}

// A % off every piece, in whole dollars, as the checkout has always worked it out. A percent that
// isn't one (0, 100, not a number) takes nothing off.
function percentOff(prices, percent) {
  const pct = Number(percent);
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? prices.map(p => Math.round(p * (1 - pct / 100))) : prices;
}

// Dollars off the order: never more than the size says, nor than its share of these pieces, nor so
// much that a piece is left at $0 (then a dollar less, until it fits).
function dollarsOff(prices, { dollars, of }) {
  const at = prices.map((p, n) => n).filter(n => cents(prices[n]) > 0);
  const worth = at.map(n => cents(prices[n]));
  for (let off = Math.min(dollars, Math.round((add(worth) / 100) * dollars / of)); off > 0; off -= 1) {
    const split = splitOff(off * 100, worth) || splitOff(off * 100, worth, 1);
    if (!split) continue;
    const amounts = [...prices];
    at.forEach((n, k) => { amounts[n] = (worth[k] - split[k]) / 100; });
    return amounts;
  }
  return prices;
}

// These pieces with a code's sizes: { amounts, total, off, size }: each piece's amount, what they add
// up to, how much that is off, and the size that gives it (the one that takes off the most; the later
// one on a tie). No sizes (no coupon): the prices as they are, off 0, size null. A piece with no price
// (0, null) stays 0 and takes no share.
export function couponPrices(prices, sizes) {
  const full = prices.map(p => { const n = Number(p); return Number.isFinite(n) && n > 0 ? n : 0; });
  const base = add(full.map(cents));
  const cut = (amounts, size) => { const total = add(amounts.map(cents)); return { amounts, total: total / 100, off: (base - total) / 100, size }; };
  let best = null;
  for (const size of Array.isArray(sizes) ? sizes : []) {
    const one = cut(inDollars(size) ? dollarsOff(full, size) : percentOff(full, size.percent), size);
    if (!best || one.off >= best.off) best = one;
  }
  return best || cut(full, null);
}

// ── in words ────────────────────────────────────────────────────

// "20%" or "$300". off: for dollars, the real amount off this cart ("$111"); left out when it isn't
// known, and then the size's own.
const amountWords = (size, off) => inDollars(size) ? moneyWords(off ?? size.dollars) : `${size.percent}%`;
// "20% off", "$300 off": the emails, the checkout's art wall, Admin.
export const sizeWords = (size, off) => `${amountWords(size, off)} off`;
// "20% coupon applied", "$300 coupon applied": an order's notes and its "order received" emails
// (api/_lib/cartCheckout.js COUPON_RE reads these words back).
export const appliedWords = (size, off) => `${amountWords(size, off)} coupon applied`;
// All of a code's sizes: "$300 off", "15% off or $300 off". upTo: "up to $300 off", for a place that
// doesn't know the cart.
export const sizesWords = (sizes, { upTo = false } = {}) => sizes.map(s => `${upTo && inDollars(s) ? "up to " : ""}${sizeWords(s)}`).join(" or ");
// What those words look like, for a place that keeps them as text (src/lib/cartOrder.js): the number
// or the dollars, then "off".
export const isSizeWords = (text) => typeof text === "string" && /^(?:\d{1,2}(?:\.\d+)?%|\$(?:0|[1-9]\d{0,2}(?:,\d{3})*)) off$/.test(text);

// ── choosing one (Admin -> Orders, "Send a coupon") ─────────────

// A whole number as it is typed ("20", "20%", "1,200", "$300") or sent; NaN for anything else.
function whole(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : NaN;
  const text = typeof value === "string" ? value.trim().replace(/^\$\s*/, "").replace(/\s*%$/, "") : "";
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text) ? Number(text.replaceAll(",", "")) : NaN;
}

// What was typed, as a size: { size }, or { why }, the one plain line that says what to type. Whole
// numbers only: a % from 1 to 99, or dollars from 1 up to the pieces' total less 1 (total: what the
// pieces are worth, null when one has no price: then only a % can be chosen). One of the two, never
// both. Admin and the server both ask here, so they always agree.
export function typedSize({ percent, dollars } = {}, total = null) {
  const given = (v) => v !== undefined && v !== null;
  if (given(percent) && given(dollars)) return { why: "Type a % or a $ amount, not both." };
  if (given(dollars)) {
    const worth = cents(Number(total)) / 100;
    const most = Math.floor(worth - 1);
    if (!(most >= 1)) return { why: "One of these pieces has no price, so type a % instead." };
    const n = whole(dollars);
    return n >= 1 && n <= most ? { size: { dollars: n, of: worth } } : { why: `Type a number from 1 to ${most.toLocaleString("en-US")}.` };
  }
  const n = whole(percent);
  return n >= 1 && n <= 99 ? { size: { percent: n } } : { why: "Type a number from 1 to 99." };
}

// Would `size` give these pieces less than what their code already gives (now)? Then what it gives, in
// words ("15% ($142 off)", "$300 off"); "" when it wouldn't. With no price to go by, two percents are
// compared as they are.
export function lessThanNow(size, prices, now) {
  const has = couponPrices(prices, now);
  if (has.total + has.off > 0) {
    if (couponPrices(prices, [size]).off >= has.off) return "";
    return inDollars(has.size) ? sizeWords(has.size, has.off) : `${amountWords(has.size)} (${moneyWords(has.off)} off)`;
  }
  const most = Math.max(0, ...now.filter(s => !inDollars(s)).map(s => Number(s.percent) || 0));
  return !inDollars(size) && size.percent < most ? `${most}%` : "";
}
