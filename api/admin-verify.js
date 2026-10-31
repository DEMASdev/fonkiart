import { isValidAdminToken } from "./_lib/adminToken.js";

// Lets the client re-check a stored session token on every visit, so a
// token that's expired, forged, or left over from a rotated password gets
// rejected even though it's still sitting in localStorage.
export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.token : (req.body || {}).token;
  return res.status(200).json({ valid: isValidAdminToken(token, process.env.ADMIN_PASSWORD) });
}
