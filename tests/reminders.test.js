import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectWaiting, opReminders, adminReminderNow, reminderSubject, SEND_HOUR_UTC } from "../api/_lib/reminders.js";
import { STORE_OPS, GET_OPS } from "../api/_lib/storeOps.js";
import { InputError } from "../api/_lib/errors.js";
import storeHandler from "../api/store.js";

// The daily "waiting for you" reminder to fonkiart@gmail.com (2026-11-13).
// Same in-memory stand-in for supabase-js as threads.test.js, plus a fake Storage
// that holds the "last ran / last sent" note.
function fakeDb(tables = {}, { bucket = false, uploadFails = false } = {}) {
  const files = {};
  const log = [];
  function from(table) {
    const filters = [];
    const b = {
      select() { return b; },
      eq(k, v) { filters.push([k, v]); return b; },
      order() { return b; },
      then(resolve, reject) {
        const rows = (tables[table] || []).filter(r => filters.every(([k, v]) => String(r[k]) === String(v)));
        return Promise.resolve({ data: rows.map(r => ({ ...r })), error: null }).then(resolve, reject);
      },
    };
    return b;
  }
  const storage = {
    async createBucket(name, opts) { log.push(["createBucket", name, opts]); bucket = true; return { data: { name }, error: null }; },
    from(name) {
      return {
        async download(path) {
          if (!bucket) return { data: null, error: { message: "Bucket not found" } };
          const body = files[`${name}/${path}`];
          return body == null ? { data: null, error: { message: "Object not found" } } : { data: new Blob([body]), error: null };
        },
        async upload(path, blob, opts) {
          if (uploadFails) return { data: null, error: { message: "Storage is down" } };
          if (!bucket) return { data: null, error: { message: "Bucket not found" } };
          files[`${name}/${path}`] = await blob.text();
          log.push(["upload", name, path, opts]);
          return { data: { path }, error: null };
        },
      };
    },
  };
  const note = () => files["system/reminders.json"] ? JSON.parse(files["system/reminders.json"]) : null;
  return { from, storage, log, note };
}

const mailbox = () => {
  const sent = [];
  return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); return { messageId: "<m@x>" }; } };
};
const at = (iso) => new Date(iso);
const inHour = at(`2026-11-14T${String(SEND_HOUR_UTC).padStart(2, "0")}:20:00Z`);
const cronReq = (headers = {}) => ({ method: "GET", query: { op: "reminders" }, headers: { "user-agent": "vercel-cron/1.0", ...headers } });

const TABLES = () => ({
  Requests: [
    { id: 1, name: "Ana <b>Lopez</b>", email: "ana@example.com", message: "Do you paint dogs?", status: "new", created_at: "2026-11-12T09:00:00Z" },
    { id: 2, name: "Bo", email: "bo@example.com", message: "Thanks!", status: "in_progress", created_at: "2026-11-01T09:00:00Z" },
    { id: 3, name: "Cy", email: "cy@example.com", message: "Got it", status: "completed", created_at: "2026-11-01T09:00:00Z" },
    { id: 4, name: "Di", email: "di@example.com", message: "One more question", status: "new", thread_token: "t".repeat(40), created_at: "2026-11-14T08:00:00Z" },
    { id: 5, name: "Ed", email: "ed@example.com", message: "No status yet", status: null, created_at: "2026-11-13T09:00:00Z" },
  ],
  Orders: [
    { id: 1, client_email: "ana@example.com", item_title: "Flamingo Party", amount: 1200, status: "pending", created_at: "2026-11-11T09:00:00Z" },
    { id: 2, client_email: "bo@example.com", item_title: "Madame Mango", amount: 900, status: "confirmed", created_at: "2026-11-13T09:00:00Z" },
    { id: 3, client_email: "cy@example.com", item_title: "Shipped one", amount: 50, status: "shipped", created_at: "2026-11-01T09:00:00Z" },
    { id: 4, client_email: "di@example.com", item_title: "Delivered one", amount: 50, status: "delivered", created_at: "2026-11-01T09:00:00Z" },
    { id: 5, client_email: "ed@example.com", item_title: "Invoice not approved", amount: 300, status: "pending", invoice_token: "i1", invoice_approved: false, created_at: "2026-11-10T09:00:00Z" },
    { id: 6, client_email: "fa@example.com", item_title: "Invoice approved", amount: 400, status: "pending", invoice_token: "i2", invoice_approved: true, created_at: "2026-11-10T09:00:00Z" },
  ],
});

test("waiting = requests still New (or a customer reply) + orders Pending/Confirmed, minus invoices the customer hasn't approved", async () => {
  const w = await collectWaiting(fakeDb(TABLES()), inHour);
  assert.deepEqual(w.requests.map(r => r.email), ["ana@example.com", "di@example.com", "ed@example.com"]);
  assert.deepEqual(w.requests.map(r => r.replied), [false, true, false]);
  assert.deepEqual(w.requests.map(r => r.days), [2, 0, 1]);
  assert.deepEqual(w.orders.map(o => o.title), ["Flamingo Party", "Madame Mango", "Invoice approved"]);
  assert.deepEqual(w.orders.map(o => o.days), [3, 1, 4]);
});

test("subject counts both kinds, singular and plural", () => {
  assert.equal(reminderSubject({ requests: [1, 2], orders: [1] }), "Waiting for you: 2 messages to answer, 1 order to send · Fonkiart");
  assert.equal(reminderSubject({ requests: [1], orders: [] }), "Waiting for you: 1 message to answer · Fonkiart");
});

test("daily run: outside the send hour it does nothing at all", async () => {
  const db = fakeDb(TABLES(), { bucket: true });
  const mail = mailbox();
  assert.deepEqual(await opReminders(db, cronReq(), mail, at("2026-11-14T04:00:00Z")), { ok: true, sent: false, reason: "not the time" });
  assert.equal(mail.sent.length, 0);
  assert.equal(db.note(), null);
});

test("daily run: first time makes the PRIVATE note bucket, emails fonkiart@gmail.com once, records it", async () => {
  const db = fakeDb(TABLES());
  const mail = mailbox();
  assert.deepEqual(await opReminders(db, cronReq(), mail, inHour), { ok: true, sent: true });
  assert.deepEqual(db.log.find(l => l[0] === "createBucket"), ["createBucket", "system", { public: false }]);
  assert.equal(mail.sent.length, 1);
  const m = mail.sent[0];
  assert.equal(m.to, "fonkiart@gmail.com");
  assert.equal(m.subject, "Waiting for you: 3 messages to answer, 3 orders to send · Fonkiart");
  assert.ok(m.htmlContent.includes("Ana &lt;b&gt;Lopez&lt;/b&gt;"), "names are escaped");
  assert.ok(!m.htmlContent.includes("<b>Lopez"), "no raw HTML from a visitor");
  assert.ok(m.htmlContent.includes("They replied to your answer"));
  assert.ok(m.htmlContent.includes("Confirmed, not sent yet"));
  assert.ok(!m.htmlContent.includes("Shipped one") && !m.htmlContent.includes("Invoice not approved"));
  const note = db.note();
  assert.equal(note.lastSentAt, inHour.toISOString());
  assert.equal(note.lastRunBy, "vercel-cron/1.0");
  assert.deepEqual(note.lastSent, { requests: 3, orders: 3 });
});

test("daily run: a second call the same day sends nothing (the cron may fire twice, or anyone may hit the URL)", async () => {
  const db = fakeDb(TABLES());
  const mail = mailbox();
  await opReminders(db, cronReq(), mail, inHour);
  const later = new Date(inHour.getTime() + 30 * 60 * 1000);
  assert.deepEqual(await opReminders(db, cronReq({ "user-agent": "curl/8" }), mail, later), { ok: true, sent: false, reason: "already sent today" });
  assert.equal(mail.sent.length, 1);
  assert.equal(db.note().lastRunAt, later.toISOString());
  assert.equal(db.note().lastSentAt, inHour.toISOString());
  // Next day it sends again.
  const nextDay = new Date(inHour.getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(await opReminders(db, cronReq(), mail, nextDay), { ok: true, sent: true });
  assert.equal(mail.sent.length, 2);
});

test("daily run: nothing waiting means no email", async () => {
  const db = fakeDb({ Requests: [{ id: 2, status: "completed" }], Orders: [{ id: 3, status: "delivered" }] });
  const mail = mailbox();
  assert.deepEqual(await opReminders(db, cronReq(), mail, inHour), { ok: true, sent: false, reason: "nothing waiting" });
  assert.equal(mail.sent.length, 0);
  assert.ok(db.note().lastRunAt, "the run is still recorded, so we can prove the cron fires");
});

test("daily run: if the note can't be saved, nothing is sent (an unrecorded send could repeat)", async () => {
  const db = fakeDb(TABLES(), { bucket: true, uploadFails: true });
  const mail = mailbox();
  await assert.rejects(opReminders(db, cronReq(), mail, inHour), /Storage is down/);
  assert.equal(mail.sent.length, 0);
});

test("daily run: once CRON_SECRET is set, only a caller holding it gets in", async () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "s3cret-value";
  try {
    const mail = mailbox();
    await assert.rejects(opReminders(fakeDb(TABLES()), cronReq(), mail, inHour), (e) => e instanceof InputError && e.status === 401);
    await assert.rejects(opReminders(fakeDb(TABLES()), cronReq({ authorization: "Bearer wrong" }), mail, inHour), (e) => e.status === 401);
    assert.equal(mail.sent.length, 0);
    assert.deepEqual(await opReminders(fakeDb(TABLES()), cronReq({ authorization: "Bearer s3cret-value" }), mail, inHour), { ok: true, sent: true });
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
});

test("admin 'send it now': any hour, same email, doesn't use up the day's reminder", async () => {
  const db = fakeDb(TABLES(), { bucket: true });
  const mail = mailbox();
  const out = await adminReminderNow(db, mail, at("2026-11-14T04:00:00Z"));
  assert.equal(out.sent, true);
  assert.equal(out.to, "fonkiart@gmail.com");
  assert.equal(out.requests, 3);
  assert.equal(out.orders, 3);
  assert.equal(mail.sent.length, 1);
  assert.equal(db.note(), null, "the daily note is untouched");
});

test("the store door: GET is let in for the reminder only; every other op stays POST-only", async () => {
  const res = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const a = res(); await storeHandler({ method: "GET", query: { op: "order" }, headers: {} }, a);
  assert.equal(a.code, 405);
  const b = res(); await storeHandler({ method: "GET", query: { op: "reminders" }, headers: {} }, b);
  assert.notEqual(b.code, 405, "the reminder gets past the method check");
  assert.deepEqual([...GET_OPS], ["reminders"]);
  assert.equal(typeof STORE_OPS.reminders, "function");
});

test("vercel.json: the cron calls the rewrite, the rewrite reaches the reminder op, at the send hour", () => {
  const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const cron = v.crons.find(c => c.path === "/api/cron/reminders");
  assert.ok(cron, "cron is scheduled");
  assert.equal(cron.schedule, `0 ${SEND_HOUR_UTC} * * *`);
  const rw = v.rewrites.find(r => r.source === cron.path);
  assert.equal(rw.destination, "/api/store?op=reminders");
});
