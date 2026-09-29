import crypto from "crypto";

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Lets the client re-check a stored session token on every visit, so a
// token that's expired, forged, or left over from a rotated password gets
// rejected even though it's still sitting in localStorage.
export default async function handler(req, res) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const token = req.method === "GET" ? req.query.token : (req.body || {}).token;

  if (!ADMIN_PASSWORD || typeof token !== "string") {
    return res.status(200).json({ valid: false });
  }

  const [expiresStr, sig] = token.split(".");
  const expires = Number(expiresStr);
  if (!expires || !/^[0-9a-f]{64}$/i.test(sig || "") || Date.now() > expires) {
    return res.status(200).json({ valid: false });
  }

  const expected = sign(ADMIN_PASSWORD, expiresStr);
  const valid = crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  return res.status(200).json({ valid });
}
