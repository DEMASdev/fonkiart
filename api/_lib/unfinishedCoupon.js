import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { couponDiscount, leadCoupon } from "./storeOps.js";
import { artPrice, findPricedArtwork } from "./artworks.js";
import { readNote, writeNote } from "./systemNote.js";
// The same rule as Admin -> Orders "Didn't finish paying", imported, never copied.
import { cartRef, unfinishedCard } from "../../src/lib/orderRow.js";
// How much: the same rules as Admin's two boxes and the checkout, imported, never copied.
import { addSize, couponPrices, lessThanNow, sizesOf, sizeWords, typedSize } from "../../src/lib/couponSize.js";

// "Send a coupon" on Admin -> Orders' "Didn't finish paying" list (Andy, 2026-11-22: "there should
// be a follow up on that unfinished maybe order ! ... maybe send them a coupon ?"). Admin-only
// (api/admin.js, behind the admin login), and only ever on Andy's tap: nothing here runs by itself.
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
//  - ONCE per checkout: when it went is kept by its reference (FA-...) in a private note; every
//    row of that checkout then says "Coupon sent <date>", a plain line with no button, and a
//    second send is refused here too (a note that is there but can't be read stops the send).
//  - A piece someone else has bought since is left out of the email; when they all have, nothing
//    is sent.
const NOTE = "coupons-sent.json";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IDS = 200;
const NO_CHOICE = "Choosing the amount waits for one database change, so nothing was sent.";
const lower = (s) => String(s ?? "").trim().toLowerCase();
const checkoutOf = (row) => cartRef(row) || `#${row.id}`;

// Has db/2026-11-23-coupon-size.sql run? Asked the way cartMemory.js cartColumns asks: a Leads row
// shows the column; an empty list shows none, so then it is asked for by name, and a refusal means
// no. A list that can't be read throws.
async function canChoose(db) {
  const { data, error } = await db.from("Leads").select("*").limit(1);
  if (error) throw new Error(`Leads read: ${error.message}`);
  if (data?.length) return Object.hasOwn(data[0], "coupon_size");
  const { error: missing } = await db.from("Leads").select("coupon_size").limit(1);
  return !missing;
}

// What a code gives, on its Leads row. Throws unless that one row took it: never on a code used since.
async function saveSize(db, email, code, sizes) {
  const { data, error } = await db.from("Leads").update({ coupon_size: sizes })
    .eq("email", email).eq("coupon_code", code).not("coupon_used", "is", true).select("id");
  if (error) throw new Error(`Leads update: ${error.message}`);
  if (data?.length !== 1) throw new Error(`Leads update: ${data?.length ?? 0} rows`);
}

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
  const emails = [...new Set(rows.map(r => lower(r.client_email)).filter(Boolean))];
  const leads = new Map();
  if (emails.length) {
    const { data: found, error: leadErr } = await db.from("Leads").select("*").in("email", emails);
    if (leadErr) throw new Error(`Leads read: ${leadErr.message}`);
    // The first row for each email, as leadCoupon reads it.
    for (const l of found || []) if (!leads.has(lower(l.email))) leads.set(lower(l.email), l);
  }
  const sent = await readNote(db, NOTE);
  const percent = await couponDiscount(db);
  const pieces = await piecesFor(db, rows);
  const choose = await canChoose(db).catch((e) => { console.warn("coupon status:", e?.message || e); return false; });
  const coupons = {};
  for (const r of rows) {
    const lead = leads.get(lower(r.client_email));
    const ref = checkoutOf(r);
    const used = !!(lead?.coupon_code && lead.coupon_used);
    coupons[r.id] = {
      ref, sentAt: sent[ref]?.at || null, said: sent[ref]?.said || null, used, code: lead?.coupon_code || null,
      sizes: sizesOf(lead?.coupon_code && !used ? lead.coupon_size : null, percent), pieces: pieces.get(r.id),
    };
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

// Sends the coupon for the checkout of order `id`: { id, percent } or { id, dollars }, the amount
// Andy chose, or { id } alone, which goes at what their code gives, the shop's % for everyone who has
// no size of their own (an Admin tab open since before amounts could be chosen, and every send until
// the SQL has run). { sent: true, ref, sentAt, to, code, said, discount, noted }: said, how much in words
// ("$300 off"); discount, the % for an Admin tab from before. Or { sent: false, why: "sent", ref, sentAt,
// said } when this checkout had its coupon already (sentAt: when); { sent: false, why: "used" | "sold" } when
// nothing went; { sent: false, why: "less", now } when their code already gives more on these pieces
// (now: what it gives, in words). noted: false when the email went but the note of it couldn't be saved
// (the row may then not remember it).
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
  if (before?.at) return { sent: false, why: "sent", ref, sentAt: before.at, ...(before.said ? { said: before.said } : {}) };

  const rows = await checkoutRows(db, row);
  const arts = new Map(await Promise.all(titlesOf(rows).map(async t => [t, await findPricedArtwork(db, t).catch(() => null)])));
  const pieces = forSale(rows, arts);
  if (!pieces.length) return { sent: false, why: "sold" };
  const titles = [...new Set(pieces.map(p => p.title))];
  const prices = pieces.map(p => p.price);

  // The amount chosen, by the rule Admin's boxes go by, on the shop's own prices. None: size null.
  let size = null;
  if (body.percent != null || body.dollars != null) {
    const typed = typedSize({ percent: body.percent, dollars: body.dollars }, prices.every(p => p !== null) ? couponPrices(prices, []).total : null);
    if (!typed.size) throw new InputError(`${typed.why} Nothing was sent.`);
    if (!(await canChoose(db))) throw new InputError(NO_CHOICE, 409);
    size = typed.size;
  }

  const coupon = await leadCoupon(db, email, "unfinished-checkout");
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
  const firstName = String(row.ship_name || row.client_name || "").trim().split(/\s+/)[0] || "";
  try {
    await mail.send({
      to: email,
      subject: T.unfinishedCouponSubject({ titles, words: said }),
      htmlContent: T.unfinishedCoupon({ firstName, titles, code: coupon.code, words: said }),
    });
  } catch (e) {
    // It didn't go: their code gives again what it gave before, never more nor less than was emailed.
    if (size) await saveSize(db, email, coupon.code, coupon.size).catch(x => console.warn(`coupon for ${ref}: not sent, and its size couldn't be put back:`, x?.message || x));
    throw e;
  }

  // Noted only once it has gone; if the note can't be saved, the email still went: say so, never
  // "failed" (a second tap would send it twice). Read strictly first, so a note that can't be read
  // is never written over with this one line.
  const sentAt = now.toISOString();
  let noted = true;
  try {
    const sent = await readNote(db, NOTE, { strict: true });
    await writeNote(db, NOTE, { ...sent, [ref]: { at: sentAt, to: email, said } }, "coupon note");
  } catch (e) {
    noted = false;
    console.warn(`coupon for ${ref}: sent, but not noted:`, e?.message || e);
  }
  return { sent: true, ref, sentAt, to: email, code: coupon.code, said, discount: cut.size.percent ?? shop, noted };
}
