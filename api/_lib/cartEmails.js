import { adminFrame } from "./emails.js";
import { escapeHtml as e } from "./brevo.js";

// The two emails of a Cart order paid by card (cartCheckout.js): ONE to the buyer and ONE to
// the shop for the whole cart, however many pieces it holds. The same look and words as an
// invoice paid by card (emails.js paymentReceived / cardPaidShop): the frame comes from emails.js,
// with the order's own pieces at the top (never another one: emailArt.js), and the small parts
// below copy its styles.
// view: { ref, lines: [{ title, amount }], total, name }. Titles are escaped like everything else.

const money = (n) => Number(n || 0).toLocaleString("en-US");
const C = { muted: "#9e7fa0", gold: "#b8923f", line: "#e8c97a" };

const p = (html) => `<p style="margin:0 0 16px;">${html}</p>`;
const small = (html) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:${C.muted};">${html}</p>`;
const link = (href, label) => `<a href="${e(href)}" style="color:${C.gold};">${label}</a>`;
const panel = (label, html) => `<div style="border:1px solid ${C.line};padding:18px 22px;margin:0 0 20px;"><p style="margin:0 0 10px;font-size:16px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};">${label}</p>${html}</div>`;
const field = (label, html) => `<p style="margin:0 0 6px;font-size:17px;"><strong>${label}:</strong> ${html}</p>`;
const footnote = `<p style="margin:20px 0 0;font-size:16px;color:${C.muted};">Sent from fonkiart.com</p>`;

const what = ({ lines }) => lines.length === 1 ? lines[0].title : `${lines.length} pieces`;
const pieces = ({ lines }) => lines.map(l => `<p style="margin:0 0 4px;font-size:17px;">${e(l.title)} — $${money(l.amount)}</p>`).join("")
  + `<div style="height:10px;"></div>`;

// To the shop: the website already turned every piece of the order Paid.
export function cartPaidSubject(view) {
  return `Paid by card ✓ — ${view.ref}: ${what(view)} · $${money(view.total)}`;
}
export function cartPaidShop({ who, email, saved = true, ...view }) {
  const amount = `$${money(view.total)}`;
  const one = view.lines.length === 1;
  return adminFrame("Paid by card",
    p(`<strong>${e(who)}</strong>${email && email !== who ? ` (${link(`mailto:${email}`, e(email))})` : ""} paid <strong>${amount}</strong> by card for order <strong>${e(view.ref)}</strong>.`)
    + panel("Paid", pieces(view) + field("Order reference", e(view.ref)) + field("Amount", amount) + field("Paid with", "Card (Stripe)"))
    + (saved
      ? p(`The website already marked ${one ? "the order" : `all ${view.lines.length} pieces`} <strong>Paid</strong>. Ship ${one ? "it" : "them"}, then set ${one ? "it" : "each one"} to <strong>Shipped</strong> in Admin → Orders.`)
      : p(`⚠ The website could not mark the order Paid. Please tap <strong>✓ Mark paid</strong> on ${one ? "it" : `each of its ${view.lines.length} pieces`} in Admin → Orders, then ship ${one ? "it" : "them"}.`))
    + small(`The money is in your Stripe account, under Payments.`)
    + footnote, view.lines.map(l => l.title));
}

// To the buyer, once their card payment is in.
export function cartReceivedSubject(view) {
  return `Payment received — ${what(view)} · Fonkiart`;
}
export function cartReceived(view) {
  const amount = `$${money(view.total)}`;
  const one = view.lines.length === 1;
  return adminFrame("Payment received",
    p(`Hi ${e(view.name || "there")},`)
    + p(`Thank you! We received your payment of <strong>${amount}</strong> for ${one ? `<strong>${e(view.lines[0].title)}</strong>` : `your ${view.lines.length} pieces`}.`)
    + panel("Receipt", pieces(view) + field("Order reference", e(view.ref)) + field("Amount paid", amount) + field("Paid with", "Card"))
    // Andy's tracking sentence, the same as the paid invoice and its email.
    + p(`We will be sending you a tracking number or delivery updates if shipping is needed.`)
    + footnote, view.lines.map(l => l.title));
}
