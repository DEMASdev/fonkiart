import { test } from "node:test";
import assert from "node:assert/strict";
import { issueAdminToken, isValidAdminToken, samePassword, bearer } from "../api/_lib/adminToken.js";
import { validateChain, runQuery, adminEmail } from "../api/_lib/adminOps.js";
import * as store from "../api/_lib/storeOps.js";
import { InputError } from "../api/_lib/errors.js";
import { escapeHtml, senderAddress } from "../api/_lib/brevo.js";
import { isServiceKey } from "../api/_lib/supabaseAdmin.js";
import { ADMIN_EMAIL, hashPassword, checkPassword, adminCredentials, opResetRequest, opResetSet } from "../api/_lib/adminSecret.js";
import { opCustomerResetRequest, opCustomerResetSet } from "../api/_lib/customerReset.js";
import * as serverPw from "../api/_lib/pwRules.js";
import * as browserPw from "../src/lib/pwRules.js";
import * as T from "../api/_lib/emails.js";
import { recordQuery } from "../src/lib/adminQuery.js";

// Tiny in-memory stand-in for the supabase-js query builder: enough to run the
// store's real logic and see exactly what it reads and writes.
function fakeDb(tables = {}, { user = null, fail = {}, users = [] } = {}) {
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
      if (fail[table]) return { data: null, error: fail[table] };
      const rows = (tables[table] ||= []);
      if (op === "upsert") { writes.push({ table, op, payload }); [].concat(payload).forEach(r => { const key = r.id !== undefined ? "id" : "email"; const hit = rows.find(x => x[key] === r[key]); if (hit) Object.assign(hit, r); else rows.push({ ...r }); }); return { data: null, error: null }; }
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
  const auth = {
    getUser: async (t) => (user && t === "good-jwt" ? { data: { user }, error: null } : { data: {}, error: { message: "bad jwt" } }),
    // Supabase sign-ins (auth.users), as the service key sees them.
    admin: {
      listUsers: async ({ page = 1, perPage = 50 } = {}) => ({ data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null }),
      updateUserById: async (id, attrs) => {
        const u = users.find(x => x.id === id);
        if (!u) return { data: null, error: { message: "User not found" } };
        writes.push({ table: "auth.users", op: "update", payload: attrs });
        Object.assign(u, attrs);
        return { data: { user: u }, error: null };
      },
    },
  };
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

test("sender falls back to the public address where BREVO_SENDER is missing", () => {
  const saved = [process.env.BREVO_SENDER, process.env.VITE_BREVO_SENDER];
  try {
    delete process.env.BREVO_SENDER;
    process.env.VITE_BREVO_SENDER = "shop@example.com";
    assert.equal(senderAddress(), "shop@example.com");
    process.env.BREVO_SENDER = "server@example.com";
    assert.equal(senderAddress(), "server@example.com");
  } finally {
    ["BREVO_SENDER", "VITE_BREVO_SENDER"].forEach((k, i) => saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i]));
  }
});

// ── server key ──────────────────────────────────────────────
test("server refuses the public key in place of the service key", () => {
  const jwt = (role) => ["x", Buffer.from(JSON.stringify({ role })).toString("base64url"), "sig"].join(".");
  assert.equal(isServiceKey(jwt("service_role")), true);
  assert.equal(isServiceKey(jwt("anon")), false);
  assert.equal(isServiceKey("sb_secret_abc"), true);
  assert.equal(isServiceKey("sb_publishable_abc"), false);
  assert.equal(isServiceKey("not-a-key"), false);
});

// ── admin "Forgot password?" ────────────────────────────────
const withEnvPassword = async (value, fn) => {
  const saved = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = value;
  try { await fn(); } finally { saved === undefined ? delete process.env.ADMIN_PASSWORD : (process.env.ADMIN_PASSWORD = saved); }
};
const linkToken = (mail) => mail.sent.at(-1).htmlContent.match(/#admin-reset=([A-Za-z0-9_-]{43})"/)[1];

test("admin password hash: the right password passes, wrong or malformed ones fail", () => {
  const h = hashPassword("correct horse");
  assert.match(h, /^scrypt\$/);
  assert.equal(checkPassword("correct horse", h), true);
  assert.equal(checkPassword("correct horsE", h), false);
  assert.equal(checkPassword("correct horse", "plain-text"), false);
  assert.equal(checkPassword(undefined, h), false);
});

test("admin login uses the env password until a reset, then only the stored one", () => withEnvPassword("env-pass", async () => {
  const noTable = await adminCredentials(fakeDb({}, { fail: { admin_auth: { code: "PGRST205", message: "not in the schema cache" } } }));
  assert.equal(noTable.check("env-pass"), true);
  assert.equal(noTable.secret, "env-pass");
  assert.equal((await adminCredentials(fakeDb({ admin_auth: [{ id: 1 }] }))).check("env-pass"), true);
  const stored = await adminCredentials(fakeDb({ admin_auth: [{ id: 1, password_hash: hashPassword("new-pass-123"), token_secret: "s2" }] }));
  assert.equal(stored.check("new-pass-123"), true);
  assert.equal(stored.check("env-pass"), false);
  assert.equal(stored.secret, "s2");
  // Any other read error must not quietly fall back to the env password.
  await assert.rejects(adminCredentials(fakeDb({}, { fail: { admin_auth: { code: "57014", message: "timeout" } } })));
}));

test("reset request: only the admin address gets a link, it's stored hashed, no repeat within 2 minutes", async () => {
  const db = fakeDb({ admin_auth: [{ id: 1 }] });
  const mail = mailbox();
  assert.deepEqual(await opResetRequest(db, { email: "someone@else.com" }, mail, "https://fonkiart.com", 1_000_000), { ok: true });
  assert.equal(mail.sent.length, 0);
  assert.equal(db.writes.length, 0);
  await opResetRequest(db, { email: " FonkiArt@gmail.com " }, mail, "https://fonkiart.com", 1_000_000);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, ADMIN_EMAIL);
  const token = linkToken(mail);
  assert.equal(db.tables.admin_auth[0].reset_token_hash.length, 64);
  assert.doesNotMatch(JSON.stringify(db.tables.admin_auth[0]), new RegExp(token));
  await opResetRequest(db, { email: ADMIN_EMAIL }, mail, "https://fonkiart.com", 1_000_000 + 60_000);
  assert.equal(mail.sent.length, 1);
  const noTable = fakeDb({}, { fail: { admin_auth: { code: "PGRST205", message: "not in the schema cache" } } });
  await assert.rejects(opResetRequest(noTable, { email: ADMIN_EMAIL }, mail, "https://fonkiart.com", 0), (e) => e instanceof InputError && e.status === 503);
});

test("reset link: works once, expires, needs 8+ characters, and signs out old sessions", () => withEnvPassword("env-pass", async () => {
  const db = fakeDb({ admin_auth: [{ id: 1 }] });
  const mail = mailbox();
  const t0 = 5_000_000;
  const oldSession = issueAdminToken((await adminCredentials(db)).secret, t0);
  await opResetRequest(db, { email: ADMIN_EMAIL }, mail, "https://fonkiart.com", t0);
  const token = linkToken(mail);
  await assert.rejects(opResetSet(db, { token, password: "short" }, t0), InputError);
  await assert.rejects(opResetSet(db, { token: "x".repeat(43), password: "Long-enough-1" }, t0), /already used or replaced/);
  await assert.rejects(opResetSet(db, { token, password: "Long-enough-1" }, t0 + 31 * 60_000), /expired/);
  const out = await opResetSet(db, { token, password: "Long-enough-1" }, t0 + 60_000);
  const creds = await adminCredentials(db);
  assert.equal(creds.check("Long-enough-1"), true);
  assert.equal(creds.check("env-pass"), false);
  assert.equal(isValidAdminToken(out.token, creds.secret, t0 + 120_000), true);
  assert.equal(isValidAdminToken(oldSession, creds.secret, t0 + 120_000), false);
  await assert.rejects(opResetSet(db, { token, password: "Another-pass-2" }, t0 + 90_000), /already used or replaced/);
}));

// ── password rules (the same as DEMAS) ──────────────────────
test("password rules: the browser copy and the server copy agree on every password", () => {
  const corpus = ["", "a", "Ab1!", "abcdefgh", "ABCDEFGH", "Abcdefgh", "Abcdefg1", "Abcdef1!", "abcdef1!", "ABCDEF1!", "Abcdefg!", "Pass word 1", "Ünïcödé1a", "        ", "Aa1!Aa1!Aa1!"];
  assert.deepEqual(serverPw.PW_RULES.map(r => [r.id, r.label]), browserPw.PW_RULES.map(r => [r.id, r.label]));
  for (const pw of corpus) {
    assert.deepEqual(serverPw.PW_RULES.map(r => r.test(pw)), browserPw.PW_RULES.map(r => r.test(pw)), pw);
    assert.equal(serverPw.pwRulesMet(pw), browserPw.pwRulesMet(pw), pw);
  }
  assert.equal(serverPw.pwRulesMet("Abcdef1!"), true);
  assert.deepEqual(serverPw.pwRulesFailed("abcdefgh"), ["An uppercase letter", "A number", "A special character"]);
});

test("reset links refuse a password that breaks the rules, naming the rule but never the password", async () => {
  const mail = mailbox();
  const adminDbFake = fakeDb({ admin_auth: [{ id: 1 }] });
  await opResetRequest(adminDbFake, { email: ADMIN_EMAIL }, mail, "https://fonkiart.com", 0);
  await assert.rejects(opResetSet(adminDbFake, { token: linkToken(mail), password: "alllowercase1!" }, 1000),
    (e) => /An uppercase letter/.test(e.message) && !e.message.includes("alllowercase1!"));
  const shopDb = fakeDb({ Clients: [{ id: 3, email: "c@x.com", password: "h" }], customer_resets: [] });
  await opCustomerResetRequest(shopDb, { email: "c@x.com" }, mail, "https://fonkiart.com", 0);
  await assert.rejects(opCustomerResetSet(shopDb, { token: resetToken(mail), password: "NoNumbers!!" }, 1000),
    (e) => /A number/.test(e.message) && !e.message.includes("NoNumbers!!"));
});

// ── customers' "Forgot password?" ───────────────────────────
function resetToken(mail) { return mail.sent.at(-1).htmlContent.match(/#reset=([A-Za-z0-9_-]{43})"/)[1]; }

test("customer reset request: only real accounts get a link, stored hashed, no repeat within 2 minutes", async () => {
  const db = fakeDb({ Clients: [{ id: 1, email: "col@x.com", password: "abc" }, { id: 2, email: "nopw@x.com", password: null }], customer_resets: [] },
    { users: [{ id: "u1", email: "Buyer@X.com" }] });
  const mail = mailbox();
  // No account at all, and a checkout-only customer without a password: nothing sent.
  await opCustomerResetRequest(db, { email: "nobody@x.com" }, mail, "https://fonkiart.com", 0);
  await opCustomerResetRequest(db, { email: "nopw@x.com" }, mail, "https://fonkiart.com", 0);
  assert.equal(mail.sent.length, 0);
  await assert.rejects(opCustomerResetRequest(db, { email: "not-an-email" }, mail, "https://fonkiart.com", 0), InputError);
  // A "Create Account" sign-in (any letter case) and a collectors password each get one.
  await opCustomerResetRequest(db, { email: " Buyer@x.com " }, mail, "https://fonkiart.com", 0);
  await opCustomerResetRequest(db, { email: "col@x.com" }, mail, "https://fonkiart.com", 0);
  assert.deepEqual(mail.sent.map(m => m.to), ["buyer@x.com", "col@x.com"]);
  assert.doesNotMatch(JSON.stringify(db.tables.customer_resets), new RegExp(resetToken(mail)));
  await opCustomerResetRequest(db, { email: "col@x.com" }, mail, "https://fonkiart.com", 60_000);
  assert.equal(mail.sent.length, 2);
  const noTable = fakeDb({ Clients: [{ id: 1, email: "col@x.com", password: "abc" }] }, { fail: { customer_resets: { code: "PGRST205", message: "not in the schema cache" } } });
  await assert.rejects(opCustomerResetRequest(noTable, { email: "col@x.com" }, mail, "https://fonkiart.com", 0), (e) => e instanceof InputError && e.status === 503);
});

test("customer reset link: sets the sign-in and the collectors password, works once, expires", async () => {
  const db = fakeDb({ Clients: [{ id: 7, name: "Ana", email: "ana@x.com", password: "old-hash" }], customer_resets: [] },
    { users: [{ id: "u7", email: "ana@x.com" }] });
  const mail = mailbox();
  await opCustomerResetRequest(db, { email: "ana@x.com" }, mail, "https://fonkiart.com", 0);
  const token = resetToken(mail);
  await assert.rejects(opCustomerResetSet(db, { token, password: "Short1!" }, 0), InputError);
  await assert.rejects(opCustomerResetSet(db, { token, password: "Long-enough-1" }, 31 * 60_000), /expired/);
  assert.deepEqual(await opCustomerResetSet(db, { token, password: "Long-enough-1" }, 60_000), { ok: true, email: "ana@x.com" });
  assert.deepEqual(db.writes.find(w => w.table === "auth.users").payload, { password: "Long-enough-1", email_confirm: true });
  assert.equal((await store.opLegacyLogin(db, { email: "ana@x.com", password: "Long-enough-1" })).ok, true);
  assert.equal((await store.opLegacyLogin(db, { email: "ana@x.com", password: "Wrong-pass-1" })).ok, false);
  await assert.rejects(opCustomerResetSet(db, { token, password: "Another-pass-2" }, 90_000), /already used or replaced/);
});

// ── email look: a random piece of Aliana's art ───────────────
test("customer emails get a random piece of Aliana's art (never a children's piece) and still send without one", async () => {
  const db = fakeDb({ Artworks: [
    { id: 1, title: "Kid art", image: "https://x/kid.jpg", isChildren: true },
    { id: 2, title: "Pink <palms>", image: "https://x/palms.jpg", isChildren: false },
    { id: 3, title: "No picture yet", image: null, isChildren: false },
  ] });
  const html = T.welcomeCoupon({ code: "FK-1", discount: 15 });
  assert.match(html, /<!--ART-->/);
  for (let i = 0; i < 10; i++) {
    const out = await T.withRandomArt(db, html);
    assert.match(out, /palms\.jpg/);
    assert.match(out, /Pink &lt;palms&gt;/);
    assert.doesNotMatch(out, /kid\.jpg|<!--ART-->|<palms>/);
  }
  // Shop alerts keep the look but no picture.
  assert.doesNotMatch(T.contactStore({ name: "a", email: "b@c.de", message: "m" }), /<!--ART-->/);
  // No art, or the database is down: the email still goes, just without the picture.
  assert.doesNotMatch(await T.withRandomArt(fakeDb({ Artworks: [] }), html), /<!--ART-->|<img/);
  assert.doesNotMatch(await T.withRandomArt(fakeDb({}, { fail: { Artworks: { code: "x", message: "down" } } }), html), /<!--ART-->|<img/);
});
