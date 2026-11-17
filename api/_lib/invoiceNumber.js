// Invoice numbers — THE SERVER'S COPY, for the emails the server sends (the "invoice
// confirmed by customer" email to the shop). The browser's copy is src/lib/invoiceNumber.js;
// tests/invoice.test.js checks both give the same number for the same order, so change
// one, change both. Two copies on purpose, like api/_lib/pwRules.js: importing src/ from a
// Vercel function depends on file tracing outside api/.
//
// The number is the moment the invoice was made (the order's created_at), in Florida
// time, to the millisecond: 2026-11-17 4:12:46.123 PM Florida -> FA-261117161246123

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
  if (!d) return `FA-${String(order.id ?? "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const p = Object.fromEntries(parts.formatToParts(d).map(x => [x.type, x.value]));
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `FA-${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}${ms}`;
}
