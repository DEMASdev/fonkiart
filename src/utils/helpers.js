import { adminSendEmail } from "../lib/adminDb";

export const STORE_KEY = "fonkiart-v2";

export function generateCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `FK-${part(4)}-${part(4)}`;
}

export async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Admin screens only: /api/admin refuses to send unless the admin is logged in.
// Public forms send their emails from /api/store instead.
export async function sendEmail({ to, subject, htmlContent, replyTo } = {}) {
  await adminSendEmail({ to, subject, htmlContent, replyTo });
}

export async function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

export async function saveData(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch { /* best-effort local cache */ }
}
