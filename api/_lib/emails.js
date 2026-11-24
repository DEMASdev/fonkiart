import crypto from "crypto";
import { escapeHtml as e } from "./brevo.js";
import { paidWords } from "./stripe.js";
import { unfinishedLink } from "../../src/lib/adminLink.js";
import { codePx } from "../../src/lib/couponCode.js";
import { MAX_ROWS } from "./reminderRows.js";

// Every Fonkiart email, built on the server so a visitor can't choose the
// recipient, subject or markup. Everything a visitor typed is escaped.
// One look for all of them (Andy, 2026-11-01): the site's white, pink and gold,
// and a picture of Aliana's art in every email ("the picture to the left in all emails"),
// filled in when the email is sent (emailArt.js withArt):
//  - an email ABOUT pieces (an order, an invoice, a payment, a price inquiry...) names them
//    (frame's `pieces`) and shows exactly those, never another one (Andy, 2026-11-18, after an
//    "Order Received — Flamingo Party" email showed the piece he had just taken out of his cart:
//    "shows the one i removed but names the one i did keep in the cart !! BIG BIG BIG mistake !!!");
//  - an email about no piece (password reset, welcome coupon, contact form...) gets a random one.
//  - the coupon to a buyer who didn't finish paying shows their pieces BIG and whole (piecesSlot's big), and
//    the daily reminder's "Didn't finish paying" and "Left in the cart" a small whole picture by each piece.

const money = (n) => Number(n || 0).toLocaleString("en-US");
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const multiline = (s) => e(s).replace(/\r?\n/g, "<br/>");

// "It worked" words (a coupon applied): never green (Andy, 2026-11-22: "no green on the sile maybe soft
// lilac or violet"). An email can't read the site's CSS, so its two choices sit here too, the same as
// --ok-a and --ok-b in src/index.css. OK_PICK is the one to change, with the site's pick there
// (tests/noGreen.test.js checks the two agree).
const OK_CHOICES = { A: "#765389", B: "#5b2f9e" }; // A "soft lilac", B "violet"
const OK_PICK = "A";
const C = { ink: "#1c1a18", muted: "#9e7fa0", gold: "#b8923f", line: "#e8c97a", pink: "#DF88B7", red: "#c0392b", ok: OK_CHOICES[OK_PICK] };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";
const SITE = "https://fonkiart.com";

// The picture's place in the frame. Plain: a random piece. With titles: exactly those pieces.
// Each title rides as hex, so no title can end the comment early or be read as another one.
export const ART_SLOT = "<!--ART-->";
const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const usableTitle = (t) => typeof t === "string" && t.trim() !== "";
// big: the pieces at the email's full width (artBig), not beside the message.
export const piecesSlot = (titles, { big = false } = {}) => `<!--ART${big ? "-BIG" : ""}:${[...new Set(titles.filter(usableTitle))].map(hex).join(",")}-->`;
// The slot in a built email: { titles } for an email about pieces (titles may be empty: then no
// picture), { titles: null } for a random piece, or null when the email has no slot. big: true
// for the big ones.
const ANY_SLOT = /<!--ART(-BIG)?(?::([0-9a-f,]*))?-->/;
export function readSlot(html) {
  const m = String(html).match(ANY_SLOT);
  if (!m) return null;
  return { slot: m[0], titles: m[2] === undefined ? null : m[2].split(",").filter(Boolean).map(h => Buffer.from(h, "hex").toString("utf8")), ...(m[1] ? { big: true } : {}) };
}
// A small picture of ONE named piece inside a list (the daily reminder's "Didn't finish paying"),
// filled when the email is sent, by the same rule: exactly that piece, or nothing.
export const thumbSlot = (title) => usableTitle(title) ? `<!--THUMB:${hex(title)}-->` : "";
export const readThumbs = (html) => [...String(html).matchAll(/<!--THUMB:([0-9a-f]+)-->/g)].map(m => ({ slot: m[0], title: Buffer.from(m[1], "hex").toString("utf8") }));

// pieces: the titles of the pieces this email is about (left out when it is about none), or
// { big: titles } for those pieces big and whole above the message.
const slotFor = (pieces) => Array.isArray(pieces) ? piecesSlot(pieces) : Array.isArray(pieces?.big) ? piecesSlot(pieces.big, { big: true }) : ART_SLOT;
function frame(heading, body, pieces) {
  return `<div style="margin:0;padding:24px 12px;background:#ffffff;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:2px solid ${C.gold};border-collapse:collapse;">`
    + `<tr><td style="background:${C.pink};padding:20px 28px;text-align:center;">`
    + `<a href="${SITE}" style="font-family:${SERIF};font-size:27px;letter-spacing:.32em;color:#ffffff;text-decoration:none;">FONKIART</a>`
    + `<div style="font-family:${SANS};font-size:16px;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;margin-top:6px;">Original Art &amp; Fine Art Prints</div></td></tr>`
    // Picture and message are two inline-blocks: side by side when the email is
    // wide, picture on top when it isn't (phones) — no media queries, which many
    // mail apps ignore. Outlook gets the same two columns from the [if mso] table.
    + `<tr><td style="padding:30px 28px 14px;font-size:0;text-align:center;">`
    + `<!--[if mso]><table role="presentation" width="536" cellpadding="0" cellspacing="0"><tr><![endif]-->`
    + slotFor(pieces)
    + `<!--[if mso]><td width="360" valign="top"><![endif]-->`
    + `<div style="display:inline-block;vertical-align:top;width:100%;max-width:360px;text-align:left;font-family:${SANS};font-size:18px;line-height:1.7;color:${C.ink};">`
    + `<h1 style="font-family:${SERIF};font-weight:normal;font-size:31px;line-height:1.25;color:${C.ink};margin:0 0 14px;">${heading}</h1>${body}</div>`
    + `<!--[if mso]></td></tr></table><![endif]-->`
    + `</td></tr>`
    + `<tr><td style="padding:18px 28px 24px;border-top:1px solid ${C.line};text-align:center;font-family:${SANS};font-size:16px;line-height:1.8;color:${C.muted};">`
    + `<a href="${SITE}" style="color:${C.gold};text-decoration:none;font-weight:bold;letter-spacing:.14em;">FONKIART.COM</a><br/>Original art by Aliana · Isla Morada, Florida Keys</td></tr>`
    + `</table></div>`;
}

const p = (html) => `<p style="margin:0 0 16px;">${html}</p>`;
const small = (html) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:${C.muted};">${html}</p>`;
const link = (href, label) => `<a href="${e(href)}" style="color:${C.gold};">${label}</a>`;
const signoff = small("— Fonkiart");
const button = (href, label) => `<p style="text-align:center;margin:8px 0 24px;"><a href="${e(href)}" style="display:inline-block;background:${C.gold};color:#ffffff;padding:14px 30px;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">${label}</a></p>`;
// The code on one line, as big as fits a phone (src/lib/couponCode.js).
const codeBox = (code, note) => `<div style="background:#ffffff;border:2px dashed ${C.line};padding:18px 12px;text-align:center;margin:0 0 20px;"><div style="font-family:${SERIF};font-size:${codePx(code)}px;font-weight:bold;letter-spacing:1px;white-space:nowrap;color:${C.ink};">${code}</div>${note ? `<div style="font-size:16px;color:${C.muted};margin-top:6px;">${note}</div>` : ""}</div>`;
const panel = (label, html) => `<div style="border:1px solid ${C.line};padding:18px 22px;margin:0 0 20px;"><p style="margin:0 0 10px;font-size:16px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};">${label}</p>${html}</div>`;
const field = (label, html) => `<p style="margin:0 0 6px;font-size:17px;"><strong>${label}:</strong> ${html}</p>`;
const footnote = `<p style="margin:20px 0 0;font-size:16px;color:${C.muted};">Sent from fonkiart.com</p>`;

// The picture runs down the left third of every email, beside the message
// (Andy, 11-01: "to the left, at 1/3 of the size" / "the picture to the left in all emails"),
// and sits on top of it on a phone ("picture on top on phones").
function artCell({ href, image, alt, title, linkLabel }) {
  return `<!--[if mso]><td width="176" valign="top"><![endif]-->`
    + `<div style="display:inline-block;vertical-align:top;width:100%;max-width:176px;text-align:left;">`
    + `<div style="padding:6px 20px 18px 0;">`
    + `<a href="${e(href)}" style="text-decoration:none;"><img src="${e(image)}" alt="${e(alt)}" width="156" style="display:block;width:100%;max-width:156px;height:auto;border:0;"></a>`
    + (title ? `<p style="margin:10px 0 2px;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.4;color:${C.ink};">“${e(title)}”</p>` : "")
    + `<p style="margin:${title ? "0" : "10px 0 0"};font-family:${SANS};font-size:16px;line-height:1.6;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">Original art by Aliana</p>`
    + `<p style="margin:6px 0 0;font-family:${SANS};font-size:16px;line-height:1.5;"><a href="${e(href)}" style="font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${C.gold};text-decoration:none;">${linkLabel}</a></p>`
    + `</div></div>`
    + `<!--[if mso]></td><![endif]-->`;
}

// The originals are full-size photos (up to 24 MB); emails get a 320px copy made
// by Vercel's image service (vercel.json "images" allows the Supabase bucket).
// width: one of vercel.json's sizes (640 for the big pictures, the size Stripe's page asks for too).
export const emailImage = (url, width = 320) => `${SITE}/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;

const pieceHref = (art) => `${SITE}/?artwork=${encodeURIComponent(art.id)}`;

export function artRow(art) {
  return artCell({ href: pieceHref(art), image: emailImage(art.image), alt: `${art.title}, original art by Aliana`, title: art.title, linkLabel: "See it in the shop →" });
}

// Several pieces (a Cart order, the daily reminder): each one small, art first, its title under
// it in the serif, as the Cart's card payment shows them (src/components/PayArt.jsx). A row across
// the top of the email, 3 to a line on a computer and 2 on a phone, the message under it. Outlook
// for Windows, which only knows tables, keeps them in the left column, one under the other.
function artGallery(arts) {
  const piece = (art) => `<div style="display:inline-block;vertical-align:top;width:120px;margin:0 8px 18px;text-align:left;">`
    + `<a href="${e(pieceHref(art))}" style="text-decoration:none;"><img src="${e(emailImage(art.image))}" alt="${e(`${art.title}, original art by Aliana`)}" width="120" style="display:block;width:120px;height:auto;border:0;"></a>`
    + `<p style="margin:8px 0 0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.4;color:${C.ink};">“${e(art.title)}”</p>`
    + `</div>`;
  return `<!--[if mso]><td width="176" valign="top"><![endif]-->`
    + `<div style="display:inline-block;vertical-align:top;width:100%;max-width:536px;text-align:center;">`
    + `<div style="padding:6px 0 4px;">${arts.map(piece).join("")}`
    + `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.6;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">Original art by Aliana</p>`
    + `</div></div>`
    + `<!--[if mso]></td><![endif]-->`;
}

// The buyer's own pieces, big and whole (the coupon after a checkout they didn't finish): each one
// at the email's full width, two to a line on a computer when there are several and one on a
// phone, never cropped (height auto), its title under it, each a link to the piece in the shop.
// Outlook for Windows gets them in a row of their own above the message.
function artBig(arts) {
  const one = arts.length === 1;
  const w = one ? 536 : 260;
  const piece = (art) => `<div style="display:inline-block;vertical-align:top;width:100%;max-width:${w}px;margin:0 ${one ? 0 : 4}px 22px;text-align:center;">`
    + `<a href="${e(pieceHref(art))}" style="text-decoration:none;"><img src="${e(emailImage(art.image, 640))}" alt="${e(`${art.title}, original art by Aliana`)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;margin:0 auto;"></a>`
    + `<p style="margin:10px 0 0;font-family:${SERIF};font-style:italic;font-size:19px;line-height:1.4;color:${C.ink};">“${e(art.title)}”</p>`
    + `</div>`;
  return `<!--[if mso]><td width="536" valign="top"><![endif]-->`
    + `<div style="display:inline-block;vertical-align:top;width:100%;max-width:536px;text-align:center;">`
    + `<div style="padding:6px 0 4px;">${arts.map(piece).join("")}`
    + `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.6;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">Original art by Aliana</p>`
    + `</div></div>`
    + `<!--[if mso]></td></tr><tr><![endif]-->`;
}

// What fills the slot: no piece, no picture; one, beside the message; several, the row; big: artBig.
export const artFor = (arts, { big = false } = {}) => !arts.length ? "" : big ? artBig(arts) : arts.length === 1 ? artRow(arts[0]) : artGallery(arts);

// A thumbSlot's picture: small and whole, in its own cell before the piece's line.
export function artThumb(art) {
  return `<td width="80" valign="top" style="padding:0 12px 0 0;"><a href="${e(pieceHref(art))}" style="text-decoration:none;"><img src="${e(emailImage(art.image))}" alt="${e(`${art.title}, original art by Aliana`)}" width="80" style="display:block;width:80px;height:auto;border:0;"></a></td>`;
}

// A random piece of Aliana's own art (not the children's pieces), or null. Only for the emails
// about no piece, and the picture in Supabase's own emails (api/art.js).
export async function pickArt(db) {
  const { data, error } = await db.from("Artworks").select("id,title,image,isChildren");
  if (error || !Array.isArray(data)) return null;
  const pool = data.filter(a => a.image && !a.isChildren);
  return pool.length ? pool[crypto.randomInt(pool.length)] : null;
}

// The emails Supabase sends itself, in the same look: paste the result into
// Supabase > Authentication > Emails > Templates. It keeps Supabase's own
// {{ .ConfirmationURL }} / {{ .Token }}, and its picture comes from /api/art.
export function supabaseTemplate({ heading, intro, buttonLabel, withCode = false }) {
  const art = artCell({ href: SITE, image: `${SITE}/api/art`, alt: "Original art by Aliana", title: "", linkLabel: "See more in the shop →" });
  return frame(heading,
    p(intro)
    + button("{{ .ConfirmationURL }}", buttonLabel)
    + (withCode ? `<p style="margin:0 0 8px;text-align:center;font-size:17px;color:${C.muted};">Or type this code on the site:</p>` + codeBox("{{ .Token }}") : "")
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

export function welcomeCoupon({ code, discount, verifyLink }) {
  return frame("Welcome to Fonkiart",
    p("Thank you for joining. Here is your exclusive welcome coupon:")
    + codeBox(e(code), `${e(discount)}% off your first purchase`)
    + small("Enter this code at checkout. Valid on original art and prints. One use per customer.")
    + (verifyLink ? button(verifyLink, "Verify my email") + small("Tapping it confirms your email and signs you in to your Fonkiart account. No password needed.") : "")
    + signoff);
}

// The coupon to a buyer who started a Cart checkout and didn't finish paying (Andy, 2026-11-22:
// "maybe send them a coupon ?"). It goes only when Andy taps "Send a coupon" in Admin -> Orders
// (unfinishedCoupon.js), never by itself. Their pieces big and whole, one warm line, their code,
// the way back to the shop. A marketing email, in the same frame and footer as the welcome coupon.
// words: how much, as Andy chose it ("20% off", "$300 off": src/lib/couponSize.js sizeWords).
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
export function unfinishedCouponSubject({ titles, words }) {
  const what = titles.length === 1 ? clip(oneLine(titles[0]), 60) : `your ${titles.length} pieces`;
  return `Still thinking about ${what}? Here's ${words} — Fonkiart`;
}
export function unfinishedCoupon({ firstName, titles, code, words }) {
  const one = titles.length === 1;
  return frame(`Still thinking it over${firstName ? `, ${e(firstName)}` : ""}?`,
    p(`${one ? "Your piece is" : "Your pieces are"} still here, waiting for you. Here is ${e(words)} to bring ${one ? "it" : "them"} home:`)
    + codeBox(e(code), `${e(words)} your order`)
    + button(SITE, "Back to the shop")
    + small("Enter the code at checkout with this email address. One use.")
    + signoff, { big: titles });
}

// applied: the coupon's words ("20% coupon applied", "$300 coupon applied"), or "" (storeOps.js orderReceived).
export function orderBuyer({ firstName, orderRef, items, total, applied, addr, sender }) {
  const rows = items.map(i => `<p style="margin:0 0 4px;font-size:19px;">${e(i.title)}${i.amount ? ` — $${money(i.amount)}` : ""}</p>`).join("");
  const summary = (orderRef ? `<p style="margin:0 0 8px;font-size:16px;color:${C.muted};">Reference: <strong style="font-family:monospace;letter-spacing:.05em;color:${C.ink};">${e(orderRef)}</strong></p>` : "")
    + rows
    + (total ? `<p style="margin:8px 0 0;font-family:${SERIF};font-size:25px;color:${C.gold};">Total: $${money(total)}${applied ? ` &nbsp;<span style="font-family:${SANS};font-size:16px;color:${C.ok};">✓ ${e(applied)}</span>` : ""}</p>` : "")
    + (addr ? `<p style="margin:10px 0 0;font-size:16px;color:${C.muted};"><strong>Ship to:</strong> ${e(addr)}</p>` : "");
  return frame(`Thank you, ${e(firstName)}!`,
    p("Your order has been received. Fonkiart will confirm and reach out about shipping within 24–48 hours.")
    + panel("Order Summary", summary)
    + small(`Questions? Reply to this email and quote your reference number. You can also reach us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff, items.map(i => i.title));
}

export function inquiryBuyer({ name, artTitle, sender }) {
  return frame(`Thank you, ${e(firstWord(name))}!`,
    p(`We received your inquiry about <strong>${e(artTitle)}</strong> and will get back to you shortly with pricing and availability.`)
    + small(`Questions? Contact us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff, [artTitle]);
}

export function contactBuyer({ name, message, sender }) {
  return frame(`Thank you, ${e(firstWord(name))}!`,
    p("We received your message and will get back to you within 24–48 hours.")
    + panel("Your message", `<p style="margin:0;font-size:17px;">${multiline(message)}</p>`)
    + small(`Questions? Reply to this email or reach us at ${link(`mailto:${sender}`, e(sender))}.`)
    + signoff);
}

// A price inquiry is saved as a request whose text starts with the piece's title, in the words
// opRequest writes (storeOps.js): Price inquiry for "<title>" — <their message>. Phone: <phone>.
// So a conversation about it can show THAT piece. Anything else (a contact message, a
// commission) is about no piece: "". A title or message with quotes in it could be cut in more
// than one place; then it's "" too (no picture), never a guess that could be another piece.
const INQUIRY_HEAD = 'Price inquiry for "';
const INQUIRY_TAIL = /^"(?: — [\s\S]*)?\. Phone: [\s\S]*\.$/;
export function inquiryTitle(message) {
  const s = String(message ?? "");
  if (!s.startsWith(INQUIRY_HEAD)) return "";
  const rest = s.slice(INQUIRY_HEAD.length);
  const cuts = [];
  for (let i = rest.indexOf('"'); i !== -1; i = rest.indexOf('"', i + 1)) {
    if (i > 0 && INQUIRY_TAIL.test(rest.slice(i))) cuts.push(rest.slice(0, i));
  }
  return cuts.length === 1 ? cuts[0] : "";
}
const aboutRequest = (requestText) => { const t = inquiryTitle(requestText); return t ? [t] : undefined; };

// The shop's answer to a request, written in the admin; the button opens the
// customer's private conversation page. requestText: what the request itself says (its piece).
export function requestReply({ name, message, link: href, requestText }) {
  return frame(`Hi ${e(firstWord(name) || "there")},`,
    `<div style="margin:0 0 20px;">${multiline(message)}</div>`
    + button(href, "Reply on fonkiart.com")
    + small("Or simply reply to this email. Your whole conversation with us is kept on that page.")
    + signoff, aboutRequest(requestText));
}

// Emails written in the admin (invoice, order status, coupon): the admin sends
// the heading and the inside, the server puts them in the same frame. pieces: the titles the
// email is about (an invoice, an order's status, a Cart payment), left out for none (a coupon).
export function adminFrame(heading, content, pieces) {
  return frame(heading, content, pieces);
}

// ── to the shop ──────────────────────────────────────────────

export function orderStore({ orderRef, items, total, applied, fullName, email, phone, addr, saveFailed }) {
  const rows = items.map(i => `<p style="margin:0 0 4px;font-size:17px;">${e(i.title)}${i.amount ? ` — $${money(i.amount)}` : ""}</p>`).join("");
  const warning = saveFailed ? `<p style="margin:0 0 16px;font-size:17px;color:${C.red};"><strong>⚠ This order could not be saved to the database. Add it by hand in the admin.</strong></p>` : "";
  return frame("New Order Received",
    warning
    + (orderRef ? `<p style="margin:0 0 16px;font-family:monospace;font-size:17px;color:${C.gold};">${e(orderRef)}</p>` : "")
    + rows
    + (total ? `<p style="margin:6px 0 12px;font-size:17px;"><strong>Total:</strong> $${money(total)}${applied ? ` (${e(applied)})` : ""}</p>` : "")
    + field("Customer", e(fullName))
    + field("Email", link(`mailto:${email}`, e(email)))
    + (phone ? field("Phone", e(phone)) : "")
    + (addr ? field("Ship to", e(addr)) : "")
    + footnote, items.map(i => i.title));
}

export function inquiryStore({ art, name, email, phone, message }) {
  const details = [
    art.category && `Category: ${e(art.category)}`,
    art.medium && `Medium: ${e(art.medium)}`,
    art.dimensions && `Dimensions: ${e(art.dimensions)}`,
  ].filter(Boolean).join("<br/>");
  return frame("Price Inquiry",
    small("A customer is asking for pricing on one of your artworks.")
    + panel("Artwork", `<p style="margin:0 0 8px;font-size:23px;">${e(art.title)}</p>`
      + (details ? `<p style="margin:0;font-size:16px;line-height:1.8;color:${C.muted};">${details}</p>` : "")
      + (art.description ? `<p style="margin:8px 0 0;font-size:16px;font-style:italic;color:${C.muted};">"${e(art.description)}"</p>` : ""))
    + panel("Customer", field("Name", e(name))
      + field("Email", link(`mailto:${email}`, e(email)))
      + (phone ? field("Phone", e(phone)) : "")
      + (message ? `<p style="margin:10px 0 0;font-size:17px;"><strong>Message:</strong> ${multiline(message)}</p>` : ""))
    + footnote, [art.title]);
}

export function contactStore({ name, email, message }) {
  return frame("New Contact Form Request",
    field("Name", e(name))
    + field("Email", e(email))
    + `<div style="margin:14px 0 0;padding:14px 18px;border-left:3px solid ${C.gold};background:#ffffff;font-size:17px;line-height:1.7;">${multiline(message)}</div>`
    + footnote);
}

// To the shop when a client confirms an invoice (Andy, 2026-11-17: "Invoice confirmed by
// customer !"). Confirming is NOT paying, and the site never sees money arrive, so the
// email says so plainly and says what to do once the money is in.
const PAY_NAMES = { zelle: "Zelle", venmo: "Venmo", cashapp: "Cash App", stripe: "Card" };
const clientWho = (order) => order.client_name
  ? `${e(order.client_name)}${order.client_email ? ` (${link(`mailto:${order.client_email}`, e(order.client_email))})` : ""}`
  : e(order.client_email || "The customer");
export function invoiceConfirmedSubject(order) {
  return `Invoice confirmed by customer, NOT paid yet — ${order.item_title} · $${money(order.amount)}`;
}
export function invoiceApproved({ order, invNum }) {
  const amount = `$${money(order.amount)}`;
  const ticked = order.payment_methods ? String(order.payment_methods).split(",").map(m => m.trim()) : [];
  const ways = ticked.map(m => PAY_NAMES[m]).filter(Boolean);
  // The apps the website can't see (Zelle, Venmo, Cash App): the shop marks those Paid by hand.
  const byHand = ticked.filter(m => m !== "stripe").map(m => PAY_NAMES[m]).filter(Boolean);
  const card = ticked.includes("stripe");
  return frame("Invoice confirmed by customer",
    p(`<strong>${clientWho(order)}</strong> confirmed the invoice for <strong>${e(order.item_title)}</strong>.`)
    + panel("Not paid yet",
      field("Invoice", e(invNum))
      + field("Amount", amount)
      + (ways.length ? field("Ways to pay shown", e(ways.join(", "))) : ""))
    + p(`This is <strong>not a payment</strong>.`)
    + (byHand.length || !card
      ? p(`When ${amount} arrives${byHand.length ? ` by ${e(byHand.join(" or "))}` : ""}, look for "${e(order.item_title)}" or "${e(invNum)}" in the memo. Then tap <strong>✓ Mark paid</strong> on the order in Admin → Orders (the client gets a receipt) and ship it.`)
      : "")
    + (card ? p(`If they pay by card, the website marks the order Paid by itself and emails you.`) : "")
    + footnote, [order.item_title]);
}

// To the shop when a client adds or changes the shipping address on their invoice page (Andy,
// 2026-11-18: "7ab Yes"). Only the client's own save sends it (storeOps.js opShipAddress); the
// shop's own edits in Admin -> Orders never do. The address in the same lines as the admin's
// (src/lib/shipAddress.js shipLines): name, street, "City, ST ZIP", country, phone.
const shipLines = (a) => {
  const v = (column) => String(a?.[column] ?? "").trim();
  const cityLine = [v("ship_city"), [v("ship_state"), v("ship_zip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [v("ship_name"), v("ship_address"), cityLine, v("ship_country"), v("ship_phone")].filter(Boolean);
};
const addressLines = (a) => `<p style="margin:0;font-size:17px;line-height:1.6;">${shipLines(a).map(line => e(line)).join("<br/>")}</p>`;
export function shipAddressSubject({ order, invNum, changed }) {
  return `Shipping address ${changed ? "changed" : "added"} — ${order.item_title} · ${invNum}`;
}
// before: the address it had (with a street), when the client changed it; null when added.
export function shipAddressShop({ order, invNum, address, before = null }) {
  const did = before ? "changed" : "added";
  return frame(`Shipping address ${did}`,
    p(`<strong>${clientWho(order)}</strong> ${did} the shipping address for <strong>${e(order.item_title)}</strong> on the invoice page.`)
    + p(`<strong>Invoice:</strong> ${e(invNum)}`)
    + panel(before ? "New address" : "Ship to", addressLines(address))
    + (before ? panel("Before", addressLines(before)) : "")
    + p(`See it in <strong>Admin → Orders</strong>.`)
    + footnote, [order.item_title]);
}

// To the shop when a client pays an invoice in the card form (a card, Link, Klarna, or a bank
// payment once it clears). Stripe confirmed it to the server, so the website marked the order
// Paid by itself, with the way Stripe says it was paid (paid_method), in the words of stripe.js
// paidWords.
export function cardPaidSubject(order) {
  return `Paid ${paidWords(order.paid_method).by} ✓ — ${order.item_title} · $${money(order.amount)}`;
}
export function cardPaidShop({ order, invNum, saved = true }) {
  const amount = `$${money(order.amount)}`;
  const way = paidWords(order.paid_method);
  return frame(`Paid ${way.by}`,
    p(`<strong>${clientWho(order)}</strong> paid <strong>${amount}</strong> ${way.how} for <strong>${e(order.item_title)}</strong>.`)
    + panel("Paid", field("Invoice", e(invNum)) + field("Amount", amount) + field("Paid with", way.stripe))
    + (saved
      ? p(`The website already marked the order <strong>Paid</strong>. Ship it, then set it to <strong>Shipped</strong> in Admin → Orders.`)
      : p(`⚠ The website could not mark the order Paid. Please tap <strong>✓ Mark paid</strong> on it in Admin → Orders, then ship it.`))
    + small(`The money is in your Stripe account, under Payments.`)
    + footnote, [order.item_title]);
}

// To the client once their payment in the card form is in.
export function paymentReceivedSubject(order) {
  return `Payment received — ${order.item_title} · Fonkiart`;
}
export function paymentReceived({ order, invNum }) {
  const first = order.client_name ? String(order.client_name).trim().split(/\s+/)[0] : "there";
  const amount = `$${money(order.amount)}`;
  return frame("Payment received",
    p(`Hi ${e(first)},`)
    + p(`Thank you! We received your payment of <strong>${amount}</strong> for <strong>${e(order.item_title)}</strong>.`)
    + panel("Receipt", field("Invoice", e(invNum)) + field("Amount paid", amount) + field("Paid with", paidWords(order.paid_method).name))
    // Andy's tracking sentence, the same as the paid invoice (src/pages/InvoicePage.jsx).
    + p(`We will be sending you a tracking number or delivery updates if shipping is needed.`)
    + footnote, [order.item_title]);
}

export function requestReplyStore({ name, email, message, via, requestText }) {
  return frame("New reply to a request",
    field("From", `${e(name || "—")}${email ? ` · ${link(`mailto:${email}`, e(email))}` : ""}`)
    + field("Came in", via === "email" ? "by email" : "on fonkiart.com")
    + `<div style="margin:14px 0 16px;padding:14px 18px;border-left:3px solid ${C.gold};background:#ffffff;font-size:17px;line-height:1.7;">${multiline(message)}</div>`
    + small("It's saved with the request. Answer it in the admin, under Requests, so the whole conversation stays in one place.")
    + footnote, aboutRequest(requestText));
}

// An email to the reply address that matched no request: passed on so it isn't lost.
export function inboundUnmatched({ from, subject, text }) {
  return frame("Email that matched no request",
    p("This came in through the reply address but didn't match any request, so it isn't saved anywhere. Here it is in full.")
    + field("From", e(from || "unknown"))
    + field("Subject", e(subject))
    + `<div style="margin:14px 0 0;padding:14px 18px;border-left:3px solid ${C.gold};background:#ffffff;font-size:17px;line-height:1.7;">${multiline(text)}</div>`
    + footnote);
}

// The daily "waiting for you" reminder (reminders.js). Only sent when the list isn't empty.
const waited = (d) => d === 0 ? "came in today" : d === 1 ? "1 day ago" : `${d} days ago`;
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const more = (n) => n > MAX_ROWS ? `<p style="margin:6px 0 0;font-size:16px;color:${C.muted};">…and ${n - MAX_ROWS} more in the admin.</p>` : "";
// A thin gold line BETWEEN rows, none under the last one.
const row = (html, i) => `<div style="${i ? `margin:14px 0 0;padding:14px 0 0;border-top:1px solid ${C.line};` : "margin:0;"}">${html}</div>`;
const note = (html) => `<p style="margin:0;font-size:16px;letter-spacing:.06em;color:${C.muted};">${html}</p>`;

// "Didn't finish paying" (Andy, 2026-11-22: "a warning to the admin saying .... this person had an
// order in the cart and didn't checkout"): one entry per checkout, from the last 7 days
// (reminders.js). Who, how to reach them, each piece with its small picture and price, the total,
// when they started, and the way into Admin -> Orders with that list open.
const SHOP_TZ = "America/New_York"; // the shop: Isla Morada, Florida Keys
// "Nov 20, 10:05 AM", in the shop's own time.
const whenOf = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: SHOP_TZ }) : ""; };
const pieceRow = (thumb, title, price) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px;"><tr>${thumb}`
  + `<td valign="middle" style="font-family:${SANS};font-size:17px;line-height:1.5;color:${C.ink};">${e(title || "—")}${price ? ` — $${money(price)}` : ""}</td></tr></table>`;
const pieceLine = (pc) => pieceRow(thumbSlot(pc.title), pc.title, pc.amount);
const unfinishedRow = (u, i) => row(
  `<p style="margin:0 0 4px;font-size:17px;"><strong>${e(u.name || "—")}</strong></p>`
  + `<p style="margin:0 0 12px;font-size:16px;">${[u.email ? link(`mailto:${u.email}`, e(u.email)) : "", u.phone ? e(u.phone) : ""].filter(Boolean).join(" · ")}</p>`
  + u.pieces.map(pieceLine).join("")
  + (u.pieces.length > 1 ? `<p style="margin:0 0 6px;font-size:17px;"><strong>Total:</strong> $${money(u.total)}</p>` : "")
  + (whenOf(u.started) ? note(`Started paying ${whenOf(u.started)}`) : "")
  + `<p style="margin:8px 0 0;font-size:16px;">${link(unfinishedLink(SITE), "Open in Admin → Orders →")}</p>`, i);

// "Left in the cart" (Andy, 2026-11-23, "all 8": nobody saw who left art in their cart), drawn like the
// part above: who, each piece with its small whole picture and the shop's price today, the total, and
// how long ago. cartMemory.js cartsLeft gives each piece's own id and picture, so it is drawn as it
// is, not looked up by its title. name: shown when the shop knows it.
const agoWords = (hours) => { const days = Math.floor(hours / 24); return days >= 1 ? `${days} ${days === 1 ? "day" : "days"} ago` : `${hours} ${hours === 1 ? "hour" : "hours"} ago`; };
const cartPiece = (pc) => pieceRow(pc.image ? artThumb(pc) : "", pc.title, pc.price);
const cartRow = (c, i) => row(
  (c.name ? `<p style="margin:0 0 4px;font-size:17px;"><strong>${e(c.name)}</strong></p>` : "")
  + `<p style="margin:0 0 12px;font-size:16px;">${link(`mailto:${c.email}`, e(c.email))}</p>`
  + c.pieces.map(cartPiece).join("")
  + (c.pieces.length > 1 && c.total ? `<p style="margin:0 0 6px;font-size:17px;"><strong>Total:</strong> $${money(c.total)}</p>` : "")
  + (Number.isFinite(c.hours) ? note(`Left in the cart ${agoWords(c.hours)}`) : "")
  + `<p style="margin:8px 0 0;font-size:16px;">${link(unfinishedLink(SITE), "Open in Admin → Orders →")}</p>`, i);

// Its pictures: the pieces of the orders it lists and of the price inquiries it lists, each
// once. When it lists none (only contact messages), a random piece, as in every email about none.
// A checkout that wasn't finished, and a cart left behind, show their own pieces by their lines
// (thumbSlot, artThumb), so they are not in the top row too; with only those, the top row stays
// empty, never a random piece.
export function reminderStore({ requests, orders, unfinished = [], carts = [] }) {
  const named = [...orders.slice(0, MAX_ROWS).map(o => o.title), ...requests.slice(0, MAX_ROWS).map(r => inquiryTitle(r.message))].filter(Boolean);
  const reqRows = requests.slice(0, MAX_ROWS).map((r, i) => row(
    `<p style="margin:0 0 4px;font-size:17px;"><strong>${e(r.name || "—")}</strong>${r.email ? ` · ${link(`mailto:${r.email}`, e(r.email))}` : ""}</p>`
    + `<p style="margin:0 0 4px;font-size:16px;line-height:1.6;">${e(clip(r.message, 140))}</p>`
    + note(`${r.replied ? "They replied to your answer" : "New message"}${r.days != null ? ` · ${waited(r.days)}` : ""}`), i)).join("");
  const ordRows = orders.slice(0, MAX_ROWS).map((o, i) => row(
    `<p style="margin:0 0 4px;font-size:17px;"><strong>${e(o.title || "—")}</strong>${o.amount ? ` — $${money(o.amount)}` : ""}</p>`
    + (o.email ? `<p style="margin:0 0 4px;font-size:16px;">${link(`mailto:${o.email}`, e(o.email))}</p>` : "")
    + note(`${o.status === "paid" ? "Paid, ship it" : o.status === "confirmed" ? "Confirmed, not paid yet" : "Pending"}${o.days != null ? ` · ordered ${o.days === 0 ? "today" : waited(o.days)}` : ""}`), i)).join("");
  return frame("Waiting for you",
    p("Here's what is still waiting at Fonkiart.")
    + (requests.length ? panel(`Messages to answer (${requests.length})`, reqRows + more(requests.length)) : "")
    + (orders.length ? panel(`Orders to send (${orders.length})`, ordRows + more(orders.length)) : "")
    + (unfinished.length ? panel(`Didn't finish paying (${unfinished.length})`, unfinished.slice(0, MAX_ROWS).map(unfinishedRow).join("") + more(unfinished.length)) : "")
    + (carts.length ? panel(`Left in the cart (${carts.length})`, carts.slice(0, MAX_ROWS).map(cartRow).join("") + more(carts.length)) : "")
    + button(SITE, "Open the admin")
    + small("Answer messages under Requests and update orders under Orders. This email comes once a day, and only when something is waiting.")
    + footnote, named.length ? named : unfinished.length || carts.length ? [] : undefined);
}
