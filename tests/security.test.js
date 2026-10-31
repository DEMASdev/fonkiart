import { test } from "node:test";
import assert from "node:assert/strict";
import { issueAdminToken, isValidAdminToken, samePassword, bearer } from "../api/_lib/adminToken.js";
import { validateChain, runQuery, adminEmail } from "../api/_lib/adminOps.js";
import * as store from "../api/_lib/storeOps.js";
import { InputError } from "../api/_lib/errors.js";
import { escapeHtml } from "../api/_lib/brevo.js";
import * as T from "../api/_lib/emails.js";
import { recordQuery } from "../src/lib/adminQuery.js";

// Tiny in-memory stand-in for the supabase-js query builder: enough to run the
// store's real logic and see exactly what it reads and writes.
function fakeDb(tables = {}, { user = null } = {}) {
  const writes = [];
  function from(table) {
    let op = "select", payload = null, lim = null, single = null;
    const filters = [];
    const b = {
      select() { return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      delete() { op = "delete"; return b; },
      upsert(v) { op = "upsert"; payload = v; return b; },
      eq(k, v) { filters.push([k, v]); return b; },
      order() { return b; },
      limit(n) { lim = n; return b; },
      single() { single = "one"; return b; },
      maybeSingle() { single = "maybe"; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    const match = (r) => filters.every(([k, v]) => String(r[k]) === String(v));
    function run() {
      const rows = (tables[table] ||= []);
      if (op === "insert") { writes.push({ table, op, payload }); payload.forEach(r => rows.push({ id: rows.length + 100, ...r })); return { data: null, error: null }; }
      if (op === "update") { writes.push({ table, op, payload, filters: [...filters] }); rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      let out = rows.filter(match).map(r => ({ ...r }));
      if (lim != null) out = out.slice(0, lim);
      if (single === "one") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "not one row" } };
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }
    return b;
  }
  const auth = { getUser: async (t) => (user && t === "good-jwt" ? { data: { user }, error: null } : { data: {}, error: { message: "bad jwt" } }) };
  return { from, auth, writes, tables };
}

const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };

// ── admin token ─────────────────────────────────────────────
test("admin token: issued token is valid, tampered/expired/wrong-secret ones are not", () => {
  const t = issueAdminToken("s3cret", 1000);
  assert.equal(isValidAdminToken(t, "s3cret", 2000), true);
  assert.equal(isValidAdminToken(t, "other", 2000), false);
  assert.equal(isValidAdminToken(t, "s3cret", 1000 + 25 * 3600 * 1000), false);
  assert.equal(isValidAdminToken(t.replace(/.$/, c => (c === "0" ? "1" : "0")), "s3cret", 2000), false);
  assert.equal(isValidAdminToken("1", "s3cret", 2000), false);
  assert.equal(isValidAdminToken(undefined, "s3cret", 2000), false);
  assert.equal(isValidAdminToken(t, "", 2000), false);
});

test("admin password compare + bearer header", () => {
  assert.equal(samePassword("abc", "abc"), true);
  assert.equal(samePassword("abd", "abc"), false);
  assert.equal(samePassword(undefined, "abc"), false);
  assert.equal(bearer({ headers: { authorization: "Bearer xyz" } }), "xyz");
  assert.equal(bearer({ headers: {} }), "");
});

// ── admin proxy ─────────────────────────────────────────────
test("admin proxy refuses unknown tables, unknown methods and a filter first", () => {
  assert.throws(() => validateChain("pg_user", [{ m: "select", a: [] }]), InputError);
  assert.throws(() => validateChain("Orders", [{ m: "rpc", a: [] }]), InputError);
  assert.throws(() => validateChain("Orders", [{ m: "eq", a: ["id", 1] }]), InputError);
  assert.throws(() => validateChain("Orders", []), InputError);
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "select", a: ["*"] }, { m: "eq", a: ["status", "pending"] }, { m: "order", a: ["created_at", { ascending: false }] }]));
});

test("admin proxy replays the browser's query on the server, in order", async () => {
  const db = fakeDb({ Orders: [{ id: 1, status: "pending" }, { id: 2, status: "shipped" }] });
  const out = await runQuery(db, "Orders", [{ m: "select", a: ["*"] }, { m: "eq", a: ["status", "pending"] }]);
  assert.deepEqual(out.data, [{ id: 1, status: "pending" }]);
  assert.equal(out.error, null);
});

test("browser recorder produces the chain the server replays", async () => {
  let seen = null;
  const q = recordQuery("Leads", async (p) => { seen = p; return { data: [], error: null }; });
  const res = await q.select("id", { count: "exact", head: true }).eq("source", "manual");
  assert.deepEqual(seen, { kind: "query", table: "Leads", chain: [{ m: "select", a: ["id", { count: "exact", head: true }] }, { m: "eq", a: ["source", "manual"] }] });
  assert.deepEqual(res, { data: [], error: null });
  assert.doesNotThrow(() => validateChain(seen.table, seen.chain));
});

test("admin email refuses a bad recipient", async () => {
  const mail = mailbox();
  await assert.rejects(adminEmail(mail, { to: "not-an-email", subject: "x", htmlContent: "<p>x</p>" }), InputError);
  await adminEmail(mail, { to: "a@b.co", subject: "Hi", htmlContent: "<p>x</p>" });
  assert.equal(mail.sent.length, 1);
});

// ── public store ────────────────────────────────────────────
test("welcome: new email gets a fresh code + email; returning email gets its old code, no email", async () => {
  const db = fakeDb({ Settings: [{ id: 1, couponDiscount: 15 }], Leads: [{ id: 1, email: "old@x.co", coupon_code: "FK-AAAA-BBBB", coupon_used: true }] });
  const mail = mailbox();
  const fresh = await store.opWelcome(db, { email: "New@X.co" }, mail);
  assert.equal(fresh.returning, false);
  assert.match(fresh.code, /^FK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(db.tables.Leads.at(-1).email, "new@x.co");
  assert.equal(mail.sent.length, 1);
  const back = await store.opWelcome(db, { email: "old@x.co" }, mail);
  assert.deepEqual(back, { returning: true, code: "FK-AAAA-BBBB", used: true });
  assert.equal(mail.sent.length, 1);
});

test("coupon: invalid / used / wrong-email / valid", async () => {
  const db = fakeDb({ Leads: [{ id: 1, email: "a@x.co", coupon_code: "FK-1111-2222", coupon_used: false }, { id: 2, email: "b@x.co", coupon_code: "FK-3333-4444", coupon_used: true }] });
  assert.equal((await store.opCoupon(db, { code: "FK-9999-9999", email: "a@x.co" })).status, "invalid");
  assert.equal((await store.opCoupon(db, { code: "fk-3333-4444", email: "b@x.co" })).status, "used");
  assert.equal((await store.opCoupon(db, { code: "FK-1111-2222", email: "z@x.co" })).status, "wrong-email");
  assert.equal((await store.opCoupon(db, { code: "FK-1111-2222", email: "A@x.co" })).status, "valid");
});

const order = (over = {}) => ({
  customer: { firstName: "Jane", lastName: "Smith", email: "jane@x.co", phone: "", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  items: [{ title: "Ocean", amount: 510 }], total: 510, orderRef: "FA-1720", couponCode: "FK-1111-2222", ...over,
});

test("order: saves the order, creates the client, marks a valid coupon used, emails buyer + shop", async () => {
  const db = fakeDb({ Settings: [{ id: 1, couponDiscount: 15 }], Leads: [{ id: 7, email: "jane@x.co", coupon_code: "FK-1111-2222", coupon_used: false }], Orders: [], Clients: [] });
  const mail = mailbox();
  const out = await store.opOrder(db, order(), mail);
  assert.deepEqual(out, { ok: true, saved: true });
  assert.equal(db.tables.Orders.length, 1);
  assert.equal(db.tables.Orders[0].item_title, "Ocean");
  assert.match(db.tables.Orders[0].notes, /Order Ref: FA-1720 · Jane Smith · 1 Main, Miami, FL, 33101, USA · 15% coupon applied/);
  assert.equal(db.tables.Clients.length, 1);
  assert.equal(db.tables.Leads[0].coupon_used, true);
  assert.deepEqual(mail.sent.map(m => m.to), ["jane@x.co", "shop@fonkiart.com"]);
});

test("order: a coupon tied to another email is NOT marked used and not noted", async () => {
  const db = fakeDb({ Settings: [{ id: 1, couponDiscount: 15 }], Leads: [{ id: 7, email: "other@x.co", coupon_code: "FK-1111-2222", coupon_used: false }], Orders: [], Clients: [] });
  await store.opOrder(db, order(), mailbox());
  assert.equal(db.tables.Leads[0].coupon_used, false);
  assert.doesNotMatch(db.tables.Orders[0].notes, /coupon/);
});

test("order: rejects junk before touching the database", async () => {
  const db = fakeDb({ Orders: [] });
  await assert.rejects(store.opOrder(db, order({ items: [] }), mailbox()), InputError);
  await assert.rejects(store.opOrder(db, order({ orderRef: "<script>" }), mailbox()), InputError);
  await assert.rejects(store.opOrder(db, order({ customer: { firstName: "J", lastName: "S", email: "nope" } }), mailbox()), InputError);
  assert.equal(db.writes.length, 0);
});

test("legacy login: hash match, plaintext upgrade, wrong password — never returns the password", async () => {
  const db = fakeDb({ Clients: [{ id: 1, name: "Ann", email: "ann@x.co", password: store.sha256hex("pw1") }, { id: 2, name: "Bo", email: "bo@x.co", password: "plain" }] });
  assert.deepEqual(await store.opLegacyLogin(db, { email: "ANN@x.co", password: "pw1" }), { ok: true, client: { id: 1, name: "Ann", email: "ann@x.co" } });
  const bo = await store.opLegacyLogin(db, { email: "bo@x.co", password: "plain" });
  assert.equal(bo.ok, true);
  assert.equal(db.tables.Clients[1].password, store.sha256hex("plain"));
  assert.deepEqual(await store.opLegacyLogin(db, { email: "ann@x.co", password: "nope" }), { ok: false });
});

test("buyer data: needs a real signed-in, confirmed user; strips the password", async () => {
  const tables = { Orders: [{ id: 1, client_email: "ann@x.co" }, { id: 2, client_email: "bo@x.co" }], Clients: [{ id: 1, email: "ann@x.co", password: "hash" }] };
  await assert.rejects(store.opBuyer(fakeDb(tables), { headers: {} }), InputError);
  await assert.rejects(store.opBuyer(fakeDb(tables, { user: { email: "ann@x.co" } }), { headers: { authorization: "Bearer good-jwt" } }), InputError);
  const out = await store.opBuyer(fakeDb(tables, { user: { email: "Ann@x.co", email_confirmed_at: "2026-01-01" } }), { headers: { authorization: "Bearer good-jwt" } });
  assert.deepEqual(out.orders.map(o => o.id), [1]);
  assert.equal(out.client.password, undefined);
});

test("invoice: found by its link, approve marks it confirmed once and tells the shop", async () => {
  const db = fakeDb({ Orders: [{ id: 5, invoice_token: "8f0c2a5e-1111-2222-3333-444455556666", item_title: "Ocean", amount: 300, invoice_approved: false }], Settings: [{ id: 1 }] });
  const mail = mailbox();
  const got = await store.opInvoice(db, { token: "8f0c2a5e-1111-2222-3333-444455556666" });
  assert.equal(got.order.id, 5);
  await store.opInvoiceApprove(db, { token: "8f0c2a5e-1111-2222-3333-444455556666" }, mail);
  assert.equal(db.tables.Orders[0].status, "confirmed");
  await store.opInvoiceApprove(db, { token: "8f0c2a5e-1111-2222-3333-444455556666" }, mail);
  assert.equal(mail.sent.length, 1);
  await assert.rejects(store.opInvoice(db, { token: "nope!" }), InputError);
});

test("next order number matches the old FA-1710 offset", async () => {
  assert.deepEqual(await store.opNextRef(fakeDb({ Orders: [{ id: 12 }] })), { ref: "FA-1723" });
  assert.deepEqual(await store.opNextRef(fakeDb({ Orders: [] })), { ref: "FA-1720" });
});

// ── emails ──────────────────────────────────────────────────
test("emails escape whatever a visitor typed", () => {
  assert.equal(escapeHtml(`<b>"x"&'y'</b>`), "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
  const html = T.contactStore({ name: "<img src=x onerror=alert(1)>", email: "a@b.co", message: "hi\n<script>" });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /hi<br\/>&lt;script&gt;/);
});
