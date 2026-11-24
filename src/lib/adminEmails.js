// The insides of the emails the admin sends (invoice, order status).
// The server wraps each one in the shared Fonkiart frame with a picture (api/_lib/emails.js):
// the order's own piece when the email is about one (send its title as `pieces`), a random
// piece of Aliana's art when it is about none. So only the heading and the inside live here.
// Anything that came from a customer (name, notes, titles) is escaped. A coupon is never sent from
// here: the server builds it and sends it (api/_lib/leadsCoupon.js), with its Unsubscribe link.

import { orderTracking, orderTrackingLink, carrierLabel, isPickup } from "./tracking.js";

const C = { ink: "#1c1a18", muted: "#9e7fa0", gold: "#b8923f", line: "#e8c97a" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => Number(n || 0).toLocaleString("en-US");
const small = (html) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:${C.muted};">${html}</p>`;
const contact = (sender) => `<a href="mailto:${esc(sender)}" style="color:${C.gold};">${esc(sender)}</a>`;
const button = (href, label) => `<p style="text-align:center;margin:8px 0 24px;"><a href="${esc(href)}" style="display:inline-block;background:${C.gold};color:#ffffff;padding:14px 30px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">${label}</a></p>`;

export { esc };

export function invoiceEmail({ invNum, invDate, firstName, itemTitle, notes, dueDate, amount, link, sender }) {
  const row = (label, value, size = 16) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:16px;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};">${label}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:${size}px;color:${C.ink};text-align:right;">${value}</td></tr>`;
  const content = `<p style="margin:0 0 18px;font-size:16px;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};">Invoice ${esc(invNum)} · ${esc(invDate)}</p>`
    + `<p style="margin:0 0 8px;">Hi ${esc(firstName)},</p>`
    + `<p style="margin:0 0 22px;">You have a new invoice from Fonkiart. Click below to review the details and confirm your order.</p>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">`
    + row("Artwork / Item", esc(itemTitle), 18)
    + (notes ? row("Notes", esc(notes)) : "")
    + (dueDate ? row("Due Date", esc(dueDate)) : "")
    + `<tr><td style="padding:14px 0 0;font-size:17px;font-weight:bold;color:${C.ink};">Total Due</td><td style="padding:14px 0 0;font-family:Georgia,serif;font-size:27px;font-weight:bold;color:${C.gold};text-align:right;">$${money(amount)}</td></tr></table>`
    + small("You pay after you confirm. The ways to pay show on the invoice page.")
    + button(link, "Review &amp; Confirm →")
    + small(`Questions? Reply to this email or contact us at ${contact(sender)}.`);
  return { heading: "Your invoice", content };
}

// `message` is the admin's own sentence; escape anything customer-made in it before passing it in.
// `after` (optional) is more of the email, already built here, that goes under the message.
export function statusEmail({ name, message, sender, after = "" }) {
  return {
    heading: `Hi ${esc(name)}!`,
    content: `<p style="margin:0 0 16px;">${message}</p>` + after + small(`Questions? Contact us at ${contact(sender)}.`) + small("— Fonkiart"),
  };
}

// The tracking under a Shipped or Delivered message (Andy, 2026-11-17: "a live link to track the
// order"): the carrier and number in words, then the live link as a button. Nothing when the
// order has no tracking, or when its link isn't a safe https:// one (src/lib/tracking.js).
function trackingPart(order) {
  const link = orderTrackingLink(order);
  if (!link) return "";
  const { carrier, number } = orderTracking(order);
  const words = carrier === "other" ? "" : `<p style="margin:0 0 16px;">${esc(carrierLabel(carrier))} tracking number: <strong>${esc(number)}</strong></p>`;
  return words + button(link, "Track your package →");
}

// The email the client gets when the admin moves an order on (src/admin/OrdersTab.jsx): its
// subject plus the heading and inside for the shared frame, or null for a status with no email.
// Shipped and Delivered carry the live tracking link whenever the order has tracking. A pickup /
// hand delivery has no link: its Shipped email says the order is ready instead (Andy,
// 2026-11-17), with no tracking words in it.
// paid: Andy's tracking sentence, the same as the paid invoice (src/pages/InvoicePage.jsx).
export function statusEmailFor({ status, order, name, sender }) {
  const title = String(order?.item_title ?? "");
  const item = `<strong>${esc(title)}</strong>`;
  const tracking = status === "shipped" || status === "delivered" ? trackingPart(order) : "";
  const msgs = {
    confirmed: [`Your order is confirmed — ${title}`, `Great news! Your order for ${item} has been confirmed. We'll notify you once it ships.`],
    paid:      [`Payment received — ${title}`,       `Thank you! We received your payment for ${item}. We will be sending you a tracking number or delivery updates if shipping is needed.`],
    shipped:   isPickup(order)
      ? [`Your order is ready — ${title}`, `Your order for ${item} is ready, and Fonkiart will arrange the pickup or hand delivery with you.`]
      : [`Your order has shipped — ${title}`, tracking ? `Your order for ${item} is on its way!` : `Your order for ${item} is on its way! Fonkiart will follow up with any tracking details.`],
    delivered: [`Order delivered — ${title}`,        `Your order for ${item} has been marked as delivered. We hope you love it!`],
  };
  if (!Object.hasOwn(msgs, status)) return null;
  const [subject, message] = msgs[status];
  return { subject, ...statusEmail({ name, message, sender, after: tracking }) };
}
