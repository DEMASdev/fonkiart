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
