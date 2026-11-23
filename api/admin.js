import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { isValidAdminToken, bearer } from "./_lib/adminToken.js";
import { adminCredentials } from "./_lib/adminSecret.js";
import { sendBrevo, senderAddress } from "./_lib/brevo.js";
import { adminThread, adminReply, adminInboundSetup } from "./_lib/threads.js";
import { withArt } from "./_lib/emailArt.js";
import { InputError } from "./_lib/errors.js";
import { signUpload, removeFiles, adminEmail } from "./_lib/adminOps.js";
import { queryMarkingSold } from "./_lib/artworks.js";
import { adminReminderNow } from "./_lib/reminders.js";
import { couponStatus, couponSend } from "./_lib/unfinishedCoupon.js";
import { cardCheck } from "./_lib/stripe.js";
import { siteUrl } from "./_lib/site.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });
  const db = getServiceClient();
  if (!db) {
    console.error("admin: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not configured");
    return res.status(503).json({ error: { message: "Database not configured" } });
  }
  let creds;
  try {
    creds = await adminCredentials(db);
  } catch (e) {
    console.error("admin:", e?.message || e);
    return res.status(503).json({ error: { message: "Admin login unavailable, try again in a minute" } });
  }
  if (!creds || !isValidAdminToken(bearer(req), creds.secret)) {
    return res.status(401).json({ error: { message: "Admin login required" } });
  }
  const body = req.body || {};
  const send = async (m) => sendBrevo({ ...m, htmlContent: await withArt(db, m.htmlContent) });
  try {
    // The admin's query as before; an Orders write that turns an order paid also marks its
    // artwork SOLD (Andy, 2026-11-17: "when an item is sold / paid for it should be marked as SOLD").
    if (body.kind === "query") return res.status(200).json(await queryMarkingSold(db, body.table, body.chain));
    if (body.kind === "storage-sign") return res.status(200).json(await signUpload(db, body.path));
    if (body.kind === "storage-remove") return res.status(200).json(await removeFiles(db, body.paths));
    if (body.kind === "email") return res.status(200).json(await adminEmail({ send }, body));
    if (body.kind === "request-thread") return res.status(200).json(await adminThread(db, body));
    if (body.kind === "request-reply") return res.status(200).json(await adminReply(db, body, { sender: senderAddress(), send }));
    if (body.kind === "inbound-setup") return res.status(200).json(await adminInboundSetup());
    if (body.kind === "reminder-now") return res.status(200).json(await adminReminderNow(db, { send }));
    // "Didn't finish paying" -> "Send a coupon": only on Andy's tap, one buyer, one email.
    if (body.kind === "coupon-status") return res.status(200).json(await couponStatus(db, body));
    if (body.kind === "coupon-send") return res.status(200).json(await couponSend(db, body, { send }));
    // deep: "Check again" makes a real $0.50 payment page on Stripe's own site, cards only (not
    // the card form inside fonkiart.com), and cancels it at once (see cardCheck).
    if (body.kind === "card-check") return res.status(200).json(await cardCheck({ deep: body.deep === true, site: siteUrl() }));
    return res.status(400).json({ error: { message: "Unknown request" } });
  } catch (e) {
    if (e instanceof InputError) return res.status(e.status).json({ error: { message: e.message } });
    console.error("admin:", e?.message || e);
    return res.status(500).json({ error: { message: e?.message || "Server error" } });
  }
}
