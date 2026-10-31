import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { isValidAdminToken } from "./_lib/adminToken.js";
import { adminCredentials } from "./_lib/adminSecret.js";

// Lets the client re-check a stored session token on every visit, so a
// token that's expired, forged, or left over from a changed password gets
// rejected even though it's still sitting in localStorage.
export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.token : (req.body || {}).token;
  try {
    const creds = await adminCredentials(getServiceClient());
    return res.status(200).json({ valid: !!creds && isValidAdminToken(token, creds.secret) });
  } catch (e) {
    console.error("admin-verify:", e?.message || e);
    return res.status(503).json({ valid: false });
  }
}
