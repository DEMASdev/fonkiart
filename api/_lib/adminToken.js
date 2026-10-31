import crypto from "crypto";

const TTL_MS = 1000 * 60 * 60 * 24;

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function issueAdminToken(secret, now = Date.now()) {
  const expires = now + TTL_MS;
  return `${expires}.${sign(secret, String(expires))}`;
}

export function isValidAdminToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string") return false;
  const [expiresStr, sig] = token.split(".");
  const expires = Number(expiresStr);
  if (!expires || !/^[0-9a-f]{64}$/i.test(sig || "") || now > expires) return false;
  const expected = sign(secret, expiresStr);
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

export function samePassword(given, actual) {
  if (typeof given !== "string" || typeof actual !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(a, b);
}

export function bearer(req) {
  const h = req.headers?.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
