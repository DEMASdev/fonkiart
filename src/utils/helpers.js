import { BREVO_API_KEY, BREVO_SENDER } from "../lib/supabase";

export const STORE_KEY      = "fonkiart-v2";
export const CART_TTL_HOURS = 2;

export const SESSION_ID = (() => {
  let id = localStorage.getItem("fonkiart-session-id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("fonkiart-session-id", id); }
  return id;
})();

export function generateCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `FK-${part(4)}-${part(4)}`;
}

export async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Sends email via serverless proxy in production; falls back to direct Brevo in local dev.
// In production (fonkiart.com / Vercel), VITE_BREVO_API_KEY is intentionally NOT set —
// only the server-side BREVO_API_KEY is set, keeping the key out of the browser bundle.
export async function sendEmail({ to, subject, htmlContent, replyTo } = {}) {
  const toArr = typeof to === "string" ? [{ email: to }] : to;
  const payload = { sender: { name: "Fonkiart", email: BREVO_SENDER }, to: toArr, subject, htmlContent };
  if (replyTo) payload.replyTo = { email: replyTo };

  const isLocal = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168.");
  if (isLocal && BREVO_API_KEY) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}`);
    return;
  }

  const r = await fetch("/api/send-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Email API ${r.status}`);
}

const _urgencyCache = new Map();
export function getUrgency(id) {
  if (!_urgencyCache.has(id)) {
    _urgencyCache.set(id, {
      inDemand:  Math.random() > 0.30,
      cartCount: Math.floor(Math.random() * 4),
    });
  }
  return _urgencyCache.get(id);
}

export async function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

export async function saveData(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}
