import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { issueAdminToken } from "./_lib/adminToken.js";
import { adminCredentials } from "./_lib/adminSecret.js";

// Checks the admin password server-side and, on success, hands back a signed
// session token. The password never ships to the browser — unlike the old
// VITE_ADMIN_PASSWORD, which Vite baked straight into the public JS bundle.
// It is the ADMIN_PASSWORD env var until a reset from the site stores a new one
// (see api/_lib/adminSecret.js).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let creds;
  try {
    creds = await adminCredentials(getServiceClient());
  } catch (e) {
    console.error("admin-login:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Admin login unavailable, try again in a minute" });
  }
  if (!creds) {
    console.error("admin-login: no admin password configured");
    return res.status(500).json({ ok: false, error: "Admin login not configured" });
  }

  const { password } = req.body || {};
  if (!creds.check(password)) {
    return res.status(401).json({ ok: false, error: "Incorrect password" });
  }

  return res.status(200).json({ ok: true, token: issueAdminToken(creds.secret) });
}
