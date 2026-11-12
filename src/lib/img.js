// Pictures for the screen, not the print: Andy, 2026-11-12, "they take ages to load".
// Artworks are stored as the full original photo (up to 7 MB, 5907×4252), and every
// card used to download it to fill a 137px box. Vercel's image service (vercel.json →
// "images") hands back a small WebP of the same picture instead. The same service
// already serves the email pictures (api/_lib/emails.js → emailImage).
export const IMAGE_SIZES = [320, 640, 1080, 1600]; // must match vercel.json images.sizes

export function sizedImage(url, width = 640, quality = 75, env = import.meta.env || {}) {
  const base = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!url || !env.PROD || !base) return url;
  if (!String(url).startsWith(`${base}/storage/v1/object/public/`)) return url;
  const w = IMAGE_SIZES.find(s => s >= width) || IMAGE_SIZES[IMAGE_SIZES.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=${quality}`;
}
