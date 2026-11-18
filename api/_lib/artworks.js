// The artwork an order is for. An order keeps only the item's TITLE (item_title; there is no
// artwork id on it), so the piece is found by its title. For the picture on Stripe's card page
// (Andy, 2026-11-17: "please also see if in stripe when going into their payment CC page they
// can show the picture of the art that is being sold").
// Only an EXACT title counts (same letters, same capitals, same spaces), and only when exactly
// one artwork has it: two pieces with one title can't be told apart, so neither is used.
// (The invoice page's picture matches more loosely: src/lib/invoiceView.js findArtwork.)

const SITE = "https://fonkiart.com";

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
