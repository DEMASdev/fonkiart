import crypto from "crypto";
import { InputError } from "./errors.js";
import { ADMIN_EMAIL } from "./adminSecret.js";
import { bearer } from "./adminToken.js";
import * as T from "./emails.js";

// "Waiting for you" reminder (Andy, 2026-11-13): "there should be a warning sent to
// fonkiart@gmail.com whenever there's a message waiting for answer or order waiting to
// be fulfilled". The instant alerts (new order, new request, customer reply) already go
// to the shop the moment something arrives; this is the daily nudge while it still waits.
//
// Vercel's cron calls GET /api/cron/reminders once a day (vercel.json). On the Hobby plan
// it can fire any time inside the scheduled hour, so the email goes out only during
// SEND_HOUR_UTC and at most once per MIN_GAP_MS, whoever calls the URL. A small JSON note
// in a private Storage bucket remembers when it last ran and last sent.

export const SEND_HOUR_UTC = 13;              // 8–9 am in the Florida Keys in winter, 9–10 am in summer
const MIN_GAP_MS = 20 * 60 * 60 * 1000;
const BUCKET = "system";
const FILE = "reminders.json";
const DAY_MS = 24 * 60 * 60 * 1000;

const daysSince = (iso, now) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : null;
};

// A request waits for the shop while its status is New. A customer's reply (on the
// site or by email) puts it back to New, so that case is covered too.
const requestWaits = (r) => !r.status || r.status === "new";

// An order waits to be fulfilled while it is Pending or Confirmed. An invoice the
// customer hasn't approved yet waits on the customer, not the shop, so it's left out.
const orderWaits = (o) => {
  const s = o.status || "pending";
  if (s !== "pending" && s !== "confirmed") return false;
  if (o.invoice_token && !o.invoice_approved) return false;
  return true;
};

export async function collectWaiting(db, now = new Date()) {
  const [reqs, ords] = await Promise.all([
    db.from("Requests").select("*").order("created_at", { ascending: true }),
    db.from("Orders").select("*").order("created_at", { ascending: true }),
  ]);
  if (reqs.error) throw reqs.error;
  if (ords.error) throw ords.error;
  const requests = (reqs.data || []).filter(requestWaits).map(r => ({
    name: r.name, email: r.email, message: r.message,
    replied: Boolean(r.thread_token),        // the shop answered before and the customer wrote back
    days: daysSince(r.created_at, now),
  }));
  const orders = (ords.data || []).filter(orderWaits).map(o => ({
    title: o.item_title, amount: o.amount, email: o.client_email,
    status: o.status || "pending", days: daysSince(o.created_at, now),
  }));
  return { requests, orders };
}

export function reminderSubject({ requests, orders }) {
  const bits = [];
  if (requests.length) bits.push(`${requests.length} ${requests.length === 1 ? "message" : "messages"} to answer`);
  if (orders.length) bits.push(`${orders.length} ${orders.length === 1 ? "order" : "orders"} to send`);
  return `Waiting for you: ${bits.join(", ")} · Fonkiart`;
}

async function readState(db) {
  const { data, error } = await db.storage.from(BUCKET).download(FILE);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) || {}; } catch { return {}; }
}

async function writeState(db, state) {
  const put = () => db.storage.from(BUCKET).upload(FILE, new Blob([JSON.stringify(state)], { type: "application/json" }), { contentType: "application/json", upsert: true });
  let { error } = await put();
  if (error && /not.?found|bucket/i.test(error.message || "")) {
    const made = await db.storage.createBucket(BUCKET, { public: false });
    if (made.error && !/exist/i.test(made.error.message || "")) throw new Error(`reminder note bucket: ${made.error.message}`);
    ({ error } = await put());
  }
  if (error) throw new Error(`reminder note: ${error.message || error}`);
}

const sameSecret = (given, actual) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(String(given)).digest(), crypto.createHash("sha256").update(String(actual)).digest());

async function sendReminder(db, mail, now) {
  const waiting = await collectWaiting(db, now);
  const count = waiting.requests.length + waiting.orders.length;
  if (!count) return { waiting, sent: false };
  await mail.send({ to: ADMIN_EMAIL, subject: reminderSubject(waiting), htmlContent: T.reminderStore(waiting) });
  return { waiting, sent: true };
}

// The daily run (GET /api/cron/reminders). If CRON_SECRET is ever set in Vercel, Vercel
// sends it with the cron call and nothing else gets in; until then the hour window and the
// once-a-day note are what stop anyone from using this URL to fill the inbox.
export async function opReminders(db, req, mail, now = new Date()) {
  const secret = process.env.CRON_SECRET;
  if (secret && !sameSecret(bearer(req), secret)) throw new InputError("Not allowed", 401);
  if (now.getUTCHours() !== SEND_HOUR_UTC) return { ok: true, sent: false, reason: "not the time" };

  const state = await readState(db);
  const ranBy = String(req.headers?.["user-agent"] || "").slice(0, 60);
  // Written first, before anything is sent: it proves the cron fires, and if the note
  // can't be saved nothing goes out (a send we can't record could repeat).
  await writeState(db, { ...state, lastRunAt: now.toISOString(), lastRunBy: ranBy });
  if (state.lastSentAt && now.getTime() - Date.parse(state.lastSentAt) < MIN_GAP_MS) {
    return { ok: true, sent: false, reason: "already sent today" };
  }
  const { waiting, sent } = await sendReminder(db, mail, now);
  if (!sent) return { ok: true, sent: false, reason: "nothing waiting" };
  await writeState(db, {
    ...state, lastRunAt: now.toISOString(), lastRunBy: ranBy,
    lastSentAt: now.toISOString(), lastSent: { requests: waiting.requests.length, orders: waiting.orders.length },
  });
  return { ok: true, sent: true };
}

// Admin "send it now" (to test, or whenever Andy wants the list). Same email, no hour
// window, and it doesn't count as the day's reminder.
export async function adminReminderNow(db, mail, now = new Date()) {
  const { waiting, sent } = await sendReminder(db, mail, now);
  const state = await readState(db);
  return {
    ok: true, sent, to: ADMIN_EMAIL,
    requests: waiting.requests.length, orders: waiting.orders.length,
    lastRunAt: state.lastRunAt || null, lastRunBy: state.lastRunBy || null, lastSentAt: state.lastSentAt || null,
  };
}
