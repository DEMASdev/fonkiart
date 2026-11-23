import { readSlot, readThumbs, artFor, artThumb, pickArt } from "./emails.js";
import { findArtworkByTitle } from "./artworks.js";

// The picture in every email, put in when it is sent (api/store.js, api/admin.js,
// api/admin-reset.js wrap their send with this).
//  - An email ABOUT pieces (an order, an invoice, a payment, a price inquiry...) shows exactly
//    the pieces it names, each found by its EXACT title and only when exactly one artwork has it
//    (artworks.js findArtworkByTitle: the same rule as the picture on Stripe's page and SOLD).
//    A piece that can't be found that way shows nothing: never another piece. (Andy, 2026-11-18,
//    after an "Order Received — Flamingo Party" email showed a random piece, the one he had just
//    taken out of his cart: "shows the one i removed but names the one i did keep in the cart !!
//    BIG BIG BIG mistake !!!")
//  - An email about no piece (password reset, welcome coupon, contact form...) keeps a random
//    piece of Aliana's art (pickArt), as since 2026-11-01.
//  - The small pictures inside a list (the daily reminder's "Didn't finish paying") follow the
//    same rule, one named piece each (fillThumbs); the coupon after an unfinished checkout shows its
//    pieces big (the slot's big flag).
// The picture never stops an email: anything that goes wrong finding it means no picture.
export async function withArt(db, html) {
  const found = readSlot(html);
  if (!found) return fillThumbs(db, html);
  let arts = [];
  try {
    if (found.titles === null) {
      const art = await pickArt(db);
      arts = art ? [art] : [];
    } else {
      const each = await Promise.all(found.titles.map(t => findArtworkByTitle(db, t).catch(() => null)));
      arts = each.filter(a => a && a.image);
    }
  } catch (e) {
    console.warn("email art:", e?.message || e);
    arts = [];
  }
  // A function, so a "$" in a title is never read as a replacement pattern.
  return fillThumbs(db, String(html).replace(found.slot, () => artFor(arts, { big: found.big === true })));
}

// Each thumbSlot gets exactly its piece (found by its exact title, once per title), or nothing.
async function fillThumbs(db, html) {
  const slots = readThumbs(html);
  if (!slots.length) return html;
  const titles = [...new Set(slots.map(s => s.title))];
  const found = new Map(await Promise.all(titles.map(async t => [t, await findArtworkByTitle(db, t).catch(() => null)])));
  return slots.reduce((out, s) => out.replace(s.slot, () => { const art = found.get(s.title); return art?.image ? artThumb(art) : ""; }), String(html));
}
