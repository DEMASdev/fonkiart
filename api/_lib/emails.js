import crypto from "crypto";
import { escapeHtml as e } from "./brevo.js";

// Every Fonkiart email, built on the server so a visitor can't choose the
// recipient, subject or markup. Everything a visitor typed is escaped.
// One look for all of them (Andy, 2026-11-01): the site's white, pink and gold,
// and in every email a random piece of Aliana's art, dropped into ART_SLOT by
// withRandomArt() when the email is sent ("the picture to the left in all emails").

const money = (n) => Number(n || 0).toLocaleString("en-US");
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const multiline = (s) => e(s).replace(/\r?\n/g, "<br/>");

const C = { ink: "#1c1a18", muted: "#9e7fa0", gold: "#b8923f", line: "#e8c97a", pink: "#DF88B7", red: "#c0392b", green: "#2d6a4f" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";
const SITE = "https://fonkiart.com";

export const ART_SLOT = "<!--ART-->";

function frame(heading, body) {
  return `<div style="margin:0;padding:24px 12px;background:#ffffff;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${C.line};border-collapse:collapse;">`
    + `<tr><td style="background:${C.pink};padding:20px 28px;text-align:center;">`
    + `<a href="${SITE}" style="font-family:${SERIF};font-size:24px;letter-spacing:.32em;color:#ffffff;text-decoration:none;">FONKIART</a>`
    + `<div style="font-family:${SANS};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;margin-top:6px;">Original Art &amp; Fine Art Prints</div></td></tr>`
    + `<tr><td style="padding:30px 28px 14px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>`
    + ART_SLOT
    + `<td style="vertical-align:top;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.ink};">`
    + `<h1 style="font-family:${SERIF};font-weight:normal;font-size:28px;line-height:1.25;color:${C.ink};margin:0 0 14px;">${heading}</h1>${body}</td>`
    + `</tr></table></td></tr>`
    + `<tr><td style="padding:18px 28px 24px;border-top:1px solid ${C.line};text-align:center;font-family:${SANS};font-size:12px;line-height:1.8;color:${C.muted};">`
    + `<a href="${SITE}" style="color:${C.gold};text-decoration:none;font-weight:bold;letter-spacing:.14em;">FONKIART.COM</a><br/>Original art by Aliana · Isla Morada, Florida Keys</td></tr>`
    + `</table></div>`;
}

const p = (html) => `<p style="margin:0 0 16px;">${html}</p>`;
const small = (html) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:${C.muted};">${html}</p>`;
const link = (href, label) => `<a href="${e(href)}" style="color:${C.gold};">${label}</a>`;
const signoff = small("— Fonkiart");
const button = (href, label) => `<p style="text-align:center;margin:8px 0 24px;"><a href="${e(href)}" style="display:inline-block;background:${C.gold};color:#ffffff;padding:14px 30px;text-decoration:none;font-family:${SANS};font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">${label}</a></p>`;
const codeBox = (code, note) => `<div style="background:#ffffff;border:2px dashed ${C.line};padding:18px 24px;text-align:center;margin:0 0 20px;"><div style="font-family:${SERIF};font-size:28px;font-weight:bold;letter-spacing:4px;color:${C.ink};">${code}</div>${note ? `<div style="font-size:13px;color:${C.muted};margin-top:6px;">${note}</div>` : ""}</div>`;
const panel = (label, html) => `<div style="border:1px solid ${C.line};padding:18px 22px;margin:0 0 20px;"><p style="margin:0 0 10px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};">${label}</p>${html}</div>`;
const field = (label, html) => `<p style="margin:0 0 6px;font-size:14px;"><strong>${label}:</strong> ${html}</p>`;
const footnote = `<p style="margin:20px 0 0;font-size:12px;color:${C.muted};">Sent from fonkiart.com</p>`;

// The picture runs down the left third of every email, beside the message
// (Andy, 11-01: "to the left, at 1/3 of the size" / "the picture to the left in all emails").
function artCell({ href, image, alt, title, linkLabel }) {
  return `<td width="33%" style="width:33%;vertical-align:top;padding:6px 22px 0 0;">`
    + `<a href="${e(href)}" style="text-decoration:none;"><img src="${e(image)}" alt="${e(alt)}" width="170" style="display:block;width:100%;max-width:170px;height:auto;border:0;"></a>`
    + (title ? `<p style="margin:10px 0 2px;font-family:${SERIF};font-style:italic;font-size:14px;line-height:1.4;color:${C.ink};">“${e(title)}”</p>` : "")
    + `<p style="margin:${title ? "0" : "10px 0 0"};font-family:${SANS};font-size:10px;line-height:1.6;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">Original art by Aliana</p>`
    + `<p style="margin:6px 0 0;font-family:${SANS};font-size:11px;line-height:1.5;"><a href="${e(href)}" style="font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${C.gold};text-decoration:none;">${linkLabel}</a></p>`
    + `</td>`;
}

export function artRow(art) {
  const href = `${SITE}/?artwork=${encodeURIComponent(art.id)}`;
  return artCell({ href, image: art.image, alt: `${art.title}, original art by Aliana`, title: art.title, linkLabel: "See it in the shop →" });
}

// A random piece of Aliana's own art (not the children's pieces), or null.
export async function pickArt(db) {
  const { data, error } = await db.from("Artworks").select("id,title,image,isChildren");
  if (error || !Array.isArray(data)) return null;
  const pool = data.filter(a => a.image && !a.isChildren);
  return pool.length ? pool[crypto.randomInt(pool.length)] : null;
}

// Fills ART_SLOT at send time. The art never stops an email: no art, no row.
export async function withRandomArt(db, html) {
  if (!String(html).includes(ART_SLOT)) return html;
  let art;
  try { art = await pickArt(db); } catch { art = null; }
  return html.replace(ART_SLOT, art ? artRow(art) : "");
}

// The emails Supabase sends itself, in the same look: paste the result into
// Supabase > Authentication > Emails > Templates. It keeps Supabase's own
// {{ .ConfirmationURL }} / {{ .Token }}, and its picture comes from /api/art.
export function supabaseTemplate({ heading, intro, buttonLabel, withCode = false }) {
  const art = artCell({ href: SITE, image: `${SITE}/api/art`, alt: "Original art by Aliana", title: "", linkLabel: "See more in the shop →" });
  return frame(heading,
    p(intro)
    + button("{{ .ConfirmationURL }}", buttonLabel)
    + (withCode ? `<p style="margin:0 0 8px;text-align:center;font-size:14px;color:${C.muted};">Or type this code on the site:</p>` + codeBox("{{ .Token }}") : "")
    + small("If you didn't ask for this, just ignore this email.")
    + signoff).replace(ART_SLOT, art);
}

// ── to customers ─────────────────────────────────────────────

export function adminReset({ link: href, minutes }) {
  return frame("Reset your admin password",
    p("Someone asked to reset the Fonkiart admin password. If it was you, choose a new one here:")
    + button(href, "Choose a new password")
    + small(`The link works once and expires in ${e(minutes)} minutes. If you didn't ask for this, ignore this email and your password stays the same.`)
    + signoff);
}

export function customerReset({ link: href, minutes }) {
  return frame("Reset your password",
    p("Someone asked to reset the password for your Fonkiart account. If it was you, choose a new one here:")
    + button(href, "Choose a new password")
    + small(`The link works once and expires in ${e(minutes)} minutes. If you didn't ask for this, ignore this email and your password stays the same.`)
    + signoff);
}

export function welcomeCoupon({ code, discount }) {
  return frame("Welcome to Fonkiart",
    p("Thank you for joining. Here is your exclusive welcome coupon:")
    + codeBox(e(code), `${e(discount)}% off your first purchase`)
    + small("Enter this code at checkout. Valid on original art and prints. One use per customer.")
    + signoff);
}

export function orderBuyer({ firstName, orderRef, items, total, couponApplied, discount, addr, sender }) {
  const rows = items.map(i => `<p style="margin:0 0 4px;font-size:16px;">${e(i.title)}${i.amount ? ` — $${money(i.amount)}` : ""}</p>`).join("");
  const summary = (orderRef ? `<p style="margin:0 0 8px;font-size:12px;color:${C.muted};">Reference: <strong style="font-family:monospace;letter-spacing:.05em;color:${C.ink};">${e(orderRef)}</strong></p>` : "")
    + rows
    + (total ? `<p style="margin:8px 0 0;font-family:${SERIF};font-size:22px;color:${C.gold};">Total: $${money(total)}${couponApplied ? ` &nbsp;<span style="font-family:${SANS};font-size:12px;color:${C.green};">✓ ${e(discount)}% coupon applied</span>` : ""}</p>` : "")
    + (addr ? `<p style="margin:10px 0 0;font-size:13px;color:${C.muted};"><strong>Ship to:</strong> ${e(addr)}</p>` : "");
  return frame(`Thank you, ${e(firstName)}!`,
    p("Your order has been received. Fonkiart will confirm and reach out about shipping within 24–48 hours.")
    + panel("Order Summary", summary)
    + small(`Questions? Reply to this email and quote your reference number. You can also reach us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff);
}

export function inquiryBuyer({ name, artTitle, sender }) {
  return frame(`Thank you, ${e(firstWord(name))}!`,
    p(`We received your inquiry about <strong>${e(artTitle)}</strong> and will get back to you shortly with pricing and availability.`)
    + small(`Questions? Contact us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff);
}

export function contactBuyer({ name, message, sender }) {
  return frame(`Thank you, ${e(firstWord(name))}!`,
    p("We received your message and will get back to you within 24–48 hours.")
    + panel("Your message", `<p style="margin:0;font-size:14px;">${multiline(message)}</p>`)
    + small(`Questions? Reply to this email or reach us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff);
}

// Emails written in the admin (invoice, order status, coupon): the admin sends
// the heading and the inside, the server puts them in the same frame.
export function adminFrame(heading, content) {
  return frame(heading, content);
}

// ── to the shop ──────────────────────────────────────────────

export function orderStore({ orderRef, items, total, couponApplied, discount, fullName, email, phone, addr, saveFailed }) {
  const rows = items.map(i => `<p style="margin:0 0 4px;font-size:14px;">${e(i.title)}${i.amount ? ` — $${money(i.amount)}` : ""}</p>`).join("");
  const warning = saveFailed ? `<p style="margin:0 0 16px;font-size:14px;color:${C.red};"><strong>⚠ This order could not be saved to the database. Add it by hand in the admin.</strong></p>` : "";
  return frame("New Order Received",
    warning
    + (orderRef ? `<p style="margin:0 0 16px;font-family:monospace;font-size:14px;color:${C.gold};">${e(orderRef)}</p>` : "")
    + rows
    + (total ? `<p style="margin:6px 0 12px;font-size:14px;"><strong>Total:</strong> $${money(total)}${couponApplied ? ` (${e(discount)}% coupon applied)` : ""}</p>` : "")
    + field("Customer", e(fullName))
    + field("Email", link(`mailto:${email}`, e(email)))
    + (phone ? field("Phone", e(phone)) : "")
    + (addr ? field("Ship to", e(addr)) : "")
    + footnote);
}

export function inquiryStore({ art, name, email, phone, message }) {
  const details = [
    art.category && `Category: ${e(art.category)}`,
    art.medium && `Medium: ${e(art.medium)}`,
    art.dimensions && `Dimensions: ${e(art.dimensions)}`,
  ].filter(Boolean).join("<br/>");
  return frame("Price Inquiry",
    small("A customer is asking for pricing on one of your artworks.")
    + panel("Artwork", `<p style="margin:0 0 8px;font-size:20px;">${e(art.title)}</p>`
      + (details ? `<p style="margin:0;font-size:13px;line-height:1.8;color:${C.muted};">${details}</p>` : "")
      + (art.description ? `<p style="margin:8px 0 0;font-size:13px;font-style:italic;color:${C.muted};">"${e(art.description)}"</p>` : ""))
    + panel("Customer", field("Name", e(name))
      + field("Email", link(`mailto:${email}`, e(email)))
      + (phone ? field("Phone", e(phone)) : "")
      + (message ? `<p style="margin:10px 0 0;font-size:14px;"><strong>Message:</strong> ${multiline(message)}</p>` : ""))
    + footnote);
}

export function contactStore({ name, email, message }) {
  return frame("New Contact Form Request",
    field("Name", e(name))
    + field("Email", e(email))
    + `<div style="margin:14px 0 0;padding:14px 18px;border-left:3px solid ${C.gold};background:#ffffff;font-size:14px;line-height:1.7;">${multiline(message)}</div>`
    + footnote);
}

export function invoiceApproved({ order }) {
  return frame("Invoice Approved",
    p(`<strong>${e(order.client_name || order.client_email)}</strong> approved the invoice for <strong>${e(order.item_title)}</strong> — $${money(order.amount)}.`)
    + footnote);
}
