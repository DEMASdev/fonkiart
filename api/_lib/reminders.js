import crypto from "crypto";
import { InputError } from "./errors.js";
import { ADMIN_EMAIL } from "./adminSecret.js";
import { bearer } from "./adminToken.js";
import * as T from "./emails.js";
import { MAX_ROWS } from "./reminderRows.js";
import { readNote, writeNote } from "./systemNote.js";
import { CART_DAYS, cartsLeft, forgetOldCarts } from "./cartMemory.js";
// The same rule as Admin -> Orders "Didn't finish paying", imported, never copied.
import { cartRef, unfinishedCard, unfinishedThisWeek } from "../../src/lib/orderRow.js";

// "Waiting for you" reminder (Andy, 2026-11-13): "there should be a warning sent to
// fonkiart@gmail.com whenever there's a message waiting for answer or order waiting to
// be fulfilled". The instant alerts (new order, new request, customer reply) already go
// to the shop the moment something arrives; this is the daily nudge while it still waits.
//
// Vercel's cron calls GET /api/cron/reminders once a day (vercel.json). On the Hobby plan
// it can fire any time inside the scheduled hour, so the email goes out only during
// SEND_HOUR_UTC and at most once per MIN_GAP_MS, whoever calls the URL. A small JSON note
// in a private Storage bucket remembers when it last ran and last sent.
//
// It also names the Cart checkouts a buyer started and never paid (Andy, 2026-11-22: "a warning
// to the admin saying .... this person had an order in the cart and didn't checkout"): their own
// part, "Didn't finish paying", from the last 7 days by the SAME rule as Admin -> Orders
// (src/lib/orderRow.js unfinishedThisWeek), and no longer under "Orders to send". And whoever
// left art in their saved cart (Andy, 2026-11-23, "all 8"; cartMemory.js cartsLeft): "Left in
// the cart".
//
// In those two parts each person is named ONCE (Andy, 2026-11-23): a checkout, by its FA-
// reference, in one daily email only; someone who left art in their cart, once in CART_DAYS. The
// note keeps who was named and when (named). Admin -> Orders keeps the whole list. A note that
// can't be read names them again: better twice than never.

export const SEND_HOUR_UTC = 13;              // 8–9 am in the Florida Keys in winter, 9–10 am in summer
const HOUR_MS = 60 * 60 * 1000;
const MIN_GAP_MS = 20 * HOUR_MS;
const FILE = "reminders.json";
const DAY_MS = 24 * HOUR_MS;
const CART_RESTS_MS = 6 * HOUR_MS;            // a cart counts as left once it hasn't changed for this long
const NAMED_KEEP_MS = 45 * DAY_MS;            // who was named is kept this long, past both rules above

const daysSince = (iso, now) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : null;
};

// A request waits for the shop while its status is New. A customer's reply (on the
// site or by email) puts it back to New, so that case is covered too.
const requestWaits = (r) => !r.status || r.status === "new";

// An order waits to be fulfilled while it is Pending, Confirmed or Paid (paid = ship it).
// An invoice the customer hasn't approved yet waits on the customer, not the shop, so
// it's left out.
const orderWaits = (o) => {
  const s = o.status || "pending";
  if (s !== "pending" && s !== "confirmed" && s !== "paid") return false;
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
  const all = ords.data || [];
  const orders = all.filter(o => orderWaits(o) && !unfinishedCard(o)).map(o => ({
    title: o.item_title, amount: o.amount, email: o.client_email,
    status: o.status || "pending", days: daysSince(o.created_at, now),
  }));
  return { requests, orders, unfinished: unfinishedCheckouts(all, now), carts: await leftCarts(db, now) };
}

// Who left art in their saved cart (cartMemory.js cartsLeft), untouched for CART_RESTS_MS, and for
// how many hours. They never stop the email: one that can't be read names nobody.
async function leftCarts(db, now) {
  try {
    const carts = await cartsLeft(db, { now, limit: Infinity });
    return carts.filter(c => now.getTime() - Date.parse(c.at) >= CART_RESTS_MS)
      .map(c => ({ ...c, hours: Math.floor((now.getTime() - Date.parse(c.at)) / HOUR_MS) }));
  } catch (e) {
    console.warn("reminders: carts not read:", e?.code || "error");
    return [];
  }
}

// One entry per checkout: its rows share the Order Ref in their notes (one row per piece). Who
// (the name and phone the buyer typed at checkout), the pieces, the total, and when it started.
function unfinishedCheckouts(rows, now) {
  const byRef = new Map();
  for (const o of rows.filter(r => unfinishedThisWeek(r, now.getTime()))) {
    const ref = cartRef(o) || `#${o.id}`;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(o);
  }
  return [...byRef.entries()].map(([ref, list]) => {
    const first = list[0];
    return {
      ref, name: first.ship_name || first.client_name || "", email: first.client_email || "", phone: first.ship_phone || "",
      pieces: list.map(o => ({ title: o.item_title, amount: o.amount })),
      total: list.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
      started: first.created_at || null,
    };
  });
}

export function reminderSubject({ requests, orders, unfinished = [], carts = [] }) {
  const bits = [];
  if (requests.length) bits.push(`${requests.length} ${requests.length === 1 ? "message" : "messages"} to answer`);
  if (orders.length) bits.push(`${orders.length} ${orders.length === 1 ? "order" : "orders"} to send`);
  if (unfinished.length) bits.push(`${unfinished.length} didn't finish paying`);
  if (carts.length) bits.push(`${carts.length} left art in their ${carts.length === 1 ? "cart" : "carts"}`);
  return `Waiting for you: ${bits.join(", ")} · Fonkiart`;
}

const readState = (db) => readNote(db, FILE);
const writeState = (db, state) => writeNote(db, FILE, state, "reminder note");

const sameSecret = (given, actual) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(String(given)).digest(), crypto.createHash("sha256").update(String(actual)).digest());

// Who was named already, from the note: a checkout by its reference, a cart by its email.
const cartKey = (c) => `cart:${c.email}`;
const namedWithin = (iso, ms, now) => now.getTime() - (Date.parse(iso || "") || 0) <= ms;
const notNamed = (waiting, named, now) => ({
  ...waiting,
  unfinished: waiting.unfinished.filter(u => !namedWithin(named[u.ref], NAMED_KEEP_MS, now)),
  carts: waiting.carts.filter(c => !namedWithin(named[cartKey(c)], CART_DAYS * DAY_MS, now)),
});
// Who this email named: those it showed (MAX_ROWS of each), added to the ones kept, the oldest dropped.
function nowNamed(named, waiting, now) {
  const kept = Object.entries(named).filter(([, iso]) => namedWithin(iso, NAMED_KEEP_MS, now));
  const keys = [...waiting.unfinished.slice(0, MAX_ROWS).map(u => u.ref), ...waiting.carts.slice(0, MAX_ROWS).map(cartKey)];
  return { ...Object.fromEntries(kept), ...Object.fromEntries(keys.map(k => [k, now.toISOString()])) };
}
const namedIn = (state) => (state?.named && typeof state.named === "object" ? state.named : {});

// named: who was named already (the daily run), so only the others count and show. Without it
// (Admin's "send it now") everyone who waits does.
async function sendReminder(db, mail, now, named = null) {
  const all = await collectWaiting(db, now);
  const waiting = named ? notNamed(all, named, now) : all;
  const count = waiting.requests.length + waiting.orders.length + waiting.unfinished.length + waiting.carts.length;
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
  const { waiting, sent } = await sendReminder(db, mail, now, namedIn(state));
  if (sent) {
    const { requests, orders, unfinished, carts } = waiting;
    await writeState(db, {
      ...state, lastRunAt: now.toISOString(), lastRunBy: ranBy, lastSentAt: now.toISOString(),
      lastSent: { requests: requests.length, orders: orders.length, unfinished: unfinished.length, ...(carts.length && { carts: carts.length }) },
      named: nowNamed(namedIn(state), waiting, now),
    });
  }
  // Once a day, after the email, so it can never stop one: carts older than CART_DAYS are let go.
  await forgetOldCarts(db, now).catch(e => console.warn("reminders: old carts not let go:", e?.code || e?.message || "error"));
  return sent ? { ok: true, sent: true } : { ok: true, sent: false, reason: "nothing waiting" };
}

// Admin "send it now" (to test, or whenever Andy wants the list). Same email with everyone who
// waits, named before or not; no hour window, and it doesn't count as the day's reminder: it
// marks nobody as named.
export async function adminReminderNow(db, mail, now = new Date()) {
  const { waiting, sent } = await sendReminder(db, mail, now);
  const state = await readState(db);
  return {
    ok: true, sent, to: ADMIN_EMAIL,
    requests: waiting.requests.length, orders: waiting.orders.length, unfinished: waiting.unfinished.length, carts: waiting.carts.length,
    lastRunAt: state.lastRunAt || null, lastRunBy: state.lastRunBy || null, lastSentAt: state.lastSentAt || null,
  };
}
