import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { sendBrevo, senderAddress } from "./_lib/brevo.js";
import { InputError } from "./_lib/errors.js";
import { opResetRequest, opResetSet } from "./_lib/adminSecret.js";

// "Forgot password?" for the admin: ?op=request emails a one-time link to the
// admin inbox, ?op=set saves the new password from that link and signs in.
// Links point at fonkiart.com in production and at the deployment on previews.
function siteUrl() {
  return process.env.VERCEL_ENV === "production" || !process.env.VERCEL_URL
    ? "https://fonkiart.com"
    : `https://${process.env.VERCEL_URL}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const op = String(req.query?.op || "");
  if (op !== "request" && op !== "set") return res.status(404).json({ error: "Unknown operation" });
  const db = getServiceClient();
  if (!db) {
    console.error("admin-reset: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not configured");
    return res.status(503).json({ error: "Password reset not configured" });
  }
  try {
    if (op === "request") {
      return res.status(200).json(await opResetRequest(db, req.body || {}, { sender: senderAddress(), send: sendBrevo }, siteUrl()));
    }
    return res.status(200).json(await opResetSet(db, req.body || {}));
  } catch (e) {
    if (e instanceof InputError) return res.status(e.status).json({ error: e.message });
    console.error(`admin-reset ${op}:`, e?.message || e);
    return res.status(500).json({ error: "Something went wrong. Try again in a minute." });
  }
}
