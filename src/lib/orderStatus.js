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

// "Resend" asks first. Andy, 2026-11-17: "if the invoice was paid, and the admin clicks resend
// it should warn ... this invoice was sent already ... or this invoice was sent already and paid".
// Paid, Shipped and Delivered all count as paid.
export const resendQuestion = (status) => isPaid(status)
  ? "This invoice was sent already and paid. Send it again?"
  : "This invoice was sent already. Send it again?";

// The method already saved on the order, if it is one of the six; else null. An order that was
// paid before (Paid -> Shipped -> Paid again) knows how it was paid, so nobody is asked twice.
export function knownPaidMethod(order) {
  const m = order && order.paid_method;
  return PAID_METHODS.some(([v]) => v === m) ? m : null;
}

// What picking Paid (or tapping Mark paid) does for this order: "ask" = the "Paid by:" question;
// "save-quietly" = save Paid at once, keep the method, and do NOT email "Payment received" again
// (the client was told when the method was first recorded). Other statuses: "save" (email as usual).
export function paidPick(order, status) {
  if (!asksPaidMethod(status)) return "save";
  return knownPaidMethod(order) ? "save-quietly" : "ask";
}

// How each status looks to a buyer. My Account and Track my order both read this one table, so a
// paid order can never look less far along in one than in the other (2026-11-18: My Account had no
// Paid, so a paid order showed a plain chip and nothing lit on its line, behind an unpaid one).
// The colours are Track my order's; Admin -> Dashboard reads them too. bg = the chip, fg = its
// words, dot = its dot on a line where that differs from the chip: Pending's light chip colour
// would be lost as a small dot on white. Every chip's words read at 4.5:1 or more (Andy's rule is
// for people who can't see well): white was 2.5:1 on Paid's green and 2.9:1 on Delivered's gold,
// so those two have dark ink words (7.0:1 and 6.0:1).
export const STATUS_LOOK = {
  pending: { bg: "#f0d5a8", fg: "var(--ink)", dot: "#c9a96e" },
  confirmed: { bg: "#1e3a52", fg: "#fff" },
  paid: { bg: "#52b788", fg: "var(--ink)" },
  shipped: { bg: "#2d6a4f", fg: "#fff" },
  delivered: { bg: "var(--gold)", fg: "var(--ink)" },
};

// One status as a buyer sees it: its word, its colours and its step on the list (0 = Pending ...
// 4 = Delivered). A status the list doesn't know shows its own word on a plain chip, step -1, so
// nothing is lit.
export function statusLook(status) {
  const step = ORDER_STATUSES.findIndex(([v]) => v === status);
  if (step < 0) return { label: status || "", bg: "var(--border)", fg: "var(--ink)", dot: "var(--border)", step: -1 };
  const { bg, fg, dot = bg } = STATUS_LOOK[status];
  return { label: ORDER_STATUSES[step][1], bg, fg, dot, step };
}
