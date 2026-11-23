import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { couponDiscount, leadCoupon } from "./storeOps.js";
import { findArtworkByTitle } from "./artworks.js";
import { readNote, writeNote } from "./systemNote.js";
// The same rule as Admin -> Orders "Didn't finish paying", imported, never copied.
import { cartRef, unfinishedCard } from "../../src/lib/orderRow.js";

// "Send a coupon" on Admin -> Orders' "Didn't finish paying" list (Andy, 2026-11-22: "there should
// be a follow up on that unfinished maybe order ! ... maybe send them a coupon ?"). Admin-only
// (api/admin.js, behind the admin login), and only ever on Andy's tap: nothing here runs by itself.
//  - The buyer gets ONE email: their pieces, big and whole, one warm line, their coupon code and the
//    way back to the shop (emails.js unfinishedCoupon).
//  - The code is THEIR coupon (Leads coupon_code): their own unused one, or one made the same way
//    the welcome popup makes it (storeOps.js leadCoupon), at the shop's coupon % (couponDiscount).
//  - Their code already used: nothing is sent, and the answer says so.
//  - ONCE per checkout: when it went is kept by its reference (FA-...) in a private note; every
//    row of that checkout then says "Coupon sent <date>", a plain line with no button, and a
//    second send is refused here too (a note that is there but can't be read stops the send).
//  - A piece someone else has bought since is left out of the email; when they all have, nothing
//    is sent.
const NOTE = "coupons-sent.json";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IDS = 200;
const lower = (s) => String(s ?? "").trim().toLowerCase();
const checkoutOf = (row) => cartRef(row) || `#${row.id}`;

// The answer for the list: by order id, { ref, sentAt, used, code } (code: their coupon, when they
// have one). Only orders that are still unfinished checkouts are answered.
export async function couponStatus(db, body) {
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids)] : [];
  if (ids.length > MAX_IDS || !ids.every(id => Number.isSafeInteger(id) && id > 0)) throw new InputError("Bad orders");
  if (!ids.length) return { coupons: {} };
  const { data, error } = await db.from("Orders").select("id,client_email,notes,status").in("id", ids);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = (data || []).filter(unfinishedCard);
  const emails = [...new Set(rows.map(r => lower(r.client_email)).filter(Boolean))];
  const leads = new Map();
  if (emails.length) {
    const { data: found, error: leadErr } = await db.from("Leads").select("email,coupon_code,coupon_used").in("email", emails);
    if (leadErr) throw new Error(`Leads read: ${leadErr.message}`);
    // The first row for each email, as leadCoupon reads it.
    for (const l of found || []) if (!leads.has(lower(l.email))) leads.set(lower(l.email), l);
  }
  const sent = await readNote(db, NOTE);
  const coupons = {};
  for (const r of rows) {
    const lead = leads.get(lower(r.client_email));
    const ref = checkoutOf(r);
    coupons[r.id] = { ref, sentAt: sent[ref]?.at || null, used: !!(lead?.coupon_code && lead.coupon_used), code: lead?.coupon_code || null };
  }
  return { coupons };
}

// Every row of the checkout this row belongs to (the same reference and email), still unfinished.
async function checkoutRows(db, row) {
  const ref = cartRef(row);
  if (!ref) return [row];
  const { data, error } = await db.from("Orders").select("*").eq("client_email", row.client_email);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = (data || []).filter(r => cartRef(r) === ref && unfinishedCard(r)).sort((a, b) => a.id - b.id);
  return rows.length ? rows : [row];
}

// Sends the coupon for the checkout of order `id`. { sent: true, ref, sentAt, to, code, discount,
// noted }, or { sent: false, why: "sent", ref, sentAt } when this checkout had its coupon already
// (sentAt: when), or { sent: false, why: "used" | "sold" } when nothing went. noted: false when
// the email went but the note of it couldn't be saved (the row may then not remember it).
export async function couponSend(db, body, mail, now = new Date()) {
  const id = body?.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new InputError("Bad order");
  const { data, error } = await db.from("Orders").select("*").eq("id", id).limit(1);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new InputError("Order not found", 404);
  if (!unfinishedCard(row)) throw new InputError("This checkout isn't waiting any more (it was paid or moved on). Nothing was sent.", 409);
  const email = lower(row.client_email);
  if (!EMAIL_RE.test(email)) throw new InputError("This order has no email to send to.", 409);

  // ONCE per checkout: one already noted for it, from any of its rows, is never sent again.
  const ref = checkoutOf(row);
  let before;
  try { before = (await readNote(db, NOTE, { strict: true }))[ref]; } catch (e) {
    throw new Error(`couldn't check whether one already went, so nothing was sent: ${e.message}`, { cause: e });
  }
  if (before?.at) return { sent: false, why: "sent", ref, sentAt: before.at };

  const titles = [...new Set((await checkoutRows(db, row)).map(r => r.item_title).filter(t => typeof t === "string" && t.trim()))];
  const arts = await Promise.all(titles.map(t => findArtworkByTitle(db, t).catch(() => null)));
  const forSale = titles.filter((t, i) => arts[i]?.isSold !== true);
  if (!forSale.length) return { sent: false, why: "sold" };

  const coupon = await leadCoupon(db, email, "unfinished-checkout");
  if (coupon.used) return { sent: false, why: "used", code: coupon.code };
  const discount = await couponDiscount(db);
  const firstName = String(row.ship_name || row.client_name || "").trim().split(/\s+/)[0] || "";
  await mail.send({
    to: email,
    subject: T.unfinishedCouponSubject({ titles: forSale, discount }),
    htmlContent: T.unfinishedCoupon({ firstName, titles: forSale, code: coupon.code, discount }),
  });

  // Noted only once it has gone; if the note can't be saved, the email still went: say so, never
  // "failed" (a second tap would send it twice). Read strictly first, so a note that can't be read
  // is never written over with this one line.
  const sentAt = now.toISOString();
  let noted = true;
  try {
    const sent = await readNote(db, NOTE, { strict: true });
    await writeNote(db, NOTE, { ...sent, [ref]: { at: sentAt, to: email } }, "coupon note");
  } catch (e) {
    noted = false;
    console.warn(`coupon for ${ref}: sent, but not noted:`, e?.message || e);
  }
  return { sent: true, ref, sentAt, to: email, code: coupon.code, discount, noted };
}
