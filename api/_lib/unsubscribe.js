import crypto from "crypto";
import { InputError } from "./errors.js";
import { listNotes, readNote, writeNote } from "./systemNote.js";
import { unsubscribeLink } from "../../src/lib/unsubscribeLink.js";

// "Unsubscribe" in every email that carries a coupon (Andy, 2026-11-23, "1bc yes"): one link, one
// button, no sign-in, and after that the shop can't send that person a coupon, even by mistake. All
// of them go out through sendCouponEmail here: the welcome coupon (storeOps.js), the one sent from
// Admin -> Orders (couponMail.js) and the one made under Admin -> Leads (leadsCoupon.js). An email
// about an order, an invoice or a message is never stopped by it.
//  - The link carries the person's email, sealed (AES-256-GCM), so it names nobody, can't be made up
//    and works for that one email only. Its key is derived from the server's own service key, as
//    cartPass.js does: nothing new to keep. It never ends by itself; if that key is ever changed, the
//    links sent before stop opening, and their page says to write to us instead.
//  - Asking is kept as one small private note per person, named after a fingerprint of their email,
//    which is nowhere in it. It is not on their Leads row on purpose: that row can be deleted, or made
//    again by anyone who types the email, and what they asked must outlive it. A plain fingerprint,
//    not one made with the server's key: a changed key must never forget who asked.
//  - It is checked when the email is about to go, every time. Can't be checked: nothing is sent.
const SITE = "https://fonkiart.com"; // the shop itself, also from a preview: the link must last
const DIR = "unsub";
const EMAIL_MAX = 254;
const SEALED = /^[A-Za-z0-9_-]{40,1500}$/;
const WHAT = Buffer.from("fonkiart unsubscribe:1");
const lower = (s) => String(s ?? "").trim().toLowerCase();
const fileOf = (email) => `${crypto.createHash("sha256").update(`fonkiart-unsubscribe:${lower(email)}`).digest("hex")}.json`;

function linkKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? crypto.createHmac("sha256", secret).update("fonkiart unsubscribe link").digest() : null;
}

// The link for this email. Throws when the server has no key: a coupon never goes out without it.
export function linkFor(email) {
  const key = linkKey();
  if (!key) throw new Error("no key for the Unsubscribe link");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(WHAT);
  const sealed = Buffer.concat([c.update(lower(email), "utf8"), c.final()]);
  return unsubscribeLink(SITE, Buffer.concat([iv, c.getAuthTag(), sealed]).toString("base64url"));
}

// Whose link this is, or null when it isn't one of ours.
export function emailOf(token) {
  const key = linkKey();
  if (!key || typeof token !== "string" || !SEALED.test(token)) return null;
  try {
    const all = Buffer.from(token, "base64url");
    if (all.toString("base64url") !== token) return null; // written any other way: not one we made
    const d = crypto.createDecipheriv("aes-256-gcm", key, all.subarray(0, 12), { authTagLength: 16 });
    d.setAAD(WHAT);
    d.setAuthTag(all.subarray(12, 28));
    const email = Buffer.concat([d.update(all.subarray(28)), d.final()]).toString("utf8");
    return email && email.length <= EMAIL_MAX ? email : null;
  } catch { return null; }
}

// Has this person asked for no more coupons? Throws when it can't be read.
export async function isUnsubscribed(db, email) {
  return Object.keys(await readNote(db, `${DIR}/${fileOf(email)}`, { strict: true })).length > 0;
}

// Which of these emails have asked, for Admin's lists. Throws when it can't be read.
export async function unsubscribedAmong(db, emails) {
  if (!emails.length) return new Set();
  const asked = new Set(await listNotes(db, DIR));
  return new Set(emails.filter(e => asked.has(fileOf(e))));
}

// Why a coupon can't be emailed to this person: "out" (they asked not to get any), "unchecked" (it
// couldn't be read, so it isn't sent), or null when it can.
export async function whyNoCoupon(db, email) {
  try {
    return (await isUnsubscribed(db, email)) ? "out" : null;
  } catch (e) {
    console.warn("coupon email not sent: couldn't check who unsubscribed:", e?.message || e);
    return "unchecked";
  }
}

// The only way a coupon is emailed. html(link): builds the email, with the person's own Unsubscribe
// link in it, once it is known that it may go. { sent: true }, or { sent: false, why } as whyNoCoupon
// says. An email that doesn't go through throws, as mail.send does.
export async function sendCouponEmail(db, mail, { to, subject, html }) {
  const why = await whyNoCoupon(db, to);
  if (why) return { sent: false, why };
  await mail.send({ to, subject, htmlContent: await html(linkFor(to)) });
  return { sent: true };
}

// The store action "unsubscribe": { token }, the link's own. Asking twice is the same as once. Nothing
// about the person is answered.
export async function opUnsubscribe(db, body, now = new Date()) {
  const email = emailOf(body?.token);
  if (!email) throw new InputError("This link doesn't work", 404);
  if (!(await isUnsubscribed(db, email))) await writeNote(db, `${DIR}/${fileOf(email)}`, { at: now.toISOString() }, "unsubscribe note");
  return { ok: true };
}
