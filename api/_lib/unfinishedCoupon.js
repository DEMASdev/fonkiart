import { InputError } from "./errors.js";
import { EMAIL_RE, canChoose, couponsOf, lower, sendCoupon, sentCoupons } from "./couponMail.js";
import { couponDiscount } from "./storeOps.js";
import { artPrice, findPricedArtwork } from "./artworks.js";
// The same rule as Admin -> Orders "Didn't finish paying", imported, never copied.
import { cartRef, unfinishedCard } from "../../src/lib/orderRow.js";

// "Send a coupon" on Admin -> Orders' "Didn't finish paying" list (Andy, 2026-11-22: "there should
// be a follow up on that unfinished maybe order ! ... maybe send them a coupon ?"). The code, how
// much it gives, the email and the note of it: couponMail.js.
//  - ONCE per checkout: when it went is kept by its reference (FA-...); every row of that checkout
//    then says "Coupon sent <date>", a plain line with no button, and a second send is refused here
//    too.
//  - A piece someone else has bought since is left out of the email; when they all have, nothing
//    is sent.
const MAX_IDS = 200;
const checkoutOf = (row) => cartRef(row) || `#${row.id}`;

// A checkout's pieces, and which of them can still be bought: one per row (two copies of a print are
// two), with the shop's own price, null when it has none or the piece wasn't found.
const named = (row) => typeof row.item_title === "string" && row.item_title.trim() !== "";
const titlesOf = (rows) => [...new Set(rows.filter(named).map(r => r.item_title))];
const forSale = (rows, arts) => rows.filter(r => named(r) && arts.get(r.item_title)?.isSold !== true)
  .map(r => ({ title: r.item_title, price: artPrice(arts.get(r.item_title)) }));

// Every row of the checkout `row` belongs to (the same reference and email), still unfinished, out
// of these rows.
function sameCheckout(row, rows) {
  const ref = cartRef(row);
  const mates = ref ? rows.filter(r => r.client_email === row.client_email && cartRef(r) === ref && unfinishedCard(r)).sort((a, b) => a.id - b.id) : [];
  return mates.length ? mates : [row];
}

// The pieces of these rows' checkouts, by row id. [] for every one when the shop's artworks can't be
// read: the list must still answer (Admin then offers a % only).
async function piecesFor(db, rows) {
  const emails = [...new Set(rows.map(r => r.client_email).filter(Boolean))];
  const { data } = emails.length ? await db.from("Orders").select("id,client_email,item_title,notes,status").in("client_email", emails) : {};
  const checkouts = new Map(rows.map(r => [r.id, sameCheckout(r, data || rows)]));
  try {
    const arts = new Map(await Promise.all(titlesOf([...checkouts.values()].flat()).map(async t => [t, await findPricedArtwork(db, t)])));
    return new Map([...checkouts].map(([id, list]) => [id, forSale(list, arts)]));
  } catch (e) {
    console.warn("coupon status: the pieces couldn't be read:", e?.message || e);
    return new Map(rows.map(r => [r.id, []]));
  }
}

// The answer for the list: { coupons, choose, percent }.
//  - choose: can an amount be chosen (has the SQL run)? Not known: false. percent: the shop's %.
//  - coupons, by order id: { ref, sentAt, said, used, code, sizes, pieces }. code: their coupon, when
//    they have one. sizes: what it gives now, or the shop's % when they have none. pieces: their
//    checkout's pieces still for sale, { title, price }. said: how much the one already sent was, in
//    words ("$300 off"), null when none went, or it went before amounts could be chosen.
// Only orders that are still unfinished checkouts are answered.
export async function couponStatus(db, body) {
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids)] : [];
  if (ids.length > MAX_IDS || !ids.every(id => Number.isSafeInteger(id) && id > 0)) throw new InputError("Bad orders");
  if (!ids.length) return { coupons: {} };
  const { data, error } = await db.from("Orders").select("id,client_email,item_title,notes,status").in("id", ids);
  if (error) throw new Error(`Orders read: ${error.message}`);
  const rows = (data || []).filter(unfinishedCard);
  const percent = await couponDiscount(db);
  const theirs = await couponsOf(db, [...new Set(rows.map(r => lower(r.client_email)).filter(Boolean))], percent);
  const sent = await sentCoupons(db);
  const pieces = await piecesFor(db, rows);
  const choose = await canChoose(db).catch((e) => { console.warn("coupon status:", e?.message || e); return false; });
  const coupons = {};
  for (const r of rows) {
    const ref = checkoutOf(r);
    coupons[r.id] = { ref, sentAt: sent[ref]?.at || null, said: sent[ref]?.said || null, ...theirs(r.client_email), pieces: pieces.get(r.id) };
  }
  return { coupons, choose, percent };
}

// Every row of the checkout this row belongs to (the same reference and email), still unfinished.
async function checkoutRows(db, row) {
  if (!cartRef(row)) return [row];
  const { data, error } = await db.from("Orders").select("*").eq("client_email", row.client_email);
  if (error) throw new Error(`Orders read: ${error.message}`);
  return sameCheckout(row, data || []);
}

// Sends the coupon for the checkout of order `id`: { id, percent } or { id, dollars }, or { id } alone
// (couponMail.js sendCoupon, whose answer this gives, with the checkout's ref when it went). Or { sent:
// false, why: "sent", ref, sentAt, said } when this checkout had its coupon already (sentAt: when); {
// sent: false, why: "sold" } when nothing is left of it.
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
  const before = (await sentCoupons(db, { strict: true }))[ref];
  if (before?.at) return { sent: false, why: "sent", ref, sentAt: before.at, ...(before.said ? { said: before.said } : {}) };

  const rows = await checkoutRows(db, row);
  const arts = new Map(await Promise.all(titlesOf(rows).map(async t => [t, await findPricedArtwork(db, t).catch(() => null)])));
  const pieces = forSale(rows, arts);
  if (!pieces.length) return { sent: false, why: "sold" };
  const out = await sendCoupon(db, mail, { email, name: row.ship_name || row.client_name, pieces, amount: body, key: ref, source: "unfinished-checkout", now });
  return out.sent ? { ...out, ref } : out;
}
