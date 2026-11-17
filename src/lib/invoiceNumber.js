// Invoice numbers (Andy, 2026-11-17): "i don't want invoices having low numbers 11, 12,13 ,
// they should be FAinv-yymmddttmmss", then "add miliseconds".
//
// The number is the moment the invoice was made (the order's created_at, which the
// database sets when the invoice is saved), in Florida time, to the millisecond:
//   2026-11-17 4:12:46.123 PM Florida  ->  FAinv-261117161246123
// Nothing new is stored, so every invoice, old or new, has one, and the email, the
// invoice page, the admin list and the memo line all show the same number.
// Two invoices would need to be saved in the same millisecond to share one.

const TZ = "America/New_York"; // the shop: Isla Morada, Florida Keys

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23",
  year: "2-digit", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// Supabase sends created_at with microseconds ("…46.123456+00:00"); keep the milliseconds.
function toDate(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(/\.(\d{3})\d+/, ".$1"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function invoiceNumber(order = {}) {
  const d = toDate(order.created_at);
  if (!d) return `INV-${String(order.id ?? "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const p = Object.fromEntries(parts.formatToParts(d).map(x => [x.type, x.value]));
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `FAinv-${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}${ms}`;
}
