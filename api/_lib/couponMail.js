import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { couponDiscount, leadCoupon } from "./storeOps.js";
import { readNote, writeNote } from "./systemNote.js";
// How much: the same rules as Admin's two boxes and the checkout, imported, never copied.
import { addSize, couponPrices, lessThanNow, sizesOf, sizeWords, typedSize } from "../../src/lib/couponSize.js";

// What the two "Send a coupon" lists in Admin -> Orders share: "Didn't finish paying"
// (unfinishedCoupon.js) and "Left in the cart" (cartCoupon.js). Admin-only (api/admin.js, behind the
// admin login), and only ever on Andy's tap: nothing here runs by itself.
//  - The buyer gets ONE email: their pieces, big and whole, one warm line, their coupon code and the
//    way back to the shop (emails.js unfinishedCoupon).
//  - The code is THEIR coupon (Leads coupon_code): their own unused one, or one made the same way
//    the welcome popup makes it (storeOps.js leadCoupon).
//  - HOW MUCH is Andy's choice, each time: a % or a $ amount (Andy, 2026-11-22: "maybe we can
//    discount $300 or something if we know the acquisition power of the person !!"). It is worked
//    out here from the shop's OWN prices of the pieces still for sale, never from the browser's, and
//    never less than what their code already gives on them. It is saved on that code's Leads row
//    (coupon_size: src/lib/couponSize.js, db/2026-11-23-coupon-size.sql) BEFORE the email goes, so what
//    the email says is what the code gives: not saved, nothing is sent; not sent, the row is put
//    back as it was. Until that SQL has run no amount can be chosen, and it goes at the shop's %
//    (couponDiscount), as before.
//  - Their code already used: nothing is sent, and the answer says so.
//  - When it went is kept in a private note, so each list never sends a second: a checkout by its
//    reference (FA-...), a cart by its email.
const NOTE = "coupons-sent.json";
const NO_CHOICE = "Choosing the amount waits for one database change, so nothing was sent.";
const READ_AT_ONCE = 100;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const lower = (s) => String(s ?? "").trim().toLowerCase();

// The note: { key: { at, to, said } }. strict, before sending: one that is there but can't be read
// stops the send.
export async function sentCoupons(db, { strict = false } = {}) {
  if (!strict) return readNote(db, NOTE);
  try { return await readNote(db, NOTE, { strict: true }); } catch (e) {
    throw new Error(`couldn't check whether one already went, so nothing was sent: ${e.message}`, { cause: e });
  }
}

// Has db/2026-11-23-coupon-size.sql run? Asked the way cartMemory.js cartColumns asks: a Leads row
// shows the column; an empty list shows none, so then it is asked for by name, and a refusal means
// no. A list that can't be read throws.
export async function canChoose(db) {
  const { data, error } = await db.from("Leads").select("*").limit(1);
  if (error) throw new Error(`Leads read: ${error.message}`);
  if (data?.length) return Object.hasOwn(data[0], "coupon_size");
  const { error: missing } = await db.from("Leads").select("coupon_size").limit(1);
  return !missing;
}

// For a list: what each of these emails' own coupon is, by email: { used, code, sizes }. code: null
// when they have none. sizes: what it gives now, or the shop's % when they have none.
export async function couponsOf(db, emails, percent) {
  const leads = new Map();
  for (let i = 0; i < emails.length; i += READ_AT_ONCE) {
    const { data, error } = await db.from("Leads").select("*").in("email", emails.slice(i, i + READ_AT_ONCE));
    if (error) throw new Error(`Leads read: ${error.message}`);
    // The first row for each email, as leadCoupon reads it.
    for (const l of data || []) if (!leads.has(lower(l.email))) leads.set(lower(l.email), l);
  }
  return (email) => {
    const lead = leads.get(lower(email));
    const used = !!(lead?.coupon_code && lead.coupon_used);
    return { used, code: lead?.coupon_code || null, sizes: sizesOf(lead?.coupon_code && !used ? lead.coupon_size : null, percent) };
  };
}

// What a code gives, on its Leads row. Throws unless that one row took it: never on a code used since.
async function saveSize(db, email, code, sizes) {
  const { data, error } = await db.from("Leads").update({ coupon_size: sizes })
    .eq("email", email).eq("coupon_code", code).not("coupon_used", "is", true).select("id");
  if (error) throw new Error(`Leads update: ${error.message}`);
  if (data?.length !== 1) throw new Error(`Leads update: ${data?.length ?? 0} rows`);
}

// Sends it. email, name: whose (email lower case). pieces: theirs that are still for sale, { title,
// price }, the shop's own price, null when there is none. amount: { percent } or { dollars }, what
// Andy chose, or neither, which goes at what their code gives, the shop's % for everyone who has no
// size of their own (an Admin tab open since before amounts could be chosen, and every send until the
// SQL has run). key: its place in the note. source: where a Leads row made now came from.
// { sent: true, sentAt, to, code, said, discount, noted }: said, how much in words ("$300 off");
// discount, the % for an Admin tab from before. Or { sent: false, why: "used", code } when nothing
// went; { sent: false, why: "less", now, code } when their code already gives more on these pieces (now:
// what it gives, in words). noted: false when the email went but the note of it couldn't be saved
// (the row may then not remember it).
export async function sendCoupon(db, mail, { email, name, pieces, amount, key, source, now }) {
  const titles = [...new Set(pieces.map(p => p.title))];
  const prices = pieces.map(p => p.price);

  // The amount chosen, by the rule Admin's boxes go by, on the shop's own prices. None: size null.
  let size = null;
  if (amount.percent != null || amount.dollars != null) {
    const typed = typedSize({ percent: amount.percent, dollars: amount.dollars }, prices.every(p => p !== null) ? couponPrices(prices, []).total : null);
    if (!typed.size) throw new InputError(`${typed.why} Nothing was sent.`);
    if (!(await canChoose(db))) throw new InputError(NO_CHOICE, 409);
    size = typed.size;
  }

  const coupon = await leadCoupon(db, email, source);
  if (coupon.used) return { sent: false, why: "used", code: coupon.code };
  const shop = await couponDiscount(db);
  const gives = sizesOf(coupon.size, shop);
  if (size) {
    const more = coupon.made ? "" : lessThanNow(size, prices, gives);
    if (more) return { sent: false, why: "less", now: more, code: coupon.code };
    try { await saveSize(db, email, coupon.code, addSize(coupon.made ? [] : gives, size)); } catch (e) {
      throw new Error(`couldn't save how much their coupon gives, so nothing was sent: ${e.message}`, { cause: e });
    }
  }
  // In words: the amount chosen, or what their code gives on these pieces.
  const cut = couponPrices(prices, size ? [size] : gives);
  const said = sizeWords(cut.size, prices.some(p => p !== null) ? cut.off : undefined);
  const firstName = String(name || "").trim().split(/\s+/)[0] || "";
  try {
    await mail.send({
      to: email,
      subject: T.unfinishedCouponSubject({ titles, words: said }),
      htmlContent: T.unfinishedCoupon({ firstName, titles, code: coupon.code, words: said }),
    });
  } catch (e) {
    // It didn't go: their code gives again what it gave before, never more nor less than was emailed.
    if (size) await saveSize(db, email, coupon.code, coupon.size).catch(x => console.warn(`coupon for ${key}: not sent, and its size couldn't be put back:`, x?.message || x));
    throw e;
  }

  // Noted only once it has gone; if the note can't be saved, the email still went: say so, never
  // "failed" (a second tap would send it twice). Read strictly first, so a note that can't be read
  // is never written over with this one line.
  const sentAt = now.toISOString();
  let noted = true;
  try {
    const sent = await readNote(db, NOTE, { strict: true });
    await writeNote(db, NOTE, { ...sent, [key]: { at: sentAt, to: email, said } }, "coupon note");
  } catch (e) {
    noted = false;
    console.warn(`coupon for ${key}: sent, but not noted:`, e?.message || e);
  }
  return { sent: true, sentAt, to: email, code: coupon.code, said, discount: cut.size.percent ?? shop, noted };
}
