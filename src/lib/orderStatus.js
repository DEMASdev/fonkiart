// The steps an order goes through, in order (Andy, 2026-11-17: "add a paid button and
// status"). Paid sits between Confirmed (the client approved the invoice, no money yet)
// and Shipped. Every screen that lists statuses reads this one list.
//
// The server's daily reminder (api/_lib/reminders.js) keeps its own short rule: a Paid
// order still waits on the shop, to be shipped.

export const ORDER_STATUSES = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["paid", "Paid"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
];

// Money has arrived: Paid, and everything after it.
export const isPaid = (status) => status === "paid" || status === "shipped" || status === "delivered";

// The "Mark paid" button shows while the money hasn't come in yet.
export const canMarkPaid = (status) => !status || status === "pending" || status === "confirmed";

// How the client paid, saved on the order as paid_method; the paid invoice says "Paid by ..."
// (Andy, 2026-11-17). Only these six: the server refuses anything else (api/_lib/adminOps.js).
export const PAID_METHODS = [
  ["zelle", "Zelle"],
  ["venmo", "Venmo"],
  ["cashapp", "Cash App"],
  ["card", "Card"],
  ["cash", "Cash"],
  ["other", "Other"],
];

// An invoice's ways to pay (its payment_methods, e.g. "zelle,stripe"), as paid_method values.
const INVOICE_WAYS = new Map([["zelle", "zelle"], ["venmo", "venmo"], ["cashapp", "cashapp"], ["stripe", "card"]]);

// "Mark paid" asks how the money came: one button per way the invoice offered, then Cash and
// Other. An old invoice saved no ways (null): all four.
export function markPaidChoices(paymentMethods) {
  const offered = String(paymentMethods || "").split(",").map(m => INVOICE_WAYS.get(m.trim())).filter(Boolean);
  const ways = offered.length ? offered : [...INVOICE_WAYS.values()];
  return PAID_METHODS.filter(([v]) => ways.includes(v) || v === "cash" || v === "other");
}

// Picking "Paid" from a Status menu (an order's, or "+ Add Order") first asks the same
// question as "Mark paid", so the invoice can say "Paid by ...". Every other status saves at once.
export const asksPaidMethod = (status) => status === "paid";

// What a status change saves. paid_method goes only with Paid, and only once a method was
// chosen: the server refuses an empty one (api/_lib/adminOps.js). Any other status leaves the
// order's paid_method as it is.
export function statusChange(status, paidMethod) {
  return status === "paid" && paidMethod ? { status, paid_method: paidMethod } : { status };
}
