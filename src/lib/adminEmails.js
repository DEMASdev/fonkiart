// The insides of the emails the admin sends (invoice, order status, coupon).
// The server wraps each one in the shared Fonkiart frame and adds a random piece
// of Aliana's art (api/_lib/emails.js), so only the heading and the inside live
// here. Anything that came from a customer (name, notes, titles) is escaped.

const C = { ink: "#1c1a18", muted: "#9e7fa0", gold: "#b8923f", line: "#e8c97a" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => Number(n || 0).toLocaleString("en-US");
const small = (html) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:${C.muted};">${html}</p>`;
const contact = (sender) => `<a href="mailto:${esc(sender)}" style="color:${C.gold};">${esc(sender)}</a>`;
const button = (href, label) => `<p style="text-align:center;margin:8px 0 24px;"><a href="${esc(href)}" style="display:inline-block;background:${C.gold};color:#ffffff;padding:14px 30px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">${label}</a></p>`;

export { esc };

export function invoiceEmail({ invNum, invDate, firstName, itemTitle, notes, dueDate, amount, link, sender }) {
  const row = (label, value, size = 13) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};">${label}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:${size}px;color:${C.ink};text-align:right;">${value}</td></tr>`;
  const content = `<p style="margin:0 0 18px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};">Invoice ${esc(invNum)} · ${esc(invDate)}</p>`
    + `<p style="margin:0 0 8px;">Hi ${esc(firstName)},</p>`
    + `<p style="margin:0 0 22px;">You have a new invoice from Fonkiart. Click below to review the details and approve your order.</p>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">`
    + row("Artwork / Item", esc(itemTitle), 15)
    + (notes ? row("Notes", esc(notes)) : "")
    + (dueDate ? row("Due Date", esc(dueDate)) : "")
    + `<tr><td style="padding:14px 0 0;font-size:14px;font-weight:bold;color:${C.ink};">Total Due</td><td style="padding:14px 0 0;font-family:Georgia,serif;font-size:24px;font-weight:bold;color:${C.gold};text-align:right;">$${money(amount)}</td></tr></table>`
    + button(link, "Review &amp; Approve →")
    + small(`Questions? Reply to this email or contact us at ${contact(sender)}.`);
  return { heading: "Your invoice", content };
}

// `message` is the admin's own sentence; escape anything customer-made in it before passing it in.
export function statusEmail({ name, message, sender }) {
  return {
    heading: `Hi ${esc(name)}!`,
    content: `<p style="margin:0 0 16px;">${message}</p>` + small(`Questions? Contact us at ${contact(sender)}.`) + small("— Fonkiart"),
  };
}

export function couponEmail({ code, discount }) {
  return {
    heading: "A Gift From Fonkiart",
    content: `<p style="margin:0 0 16px;">We have a special offer just for you:</p>`
      + `<div style="background:#ffffff;border:2px dashed ${C.line};padding:18px 24px;text-align:center;margin:0 0 20px;"><div style="font-family:Georgia,serif;font-size:28px;font-weight:bold;letter-spacing:4px;color:${C.ink};">${esc(code)}</div><div style="font-size:13px;color:${C.muted};margin-top:6px;">${esc(discount)}% off your purchase</div></div>`
      + small("Enter this code at checkout. One use only.") + small("— Fonkiart"),
  };
}
