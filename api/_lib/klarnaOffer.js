// The Klarna offer — THE SERVER'S COPY, which decides (api/_lib/cartCheckout.js). The browser's
// copy is src/lib/klarnaOffer.js, which only says it on the checkout's Klarna row;
// tests/klarna-offer.test.js checks the two copies are the same code, so change one, change both.
// Two copies on purpose, like invoiceNumber.js: importing src/ from a Vercel function depends on
// file tracing outside api/.
//
// Andy said "build" (2026-11-22) to the offer as it was put to him: "when a piece is just over that line (say $3,000), the checkout
// says "Get $300 off and pay with Klarna." It shows only when the discount brings the price under
// the line, and never more off than a top amount you set in Admin." The line is the highest price
// Klarna takes, which Stripe publishes no single figure for (it depends on the country and the
// Klarna plan), so the shop copies it from its own Stripe settings into Admin -> Settings -> Stripe:
//  - klarnaMax, "Klarna's highest price";
//  - klarnaMostOff, "Most we'll take off so Klarna fits".
// Either one empty: no offer at all.
//
// An order is offered money off only while its total (after any coupon) is OVER the line and its
// total less the most-off is AT or UNDER it. The offer is exactly enough to reach the line, rounded
// UP to the next $10, and never more than the most-off: $3,000 with a $2,800 line is
// "Get $200 off and pay with Klarna". The cart's card payment takes it off ONLY on a Klarna payment
// page, split across the order's pieces; cards, Zelle and the rest always pay the full price.
//
// Every amount here is in CENTS, whole numbers, so nothing is lost to rounding.

const TEN_DOLLARS = 1000;

// A dollar amount from Settings, in cents: above zero, or 0 (empty, not a number: no offer).
export function settingCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// How much off (cents) an order of `total` cents is offered to pay with Klarna, or 0 for none.
export function klarnaOff(total, settings) {
  const line = settingCents(settings?.klarnaMax), most = settingCents(settings?.klarnaMostOff);
  if (!line || !most || !Number.isSafeInteger(total) || total <= line || total - most > line) return 0;
  const off = Math.min(Math.ceil((total - line) / TEN_DOLLARS) * TEN_DOLLARS, most);
  return off > 0 && off < total ? off : 0;
}

// The offer split across the order's pieces (amounts: each piece's cents, in the order's own
// order), in proportion to their amounts, so the shares add up to exactly `off`: in whole dollars
// when the offer and every piece are whole dollars, else in cents (the largest remainders take the
// spare units, the first piece first on a tie). null when a piece would be left at $0 or less.
export function splitOff(off, amounts) {
  if (!Number.isSafeInteger(off) || off <= 0 || !Array.isArray(amounts) || !amounts.length) return null;
  if (!amounts.every(a => Number.isSafeInteger(a) && a > 0)) return null;
  const total = amounts.reduce((sum, a) => sum + a, 0);
  if (off >= total) return null;
  const unit = off % 100 === 0 && amounts.every(a => a % 100 === 0) ? 100 : 1;
  const units = off / unit;
  const parts = amounts.map(a => units * a); // exact: whole numbers well under 2^53
  const shares = parts.map(p => (p - (p % total)) / total);
  let left = units - shares.reduce((sum, s) => sum + s, 0);
  const order = parts.map((p, n) => [p % total, n]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  for (const [, n] of order) { if (left <= 0) break; shares[n] += 1; left -= 1; }
  const split = shares.map(s => s * unit);
  return split.every((s, n) => s < amounts[n]) ? split : null;
}

// The whole offer for an order's pieces (amounts in cents), as the shop's Settings make it:
// { off, split } in cents, or null when none fits.
export function klarnaOffer(amounts, settings) {
  if (!Array.isArray(amounts) || !amounts.length || !amounts.every(a => Number.isSafeInteger(a) && a > 0)) return null;
  const off = klarnaOff(amounts.reduce((sum, a) => sum + a, 0), settings);
  const split = off ? splitOff(off, amounts) : null;
  return split ? { off, split } : null;
}

// Cents as the checkout writes money: $200, or $1,866.67 when there are cents.
export function dollars(cents) {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// The Klarna row's line while an offer fits (the checkout's ways to pay).
export const offerLine = (off) => `Get ${dollars(off)} off and pay with Klarna`;
// Said once the Klarna page is open at the lower price (the checkout's art wall).
export const offerDone = (off) => `✓ ${dollars(off)} off for Klarna`;
// The words an order row keeps once paid that way, as a coupon's are kept (" · 15% coupon applied").
export const offerWords = (off) => ` · ${dollars(off)} off for Klarna`;
