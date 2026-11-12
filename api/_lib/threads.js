import crypto from "crypto";
import { InputError } from "./errors.js";
import { oneLine } from "./brevo.js";
import * as T from "./emails.js";
import { siteUrl } from "./site.js";

// Request conversations (Andy, 2026-11-12: "is there a way to answer from the site to
// keep the log of the conversation ?" → "set it up leave it working").
// The shop answers a request from the admin; the customer answers on a private page
// (fonkiart.com/?thread=<token>) or by replying to the email; every message is kept in
// RequestMessages. Email replies reach the site through Brevo's inbound parsing:
// reply.fonkiart.com's MX points at Brevo, which posts each email to op=inbound.

export const REPLY_DOMAIN = "reply.fonkiart.com";
// Stays false until an email sent to REPLY_DOMAIN has been seen landing in the log.
// While false, replies to our emails go to the shop's own address, exactly as before.
export const INBOUND_ON = false;

// Hex, so the token survives mail systems that lower-case the address it rides in.
const TOKEN_RE = /^[a-f0-9]{40}$/;
const MAX_MESSAGE = 5000;
const DAILY_LIMIT = 20;

export const newThreadToken = () => crypto.randomBytes(20).toString("hex");
export const threadLink = (token) => `${siteUrl()}/?thread=${token}`;
export const replyAddress = (token) => `r-${token}@${REPLY_DOMAIN}`;

function messageText(value) {
  if (typeof value !== "string") throw new InputError("Bad message");
  const s = value.trim();
  if (!s) throw new InputError("Missing message");
  if (s.length > MAX_MESSAGE) throw new InputError("Message is too long");
  return s;
}

function requestId(value) {
  const s = String(value ?? "");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(s)) throw new InputError("Bad request");
  return s;
}

async function messagesFor(db, id) {
  const { data, error } = await db.from("RequestMessages").select("*").eq("request_id", id).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getRequest(db, id) {
  const { data, error } = await db.from("Requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new InputError("Request not found", 404);
  return data;
}

async function ensureToken(db, request) {
  if (request.thread_token) return request.thread_token;
  const token = newThreadToken();
  const { error } = await db.from("Requests").update({ thread_token: token }).eq("id", request.id);
  if (error) throw error;
  return token;
}

const tellShop = (mail, request, message, via, replyTo) =>
  mail.send({
    to: mail.sender,
    subject: `New reply from ${oneLine(request.name || request.email || "a customer")}`,
    htmlContent: T.requestReplyStore({ name: request.name, email: request.email, message, via }),
    replyTo: replyTo || request.email || undefined,
  }).catch(e => console.warn("thread alert:", e?.message || e));

// ── admin ────────────────────────────────────────────────────

export async function adminThread(db, body) {
  const request = await getRequest(db, requestId(body.id));
  return { messages: await messagesFor(db, request.id) };
}

export async function adminReply(db, body, mail) {
  const request = await getRequest(db, requestId(body.id));
  const message = messageText(body.message);
  if (!request.email) throw new InputError("This request has no email address");
  // Fail before anything is sent if the log can't be written (table not created yet).
  const { error: logErr } = await db.from("RequestMessages").select("id").limit(1);
  if (logErr) throw new InputError("The conversation log isn't set up yet, so nothing was sent", 503);
  const token = await ensureToken(db, request);
  const sent = await mail.send({
    to: request.email,
    subject: "A reply from Fonkiart",
    htmlContent: T.requestReply({ name: request.name, message, link: threadLink(token) }),
    replyTo: INBOUND_ON ? replyAddress(token) : mail.sender,
  });
  const { error } = await db.from("RequestMessages").insert([{
    request_id: request.id, direction: "out", via: "site", body: message, email_message_id: sent?.messageId || null,
  }]);
  if (error) throw new InputError(`The email was sent, but it couldn't be saved to the conversation: ${error.message}`, 500);
  if (!request.status || request.status === "new") {
    await db.from("Requests").update({ status: "in_progress" }).eq("id", request.id);
  }
  return { ok: true };
}

// Creates Brevo's inbound webhook once (run from the admin; safe to run again).
export async function adminInboundSetup(fetchImpl = fetch) {
  const apiKey = process.env.BREVO_API_KEY;
  const key = inboundKey();
  if (!apiKey || !key) throw new InputError("Email service not configured", 503);
  const url = `https://fonkiart.com/api/store?op=inbound&key=${key}`;
  const headers = { accept: "application/json", "api-key": apiKey, "content-type": "application/json" };
  const list = await fetchImpl("https://api.brevo.com/v3/webhooks?type=inbound", { headers });
  const listed = await list.json().catch(() => ({}));
  // With no inbound webhook yet, Brevo answers 404 "Webhook record does not exist":
  // that means "none yet", so go on and create it.
  if (!list.ok && list.status !== 404) return { ok: false, message: listed.message || `Brevo answered ${list.status}` };
  if (list.ok && (listed.webhooks || []).some(w => w.url === url)) return { ok: true, already: true };
  const made = await fetchImpl("https://api.brevo.com/v3/webhooks", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "inbound", events: ["inboundEmailProcessed"], url, domain: REPLY_DOMAIN, description: "Fonkiart request replies" }),
  });
  const out = await made.json().catch(() => ({}));
  if (!made.ok) return { ok: false, message: out.message || `Brevo answered ${made.status}` };
  return { ok: true, already: false };
}

// ── the customer's private page ──────────────────────────────

async function findByToken(db, token) {
  const t = String(token ?? "").toLowerCase();
  if (!TOKEN_RE.test(t)) throw new InputError("This link is invalid", 404);
  const { data, error } = await db.from("Requests").select("*").eq("thread_token", t).limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new InputError("This link is invalid", 404);
  return data[0];
}

export async function opThread(db, body) {
  const request = await findByToken(db, body.token);
  const messages = await messagesFor(db, request.id);
  return {
    name: String(request.name || "").trim().split(/\s+/)[0] || "",
    original: { body: request.message || "", at: request.created_at || null },
    messages: messages.map(m => ({ from: m.direction === "out" ? "shop" : "you", body: m.body, at: m.created_at })),
  };
}

export async function opThreadReply(db, body, mail) {
  const request = await findByToken(db, body.token);
  const message = messageText(body.message);
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const today = (await messagesFor(db, request.id)).filter(m => m.direction === "in" && new Date(m.created_at).getTime() > dayAgo);
  if (today.length >= DAILY_LIMIT) throw new InputError("Too many messages today. Please email us instead.", 429);
  const { error } = await db.from("RequestMessages").insert([{ request_id: request.id, direction: "in", via: "site", body: message }]);
  if (error) throw error;
  await db.from("Requests").update({ status: "new" }).eq("id", request.id);
  await tellShop(mail, request, message, "site");
  return { ok: true };
}

// ── emails coming back through Brevo ─────────────────────────

// The webhook's secret, derived from the server's own service key: nothing new to
// store, and it changes if that key is ever rotated (then run the setup again).
export function inboundKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update("fonkiart-inbound-v1").digest("hex").slice(0, 40);
}

function sameKey(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const ADDR_RE = new RegExp(`^r-([a-f0-9]{40})@${REPLY_DOMAIN.replace(/\./g, "\\.")}$`);

export function tokenFromRecipients(item) {
  const all = [...(item.To || []), ...(item.Cc || []), ...(item.Recipients || [])];
  for (const r of all) {
    const m = String(typeof r === "string" ? r : r?.Address || "").trim().toLowerCase().match(ADDR_RE);
    if (m) return m[1];
  }
  return null;
}

const bare = (id) => String(id || "").trim().replace(/^<|>$/g, "");

async function matchRequest(db, item) {
  const token = tokenFromRecipients(item);
  if (token) {
    try { return await findByToken(db, token); } catch { /* fall through to the header */ }
  }
  const parent = bare(item.InReplyTo);
  if (!parent) return null;
  for (const id of [`<${parent}>`, parent]) {
    const { data } = await db.from("RequestMessages").select("*").eq("email_message_id", id).limit(1);
    if (data?.[0]) return getRequest(db, data[0].request_id).catch(() => null);
  }
  return null;
}

export async function opInbound(db, req, mail) {
  const expected = inboundKey();
  if (!expected || !sameKey(req.query?.key || "", expected)) throw new InputError("Unknown operation", 404);
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
  let saved = 0;
  for (const item of items) {
    const from = String(item.From?.Address || "").trim();
    const subject = oneLine(item.Subject || "(no subject)").slice(0, 200);
    const text = String(item.ExtractedMarkdownMessage || item.RawTextBody || "").trim().slice(0, 20000) || "(empty message)";
    const files = Array.isArray(item.Attachments) ? item.Attachments.length : 0;
    const body = files ? `${text}\n\n[${files} attachment${files > 1 ? "s" : ""} came with this email. They are not kept here.]` : text;
    const msgId = item.MessageId ? String(item.MessageId).slice(0, 300) : null;
    if (msgId) {
      const { data: seen } = await db.from("RequestMessages").select("id").eq("email_message_id", msgId).limit(1);
      if (seen?.length) continue;   // Brevo sent this one before
    }
    const request = await matchRequest(db, item);
    if (!request) {
      // Never drop a customer's email: pass it to the shop inbox as is.
      await mail.send({
        to: mail.sender,
        subject: `Email to ${REPLY_DOMAIN}: ${subject}`,
        htmlContent: T.inboundUnmatched({ from, subject, text: body }),
        replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) ? from : undefined,
      }).catch(e => console.warn("inbound forward:", e?.message || e));
      continue;
    }
    const { error } = await db.from("RequestMessages").insert([{ request_id: request.id, direction: "in", via: "email", body, email_message_id: msgId }]);
    if (error) console.warn("inbound save:", error.message);
    else saved++;
    await db.from("Requests").update({ status: "new" }).eq("id", request.id);
    await tellShop(mail, request, body, "email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) ? from : undefined);
  }
  return { ok: true, saved };
}
