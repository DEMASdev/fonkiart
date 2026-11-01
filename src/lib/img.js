// Aliana's photos are stored at full camera size (some over 20 MB). On Vercel the
// image service hands out a copy sized for where it's shown (vercel.json "images"
// allows the Supabase bucket and these widths: 320, 640, 1080, 1600). On this computer
// (no image service) it borrows the live site's; any other address is used as is.
const BUCKET = /^https:\/\/aynesillxtejdvxucxdr\.supabase\.co\/storage\/v1\/object\/public\//;
const LOCAL = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export function img(url, width = 640) {
  if (!url || !BUCKET.test(url)) return url;
  return `${LOCAL ? "https://fonkiart.com" : ""}/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}
