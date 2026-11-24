import crypto from "crypto";

// The pass that lets a browser save a cart for an email it only TYPED (Andy, 2026-11-23, "all 8":
// anyone who typed a buyer's email could change or empty that buyer's saved cart). Only the browser
// that gave the email FIRST ever gets one (storeOps.js opWelcome: the Leads row was made in that
// very call). Someone typing an email that is on the list already gets none, so they can't touch
// that person's saved cart (cartMemory.js opRememberCart); its owner signs in instead.
//
// "<when it was made, ms in base 36>.<HMAC-SHA256, base64url>". Nothing is stored: it is worked out
// again from the email, the coupon code on its Leads row and when it was made. So it is good for
// that one email only; it ends after 30 days; it dies when the row is deleted and made again (a new
// code); and it changes nothing once its owner has saved that cart signed in (cartMemory.js). The key is derived from the server's own service key, as threads.js inboundKey does:
// nothing new to keep, and it changes if that key is ever changed. Never logged.

export const PASS_DAYS = 30;
const PASS_MS = PASS_DAYS * 24 * 60 * 60 * 1000;
const SHAPE = /^([0-9a-z]{1,11})\.([A-Za-z0-9_-]{43})$/;
const isText = (v) => typeof v === "string" && v !== "";

function passKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? crypto.createHmac("sha256", secret).update("fonkiart cart pass").digest() : null;
}

const sign = (key, email, code, issued) =>
  crypto.createHmac("sha256", key).update(JSON.stringify(["cart-pass:1", email, code, issued])).digest("base64url");

// email: lower case, as Leads keeps it. code: the coupon code on its Leads row. now: when (a Date or
// ms). null when the server has no key, or there is no email or code to make it from.
export function makePass(email, code, now = Date.now()) {
  const key = passKey();
  const ms = Number(now);
  if (!key || !isText(email) || !isText(code) || !Number.isSafeInteger(ms) || ms < 0) return null;
  const issued = ms.toString(36);
  return `${issued}.${sign(key, email, code, issued)}`;
}

// Is this pass good for this email and this code, now? The signature is worked out and compared the
// same way whether or not there is a code, so the answer takes as long for an email nobody knows.
export function goodPass(pass, email, code, now = Date.now()) {
  const key = passKey();
  const [, issued, given] = (isText(pass) && pass.match(SHAPE)) || [];
  if (!key || !given || !isText(email)) return false;
  const made = parseInt(issued, 36);
  const age = Number(now) - made;
  if (made.toString(36) !== issued || !(age >= 0 && age <= PASS_MS)) return false;
  const right = sign(key, email, isText(code) ? code : "", issued);
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(right)) && isText(code);
}
