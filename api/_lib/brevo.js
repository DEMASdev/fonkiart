export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function oneLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

// Previews only get the VITE_ copy of the sender address (public anyway).
export function senderAddress() {
  return process.env.BREVO_SENDER || process.env.VITE_BREVO_SENDER || "";
}

export async function sendBrevo({ to, subject, htmlContent, replyTo }) {
  const key = process.env.BREVO_API_KEY;
  const sender = senderAddress();
  if (!key || !sender) throw new Error("Email service not configured");
  const payload = {
    sender: { name: "Fonkiart", email: sender },
    to: typeof to === "string" ? [{ email: to }] : to,
    subject: oneLine(subject),
    htmlContent,
  };
  if (replyTo) payload.replyTo = { email: replyTo };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": key, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text().catch(() => "")}`);
  // { messageId } — kept with a request's reply so the customer's answer can be matched to it.
  return r.json().catch(() => ({}));
}
