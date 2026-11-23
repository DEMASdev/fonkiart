// The follow-up on a Cart checkout the buyer started and never paid (Andy, 2026-11-22: "3au good
// what you said , but there should be a follow up on that unfinished maybe order ! a warning to the
// admin saying .... this person had an order in the cart and didn't checkout ... maybe send them a
// coupon ?").
//  1. The daily "Waiting for you" email names them in a part of their own, "Didn't finish paying",
//     from the last 7 days by Admin's own rule (imported, never copied), and no longer counts them
//     under "Orders to send".
//  2. Each row of Admin -> Orders' "Didn't finish paying" has "Send a coupon": ONE email to the buyer,
//     only on Andy's tap, asked on the page, behind the admin login, ONCE per checkout (then a
//     plain line, "Coupon sent <date>", and the server refuses a second). How much off he chooses
//     (tests/couponSend.test.js); here, what goes when he chooses nothing: the shop's %.
// FAKE data only: every person, email, phone and code here is made up, and nothing is sent anywhere.
// Measured: with 3d36fc7's own version of the file each test checks (one at a time), every test
// fails there but the controls and "the daily email only ever goes to the shop", which held before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { collectWaiting, opReminders, adminReminderNow, reminderSubject, SEND_HOUR_UTC } from "../api/_lib/reminders.js";
import { couponStatus, couponSend } from "../api/_lib/unfinishedCoupon.js";
import { withArt } from "../api/_lib/emailArt.js";
import * as T from "../api/_lib/emails.js";
import { CARD_NOTE, unfinishedThisWeek } from "../src/lib/orderRow.js";
import { unfinishedLink, readAdminLink, withoutAdminLink, askOpenUnfinished, wantsOpenUnfinished, doneOpenUnfinished } from "../src/lib/adminLink.js";
import { issueAdminToken } from "../api/_lib/adminToken.js";
import { newCouponCode } from "../api/_lib/storeOps.js";
import { codePx, CODE_PX } from "../src/lib/couponCode.js";
import * as AE from "../src/lib/adminEmails.js";
import adminHandler from "../api/admin.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(`2026-11-22T${String(SEND_HOUR_UTC).padStart(2, "0")}:20:00Z`);
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

// A small stand-in for supabase-js: select / eq / in / order / limit / maybeSingle / insert / update,
// and Storage for the server's private notes.
function fakeDb(tables = {}, { failUpload = false } = {}) {
  const writes = [], files = {};
  let bucket = false;
  const from = (table) => {
    let op = "select", payload = null, lim = null, single = false;
    const filters = [], sorts = [];
    const b = {
      select() { return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { filters.push((r) => String(r[k]) === String(v)); return b; },
      in(k, vs) { filters.push((r) => vs.map(String).includes(String(r[k]))); return b; },
      order(k, { ascending = true } = {}) { sorts.push([k, ascending ? 1 : -1]); return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    function run() {
      const rows = (tables[table] ||= []);
      const key = (r, k) => String(r[k] ?? "");
      const hit = rows.filter(r => filters.every(f => f(r)))
        .sort((a, c) => sorts.reduce((n, [k, dir]) => n || (key(a, k) < key(c, k) ? -dir : key(a, k) > key(c, k) ? dir : 0), 0));
      if (op === "insert") { writes.push({ table, op, payload }); [].concat(payload).forEach(r => rows.push({ id: rows.length + 900, ...r })); return { data: null, error: null }; }
      if (op === "update") { writes.push({ table, op, payload }); hit.forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      const out = (lim == null ? hit : hit.slice(0, lim)).map(r => ({ ...r }));
      return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    return b;
  };
  const storage = {
    async createBucket(name, opts) { writes.push({ table: `storage:${name}`, op: "createBucket", payload: opts }); bucket = true; return { data: { name }, error: null }; },
    from(name) {
      return {
        async download(path) {
          const body = bucket ? files[`${name}/${path}`] : undefined;
          return body == null ? { data: null, error: { message: bucket ? "Object not found" : "Bucket not found" } } : { data: new Blob([body]), error: null };
        },
        async upload(path, blob) {
          if (failUpload) return { data: null, error: { message: "Storage is down" } };
          if (!bucket) return { data: null, error: { message: "Bucket not found" } };
          files[`${name}/${path}`] = await blob.text();
          return { data: { path }, error: null };
        },
      };
    },
  };
  const note = (file) => files[`system/${file}`] ? JSON.parse(files[`system/${file}`]) : null;
  return { from, storage, writes, tables, note };
}
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); return { messageId: "<m@x>" }; } }; };

// A checkout's rows, as the shop saves them (storeOps.js opOrder): one row per piece, the same notes.
const notesFor = (ref, words, ending = CARD_NOTE) => `Order Ref: ${ref} · ${words}${ending}`;
const ANA = { client_email: "ana.test@example.com", ship_name: "Ana Test", ship_phone: "+1 305 555 0100", ship_city: "Miami", status: "pending" };
const BO = { client_email: "bo.test@example.com", ship_name: "Bo <b>Test</b>", ship_phone: null, status: "pending" };
const ORDERS = () => [
  { id: 41, ...ANA, item_title: "Flamingo Party", amount: 950, created_at: "2026-11-20T15:05:00Z", notes: notesFor("FA-1760", "Ana Test · +1 305 555 0100 · 12 Ocean Dr, Miami, FL 33139, USA") },
  { id: 42, ...ANA, item_title: "Madame Mango", amount: 300, created_at: "2026-11-20T15:05:00Z", notes: notesFor("FA-1760", "Ana Test · +1 305 555 0100 · 12 Ocean Dr, Miami, FL 33139, USA") },
  { id: 43, ...BO, item_title: "Sea Turtle Dream", amount: 361.25, created_at: "2026-11-22T11:00:00Z", notes: notesFor("FA-1761", "Bo Test", ` · 15% coupon applied${CARD_NOTE}`) },
  { id: 44, client_email: "old.test@example.com", ship_name: "Old Test", item_title: "Miss Monroe manatee", amount: 700, status: "pending", created_at: ago(8), notes: notesFor("FA-1700", "Old Test") },
  { id: 45, client_email: "paid.test@example.com", item_title: "Paid by card", amount: 90, status: "paid", paid_method: "card", created_at: ago(1), notes: notesFor("FA-1762", "Paid Test") },
  { id: 46, client_email: "zelle.test@example.com", item_title: "Paid another way", amount: 80, status: "pending", created_at: ago(1), notes: notesFor("FA-1763", "Zelle Test", " · Paying by Zelle") },
  { id: 47, client_email: "plain.test@example.com", item_title: "Plain order", amount: 70, status: "confirmed", created_at: ago(2), notes: "Framed, test only" },
];
const ART = [
  { id: 11, title: "Flamingo Party", image: "https://img.test/flamingo.jpg", isSold: false, isChildren: false },
  { id: 13, title: "Madame Mango", image: "https://img.test/mango.jpg", isSold: false, isChildren: false },
  { id: 14, title: "Sea Turtle Dream", image: "https://img.test/turtle.jpg", isSold: false, isChildren: false },
];
const shopDb = (extra = {}) => fakeDb({ Requests: [], Orders: ORDERS(), Artworks: ART.map(a => ({ ...a })), Settings: [{ id: 1, couponDiscount: 20 }], Leads: [], ...extra });
const cronReq = { method: "GET", query: { op: "reminders" }, headers: { "user-agent": "vercel-cron/1.0" } };

// ── 1. the daily email ─────────────────────────────────────────

test("the daily list: a checkout nobody paid leaves \"Orders to send\" for its own part, one entry per checkout", async () => {
  const w = await collectWaiting(shopDb(), NOW);
  assert.deepEqual(w.orders.map(o => o.title), ["Plain order", "Paid by card", "Paid another way"], "only orders the shop must act on; the unfinished ones are gone from here");
  assert.deepEqual(w.unfinished, [
    { ref: "FA-1760", name: "Ana Test", email: "ana.test@example.com", phone: "+1 305 555 0100",
      pieces: [{ title: "Flamingo Party", amount: 950 }, { title: "Madame Mango", amount: 300 }], total: 1250, started: "2026-11-20T15:05:00Z" },
    { ref: "FA-1761", name: "Bo <b>Test</b>", email: "bo.test@example.com", phone: "",
      pieces: [{ title: "Sea Turtle Dream", amount: 361.25 }], total: 361.25, started: "2026-11-22T11:00:00Z" },
  ], "8 days old is out; paid, or paid another way, is not unfinished");
});

test("the 7 days are Admin's own rule, imported: the list holds exactly the checkouts Admin -> Orders shows", async () => {
  const src = read("api/_lib/reminders.js");
  assert.match(src, /import \{[^}]*\bunfinishedThisWeek\b[^}]*\} from "\.\.\/\.\.\/src\/lib\/orderRow\.js";/, "imported from the file Admin uses");
  assert.doesNotMatch(src, /UNFINISHED_DAYS|7 \* 24|7 \* DAY|604800/, "no week of its own");
  const ages = [0, 1, 6.9, 7, 7.1, 30, null];
  const rows = ages.map((d, i) => ({ id: 60 + i, client_email: `age${i}.test@example.com`, item_title: `Age ${i}`, amount: 10, status: "pending",
    created_at: d === null ? null : ago(d), notes: notesFor(`FA-${1800 + i}`, `Age ${i}`) }));
  const w = await collectWaiting(fakeDb({ Requests: [], Orders: rows }), NOW);
  const refs = w.unfinished.map(u => u.ref).sort();
  assert.deepEqual(refs, rows.filter(o => unfinishedThisWeek(o, NOW.getTime())).map(o => `FA-${1800 + o.id - 60}`).sort());
  assert.deepEqual(refs, ["FA-1800", "FA-1801", "FA-1802", "FA-1806"], "today, 1, 6.9 days, and the one with no date (Admin keeps it too)");
});

test("the email: who, how to reach them, each piece small and whole with its price, the total, when they started, and the way into Admin", async () => {
  const w = await collectWaiting(shopDb(), NOW);
  const html = await withArt(shopDb(), T.reminderStore(w));
  assert.match(html, /Didn't finish paying \(2\)/);
  assert.match(html, /<strong>Ana Test<\/strong>/);
  assert.match(html, /href="mailto:ana\.test@example\.com"/);
  assert.match(html, /\+1 305 555 0100/, "the phone, when they gave one");
  assert.match(html, /Flamingo Party — \$950/);
  assert.match(html, /Madame Mango — \$300/);
  assert.match(html, /<strong>Total:<\/strong> \$1,250/, "the amount");
  assert.match(html, /Started paying Nov 20, 10:05\sAM/u, "when, in the shop's own time");
  assert.match(html, /Sea Turtle Dream — \$361\.25/);
  assert.equal((html.match(/href="https:\/\/fonkiart\.com\/\?admin=unfinished"/g) || []).length, 2, "each one links to Admin -> Orders, its list open");
  assert.match(html, /Bo &lt;b&gt;Test&lt;\/b&gt;/, "what a buyer typed is escaped");
  assert.doesNotMatch(html, /<b>Test/);
  // Each piece by its own line, small and whole; and never twice (not in the top row too).
  const pics = [...html.matchAll(/<img [^>]*>/g)].map(m => m[0]);
  assert.deepEqual(pics.map(p => /url=([^&"]+)/.exec(p)?.[1]).map(decodeURIComponent).filter(u => u.startsWith("https://img.test/")).sort(),
    ["https://img.test/flamingo.jpg", "https://img.test/mango.jpg", "https://img.test/turtle.jpg"]);
  for (const p of pics.filter(p => p.includes("img.test"))) assert.match(p, /width="80"[^>]*height:auto/, "small, and whole: its height follows the picture");
  assert.doesNotMatch(html, /<!--(ART|THUMB)/, "every picture's place is filled");
});

test("the subject counts them on their own; the email goes when only they wait, and still never when nothing does", async () => {
  assert.equal(reminderSubject({ requests: [1], orders: [1, 2], unfinished: [1, 2] }), "Waiting for you: 1 message to answer, 2 orders to send, 2 didn't finish paying · Fonkiart");
  assert.equal(reminderSubject({ requests: [], orders: [], unfinished: [1] }), "Waiting for you: 1 didn't finish paying · Fonkiart");
  assert.equal(reminderSubject({ requests: [1], orders: [] }), "Waiting for you: 1 message to answer · Fonkiart", "as before when there are none");
  const only = fakeDb({ Requests: [], Orders: ORDERS().filter(o => o.id === 43), Artworks: ART });
  const mail = mailbox();
  assert.deepEqual(await opReminders(only, cronReq, mail, NOW), { ok: true, sent: true });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].subject, "Waiting for you: 1 didn't finish paying · Fonkiart");
  assert.deepEqual(only.note("reminders.json").lastSent, { requests: 0, orders: 0, unfinished: 1 });
  const now = await adminReminderNow(fakeDb({ Requests: [], Orders: ORDERS() }), mailbox(), NOW);
  assert.deepEqual([now.requests, now.orders, now.unfinished], [0, 3, 2]);
  // A week on, nothing waits: no email.
  const later = mailbox();
  assert.deepEqual(await opReminders(fakeDb({ Requests: [], Orders: ORDERS().filter(o => o.id === 43) }), cronReq, later, new Date(NOW.getTime() + 8 * DAY)), { ok: true, sent: false, reason: "nothing waiting" });
  assert.equal(later.sent.length, 0);
});

test("the daily email only ever goes to the shop: it never writes to a buyer, never makes a coupon", async () => {
  const db = shopDb();
  const mail = mailbox();
  await opReminders(db, cronReq, mail, NOW);
  assert.deepEqual(mail.sent.map(m => m.to), ["fonkiart@gmail.com"]);
  assert.deepEqual(db.writes.filter(w => w.table === "Leads"), [], "no coupon made");
  assert.equal(db.note("coupons-sent.json"), null);
});

// ── 2. the coupon ──────────────────────────────────────────────

test("Send a coupon: ONE email to the buyer, their pieces big, their new code at the shop's %, and the checkout remembers when", async () => {
  const db = shopDb();
  const mail = mailbox();
  const out = await couponSend(db, { id: 42 }, mail, NOW);
  assert.equal(mail.sent.length, 1);
  const m = mail.sent[0];
  assert.equal(m.to, "ana.test@example.com");
  assert.equal(m.subject, "Still thinking about your 2 pieces? Here's 20% off — Fonkiart");
  assert.equal(db.tables.Leads.length, 1);
  const lead = db.tables.Leads[0];
  assert.deepEqual([lead.email, lead.source, lead.coupon_used], ["ana.test@example.com", "unfinished-checkout", false], "made the welcome popup's way, on a Leads row of their own");
  assert.match(lead.coupon_code, /^FK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.deepEqual(out, { sent: true, ref: "FA-1760", sentAt: NOW.toISOString(), to: "ana.test@example.com", code: lead.coupon_code, said: "20% off", discount: 20, noted: true });
  assert.ok(m.htmlContent.includes(lead.coupon_code));
  assert.match(m.htmlContent, /20% off/);
  assert.match(m.htmlContent, /Back to the shop/);
  assert.deepEqual(T.readSlot(m.htmlContent), { slot: T.piecesSlot(["Flamingo Party", "Madame Mango"], { big: true }), titles: ["Flamingo Party", "Madame Mango"], big: true }, "both pieces of the checkout, big");
  assert.match(m.htmlContent, /FONKIART\.COM<\/a><br\/>Original art by Aliana · Isla Morada, Florida Keys/, "the shop's own footer, as on its other marketing emails");
  // Both rows of the checkout say when; the buyer's other orders don't.
  assert.deepEqual(db.note("coupons-sent.json"), { "FA-1760": { at: NOW.toISOString(), to: "ana.test@example.com", said: "20% off" } });
  const status = await couponStatus(db, { ids: [41, 42, 43, 47] });
  const ana = [{ title: "Flamingo Party", price: null }, { title: "Madame Mango", price: null }];
  assert.deepEqual(status.coupons, {
    41: { ref: "FA-1760", sentAt: NOW.toISOString(), said: "20% off", used: false, code: lead.coupon_code, sizes: [{ percent: 20 }], pieces: ana },
    42: { ref: "FA-1760", sentAt: NOW.toISOString(), said: "20% off", used: false, code: lead.coupon_code, sizes: [{ percent: 20 }], pieces: ana },
    43: { ref: "FA-1761", sentAt: null, said: null, used: false, code: null, sizes: [{ percent: 20 }], pieces: [{ title: "Sea Turtle Dream", price: null }] },
  }, "only unfinished checkouts are answered");
});

test("their own unused code is the one sent; one already used sends nothing, and says so", async () => {
  const own = shopDb({ Leads: [{ id: 1, email: "ana.test@example.com", source: "welcome-popup", coupon_code: "FK-TEST-AAAA", coupon_used: false }] });
  const mail = mailbox();
  const out = await couponSend(own, { id: 41 }, mail, NOW);
  assert.equal(out.code, "FK-TEST-AAAA");
  assert.ok(mail.sent[0].htmlContent.includes("FK-TEST-AAAA"));
  assert.deepEqual(own.writes.filter(w => w.table === "Leads"), [], "no second code");

  const used = shopDb({ Leads: [{ id: 1, email: "ana.test@example.com", source: "welcome-popup", coupon_code: "FK-TEST-BBBB", coupon_used: true }] });
  const none = mailbox();
  assert.deepEqual(await couponSend(used, { id: 41 }, none, NOW), { sent: false, why: "used", code: "FK-TEST-BBBB" });
  assert.equal(none.sent.length, 0, "nothing sent");
  assert.deepEqual(used.writes.filter(w => w.table === "Leads"), [], "and nothing changed");
  assert.equal(used.note("coupons-sent.json"), null, "nor noted as sent");
  assert.equal((await couponStatus(used, { ids: [41] })).coupons[41].used, true, "the list knows before the tap");
});

test("ONCE per checkout: a second send, from either of its rows, sends nothing and says when the first went", async () => {
  const db = shopDb();
  const mail = mailbox();
  assert.equal((await couponSend(db, { id: 41 }, mail, NOW)).sent, true);
  const later = new Date(NOW.getTime() + DAY);
  for (const id of [41, 42]) {
    assert.deepEqual(await couponSend(db, { id }, mail, later), { sent: false, why: "sent", ref: "FA-1760", sentAt: NOW.toISOString(), said: "20% off" }, `again, from row ${id}`);
  }
  assert.equal(mail.sent.length, 1, "one email in all");
  assert.equal(db.tables.Leads.length, 1, "one code");
  assert.deepEqual(db.note("coupons-sent.json"), { "FA-1760": { at: NOW.toISOString(), to: "ana.test@example.com", said: "20% off" } }, "the first date stays");
  // Bo's checkout is a checkout of its own: its first coupon still goes.
  assert.equal((await couponSend(db, { id: 43 }, mail, later)).sent, true);
  assert.equal(mail.sent.length, 2);
});

test("a note of coupons sent that is there but can't be read stops the send: never a chance of a second one", async () => {
  // Storage as supabase-js answers it; upload fails, so nothing could be written over either.
  const storageOf = (download) => ({ from: () => ({ download, async upload() { return { data: null, error: { message: "Storage is down" } }; } }), async createBucket() { return { data: null, error: { message: "Storage is down" } }; } });
  const mail = mailbox();
  for (const [what, download] of [
    ["Storage answers with an error", async () => ({ data: null, error: { message: "Internal Server Error", status: 500, statusCode: "500" } })],
    ["the note isn't JSON", async () => ({ data: new Blob(["{not json"]), error: null })],
  ]) {
    const db = { ...shopDb(), storage: storageOf(download) };
    await assert.rejects(couponSend(db, { id: 41 }, mail, NOW), /couldn't check whether one already went, so nothing was sent/, what);
    assert.deepEqual(db.writes, [], `${what}: no code made`);
  }
  assert.equal(mail.sent.length, 0, "nothing sent");
  // Not there yet (the very first coupon): Storage's own "not found" answers let it go.
  for (const error of [{ message: "Object not found", status: 400, statusCode: "404" }, { message: "Bucket not found", status: 404, statusCode: "404" }]) {
    const first = mailbox();
    const out = await couponSend({ ...shopDb(), storage: storageOf(async () => ({ data: null, error })) }, { id: 41 }, first, NOW);
    assert.deepEqual([out.sent, out.noted, first.sent.length], [true, false, 1], error.message);
  }
});

test("only a checkout still unfinished gets one; a piece sold since is left out, and when all are, nothing goes", async () => {
  const db = shopDb();
  const mail = mailbox();
  await assert.rejects(couponSend(db, { id: 45 }, mail, NOW), (e) => e.status === 409, "paid");
  await assert.rejects(couponSend(db, { id: 46 }, mail, NOW), (e) => e.status === 409, "paid another way");
  await assert.rejects(couponSend(db, { id: 47 }, mail, NOW), (e) => e.status === 409, "an ordinary order");
  await assert.rejects(couponSend(db, { id: 999 }, mail, NOW), (e) => e.status === 404);
  for (const id of [undefined, "41", 0, -1, 4.5]) await assert.rejects(couponSend(db, { id }, mail, NOW), (e) => e.status === 400, String(id));
  await assert.rejects(couponStatus(db, { ids: ["41"] }), (e) => e.status === 400);
  assert.equal(mail.sent.length, 0);

  const oneSold = shopDb({ Artworks: ART.map(a => ({ ...a, isSold: a.title === "Madame Mango" })) });
  await couponSend(oneSold, { id: 41 }, mail, NOW);
  assert.equal(mail.sent[0].subject, "Still thinking about Flamingo Party? Here's 20% off — Fonkiart");
  assert.deepEqual(T.readSlot(mail.sent[0].htmlContent).titles, ["Flamingo Party"]);

  const allSold = shopDb({ Artworks: ART.map(a => ({ ...a, isSold: true })) });
  const quiet = mailbox();
  assert.deepEqual(await couponSend(allSold, { id: 41 }, quiet, NOW), { sent: false, why: "sold" });
  assert.equal(quiet.sent.length, 0);
  assert.deepEqual(allSold.writes, [], "no code made, nothing noted");
});

test("the email went but its note couldn't be saved: the answer says sent (a second tap would send it twice), and that it wasn't noted", async () => {
  const failing = fakeDb(shopDb().tables, { failUpload: true });
  const mail = mailbox();
  const out = await couponSend(failing, { id: 41 }, mail, NOW);
  assert.equal(mail.sent.length, 1);
  assert.deepEqual([out.sent, out.noted], [true, false]);
});

test("the door: both coupon actions sit behind the admin login, and reach the database only once it is passed", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_URL: undefined, ADMIN_PASSWORD: "test-only-admin-password",
    // A stand-in service key, made here (not a real one, and not key-shaped text in the repo).
    SUPABASE_SERVICE_ROLE_KEY: ["x", Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"), "x"].join(".") };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  const put = (vals) => { for (const [k, v] of Object.entries(vals)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  const realFetch = globalThis.fetch;
  const seen = [];
  const rows = { Orders: ORDERS(), Leads: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    seen.push(`${String(init.method || "GET").toUpperCase()} ${u.hostname}${u.pathname}`);
    const reply = (status, json) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    if (u.hostname !== "example.supabase.co") return reply(599, { message: "no outside host in this test" });
    if (u.pathname.startsWith("/storage/")) return reply(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const table = decodeURIComponent(u.pathname.split("/rest/v1/")[1] || "");
    if (!rows[table]) return reply(404, { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });
    const tests = [...u.searchParams].filter(([k]) => !["select", "limit", "order"].includes(k)).map(([k, v]) => {
      const m = /^in\.\((.*)\)$/.exec(v);
      const list = m ? m[1].split(",").map(s => s.replace(/^"|"$/g, "")) : [v.replace(/^eq\./, "")];
      return (r) => list.includes(String(r[k]));
    });
    return reply(200, rows[table].filter(r => tests.every(t => t(r))));
  };
  put(env);
  try {
    const call = async (headers, body) => {
      const res = { code: null, body: null, status(c) { res.code = c; return res; }, json(b) { res.body = b; return res; } };
      await adminHandler({ method: "POST", headers, body }, res);
      return res;
    };
    for (const headers of [{}, { authorization: "Bearer not-a-token" }, { authorization: `Bearer ${issueAdminToken("another-password")}` }]) {
      for (const body of [{ kind: "coupon-send", id: 41 }, { kind: "coupon-status", ids: [41, 42] }]) {
        seen.length = 0;
        const res = await call(headers, body);
        assert.equal(res.code, 401, `${body.kind} without the admin login`);
        assert.deepEqual(seen.filter(s => !s.includes("/rest/v1/admin_auth")), [], "nothing read, nothing sent");
      }
    }
    seen.length = 0;
    const ok = await call({ authorization: `Bearer ${issueAdminToken(env.ADMIN_PASSWORD)}` }, { kind: "coupon-status", ids: [41, 42, 47] });
    assert.equal(ok.code, 200);
    assert.deepEqual(Object.keys(ok.body.coupons), ["41", "42"]);
    assert.ok(seen.every(s => s.includes("example.supabase.co")), "the fake database only");
  } finally {
    globalThis.fetch = realFetch;
    put(before);
  }
});

test("nothing is automatic: only Andy's tap in Admin -> Orders ever calls it", () => {
  const walk = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })
    .flatMap(d => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.jsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const files = [...walk("api"), ...walk("src")];
  assert.ok(files.includes("api/_lib/reminders.js") && files.includes("src/admin/OrdersTab.jsx"), "the scan reads the shop's files");
  assert.deepEqual(files.filter(f => /\bcouponSend\b/.test(read(f))), ["api/_lib/unfinishedCoupon.js", "api/admin.js"], "the server: only the admin door");
  assert.deepEqual(files.filter(f => /coupon-send/.test(read(f))), ["api/admin.js", "src/admin/OrdersTab.jsx"]);
  const tab = read("src/admin/OrdersTab.jsx");
  assert.equal((tab.match(/adminAction\("coupon-send"/g) || []).length, 1);
  assert.equal((tab.match(/\bsendCoupon\(/g) || []).length, 1, "sendCoupon is called in one place only");
  assert.match(tab, /<CouponAsk [^>]*\n\s*onSend=\{choice => sendCoupon\(o, choice\)\}/, "...the question on the order...");
  const asks = read("src/admin/CouponAsk.jsx");
  assert.equal((asks.match(/=> onSend\(/g) || []).length, 1, "...which sends in one place only...");
  assert.match(asks, /<button className="tap o-btn o-btn-ink" onClick=\{\(\) => onSend\(choice\)\} disabled=\{[^}]+\}>Send<\/button>/, "...its Send button");
  assert.deepEqual(JSON.parse(read("vercel.json")).crons.map(c => c.path), ["/api/cron/reminders"], "no new timer");
});

// The coupon's own part of OrdersTab.jsx (its button, question and sending), and the style lines.
const couponBits = (tab) => {
  const start = tab.indexOf("// ── The coupon for a checkout that wasn't finished.");
  return start < 0 ? "" : tab.slice(start, tab.indexOf("// The panel under an order:", start)) + tab.slice(tab.indexOf("const DONE_TEXT"), tab.indexOf("export default function OrdersTab"))
    + read("src/admin/CouponAsk.jsx");
};
test("Admin -> Orders: the button on the unfinished rows only, the question on the page, never a browser pop-up; once sent, a plain line", () => {
  const tab = read("src/admin/OrdersTab.jsx");
  assert.match(tab, /\{unfinishedCard\(o\) && couponCell\(o\)\}/, "only on a checkout that wasn't finished");
  assert.match(tab, /\{asking\("coupon", o\.id\) && couponAsk\(o\)\}/, "asked under the order itself");
  for (const src of [tab, read("src/admin/CouponAsk.jsx")]) assert.doesNotMatch(src, /window\.(confirm|alert|prompt)|\b(confirm|alert|prompt)\(/, "no browser pop-up");
  for (const words of ["✉ Send a coupon", "Coupon already used", "One per checkout, so there is nothing more to send.", "To send it, reset it under Leads first.", "Cancel"]) {
    assert.ok(tab.includes(words), words);
  }
  // ONCE per checkout: sent, the button is gone (a plain line, nothing to tap), and nothing in the
  // coupon's part can send a second (the invoice's own "Send it again?" is another thing).
  const bits = couponBits(tab);
  assert.match(bits, /if \(c\?\.sentAt\) return <span className="o-coupon-sent" style=\{SENT_LINE\}>Coupon sent \{sentDay\(c\.sentAt\)\}\{c\.said && <> <span className="o-coupon-said">\{c\.said\}<\/span><\/>\}<\/span>;/, "a plain line once sent, with how much when the note has it");
  assert.doesNotMatch(bits, /again\?|Send again/i, "no second send");
  assert.match(tab, /adminAction\("coupon-status", \{ ids:/, "the list learns what was sent, and which codes are used, from the server");
});

test("the email's link opens Admin -> Orders with the list open, once, and leaves the address bar clean", () => {
  assert.equal(unfinishedLink("https://fonkiart.com"), "https://fonkiart.com/?admin=unfinished");
  assert.equal(readAdminLink("?admin=unfinished"), "unfinished");
  for (const s of ["", "?admin=orders", "?admin=", "?x=unfinished"]) assert.equal(readAdminLink(s), null, s);
  assert.equal(withoutAdminLink("?admin=unfinished"), "");
  assert.equal(withoutAdminLink("?admin=unfinished&utm_source=email"), "?utm_source=email");
  const store = new Map();
  const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const plant = (value) => Object.defineProperty(globalThis, "sessionStorage", { value, configurable: true, writable: true });
  plant({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  try {
    assert.equal(wantsOpenUnfinished(), false);
    askOpenUnfinished();
    assert.equal(wantsOpenUnfinished(), true);
    doneOpenUnfinished();
    assert.equal(wantsOpenUnfinished(), false, "once");
    plant({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
    askOpenUnfinished();
    assert.equal(wantsOpenUnfinished(), false, "storage refused: the list just starts closed");
    doneOpenUnfinished();
  } finally {
    if (real) Object.defineProperty(globalThis, "sessionStorage", real); else delete globalThis.sessionStorage;
  }
  const app = read("src/App.jsx");
  assert.match(app, /const \[adminLink\]\s+= useState\(\(\) => \{ const link = readAdminLink\(window\.location\.search\); if \(link\) localStorage\.setItem\("fonkiart-admin-tab", "orders"\); return link; \}\);/, "on Orders: set before Admin's tab is read");
  assert.ok(app.indexOf("const [adminLink]") < app.indexOf("const [adminTab, setAdminTabState]"), "...which comes after it");
  assert.match(app, /: adminLink \? "admin" :/, "the link opens Admin (which asks for its password when needed)");
  assert.match(app, /window\.history\.replaceState\([^\n]*withoutAdminLink\(window\.location\.search\)/, "then the link leaves the address bar");
  const tab = read("src/admin/OrdersTab.jsx");
  assert.match(tab, /const \[fromEmail\] = useState\(wantsOpenUnfinished\);\n\s+const \[showUnpaid, setShowUnpaid\] = useState\(fromEmail\);/);
  assert.match(tab, /doneOpenUnfinished\(\);/);
});

// No green anywhere on Fonkiart (Andy, 2026-11-22: "i do not like the green no green on the sile maybe
// soft lilac or violet but no green"), and no cream or sand: the new emails and the new Admin parts.
const GREEN = /green|#2d6a4f|#e8f5ee|#a3d4b3|mark-paid-yes|track-ok/i;
const WARM = /cream|sand|beige|ivory|#f3f1ee|#faf7f2|#f5f0e8/i;
test("no green, no cream: the coupon email, the reminder's new part and the coupon's Admin parts", async () => {
  const coupon = await withArt(shopDb(), T.unfinishedCoupon({ firstName: "Ana", titles: ["Flamingo Party", "Madame Mango"], code: "FK-TEST-AAAA", words: "20% off" }));
  const w = await collectWaiting(shopDb(), NOW);
  const part = await withArt(shopDb(), T.reminderStore({ requests: [], orders: [], unfinished: w.unfinished }));
  for (const [name, html] of [["coupon email", coupon], ["reminder, Didn't finish paying", part]]) {
    assert.doesNotMatch(html, GREEN, name);
    assert.doesNotMatch(html, WARM, name);
  }
  const bits = couponBits(read("src/admin/OrdersTab.jsx"));
  assert.ok(bits.includes("couponCell") && bits.includes("SENT_LINE = {") && bits.includes("#5b4a5c"), "the coupon's Admin parts are read");
  assert.doesNotMatch(bits, GREEN);
  assert.doesNotMatch(bits, WARM);
});

// ── the code on one line, as big as fits a phone ───────────────
// Andy, 2026-11-01: "make it fit in 1 line plz". At 31px a code of wide letters pushed the email past
// a 375px phone's edge (measured 2026-11-22 in Chrome: about 1 code in 6, the welcome email too).
const sizeIn = (html, code) => html.match(new RegExp(`font-size:(\\d+)px;[^"]*white-space:nowrap;[^"]*">${code}<`))?.[1];
test("a coupon code stays on one line at 31px, and a code of wide letters gets just small enough to fit a phone", () => {
  assert.equal(CODE_PX, 31);
  assert.equal(codePx("FK-7QJS-2EMV"), 31, "Andy's own example (11-01) keeps its size");
  assert.equal(codePx("{{ .Token }}"), 31, "Supabase's placeholder keeps its size: its code is short");
  const wide = codePx("FK-WXDL-NPMZ"), widest = codePx("FK-WWWW-WWWW");
  assert.ok(wide < 31 && wide >= 27, `a wide code is a little smaller (${wide}px)`);
  assert.ok(widest < wide && widest >= 20, `the widest code there can be is the smallest, never under 20px (${widest}px)`);
  const sizes = Array.from({ length: 2000 }, () => codePx(newCouponCode()));
  const kept = sizes.filter(px => px === 31).length;
  assert.ok(kept >= 1333, `most codes, made the shop's way, keep 31px (${kept} of 2000)`);
  assert.ok(sizes.every(px => px >= 20 && px <= 31));
  for (const code of ["FK-7QJS-2EMV", "FK-WXDL-NPMZ", "FK-WWWW-WWWW"]) {
    const px = String(codePx(code));
    assert.equal(sizeIn(T.welcomeCoupon({ code, discount: 15 }), code), px, `the welcome coupon, ${code}`);
    assert.equal(sizeIn(T.unfinishedCoupon({ firstName: "Ana", titles: ["Flamingo Party"], code, words: "15% off" }), code), px, `the coupon after an unfinished checkout, ${code}`);
    assert.equal(sizeIn(AE.couponEmail({ code, discount: 15 }).content, code), px, `the gift from Admin -> Leads, ${code}`);
  }
  assert.equal(sizeIn(T.supabaseTemplate({ heading: "Your code", intro: "Use it.", buttonLabel: "Sign in", withCode: true }), "\\{\\{ \\.Token \\}\\}"), "31", "Supabase's code box is unchanged");
});

test("control: the readers see what they look for", () => {
  assert.match('<p style="margin:0;color:#2d6a4f;">15% coupon applied</p>', GREEN, "a green line is caught");
  assert.match('<div style="background:#f3f1ee;">', WARM, "a warm off-white is caught");
  assert.match('<button className="tap mark-paid-yes">Send</button>', GREEN);
  assert.match("{unfinishedCard(o) && couponCell(o)}", /\{unfinishedCard\(o\) && couponCell\(o\)\}/);
  assert.match('<span>A coupon went to {to} on {shortDate(c.sentAt)}. Send it again?</span>', /again\?|Send again/i, "a second send is caught");
  assert.match("if (!window.confirm(`Reset?`)) return;", /window\.(confirm|alert|prompt)|\b(confirm|alert|prompt)\(/, "a browser pop-up is caught");
  assert.match('import { cartRef, unfinishedCard, unfinishedThisWeek } from "../../src/lib/orderRow.js";', /import \{[^}]*\bunfinishedThisWeek\b[^}]*\} from "\.\.\/\.\.\/src\/lib\/orderRow\.js";/);
  assert.match("const DAYS = 7 * 24 * 60 * 60 * 1000;", /UNFINISHED_DAYS|7 \* 24|7 \* DAY|604800/, "a week of its own is caught");
  assert.equal(sizeIn('<div style="font-family:Georgia,serif;font-size:31px;font-weight:bold;letter-spacing:1px;white-space:nowrap;color:#1c1a18;">FK-WXDL-NPMZ</div>', "FK-WXDL-NPMZ"), "31", "the size reader reads a code box");
});
