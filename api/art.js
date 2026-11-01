import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { pickArt } from "./_lib/emails.js";

// The picture in the emails Supabase sends itself (the new-account code, the
// collectors' login code). Their templates can't run code, so their <img> points
// here and gets a random piece of Aliana's art each time it's loaded. Nothing
// about the reader goes in the address, so nothing personal lands in a log.
export default async function handler(req, res) {
  let art = null;
  const db = getServiceClient();
  if (db) {
    try { art = await pickArt(db); } catch (e) { console.error("art:", e?.message || e); }
  }
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Location", art?.image || "https://fonkiart.com/favicon.png");
  return res.end();
}
