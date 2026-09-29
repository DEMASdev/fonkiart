import crypto from "crypto";

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Checks the admin password server-side and, on success, hands back a
// signed session token. The real password (process.env.ADMIN_PASSWORD)
// never ships to the browser — unlike the old VITE_ADMIN_PASSWORD, which
// Vite baked straight into the public JS bundle for anyone to read.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    console.error("admin-login: ADMIN_PASSWORD not configured");
    return res.status(500).json({ ok: false, error: "Admin login not configured" });
  }

  const { password } = req.body || {};
  if (typeof password !== "string" || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Incorrect password" });
  }

  const expires = Date.now() + 1000 * 60 * 60 * 24; // 24h session
  const token = `${expires}.${sign(ADMIN_PASSWORD, String(expires))}`;
  return res.status(200).json({ ok: true, token });
}
