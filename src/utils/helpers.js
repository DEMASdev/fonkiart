import { BREVO_API_KEY, BREVO_SENDER } from "../lib/supabase";

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

// Sequential order numbers: Orders.id is an auto-incrementing integer.
// Offset chosen so the next order (id = current max + 1) is FA-1720, then +1 each order.
export const ORDER_REF_OFFSET = 1710;
export const formatOrderRef = (id) => `FA-${Number(id) + ORDER_REF_OFFSET}`;

// Sends email via direct Brevo call when a browser-side API key is available (local dev);
// otherwise falls back to the serverless proxy (production).
// In production (fonkiart.com / Vercel), VITE_BREVO_API_KEY is intentionally NOT set —
// only the server-side BREVO_API_KEY is set, keeping the key out of the browser bundle.
export async function sendEmail({ to, subject, htmlContent, replyTo } = {}) {
  const toArr = typeof to === "string" ? [{ email: to }] : to;
  const payload = { sender: { name: "Fonkiart", email: BREVO_SENDER }, to: toArr, subject, htmlContent };
  if (replyTo) payload.replyTo = { email: replyTo };

  if (BREVO_API_KEY) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Brevo ${r.status}${text ? `: ${text}` : ""}`);
    }
    return;
  }

  const r = await fetch("/api/send-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Email API ${r.status}${text ? `: ${text}` : ""}`);
  }
}

export async function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

export async function saveData(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}
