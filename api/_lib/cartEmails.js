import { adminFrame } from "./emails.js";
import { escapeHtml as e } from "./brevo.js";
import { paidWords } from "./stripe.js";

// The two emails of a Cart order paid in the card form (cartCheckout.js): ONE to the buyer and ONE
// to the shop for the whole cart, however many pieces it holds. The same look and words as an
// invoice paid there (emails.js paymentReceived / cardPaidShop): the frame comes from emails.js,
// with the order's own pieces at the top (never another one: emailArt.js), and the small parts
// below copy its styles. Then the pair for a bank payment (ACH) that didn't go through, for a Cart
// order and for an invoice alike (cartCheckout.js bankCart, storeOps.js markBankFailed).
// view: { ref, lines: [{ title, amount }], total, name, method }. Titles are escaped like
// everything else. method: how Stripe says it was paid ("klarna", "link", "bank", else a card:
// stripe.js paidWords).

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
  return `Paid ${paidWords(view.method).by} ✓ — ${view.ref}: ${what(view)} · $${money(view.total)}`;
}
export function cartPaidShop({ who, email, saved = true, ...view }) {
  const amount = `$${money(view.total)}`;
  const one = view.lines.length === 1;
  const way = paidWords(view.method);
  return adminFrame(`Paid ${way.by}`,
    p(`<strong>${e(who)}</strong>${email && email !== who ? ` (${link(`mailto:${email}`, e(email))})` : ""} paid <strong>${amount}</strong> ${way.how} for order <strong>${e(view.ref)}</strong>.`)
    + panel("Paid", pieces(view) + field("Order reference", e(view.ref)) + field("Amount", amount) + field("Paid with", way.stripe))
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
    + panel("Receipt", pieces(view) + field("Order reference", e(view.ref)) + field("Amount paid", amount) + field("Paid with", paidWords(view.method).name))
    // Andy's tracking sentence, the same as the paid invoice and its email.
    + p(`We will be sending you a tracking number or delivery updates if shipping is needed.`)
    + footnote, view.lines.map(l => l.title));
}

// ── a bank payment that didn't go through ───────────────────────
// view as above, plus refLabel ("Invoice" for an invoice; a Cart order: "Order reference").

// To the buyer, ONCE: their bank payment (ACH) didn't go through, so nothing is paid. Short and
// plain. link: their invoice, to pay it again; a Cart order has none, so they are asked to write.
export function bankFailedSubject(view) {
  return `Your bank payment didn't go through — ${what(view)} · Fonkiart`;
}
export function bankFailed({ link: href, refLabel = "Order reference", ...view }) {
  const amount = `$${money(view.total)}`;
  const one = view.lines.length === 1;
  return adminFrame("Bank payment didn't go through",
    p(`Hi ${e(view.name || "there")},`)
    + p(`Your bank payment of <strong>${amount}</strong> for ${one ? `<strong>${e(view.lines[0].title)}</strong>` : `your ${view.lines.length} pieces`} didn't go through, so your order is not paid.`)
    + panel("Not paid", pieces(view) + field(refLabel, e(view.ref)) + field("Amount", amount))
    + (href
      ? p(`You can pay again on your invoice: ${link(href, "view your invoice")}.`)
      : p(`If you'd still like ${one ? "it" : "them"}, just reply to this email and we'll help.`))
    + footnote, view.lines.map(l => l.title));
}

// To the shop, only when a piece needs a person after that (artworks.js releaseArtForOrder
// "check"): it is Sold, and the website can't tell by itself whether it should be for sale again.
// who, email: the buyer. back: the status the order went back to. check: those pieces' titles.
export function bankFailedShopSubject(view) {
  return `Bank payment failed — ${view.ref}: ${what(view)} · $${money(view.total)}`;
}
export function bankFailedShop({ who, email, back, check, refLabel = "Order reference", link: _link, ...view }) {
  const amount = `$${money(view.total)}`;
  const many = check.length > 1;
  return adminFrame("Bank payment didn't go through",
    p(`<strong>${e(who)}</strong>${email && email !== who ? ` (${link(`mailto:${email}`, e(email))})` : ""} paid <strong>${amount}</strong> by bank (ACH) for ${refLabel === "Invoice" ? "invoice" : "order"} <strong>${e(view.ref)}</strong>, and it didn't go through. The website set it back to <strong>${back === "confirmed" ? "Confirmed" : "Pending"}</strong> and told them.`)
    + panel("Not paid", pieces(view) + field(refLabel, e(view.ref)) + field("Amount", amount))
    + p(`⚠ Please check ${many ? "these pieces" : "this piece"}: ${check.map(t => `<strong>${e(t)}</strong>`).join(", ")}. ${many ? "They stayed" : "It stayed"} Sold while the payment cleared, and the website can't tell by itself whether ${many ? "they" : "it"} should be for sale again. If so, untick <strong>Mark as Sold</strong> on ${many ? "each one" : "it"} in Admin → Artworks.`)
    + small(`Stripe has the details, under Payments.`)
    + footnote, view.lines.map(l => l.title));
}
