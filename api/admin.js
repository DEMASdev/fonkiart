import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { isValidAdminToken, bearer } from "./_lib/adminToken.js";
import { sendBrevo } from "./_lib/brevo.js";
import { InputError } from "./_lib/errors.js";
import { runQuery, signUpload, removeFiles, adminEmail } from "./_lib/adminOps.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });
  if (!isValidAdminToken(bearer(req), process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: { message: "Admin login required" } });
  }
  const db = getServiceClient();
  if (!db) {
    console.error("admin: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not configured");
    return res.status(503).json({ error: { message: "Database not configured" } });
  }
  const body = req.body || {};
  try {
    if (body.kind === "query") return res.status(200).json(await runQuery(db, body.table, body.chain));
    if (body.kind === "storage-sign") return res.status(200).json(await signUpload(db, body.path));
    if (body.kind === "storage-remove") return res.status(200).json(await removeFiles(db, body.paths));
    if (body.kind === "email") return res.status(200).json(await adminEmail({ send: sendBrevo }, body));
    return res.status(400).json({ error: { message: "Unknown request" } });
  } catch (e) {
    if (e instanceof InputError) return res.status(e.status).json({ error: { message: e.message } });
    console.error("admin:", e?.message || e);
    return res.status(500).json({ error: { message: e?.message || "Server error" } });
  }
}
