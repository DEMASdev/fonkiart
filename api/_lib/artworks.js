import { validateChain, runQuery } from "./adminOps.js";

// The artwork an order is for. An order keeps only the item's TITLE (item_title; there is no
// artwork id on it), so the piece is found by its title. Used twice (Andy, 2026-11-17):
//  - the picture on Stripe's card page: "please also see if in stripe when going into their
//    payment CC page they can show the picture of the art that is being sold";
//  - SOLD once paid: "also when an item is sold / paid for it should be marked as SOLD thx".
// Only an EXACT title counts (same letters, same capitals, same spaces), and only when exactly
// one artwork has it: two pieces with one title can't be told apart, so neither is used.
// (The invoice page's picture matches more loosely: src/lib/invoiceView.js findArtwork.)

const SITE = "https://fonkiart.com";

// Money has arrived: Paid, and everything after it. Server copy of PAID_STATUSES in storeOps.js
// and of isPaid in src/lib/orderStatus.js; tests/card-picture-sold.test.js keeps them equal.
export const PAID_STATUSES = new Set(["paid", "shipped", "delivered"]);

const usable = (title) => typeof title === "string" && title.trim() !== "";

// Up to two artworks with exactly this title: enough to tell "none", "one" and "more than one".
async function titled(db, title) {
  const { data, error } = await db.from("Artworks").select("id,title,image,isSold,category").eq("title", title).limit(2);
  if (error) throw new Error(`Artworks read: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

// The one artwork with exactly this title, or null (none, or more than one).
export async function findArtworkByTitle(db, title) {
  if (!usable(title)) return null;
  const rows = await titled(db, title);
  return rows.length === 1 ? rows[0] : null;
}

// ── the picture on Stripe's card page ───────────────────────────
// The originals are full-size photos (up to 24 MB), so Stripe gets a 640px copy from Vercel's
// image service: the same width and quality as the shop's cards, so it is usually made already.
// The service answers JPEG to anyone who doesn't say they take WebP. MEASURED 2026-11-17 on a
// real artwork: Accept */*, image/jpeg or none -> image/jpeg, 640x653, 69 KB; an Accept that
// lists image/webp -> image/webp, 53 KB. So whatever Stripe's fetcher sends, it gets a picture
// it can show. Only pictures in the shop's own bucket: vercel.json "images" lets the service
// fetch nothing else (a test keeps this pattern equal to vercel.json).
const BUCKET = /^https:\/\/aynesillxtejdvxucxdr\.supabase\.co\/storage\/v1\/object\/public\//;
export const cardImage = (url) => typeof url === "string" && BUCKET.test(url)
  ? `${SITE}/_vercel/image?url=${encodeURIComponent(url)}&w=640&q=75`
  : null;

const LATE = Symbol("late");

// The picture for an order's card page, or null. Never throws, and never holds the page up
// for long: a page without a picture is fine, a payment that doesn't happen is not.
export async function cardPicture(db, title, { waitMs = 2500 } = {}) {
  let timer;
  try {
    const late = new Promise((resolve) => { timer = setTimeout(resolve, waitMs, LATE); });
    const art = await Promise.race([findArtworkByTitle(db, title), late]);
    if (art === LATE) {
      console.warn("artworks: the picture took too long; card page without it");
      return null;
    }
    return art ? cardImage(art.image) : null;
  } catch (e) {
    console.warn("artworks: card page without a picture:", e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── SOLD once paid ──────────────────────────────────────────────
// A print is not one of a kind: a piece in a print category (the shop's "Art Prints" page) is
// never marked Sold by itself, so one print sale can't take the rest off the shop.
const isPrint = (art) => /\bprints?\b/i.test(String(art?.category || ""));

// An order is paid: mark its artwork Sold, so the shop shows "Sold Out" and stops selling it.
//  - only for a paid status, and only the one artwork with exactly the order's title;
//  - no artwork or two with that title: nothing, and a line in the log;
//  - already Sold: no write. The write itself only changes a piece that isn't Sold yet, so two
//    at the same moment (the client coming back and Stripe's message) still change it once;
//  - never the other way: nothing here un-marks a piece. If an order goes back to unpaid,
//    Andy unticks "Mark as Sold" on the artwork by hand.
// Never throws: the order is already paid when this runs, and that must stand.
export async function markSoldForOrder(db, order) {
  if (!PAID_STATUSES.has(order?.status)) return { marked: false, why: "not paid" };
  const title = order.item_title;
  const ref = `order ${order.id ?? "(new)"}`;
  if (!usable(title)) {
    console.warn(`artworks: ${ref} is paid but has no title; nothing marked Sold`);
    return { marked: false, why: "no title" };
  }
  try {
    const rows = await titled(db, title);
    if (rows.length !== 1) {
      console.warn(`artworks: ${ref} is paid, but ${rows.length ? "more than one artwork has" : "no artwork has"} the title "${title}"; nothing marked Sold`);
      return { marked: false, why: rows.length ? "more than one" : "none" };
    }
    const [art] = rows;
    if (art.isSold === true) return { marked: false, why: "already sold" };
    if (isPrint(art)) {
      console.warn(`artworks: ${ref} is paid; "${title}" is a print (${art.category}), so it stays for sale`);
      return { marked: false, why: "print" };
    }
    const { data, error } = await db.from("Artworks").update({ isSold: true }).eq("id", art.id).not("isSold", "is", true).select("id");
    if (error) throw new Error(`Artworks write: ${error.message}`);
    if (!data?.length) return { marked: false, why: "already sold" }; // marked a moment ago by the other path
    console.log(`artworks: "${title}" marked Sold (${ref} is paid)`);
    return { marked: true, id: art.id };
  } catch (e) {
    console.error(`artworks: ${ref} is paid, but "${title}" could not be marked Sold:`, e?.message || e);
    return { marked: false, why: "error" };
  }
}

// The admin's query (api/admin.js), plus SOLD for the orders it turns paid: Admin -> Orders
// "✓ Mark paid", a Status menu, or "+ Add Order" saved as Paid, Shipped or Delivered. Marked
// only once the database has saved the write. A change between paid statuses (Paid -> Shipped)
// marks nothing: that order didn't just get paid, and Andy may have unticked Sold on purpose.
const FILTERS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike"]);
const CUTS = new Set(["limit", "range"]); // a write cut short: it may reach fewer orders than a read finds
const NEW_ROWS = new Set(["insert", "upsert"]);

export async function queryMarkingSold(db, table, chain) {
  validateChain(table, chain);
  let turning = [];
  if (table === "Orders") {
    const [first, ...rest] = chain;
    const change = first.a?.[0];
    if (first.m === "update" && PAID_STATUSES.has(change?.status) && rest.some(({ m }) => CUTS.has(m))) {
      // Which orders a write cut short reaches can't be told beforehand, so none is marked; Andy
      // ticks Sold by hand. The admin pages never send one.
      console.warn("artworks: an Orders write with a limit turns orders paid; nothing marked Sold");
    } else if (first.m === "update" && PAID_STATUSES.has(change?.status)) {
      // Which orders this write is about, and whether they were paid already, BEFORE it runs.
      try {
        let q = db.from("Orders").select("id,item_title,status");
        for (const { m, a = [] } of rest) if (FILTERS.has(m)) q = q[m](...a);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        turning = (data || []).filter(o => !PAID_STATUSES.has(o.status)).map(o => ({ ...o, ...change }));
      } catch (e) {
        console.error("artworks: could not read the orders before they turn paid; nothing will be marked Sold:", e?.message || e);
      }
    } else if (NEW_ROWS.has(first.m)) {
      turning = [].concat(change ?? []).filter(o => o && typeof o === "object" && PAID_STATUSES.has(o.status));
    }
  }
  const result = await runQuery(db, table, chain);
  if (!result.error) for (const order of turning) await markSoldForOrder(db, order);
  return result;
}
