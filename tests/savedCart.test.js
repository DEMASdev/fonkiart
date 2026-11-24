// The saved cart, finished (Andy, 2026-11-23: "get it done !" / "all 8"). What he said yes to:
//  1bb who left art in their cart shows in the morning email, each person once (Admin's list comes later);
//  2bb their art is waiting in the cart when they sign in;
//  3bb only its owner can save, change or empty a saved cart: the browser that gave the email FIRST
//      (it holds a pass, api/_lib/cartPass.js), or the person signed in with it;
//  4bb collectors who sign in have theirs saved too;
//  5bb a saved cart goes after 30 days, when the art sells, or when the person buys;
//  6bb the Cart page tells someone signed in that it is saved;
//  7bb Admin -> Leads "+ Create Coupon" gives a code to someone on the list with none;
//  8bb the morning email names each "Didn't finish paying" checkout once. Admin keeps the list.
// No new column: db/2026-11-22-cart-email.sql is the only SQL, and until it runs nothing changes.
// Fakes only: made-up people, emails, codes and keys; nothing is sent or saved anywhere. Every test
// fails on 94ef250 (measured), and each check has a control that shows it can fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const has = (p) => existsSync(new URL(p, root));
// Loaded when each test runs, so the shop before this change fails each test by name, not the file.
const load = (p) => (has(p) ? import(new URL(p, root).href) : Promise.resolve(null));
const KEY = ["made", "up", "for", "tests"].join("-"); // the server's key, made up
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;
const NOW = new Date("2026-11-23T13:20:00Z"); // inside the hour the morning email goes out
const ago = (ms, from = NOW) => new Date(from.getTime() - ms).toISOString();
const copy = (v) => JSON.parse(JSON.stringify(v));

// ── a stand-in for supabase-js with the service key ─────────────────
// sql: whether db/2026-11-22-cart-email.sql has run. Before it, its columns are on no row, and
// asking for them by name is refused as PostgREST refuses it. log: every read and write.
const ART = () => [
  { id: 12, title: "Flamingo Party", price: 950, salePrice: null, image: "https://img.example/flamingo.jpg", isSold: false, isChildren: false },
  { id: 13, title: "Mangrove Light", price: 1200, salePrice: 990, image: "https://img.example/mangrove.jpg", isSold: false, isChildren: false },
  { id: 14, title: "Sold Sunset", price: 700, salePrice: null, image: "https://img.example/sunset.jpg", isSold: true, isChildren: false },
  { id: 15, title: "Ask About Me", price: null, salePrice: null, image: "https://img.example/ask.jpg", isSold: false, isChildren: false },
  { id: 16, title: "Reef <b>Song</b>", price: 400, salePrice: null, image: null, isSold: false, isChildren: false },
];
const USERS = {
  "ana-jwt": { id: "u-ana", email: "Ana@Example.com", email_confirmed_at: "2026-11-20T10:00:00Z", user_metadata: { role: "buyer" } },
  "col-jwt": { id: "u-col", email: "col@example.com", confirmed_at: "2026-11-20T10:00:00Z", user_metadata: {} },
  "unsure-jwt": { id: "u-unsure", email: "ana@example.com", email_confirmed_at: null, user_metadata: { role: "buyer" } },
};
function fakeDb({ leads = [], artworks = ART(), orders = [], clients = [], requests = [], sql = true, fails = {} } = {}) {
  const tables = { Leads: leads, Artworks: artworks, Orders: orders, Clients: clients, Requests: requests, Settings: [{ id: 1, couponDiscount: 15 }] };
  if (sql) for (const r of leads) for (const c of ["cart", "cart_at"]) if (!(c in r)) r[c] = null;
  const log = [], files = {};
  let bucket = false;
  const down = (table, op) => { const f = fails[`${table}.${op}`] || fails[table]; return f ? { data: null, error: f } : null; };
  function from(table) {
    let op = "select", payload = null, lim = null, one = false, cols = "*";
    const filters = [], sorts = [], asked = [];
    const b = {
      select(c = "*") { if (op === "select") cols = c; return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      delete() { op = "delete"; return b; },
      eq(k, v) { asked.push(k); filters.push((r) => r[k] === v); return b; },
      in(k, vs) { asked.push(k); filters.push((r) => vs.includes(r[k])); return b; },
      lt(k, v) { asked.push(k); filters.push((r) => r[k] != null && r[k] < v); return b; },
      not(k) { asked.push(k); filters.push((r) => r[k] != null); return b; }, // .not(k, "is", null)
      ilike(k, pattern) { // "\_" is a real "_"; "_" any letter; "%" anything, and so is "*" (PostgREST)
        const re = new RegExp("^" + pattern.replace(/\\(.)|([%_*])|([.+?^${}()|[\]/])/g, (_, esc, wild, sign) => (wild ? (wild === "_" ? "." : ".*") : `\\${esc || sign}`)) + "$", "i");
        asked.push(k); filters.push((r) => re.test(String(r[k] ?? ""))); return b;
      },
      order(k, { ascending = true } = {}) { sorts.push([k, ascending ? 1 : -1]); return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { one = true; return b; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    function run() {
      log.push({ table, op, cols: op === "select" ? cols : undefined, payload: payload && copy(payload) });
      const no = down(table, op);
      if (no) return no;
      const named = [...asked, ...(cols === "*" ? [] : cols.split(",")), ...Object.keys([].concat(payload || [])[0] || {})];
      if (!sql && table === "Leads" && named.some((c) => c === "cart" || c === "cart_at")) return { data: null, error: { code: "42703", message: "column Leads.cart does not exist" } };
      const rows = tables[table] || [];
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      for (const [k, dir] of [...sorts].reverse()) hit.sort((a, c) => (String(a[k] ?? "") < String(c[k] ?? "") ? -dir : String(a[k] ?? "") > String(c[k] ?? "") ? dir : 0));
      if (op === "insert") { for (const r of payload) rows.push({ id: rows.length + 100, ...(sql && table === "Leads" ? { cart: null, cart_at: null } : {}), ...copy(r) }); return { data: null, error: null }; }
      if (op === "update") { for (const r of hit) Object.assign(r, copy(payload)); return { data: null, error: null }; }
      let out = hit.map((r) => (cols === "*" ? copy(r) : Object.fromEntries(cols.split(",").map((c) => [c, copy(r[c] ?? null)]))));
      if (lim != null) out = out.slice(0, lim);
      return one ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    return b;
  }
  const storage = {
    async createBucket() { bucket = true; return { data: {}, error: null }; },
    from: () => ({
      async list(dir) { return { data: Object.keys(files).filter((f) => f.startsWith(`${dir}/`)).map((f) => ({ name: f.slice(dir.length + 1) })), error: null }; },
      async download(path) {
        if (fails.note) return { data: null, error: { message: "Storage is down" } };
        return bucket && files[path] != null ? { data: new Blob([files[path]]), error: null } : { data: null, error: { message: "Object not found" } };
      },
      async upload(path, blob) {
        if (!bucket) return { data: null, error: { message: "Bucket not found" } };
        files[path] = await blob.text();
        return { data: { path }, error: null };
      },
    }),
  };
  const auth = {
    getUser: async (t) => (fails.auth ? { data: { user: null }, error: fails.auth }
      : USERS[t] ? { data: { user: USERS[t] }, error: null } : { data: { user: null }, error: { name: "AuthApiError", status: 403, message: "bad jwt" } }),
    admin: { listUsers: async () => ({ data: { users: [] }, error: null }), generateLink: async () => ({ data: null, error: { code: "off" } }) },
  };
  return {
    from, storage, auth, tables, log, fails,
    get writes() { return log.filter((l) => l.op !== "select"); },
    note: () => (files["reminders.json"] ? JSON.parse(files["reminders.json"]) : null),
    setNote: (v) => { bucket = true; files["reminders.json"] = typeof v === "string" ? v : JSON.stringify(v); },
  };
}
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); return { messageId: "<m@x>" }; } }; };
const req = (body, token) => ({ body, headers: token ? { authorization: `Bearer ${token}` } : {} });
const LEAD = (extra = {}) => ({ id: 7, email: "ana@example.com", source: "welcome-popup", coupon_code: "FK-AAAA-BBBB", coupon_used: false, created_at: "2026-11-20T10:00:00Z", ...extra });
const cartOf = (...ids) => ids.map((id) => ({ id, title: "as it was saved", price: 1, image: null }));
async function logsOf(fn) {
  const said = [];
  const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => said.push(a.map(String).join(" "));
  try { return { out: await fn(), said: said.join("\n") }; } finally { Object.assign(console, keep); }
}
const server = async () => {
  const [m, p, store] = [await load("api/_lib/cartMemory.js"), await load("api/_lib/cartPass.js"), await import(new URL("api/_lib/storeOps.js", root).href)];
  assert.ok(p, "api/_lib/cartPass.js is there");
  assert.ok(m?.opMyCart && m.forgetOldCarts, "api/_lib/cartMemory.js has opMyCart and forgetOldCarts");
  return { ...m, ...p, ...store };
};

// ── 3bb: the pass ───────────────────────────────────────────────
test("3bb the pass: good for its own email and its own code only, for 30 days; any change to it, another key or no key, and it is not", async () => {
  const p = await load("api/_lib/cartPass.js");
  assert.ok(p, "api/_lib/cartPass.js is there");
  const { out: pass, said } = await logsOf(async () => p.makePass("ana@example.com", "FK-AAAA-BBBB", NOW));
  assert.match(pass, /^[0-9a-z]+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(parseInt(pass.split(".")[0], 36), NOW.getTime(), "when it was made");
  assert.equal(p.makePass("ana@example.com", "FK-AAAA-BBBB", NOW), pass, "worked out again, never kept");
  const good = (x = pass, email = "ana@example.com", code = "FK-AAAA-BBBB", now = NOW) => p.goodPass(x, email, code, now);
  assert.equal(good(), true, "control: its own email and code, now");
  const after = (ms) => new Date(NOW.getTime() + ms);
  assert.equal(good(pass, undefined, undefined, after(30 * DAY)), true, "30 days");
  for (const [why, args] of [
    ["a moment past 30 days", [pass, undefined, undefined, after(30 * DAY + 1)]],
    ["31 days", [pass, undefined, undefined, after(31 * DAY)]],
    ["from the future", [pass, undefined, undefined, after(-1)]],
    ["another email", [pass, "bo@example.com"]], ["another code", [pass, undefined, "FK-AAAA-CCCC"]],
    ["no code", [pass, undefined, null]], ["an empty code", [pass, undefined, ""]],
  ]) assert.equal(good(...args), false, why);
  const [issued, sig] = pass.split(".");
  const later = (NOW.getTime() - 1).toString(36);
  for (const x of [`${later}.${sig}`, `0${issued}.${sig}`, `${issued.toUpperCase()}.${sig}`, `${issued}.${sig.slice(0, -1)}`, `${issued}.${sig}x`, `${issued}.${"A".repeat(43)}`,
    `${issued}.${sig.slice(0, 5)}${sig[5] === "a" ? "b" : "a"}${sig.slice(6)}`, `${issued}${sig}`, ` ${pass}`, `${pass}\n`, "", null, undefined, 5, {}, [pass], "x".repeat(100000)]) {
    assert.equal(p.goodPass(x, "ana@example.com", "FK-AAAA-BBBB", NOW), false, String(x).slice(0, 60));
  }
  // The email and the code can't be slid into each other.
  for (const [one, two] of [[["a@x.co", "B:FK-1"], ["a@x.co:B", "FK-1"]], [["a@x.co", 'B","FK-1'], ['a@x.co","B', "FK-1"]], [["a@x.co", "1FK"], ["a@x.co1", "FK"]]]) {
    assert.notEqual(p.makePass(...one, NOW), p.makePass(...two, NOW));
    assert.equal(p.goodPass(p.makePass(...one, NOW), ...two, NOW), false);
  }
  for (const [email, code] of [["", "FK-1"], ["a@x.co", ""], ["a@x.co", null], [null, "FK-1"]]) assert.equal(p.makePass(email, code, NOW), null);
  // A row with no code: not even a pass made over no code is good for it. Made by hand here, as
  // makePass makes none (control: made the same way, with its code, it is makePass's own).
  const byHand = (email, code) => {
    const key = crypto.createHmac("sha256", KEY).update("fonkiart cart pass").digest();
    return `${issued}.${crypto.createHmac("sha256", key).update(JSON.stringify(["cart-pass:1", email, code, issued])).digest("base64url")}`;
  };
  assert.equal(byHand("ana@example.com", "FK-AAAA-BBBB"), pass);
  for (const none of ["", null, undefined]) assert.equal(p.goodPass(byHand("ana@example.com", ""), "ana@example.com", none, NOW), false, String(none));
  // Another server key: the old pass is dead. No key: none made, none good.
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = `${KEY}-changed`;
    assert.equal(good(), false);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(p.makePass("ana@example.com", "FK-AAAA-BBBB", NOW), null);
    assert.equal(good(), false);
  } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
  assert.ok(!pass.includes(KEY) && said === "", "nothing is logged");
  assert.doesNotMatch(read("api/_lib/cartPass.js"), /console\./);
});

test("3bb the welcome gift hands the pass only to whoever gives an email FIRST: an email on the list already, with or without a code, gets none", async () => {
  const { opWelcome, goodPass, leadCoupon } = await server();
  const db = fakeDb({ leads: [LEAD(), LEAD({ id: 8, email: "cart@example.com", coupon_code: null, cart: cartOf(12), cart_at: ago(HOUR) })] });
  const mail = mailbox();
  const { out, said } = await logsOf(() => opWelcome(db, { email: " New@Example.com " }, mail));
  assert.equal(out.returning, false);
  assert.equal(goodPass(out.pass, "new@example.com", out.code), true, "control: someone new gets one, good for their email and code");
  // Typed again (a stranger, or them on another device): today's answer, and no pass.
  assert.deepEqual(await opWelcome(db, { email: "new@example.com" }, mail), { returning: true, code: out.code, used: false });
  assert.deepEqual(await opWelcome(db, { email: "ana@example.com" }, mail), { returning: true, code: "FK-AAAA-BBBB", used: false });
  // On the list with no code (their cart was saved signed in): a code as today, and no pass to that cart.
  const { out: coded } = await logsOf(() => opWelcome(db, { email: "cart@example.com" }, mail));
  assert.deepEqual([coded.returning, typeof coded.code, "pass" in coded], [false, "string", false]);
  assert.equal((await leadCoupon(fakeDb(), "x@example.com", "welcome-popup")).fresh, true);
  assert.equal((await leadCoupon(fakeDb({ leads: [LEAD({ email: "x@example.com", coupon_code: null })] }), "x@example.com", "welcome-popup")).fresh, false);
  // Never in an email, never in a log.
  assert.ok(!JSON.stringify(mail.sent).includes(out.pass) && !said.includes(out.pass));
  // No server key (the server has nothing at all then): no coupon email, which would have no Unsubscribe link, and no pass.
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const none = mailbox();
    await logsOf(() => assert.rejects(opWelcome(fakeDb(), { email: "new@example.com" }, none), /no key for the Unsubscribe link/));
    assert.deepEqual(none.sent, []);
  } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
});

test("3bb a stranger typing a known email changes nothing, empties nothing, and learns nothing; its own browser saves, changes and empties it", async () => {
  const { opRememberCart, makePass } = await server();
  const full = () => LEAD({ cart: cartOf(12, 13), cart_at: ago(HOUR) });
  const passFor = (email, code = "FK-AAAA-BBBB", at = NOW) => makePass(email, code, at);
  const known = "ana@example.com", unknown = "nobody@example.com";
  const tries = {
    "no pass, another cart": { pieces: [13] },
    "no pass, an empty cart": { pieces: [] },
    "an empty pass": { pass: "", pieces: [] },
    "a made-up pass": { pass: `${NOW.getTime().toString(36)}.${"A".repeat(43)}`, pieces: [] },
    "their own pass, for their own email": { pass: passFor("stranger@example.com", "FK-SSSS-TTTT"), pieces: [] },
    "a pass for that email and the stranger's own code": { pass: passFor(known, "FK-SSSS-TTTT"), pieces: [] },
    "a pass made with a guessed key": { pass: (() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "guess"; try { return passFor(known); } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; } })(), pieces: [] },
    "its real pass, 31 days old": { pass: passFor(known, "FK-AAAA-BBBB", new Date(NOW.getTime() - 31 * DAY)), pieces: [] },
    "its real pass, from before the row was made again": { pass: passFor(known, "FK-OLDE-CODE"), pieces: [] },
    "an object for a pass": { pass: { toString: "x" }, pieces: [] },
    "a list for a pass": { pass: [passFor(known)], pieces: [] },
    "a number for a pass": { pass: 7, pieces: [] },
    "a bad sign-in with no pass": { pieces: [], token: "stolen-jwt" },
  };
  for (const [why, { token, ...body }] of Object.entries(tries)) {
    const seen = [];
    for (const email of [known, unknown]) {
      const db = fakeDb({ leads: [full()] });
      const { out, said } = await logsOf(() => opRememberCart(db, req({ email, ...body }, token), NOW));
      assert.deepEqual(db.writes, [], `${why}: nothing is written`);
      assert.deepEqual(db.tables.Leads, [full()], why);
      assert.equal(said, "", why);
      seen.push({ out, reads: db.log.map((l) => [l.table, l.cols]) });
    }
    assert.deepEqual(seen[0], seen[1], `${why}: the same answer and the same reads for an email on the list and one that isn't`);
    assert.deepEqual(seen[0].out, body.pass == null || body.pass === "" ? { ok: true } : { ok: true, kept: false }, why);
  }
  // Control: the browser that gave the email first, with its pass (any capitals, spaces around it).
  const db = fakeDb({ leads: [full(), LEAD({ id: 8, email: "bo@example.com", coupon_code: "FK-BBBB-CCCC", cart: cartOf(12), cart_at: ago(HOUR) })] });
  const pass = passFor(known);
  assert.deepEqual(await opRememberCart(db, req({ email: " ANA@example.com", pass, pieces: [13] }), NOW), { ok: true, kept: true });
  assert.deepEqual(db.tables.Leads[0].cart.map((p) => p.id), [13], "changed");
  assert.deepEqual(await opRememberCart(db, req({ email: known, pass, pieces: [] }), NOW), { ok: true, kept: true });
  assert.equal(db.tables.Leads[0].cart, null, "emptied");
  assert.deepEqual(db.tables.Leads[1].cart.map((p) => p.id), [12], "nobody else's");
  // A pass for one email never works for another, on the list or not.
  for (const email of ["bo@example.com", unknown]) assert.deepEqual(await opRememberCart(db, req({ email, pass, pieces: [13] }), NOW), { ok: true, kept: false });
  assert.deepEqual(db.tables.Leads.map((r) => r.cart?.map((p) => p.id) ?? null), [null, [12]]);
  assert.equal(db.tables.Leads.length, 2, "a typed email never makes a Leads row");
  // Two rows for one email (an old double): each row's pass is good, for that row.
  const twice = fakeDb({ leads: [LEAD({ id: 1 }), LEAD({ id: 2, coupon_code: "FK-2222-2222" })] });
  assert.deepEqual(await opRememberCart(twice, req({ email: known, pass: passFor(known, "FK-2222-2222"), pieces: [13] }), NOW), { ok: true, kept: true });
  assert.deepEqual(await opRememberCart(twice, req({ email: known, pass: passFor(known), pieces: [12] }), NOW), { ok: true, kept: true });
  assert.deepEqual(twice.tables.Leads.map((r) => [r.id, r.cart.map((p) => p.id)]), [[1, [12]], [2, [13]]]);
});

test("3bb a stranger who typed the email before its owner ever did: once the owner has saved it signed in, their pass changes nothing", async () => {
  const { opRememberCart, opMyCart, cartsLeft, makePass, opWelcome } = await server();
  const start = async () => {
    const db = fakeDb({ leads: [LEAD({ id: 1, email: "else@example.com" })] });
    const { out } = await logsOf(() => opWelcome(db, { email: "ana@example.com" }, mailbox()));
    const [, row] = db.tables.Leads;
    assert.equal(row.email, "ana@example.com");
    const pass = makePass("ana@example.com", row.coupon_code, NOW);
    assert.equal(typeof out.pass, "string", "the first to type it holds a pass");
    const stranger = (pieces, at = NOW) => opRememberCart(db, req({ email: "ana@example.com", pass, pieces }), at);
    const ana = (pieces, at = NOW) => opRememberCart(db, req({ pieces }, "ana-jwt"), at);
    return { db, row, pass, stranger, ana };
  };
  const ids = (row) => (row.cart || []).map((p) => p.id).filter(Boolean);
  {
    const { row, stranger, ana, db, pass } = await start();
    assert.deepEqual(await stranger([13]), { ok: true, kept: true }, "control: until its owner signs in, that pass saves");
    assert.deepEqual(ids(row), [13]);
    assert.deepEqual(await ana([12, 13]), { ok: true });
    const theirs = copy(row);
    assert.deepEqual(ids(row), [12, 13]);
    db.log.length = 0;
    for (const pieces of [[16], [], [12, 13]]) assert.deepEqual(await stranger(pieces), { ok: true, kept: false }, JSON.stringify(pieces));
    assert.deepEqual(await stranger([], new Date(NOW.getTime() + 29 * DAY)), { ok: true, kept: false }, "for as long as the pass lasts");
    assert.deepEqual([row, db.writes], [theirs, []], "not changed, not emptied, nothing written");
    assert.deepEqual(await opRememberCart(db, req({ email: "ana@example.com", pass: `${pass.slice(0, -1)}x`, pieces: [] }), NOW), { ok: true, kept: false }, "the answer a wrong pass gets");
    assert.deepEqual(await opMyCart(db, req({}, "ana-jwt"), NOW), { signedIn: true, pieces: [12, 13] }, "and it comes back to its owner");
    assert.deepEqual((await cartsLeft(db, { now: NOW })).map((c) => [c.email, c.pieces.map((p) => p.id)]), [["ana@example.com", [12, 13]]], "shown as any other");
    assert.ok(!JSON.stringify(await cartsLeft(db, { now: NOW })).includes("signed"), "the mark stays on the row");
    // The owner goes on as before, from anywhere they are signed in.
    assert.deepEqual(await ana([16]), { ok: true });
    assert.deepEqual(ids(row), [16]);
  }
  { // Emptied by its owner (bought, or taken out): it stays empty, and nobody is followed up about it.
    const { row, stranger, ana, db } = await start();
    await stranger([13]);
    await ana([]);
    assert.deepEqual([row.cart, row.cart_at], [[{ signed: true }], NOW.toISOString()]);
    assert.deepEqual(await stranger([13]), { ok: true, kept: false });
    assert.deepEqual(row.cart, [{ signed: true }]);
    assert.deepEqual(await opMyCart(db, req({}, "ana-jwt"), NOW), { signedIn: true, pieces: [] });
    assert.deepEqual(await cartsLeft(db, { now: NOW }), []);
  }
  { // Two rows for one email: signed in, the cart on one of them is kept; a pass for the other one changes neither.
    const { stranger, ana, db } = await start();
    db.tables.Leads.push(LEAD({ id: 50, coupon_code: "FK-2222-2222", cart: cartOf(13), cart_at: ago(HOUR) }));
    await ana([12]);
    const now = copy(db.tables.Leads);
    assert.deepEqual(await stranger([16]), { ok: true, kept: false });
    assert.deepEqual(await opRememberCart(db, req({ email: "ana@example.com", pass: makePass("ana@example.com", "FK-2222-2222", NOW), pieces: [16] }), NOW), { ok: true, kept: false });
    assert.deepEqual(db.tables.Leads, now);
  }
  { // Only a real sign-in marks it: one that was never confirmed doesn't, and neither does a browser's own words.
    const { row, stranger, db, pass } = await start();
    await opRememberCart(db, req({ pieces: [12] }, "unsure-jwt"), NOW);
    await opRememberCart(db, req({ email: "ana@example.com", pass, pieces: [12], signed: true, cart: [{ signed: true }] }), NOW);
    assert.deepEqual(row.cart, [{ id: 12, title: "Flamingo Party", price: 950, image: "https://img.example/flamingo.jpg" }]);
    assert.deepEqual(await stranger([13]), { ok: true, kept: true });
    assert.deepEqual(ids(row), [13]);
  }
  // After 30 days the mark goes with the cart (forgetOldCarts), and any pass from before it is too old by then.
  const { forgetOldCarts } = await server();
  const { row, stranger, ana, db } = await start();
  await ana([12], new Date(NOW.getTime() + DAY));
  const later = new Date(NOW.getTime() + 31 * DAY + 2000);
  await forgetOldCarts(db, later);
  assert.deepEqual([row.cart, row.cart_at], [null, null]);
  assert.deepEqual(await stranger([13], later), { ok: true, kept: false });
  assert.equal(row.cart, null);
});

test("3bb signed in as yourself you can't reach anyone else's cart, and Supabase being down is an error, never 'nobody'", async () => {
  const { opRememberCart, opMyCart, makePass } = await server();
  const rows = () => [LEAD({ cart: cartOf(12), cart_at: ago(HOUR) }), LEAD({ id: 8, email: "col@example.com", coupon_code: "FK-CCCC-CCCC" })];
  // The stranger signs in as themselves and names someone else in the body, even with a pass for them.
  const db = fakeDb({ leads: rows() });
  await opRememberCart(db, req({ email: "ana@example.com", pass: makePass("ana@example.com", "FK-AAAA-BBBB", NOW), pieces: [13] }, "col-jwt"), NOW);
  assert.deepEqual(db.tables.Leads.map((r) => r.cart.map((p) => p.id)), [[12], [13]], "only their own row");
  assert.deepEqual(await opMyCart(db, req({ email: "ana@example.com" }, "col-jwt"), NOW), { signedIn: true, pieces: [13] }, "and only their own cart back");
  // A sign-in with their email that was never confirmed: nothing, as with no sign-in at all.
  const half = fakeDb({ leads: rows() });
  assert.deepEqual(await opRememberCart(half, req({ email: "ana@example.com", pieces: [] }, "unsure-jwt"), NOW), { ok: true });
  assert.deepEqual(half.writes, []);
  // Supabase's sign-in service not answering: neither action goes on as if nobody were signed in.
  for (const error of [{ name: "AuthRetryableFetchError", status: 0 }, { name: "AuthApiError", status: 503 }, { name: "AuthApiError", status: 429 }]) {
    const out = fakeDb({ leads: rows(), fails: { auth: error } });
    await assert.rejects(opMyCart(out, req({}, "ana-jwt"), NOW));
    await assert.rejects(opRememberCart(out, req({ pieces: [] }, "ana-jwt"), NOW));
    assert.deepEqual(out.writes, []);
  }
  // A sign-in that is simply no good is nobody (control for the one above).
  assert.deepEqual(await opMyCart(fakeDb({ leads: rows() }), req({}, "old-jwt"), NOW), { pieces: [] });
});

// ── 4bb: everyone who signs in for real ─────────────────────────
test("4bb a collector's cart is saved as a buyer's is: their own email, a new row says so, a row they have keeps what it says", async () => {
  const { opRememberCart } = await server();
  const made = async (token, pieces = [12]) => { const db = fakeDb({ leads: [LEAD({ id: 1, email: "else@example.com" })] }); const out = await opRememberCart(db, req({ pieces }, token), NOW); return { out, row: db.tables.Leads[1] }; };
  for (const [token, email, source] of [["col-jwt", "col@example.com", "collector-cart"], ["ana-jwt", "ana@example.com", "buyer-cart"]]) {
    const { out, row } = await made(token);
    assert.deepEqual(out, { ok: true });
    assert.deepEqual([row.email, row.source, row.coupon_code, row.coupon_used], [email, source, null, false]);
    assert.deepEqual(row.cart, [{ id: 12, title: "Flamingo Party", price: 950, image: "https://img.example/flamingo.jpg", signed: true }]);
    assert.equal(row.cart_at, NOW.toISOString());
  }
  assert.equal((await made("col-jwt", [])).row, undefined, "an empty cart makes no row");
  const db = fakeDb({ leads: [LEAD({ email: "col@example.com", source: "manual" })] });
  await opRememberCart(db, req({ pieces: [13] }, "col-jwt"), NOW);
  assert.deepEqual([db.tables.Leads.length, db.tables.Leads[0].source, db.tables.Leads[0].coupon_code, db.tables.Leads[0].cart[0].id], [1, "manual", "FK-AAAA-BBBB", 13]);
});

// ── 2bb: my-cart ────────────────────────────────────────────────
test("2bb my-cart: the pieces whoever is signed in left, still for sale, saved in the last 30 days; nothing else, and nothing for anyone else", async () => {
  const { STORE_OPS, opMyCart } = await server();
  assert.equal(typeof STORE_OPS["my-cart"], "function", "a store action");
  const rows = (extra = {}) => [LEAD({ cart: cartOf(13, 14, 12, 15, 99), cart_at: ago(29 * DAY), ...extra }), LEAD({ id: 8, email: "col@example.com", cart: cartOf(13), cart_at: ago(HOUR) })];
  const mine = (opts = {}, token = "ana-jwt", body = {}) => opMyCart(fakeDb({ leads: rows(), ...opts }), req(body, token), NOW);
  assert.deepEqual(await mine(), { signedIn: true, pieces: [13, 12] }, "in their order: the sold one, the one with no price and the one that left the shop are out");
  assert.deepEqual(await mine({}, "col-jwt", { email: "ana@example.com" }), { signedIn: true, pieces: [13] }, "a collector's own, never an email in the body");
  // Nobody signed in for real: nothing, and not the word that says it is their own answer.
  for (const [why, out] of [
    ["no sign-in", await mine({}, null, { email: "ana@example.com" })],
    ["a sign-in that is no good", await mine({}, "old-jwt")],
    ["an email never confirmed", await mine({}, "unsure-jwt")],
  ]) assert.deepEqual(out, { pieces: [] }, why);
  for (const [why, out] of [
    ["nothing saved", await mine({ leads: [LEAD()] })],
    ["not on the list", await mine({ leads: [] })],
    ["saved 31 days ago", await mine({ leads: rows({ cart_at: ago(31 * DAY) }) })],
    ["a cart with no date", await mine({ leads: rows({ cart_at: null }) })],
    ["not a list", await mine({ leads: rows({ cart: { id: 12 } }) })],
    ["the SQL hasn't run", await mine({ leads: [LEAD()], sql: false })],
  ]) assert.deepEqual(out, { signedIn: true, pieces: [] }, why);
  // Bought since: theirs already. A card checkout they didn't finish bought nothing, and an order from before the cart is another time.
  const order = (extra) => ({ id: 1, client_email: "ANA@example.com", item_title: "Mangrove Light", status: "pending", notes: "Order Ref: FA-1800 · Ana · Paying by Zelle", created_at: ago(DAY), ...extra });
  assert.deepEqual((await mine({ orders: [order()] })).pieces, [12]);
  assert.deepEqual((await mine({ orders: [order({ notes: "Order Ref: FA-1800 · Ana · Paying by card" })] })).pieces, [13, 12]);
  assert.deepEqual((await mine({ orders: [order({ status: "paid", notes: "Order Ref: FA-1800 · Ana · Paying by card" })] })).pieces, [12]);
  assert.deepEqual((await mine({ orders: [order({ created_at: ago(60 * DAY) })] })).pieces, [13, 12]);
  assert.deepEqual((await mine({ orders: [order({ client_email: "anaXexample.com" }), order({ client_email: "xana@example.com" })] })).pieces, [13, 12], "someone else's order");
  // It only reads.
  const db = fakeDb({ leads: rows() });
  await opMyCart(db, req({}, "ana-jwt"), NOW);
  assert.deepEqual(db.writes, []);
  // An email with a sign the search takes for "anything" is only itself ("a_a@" and "a*a@" are not "axa@").
  for (const sign of ["_", "*", "%"]) {
    USERS["sign-jwt"] = { id: "u-sign", email: `a${sign}a@example.com`, email_confirmed_at: "2026-11-20T10:00:00Z", user_metadata: {} };
    const bought = (client_email) => opMyCart(fakeDb({ leads: [LEAD({ email: `a${sign}a@example.com`, cart: cartOf(13), cart_at: ago(DAY) })], orders: [order({ client_email, created_at: ago(HOUR) })] }), req({}, "sign-jwt"), NOW);
    assert.deepEqual(await bought("axa@example.com"), { signedIn: true, pieces: [13] }, sign);
    assert.deepEqual(await bought(`A${sign}A@example.com`), { signedIn: true, pieces: [] }, `control: their own order, ${sign}`);
  }
});

// ── 5bb: what counts as left in the cart ────────────────────────
test("5bb cartsLeft: today's pieces and prices, the newest first; old carts, sold art, buyers and 'Didn't finish paying' are out", async () => {
  const { cartsLeft } = await server();
  const lead = (email, ids, at, extra = {}) => LEAD({ id: email, email, cart: cartOf(...ids), cart_at: at, ...extra });
  const order = (client_email, created_at, extra = {}) => ({ id: `${client_email}${created_at}`, client_email, item_title: "Other", status: "delivered", notes: "", created_at, ...extra });
  const CARD = "Order Ref: FA-1801 · Di · Paying by card";
  const leads = [
    lead("ana@example.com", [12, 14, 99, 13], ago(2 * DAY)),
    lead("bo@example.com", [15], ago(DAY)),
    lead("old@example.com", [12], ago(31 * DAY)),
    lead("edge@example.com", [12], ago(30 * DAY)),
    lead("sold@example.com", [14, 99], ago(DAY)),
    lead("none@example.com", [], ago(DAY)),
    lead("bought@example.com", [12], ago(DAY)),
    lead("cancelled@example.com", [12], ago(DAY)),
    lead("card@example.com", [12], ago(DAY)),
    lead("ship@example.com", [12], ago(3 * DAY)),
    lead("ana@example.com", [16], ago(5 * DAY), { id: "again" }), // a second row for the same email
  ];
  const orders = [
    order("BOUGHT@Example.com", ago(HOUR)), order("cancelled@example.com", ago(HOUR), { status: "cancelled" }),
    order("card@example.com", ago(6 * DAY), { status: "pending", notes: CARD }), // before the cart, and this week
    order("ship@example.com", ago(90 * DAY), { ship_name: "Shea Ship" }),
    order("ana@example.com", ago(40 * DAY), { ship_name: "Not This One" }),
  ];
  const clients = [{ name: " Ana Client ", email: "Ana@Example.com" }];
  const left = await cartsLeft(fakeDb({ leads, orders, clients }), { now: NOW });
  const piece = (id, title, price, image) => ({ id, title, price, image });
  assert.deepEqual(left, [
    { email: "bo@example.com", name: "", pieces: [piece(15, "Ask About Me", null, "https://img.example/ask.jpg")], total: 0, at: ago(DAY) },
    { email: "ana@example.com", name: "Ana Client", pieces: [piece(12, "Flamingo Party", 950, "https://img.example/flamingo.jpg"), piece(13, "Mangrove Light", 990, "https://img.example/mangrove.jpg")], total: 1940, at: ago(2 * DAY) },
    { email: "ship@example.com", name: "Shea Ship", pieces: [piece(12, "Flamingo Party", 950, "https://img.example/flamingo.jpg")], total: 950, at: ago(3 * DAY) },
    { email: "edge@example.com", name: "", pieces: [piece(12, "Flamingo Party", 950, "https://img.example/flamingo.jpg")], total: 950, at: ago(30 * DAY) },
  ]);
  assert.deepEqual((await cartsLeft(fakeDb({ leads, orders, clients }), { now: NOW, limit: 2 })).map((c) => c.email), ["bo@example.com", "ana@example.com"]);
  // Controls: each rule is what keeps that person out (without it they are on the list).
  const emails = async (o) => (await cartsLeft(fakeDb({ leads: copy(leads), ...o }), { now: NOW })).map((c) => c.email);
  assert.ok((await emails({ orders: [] })).includes("bought@example.com"));
  assert.ok((await emails({ orders: [order("bought@example.com", ago(25 * HOUR))] })).includes("bought@example.com"), "an order from before the cart is another time");
  assert.ok((await emails({ orders: [order("card@example.com", ago(8 * DAY), { status: "pending", notes: CARD })] })).includes("card@example.com"), "a checkout from last week is no longer on the other list");
  // Before the SQL: nothing, and nothing in the log. Anything that can't be read: [], said by its code only.
  const { out: before, said } = await logsOf(() => cartsLeft(fakeDb({ leads: [LEAD()], sql: false }), { now: NOW }));
  assert.deepEqual([before, said], [[], ""]);
  for (const table of ["Leads", "Orders", "Artworks"]) {
    const { out, said: why } = await logsOf(() => cartsLeft(fakeDb({ leads: copy(leads), fails: { [table]: { code: "57014", message: "ana@example.com" } } }), { now: NOW }));
    assert.deepEqual([out, why], [[], "cartsLeft: not read (57014)"], table);
  }
  const { out: noNames } = await logsOf(() => cartsLeft(fakeDb({ leads: copy(leads), orders, fails: { Clients: { code: "57014" } } }), { now: NOW }));
  assert.equal(noNames.find((c) => c.email === "ana@example.com").name, "Not This One", "names the shop can't read are only a nicety");
});

test("5bb forgetOldCarts: a cart saved more than 30 days ago is let go, the row itself stays; nothing before the SQL", async () => {
  const { forgetOldCarts } = await server();
  const rows = () => [LEAD({ cart: cartOf(12), cart_at: ago(30 * DAY + 1000) }), LEAD({ id: 8, email: "bo@example.com", cart: cartOf(13), cart_at: ago(30 * DAY - 1000) }), LEAD({ id: 9, email: "cy@example.com" })];
  const db = fakeDb({ leads: rows() });
  await forgetOldCarts(db, NOW);
  assert.deepEqual(db.tables.Leads, [{ ...rows()[0], cart: null, cart_at: null }, rows()[1], { ...rows()[2], cart: null, cart_at: null }]);
  const before = fakeDb({ leads: [LEAD()], sql: false });
  await forgetOldCarts(before, NOW);
  assert.deepEqual(before.writes, [], "before the SQL");
  await assert.rejects(forgetOldCarts(fakeDb({ leads: rows(), fails: { "Leads.update": { code: "57014" } } }), NOW), (e) => e.code === "57014");
});

// ── 1bb (email) and 8bb: the morning email ──────────────────────
const cron = { method: "GET", query: { op: "reminders" }, headers: { "user-agent": "vercel-cron/1.0" } };
const on = (day) => new Date(NOW.getTime() + day * DAY);
const SARA = (extra = {}) => ({ id: 41, client_email: "sara@example.com", ship_name: "Sara Test", ship_phone: "+1 305 555 0100", item_title: "Flamingo Party", amount: 950, status: "pending", created_at: ago(5 * HOUR), notes: "Order Ref: FA-1752 · Sara Test · Paying by card", ...extra });
const mailRun = async () => {
  const r = await import(new URL("api/_lib/reminders.js", root).href);
  await server();
  return r;
};
const textOf = (html) => html.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, " ").replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

test("1bb the morning email, 'Left in the cart': who, each piece small and whole at today's price, the total, how long ago, and the way into Admin", async () => {
  const { opReminders } = await mailRun();
  const leads = [
    LEAD({ cart: cartOf(12, 13), cart_at: ago(2 * DAY) }),
    LEAD({ id: 8, email: "bo@example.com", cart: cartOf(16), cart_at: ago(7 * HOUR) }),
    LEAD({ id: 9, email: "just@example.com", cart: cartOf(12), cart_at: ago(6 * HOUR - 1000) }), // still shopping
  ];
  const db = fakeDb({ leads, clients: [{ name: "Ana <i>Client</i>", email: "ana@example.com" }], orders: [SARA()] });
  const mail = mailbox();
  assert.deepEqual(await opReminders(db, cron, mail, NOW), { ok: true, sent: true });
  const [m] = mail.sent;
  assert.equal(m.to, "fonkiart@gmail.com");
  assert.equal(m.subject, "Waiting for you: 1 didn't finish paying, 2 left art in their carts · Fonkiart");
  const html = m.htmlContent, words = textOf(html);
  assert.match(words, /Didn't finish paying \(1\).*Left in the cart \(2\)/, "after that part");
  const part = words.slice(words.indexOf("Left in the cart (2)"));
  assert.match(part, /^Left in the cart \(2\) bo@example\.com Reef &lt;b&gt;Song&lt;\/b&gt; — \$400 Left in the cart 7 hours ago Open in Admin → Orders → Ana &lt;i&gt;Client&lt;\/i&gt; ana@example\.com Flamingo Party — \$950 Mangrove Light — \$990 Total: \$1,940 Left in the cart 2 days ago Open in Admin → Orders →/);
  assert.doesNotMatch(words, /just@example\.com/, "a cart that changed in the last 6 hours isn't left yet");
  assert.ok(!html.includes("<b>Song") && !html.includes("<i>Client"), "their words are never drawn as HTML");
  assert.ok(html.includes('href="mailto:ana@example.com"') && html.includes('href="https://fonkiart.com/?admin=unfinished"'));
  for (const [id, pic] of [[12, "flamingo"], [13, "mangrove"]]) {
    const img = html.match(new RegExp(`<a href="https://fonkiart\\.com/\\?artwork=${id}"[^>]*><img src="[^"]*${pic}[^"]*"[^>]*style="([^"]*)"`));
    assert.match(img?.[1] || "", /width:80px;height:auto/, `${pic}: small and whole`);
  }
  assert.doesNotMatch(html, /object-fit/);
  const sizes = [...html.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1]));
  assert.ok(sizes.length > 5 && sizes.every((n) => n >= 16), sizes.join(","));
  assert.deepEqual(db.note().lastSent, { requests: 0, orders: 0, unfinished: 1, carts: 2 });
  assert.deepEqual(db.writes.filter((w) => w.table === "Leads" && w.op === "insert"), [], "it makes no coupon and writes to no buyer");
  // One person: the singular, and the email goes for them alone.
  const one = fakeDb({ leads: [LEAD({ cart: cartOf(12), cart_at: ago(DAY) })] });
  const box = mailbox();
  await opReminders(one, cron, box, NOW);
  assert.equal(box.sent[0].subject, "Waiting for you: 1 left art in their cart · Fonkiart");
  assert.match(textOf(box.sent[0].htmlContent), /ana@example\.com Flamingo Party — \$950 Left in the cart 1 day ago/, "one piece: no total; no name known: just the email");
  // Its art is by its own line, so nothing is on top: never a random piece.
  const { readSlot, reminderStore } = await import(new URL("api/_lib/emails.js", root).href);
  assert.deepEqual(readSlot(box.sent[0].htmlContent).titles, []);
  assert.equal(readSlot(reminderStore({ requests: [], orders: [] })).titles, null, "control: an email about no piece gets a random one");
  // An email made of HTML is only ever words in it.
  const odd = fakeDb({ leads: [LEAD({ email: '"><u>x</u>@example.com', cart: cartOf(12), cart_at: ago(DAY) })] });
  const oddBox = mailbox();
  await opReminders(odd, cron, oddBox, NOW);
  const drawnOdd = oddBox.sent[0].htmlContent;
  assert.ok(drawnOdd.includes(">&quot;&gt;&lt;u&gt;x&lt;/u&gt;@example.com</a>") && drawnOdd.includes('href="mailto:&quot;&gt;&lt;u&gt;x&lt;/u&gt;@example.com"') && !drawnOdd.includes("<u>"));
});

test("8bb each person is named once: day 1 Sara and Ana, day 2 no email, day 3 only the new one; 'Send it now' shows all and marks nobody", async () => {
  const { opReminders, adminReminderNow } = await mailRun();
  const leads = [LEAD({ cart: cartOf(12), cart_at: ago(DAY) })];
  const orders = [SARA()];
  const db = fakeDb({ leads, orders });
  const mail = mailbox();
  assert.deepEqual(await opReminders(db, cron, mail, on(0)), { ok: true, sent: true });
  assert.match(textOf(mail.sent[0].htmlContent), /Sara Test.*ana@example\.com/);
  assert.deepEqual(db.note().named, { "FA-1752": on(0).toISOString(), "cart:ana@example.com": on(0).toISOString() });
  assert.deepEqual(await opReminders(db, cron, mail, on(1)), { ok: true, sent: false, reason: "nothing waiting" });
  assert.equal(mail.sent.length, 1, "day 2: no email");
  orders.push(SARA({ id: 42, client_email: "bo@example.com", ship_name: "Bo Test", created_at: on(1.9).toISOString(), notes: "Order Ref: FA-1753 · Bo Test · Paying by card" }));
  leads.push(LEAD({ id: 8, email: "cy@example.com", cart: cartOf(13), cart_at: on(1.5).toISOString() }));
  assert.deepEqual(await opReminders(db, cron, mail, on(2)), { ok: true, sent: true });
  assert.equal(mail.sent[1].subject, "Waiting for you: 1 didn't finish paying, 1 left art in their cart · Fonkiart");
  const third = textOf(mail.sent[1].htmlContent);
  assert.match(third, /Bo Test.*cy@example\.com/);
  assert.doesNotMatch(third, /Sara|ana@example\.com/, "day 3: only the new ones");
  // "Send it now": everyone who waits, and nobody is marked by it.
  const was = db.note();
  const now = await adminReminderNow(db, mail, on(2));
  assert.deepEqual([now.unfinished, now.carts, now.sent], [2, 2, true]);
  assert.match(textOf(mail.sent[2].htmlContent), /Sara Test.*Bo Test.*cy@example\.com.*ana@example\.com/);
  assert.deepEqual(db.note(), was);
  // A fresh shop where only "send it now" was used: the morning email still names them.
  const fresh = fakeDb({ leads: [LEAD({ cart: cartOf(12), cart_at: ago(DAY) })], orders: [SARA()] });
  await adminReminderNow(fresh, mailbox(), on(0));
  const morning = mailbox();
  await opReminders(fresh, cron, morning, on(0));
  assert.equal(morning.sent.length, 1);
  // Messages and orders wait every day, as before: they bring the email, without naming anyone again.
  const busy = fakeDb({ leads: [LEAD({ cart: cartOf(12), cart_at: ago(DAY) })], orders: [SARA()], requests: [{ id: 1, name: "Di", email: "di@example.com", message: "Hi", status: "new", created_at: ago(DAY) }] });
  const days = mailbox();
  for (const d of [0, 1]) await opReminders(busy, cron, days, on(d));
  assert.deepEqual(days.sent.map((m) => m.subject), ["Waiting for you: 1 message to answer, 1 didn't finish paying, 1 left art in their cart · Fonkiart", "Waiting for you: 1 message to answer · Fonkiart"]);
  assert.doesNotMatch(textOf(days.sent[1].htmlContent), /Sara|ana@example\.com|Left in the cart|Didn't finish/);
});

test("8bb who was named is remembered as long as it must be: a cart for 30 days, the note's oldest go after 45, a note that can't be read names them again, and nobody behind '…and N more' is skipped", async () => {
  const { opReminders } = await mailRun();
  const cart = (email, at) => LEAD({ id: email, email, cart: cartOf(12), cart_at: at });
  const run = async (db, when) => { const mail = mailbox(); await opReminders(db, cron, mail, when); return mail.sent.length ? textOf(mail.sent[0].htmlContent) : ""; };
  // Named 29 days ago, and the cart changed since: not again. 31 days ago: again.
  for (const [days, said] of [[29, false], [31, true]]) {
    const db = fakeDb({ leads: [cart("ana@example.com", ago(DAY))] });
    db.setNote({ named: { "cart:ana@example.com": ago(days * DAY) } });
    assert.equal(/ana@example\.com/.test(await run(db, NOW)), said, `${days} days`);
  }
  // Named checkouts never come back, and 45 days later they are gone from the note.
  const db = fakeDb({ leads: [cart("ana@example.com", ago(DAY))], orders: [SARA()] });
  db.setNote({ named: { "FA-1752": ago(6 * DAY), "FA-1700": ago(44 * DAY), "FA-1600": ago(46 * DAY), "cart:old@example.com": ago(46 * DAY), junk: "not a date" } });
  assert.doesNotMatch(await run(db, NOW), /Sara/);
  assert.deepEqual(Object.keys(db.note().named).sort(), ["FA-1700", "FA-1752", "cart:ana@example.com"]);
  // A note that can't be read, or isn't one: named again (better twice than never).
  for (const bad of ["{ not json", "[]", JSON.stringify({ named: "x" }), JSON.stringify({ named: { "FA-1752": "soon" } })]) {
    const again = fakeDb({ orders: [SARA()] });
    again.setNote(bad);
    assert.match(await run(again, NOW), /Sara/, bad);
  }
  // 17 people: the 15 shown are named; the other 2 come the next day.
  const many = fakeDb({ leads: Array.from({ length: 17 }, (_, i) => cart(`p${String(i).padStart(2, "0")}@example.com`, ago(DAY + i * 60000))) });
  const first = await run(many, on(0));
  assert.match(first, /Left in the cart \(17\).*…and 2 more in the admin/);
  const second = await run(many, on(1));
  assert.match(second, /Left in the cart \(2\).*p15@example\.com.*p16@example\.com/);
  assert.doesNotMatch(second, /p14@example\.com/);
  assert.equal(await run(many, on(2)), "");
});

test("1bb and 8bb the carts never stop the email: not read, or old ones that can't be let go, and it goes as always; before the SQL it is today's email", async () => {
  const { opReminders } = await mailRun();
  const waiting = { requests: [{ id: 1, name: "Di", email: "di@example.com", message: "Hi", status: "new", created_at: ago(DAY) }] };
  const run = async (db) => { const mail = mailbox(); const { out, said } = await logsOf(() => opReminders(db, cron, mail, NOW)); return { out, said, sent: mail.sent }; };
  const cart = () => [LEAD({ cart: cartOf(12), cart_at: ago(DAY) }), LEAD({ id: 8, email: "old@example.com", cart: cartOf(13), cart_at: ago(31 * DAY) })];
  // Control: all well, the cart is named, and the old one is let go.
  const well = fakeDb({ ...waiting, leads: cart() });
  assert.match((await run(well)).sent[0].subject, /1 message to answer, 1 left art in their cart/);
  assert.deepEqual(well.tables.Leads.map((r) => [r.email, r.cart === null]), [["ana@example.com", false], ["old@example.com", true]]);
  const notRead = await run(fakeDb({ ...waiting, leads: cart(), fails: { "Leads.select": { code: "57014", message: "x" } } }));
  assert.deepEqual([notRead.out.sent, notRead.sent[0].subject], [true, "Waiting for you: 1 message to answer · Fonkiart"]);
  const notLet = await run(fakeDb({ ...waiting, leads: cart(), fails: { "Leads.update": { code: "57014", message: "x" } } }));
  assert.equal(notLet.out.sent, true);
  assert.match(notLet.said, /old carts not let go: 57014/);
  assert.doesNotMatch(notLet.said + notRead.said, /example\.com/, "no email in a log");
  // Let go once a day, also when there is nothing to send, and never by a call that only looks.
  const quiet = fakeDb({ leads: cart().slice(1) });
  assert.equal((await run(quiet)).out.reason, "nothing waiting");
  assert.equal(quiet.tables.Leads[0].cart, null);
  // Before the SQL: no part, no word in the log, no write.
  const before = fakeDb({ ...waiting, leads: [LEAD()], sql: false });
  const old = await run(before);
  assert.deepEqual([old.sent[0].subject, old.said, before.writes], ["Waiting for you: 1 message to answer · Fonkiart", "", []]);
  assert.deepEqual(before.note().lastSent, { requests: 1, orders: 0, unfinished: 0 });
});

// ── the browser ─────────────────────────────────────────────────
// A browser of one person's: its own storage, events and copy of src/lib/cartMemory.js.
function storage({ broken = false } = {}) {
  const m = new Map();
  const no = () => { throw new Error("storage refused"); };
  return { getItem: (k) => (broken ? no() : m.has(k) ? m.get(k) : null), setItem: (k, v) => (broken ? no() : m.set(k, String(v))), removeItem: (k) => (broken ? no() : m.delete(k)), _map: m };
}
let browsers = 0;
async function browser(opts) {
  const b = { store: storage(opts), win: new EventTarget(), doc: { paying: false, querySelector: (s) => (b.doc.paying && s.includes(".checkout-page-bg") ? {} : null) } };
  b.use = () => { globalThis.localStorage = b.store; globalThis.window = b.win; globalThis.document = b.doc; return b; };
  b.use();
  b.lib = has("src/lib/cartMemory.js") ? await import(`${new URL("src/lib/cartMemory.js", root).href}?browser=${++browsers}`) : null;
  assert.ok(b.lib?.markBack && b.lib.waitingPieces, "src/lib/cartMemory.js brings a saved cart back");
  return b;
}
const SIGNED = { id: "u-ana", email: "ana@example.com", email_confirmed_at: "2026-11-20T10:00:00Z", user_metadata: { role: "buyer" } };
const COLLECTOR = { id: "u-col", email: "col@example.com", confirmed_at: "2026-11-20T10:00:00Z", user_metadata: {} };

test("3bb in the browser: 'saved' needs the words AND the pass for that same email; kept: false ends it, and only kept: true is a save", async () => {
  const b = await browser();
  const c = b.lib;
  assert.equal(c.remember("Ana@Example.com ", { told: true, pass: "pass-1" }), true);
  assert.equal(c.toldEmail(), "ana@example.com", "control: told, with its pass");
  // Its parts, each alone.
  for (const key of ["fonkiart-cart-told", "fonkiart-cart-pass"]) {
    const was = b.store.getItem(key);
    b.store.removeItem(key);
    assert.equal(c.toldEmail(), "", `without ${key}`);
    b.store.setItem(key, was);
  }
  b.store.setItem("fonkiart-cart-pass", "bo@example.com pass-1");
  assert.equal(c.toldEmail(), "", "a pass for another email");
  b.store.setItem("fonkiart-cart-pass", "ana@example.com pass-1");
  for (const junk of [{ told: true, pass: 5 }, { told: true, pass: null }, { told: true, pass: {} }]) { c.forget(); c.remember("ana@example.com", junk); assert.equal(c.toldEmail(), "", JSON.stringify(junk)); }
  // Given first while saving was off (no words, but a pass), then again with the words: this browser was first.
  c.forget();
  c.remember("ana@example.com", { told: false, pass: "pass-1" });
  assert.equal(c.toldEmail(), "");
  c.remember("ana@example.com", { told: true });
  assert.equal(c.toldEmail(), "ana@example.com");
  // Saves: the pass goes with the cart; only kept: true is a save; kept: false drops the pass and the words.
  const calls = [];
  let answer = { ok: true, kept: true };
  const ask = async (op, body, opts) => { calls.push([op, body, opts]); return answer; };
  const who = () => ({ user: null, email: "ana@example.com", saving: true });
  assert.equal(await c.saveCart(ask, [{ id: 12 }], who()), true);
  assert.deepEqual(calls, [["remember-cart", { email: "ana@example.com", pass: "pass-1", pieces: [12] }, undefined]]);
  answer = { ok: true }; // saving went off again: not a save, and not a reason to drop the pass
  assert.equal(await c.saveCart(ask, [{ id: 13 }], who()), false);
  assert.equal(c.toldEmail(), "ana@example.com");
  let heard = 0;
  const stop = c.onRemembered(() => { heard++; });
  answer = { ok: true, kept: false };
  assert.equal(await c.saveCart(ask, [{ id: 14 }], who()), false);
  assert.deepEqual([c.toldEmail(), c.rememberedEmail(), heard], ["", "ana@example.com", 1], "the site stops saying so at once; the email itself stays known");
  assert.equal(b.store.getItem("fonkiart-cart-pass"), null);
  assert.equal(await c.saveCart(ask, [{ id: 15 }], who()), false);
  assert.equal(calls.length, 3, "and nothing is sent any more");
  stop();
  // A late kept: false for an old pass doesn't take a newer one's place.
  c.remember("ana@example.com", { told: true, pass: "pass-2" });
  const late = c.saveCart(async () => { c.remember("ana@example.com", { told: true, pass: "pass-3" }); return { ok: true, kept: false }; }, [{ id: 16 }], who());
  assert.equal(await late, false);
  assert.equal(c.toldEmail(), "ana@example.com");
  assert.match(b.store.getItem("fonkiart-cart-pass"), /pass-3$/);
  // Another tab of this browser: heard when any of it changes there, and nothing else.
  let there = 0;
  const off = c.onRemembered(() => { there++; });
  const changedThere = (key) => b.win.dispatchEvent(Object.assign(new Event("storage"), { key }));
  for (const key of ["fonkiart-cart-email", "fonkiart-cart-told", "fonkiart-cart-pass", "fonkiart-cart-back", null]) {
    const was = there;
    changedThere(key);
    assert.equal(there, was + 1, String(key));
  }
  for (const key of ["fonkiart-cart", "fonkiart-cart-sent", "fonkiart-page"]) changedThere(key);
  assert.equal(there, 5);
  off();
  changedThere("fonkiart-cart-pass");
  assert.equal(there, 5, "stopped");
  // A new pass goes with a new row on the server, which has no cart yet: the same cart is sent again.
  answer = { ok: true, kept: true };
  assert.equal(await c.saveCart(ask, [{ id: 16 }], who()), true);
  assert.equal(await c.saveCart(ask, [{ id: 16 }], who()), false, "control: the same cart is not");
  c.remember("ana@example.com", { told: true, pass: "pass-4" });
  assert.equal(await c.saveCart(ask, [{ id: 16 }], who()), true);
});

test("3bb 'Not you?' empties it with its pass, then this browser forgets all of it; a browser that keeps nothing works for the visit and never crashes", async () => {
  const b = await browser();
  const c = b.lib;
  c.remember("ana@example.com", { told: true, pass: "pass-1" });
  const calls = [];
  await c.notMe(async (op, body) => { calls.push([op, body]); return { ok: true, kept: true }; });
  assert.deepEqual(calls, [["remember-cart", { email: "ana@example.com", pass: "pass-1", pieces: [] }]]);
  assert.deepEqual([...b.store._map.keys()], [], "email, words, pass and what was sent: all forgotten");
  await c.notMe(async () => { throw new Error("never asked"); });
  // It waits its turn behind a save on its way, so the empty cart lands last.
  c.remember("ana@example.com", { told: true, pass: "pass-1" });
  const order = [];
  let go;
  const slow = c.saveCart(async () => { order.push("save"); await new Promise((r) => { go = r; }); return { ok: true, kept: true }; }, [{ id: 12 }], { user: null, email: "ana@example.com", saving: true });
  await new Promise((r) => setImmediate(r));
  const not = c.notMe(async () => { order.push("empty"); return { ok: true, kept: true }; });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ["save"]);
  go();
  assert.equal(await slow, false, "forgotten meanwhile: not kept as sent");
  await not;
  assert.deepEqual(order, ["save", "empty"]);
  assert.deepEqual([...b.store._map.keys()], []);
  // Storage refused (a private window).
  const p = await browser({ broken: true });
  p.lib.remember("cy@example.com", { told: true, pass: "pass-9" });
  assert.equal(p.lib.toldEmail(), "cy@example.com");
  assert.equal(await p.lib.saveCart(async () => ({ ok: true, kept: true }), [{ id: 12 }], { user: null, email: "cy@example.com", saving: true }), true);
  assert.equal(await p.lib.saveCart(async () => { throw new Error("never asked"); }, [{ id: 12 }], { user: null, email: "cy@example.com", saving: true }), false, "unchanged");
  p.lib.markBack("u-1", [12]);
  assert.equal(p.lib.cameBack("u-1"), true);
  p.lib.forgetBack();
  assert.equal(p.lib.cameBack("u-1"), false);
  await p.lib.notMe(async () => ({ ok: true, kept: true }));
  assert.equal(p.lib.rememberedEmail(), "");
});

test("4bb and 2bb in the browser: any confirmed sign-in counts, saved only once what they left has come back; my-cart is tried three times, and never while the cart is being paid for", async () => {
  const { lib: c } = await browser();
  for (const u of [SIGNED, COLLECTOR, { ...COLLECTOR, user_metadata: { role: "collector" } }]) { assert.equal(c.isBuyer(u), true); assert.equal(c.cartOwner(u, "x@example.com"), `account:${u.id}`); }
  for (const u of [null, {}, { ...SIGNED, email_confirmed_at: null }, { ...SIGNED, id: "" }]) { assert.equal(c.isBuyer(u), false, JSON.stringify(u)); assert.equal(c.cartOwner(u, "x@example.com"), "x@example.com"); }
  const calls = [];
  const ask = async (op, body, opts) => { calls.push([op, body, opts]); return { ok: true }; };
  const who = { user: COLLECTOR, email: "", saving: true };
  assert.equal(await c.saveCart(ask, [{ id: 12 }], who), false, "not before it has come back");
  c.markBack("u-col", [12]);
  assert.equal(await c.saveCart(ask, [{ id: 12 }], who), false, "the same as the server has: nothing to send");
  assert.equal(await c.saveCart(ask, [{ id: 12 }, { id: 13 }], who), true);
  assert.deepEqual(calls, [["remember-cart", { pieces: [12, 13] }, { signedIn: true }]], "with their own sign-in: no email, no pass");
  assert.equal(await c.saveCart(ask, [], { ...who, user: SIGNED }), false, "someone else's sign-in in the same browser: theirs hasn't come back");
  // my-cart: asked with the sign-in; three tries; null when it can't be asked.
  const asked = [];
  const down = async (...a) => { asked.push(a); throw new Error("offline"); };
  const { out } = await logsOf(() => c.waitingPieces(down, { pauses: [1, 1] }));
  assert.equal(out, null);
  assert.deepEqual(asked, Array(3).fill(["my-cart", {}, { signedIn: true }]));
  let n = 0;
  assert.deepEqual(await c.waitingPieces(async () => { if (++n < 3) throw new Error("offline"); return { signedIn: true, pieces: [13, "12", 13, null, -1, 1.5] }; }, { pauses: [1, 1] }), [13, 12]);
  for (const odd of [{ pieces: [12] }, { signedIn: "yes", pieces: [12] }, { signedIn: true }, { signedIn: true, pieces: "12" }, {}, null]) assert.equal((await logsOf(() => c.waitingPieces(async () => odd, { pauses: [] }))).out, null, JSON.stringify(odd));
  // Paying: it waits, and asks again after, as some of them may be bought by then.
  let paying = true, times = 0;
  setTimeout(() => { paying = false; }, 20);
  assert.deepEqual(await c.waitingPieces(async () => ({ signedIn: true, pieces: [++times] }), { paying: () => paying, look: 5 }), [1]);
  let open = false;
  times = 0;
  const during = c.waitingPieces(async () => { if (++times === 1) { open = true; setTimeout(() => { open = false; }, 20); } return { signedIn: true, pieces: [times] }; }, { paying: () => open, look: 5 });
  assert.deepEqual(await during, [2], "opened while it asked: asked again once it closed");
  // Joining: what is in the cart stays, each piece once, only what the shop still sells.
  const A = { id: 12, price: 950 }, B = { id: 13, salePrice: 990 }, S = { id: 14, price: 700, isSold: true }, Q = { id: 15 };
  assert.deepEqual(c.stillSold([13, 14, 99, 15, 12], [A, B, S, Q]), [B, A]);
  const cart = [{ id: "12", note: "mine" }, S];
  assert.deepEqual(c.joinCart(cart, [A, B]), [...cart, B], "never twice, and nothing in it is removed, sold or not");
  assert.equal(c.joinCart(cart, [A]), cart, "nothing to add: the very same cart");
});

// A stand-in for React's hooks, enough to run the site's own hook and components under Node as React
// would: state changes drawn together, effects in order, the latest effect event. (The real React
// runs them in a real browser too, by hand.)
function miniReact() {
  let cur = null;
  const cell = (make) => { const i = cur.i++; if (!(i in cur.cells)) cur.cells[i] = make(); return cur.cells[i]; };
  const useState = (init) => {
    const me = cur;
    const s = cell(() => ({ value: typeof init === "function" ? init() : init }));
    s.set ||= (v) => { const next = typeof v === "function" ? v(s.value) : v; if (!Object.is(next, s.value)) { s.value = next; me.redraw(); } };
    return [s.value, s.set];
  };
  const effect = (fn, deps) => {
    const me = cur;
    const s = cell(() => ({ first: true }));
    if (s.first || !deps || deps.some((d, i) => !Object.is(d, s.deps[i]))) me.after.push(() => { s.off?.(); s.off = fn() || null; });
    s.first = false; s.deps = deps;
    me.offs.add(s);
  };
  const useEffectEvent = (fn) => { const s = cell(() => ({ call: (...a) => s.fn(...a) })); s.fn = fn; return s.call; };
  const useSyncExternalStore = (sub, get) => {
    const me = cur;
    const s = cell(() => ({}));
    s.value = get();
    effect(() => sub(() => { if (!Object.is(get(), s.value)) me.redraw(); }), [sub]);
    return s.value;
  };
  function mount(body) {
    const me = { cells: [], offs: new Set(), alive: true, waiting: false };
    const draw = () => { me.waiting = false; if (!me.alive) return; me.i = 0; me.after = []; cur = me; me.out = body(); cur = null; for (const run of me.after) run(); };
    me.redraw = () => { if (!me.waiting && me.alive) { me.waiting = true; queueMicrotask(draw); } };
    draw();
    return { get out() { return me.out; }, redraw: draw, close() { me.alive = false; for (const s of me.offs) s.off?.(); } };
  }
  return { useState, useEffect: effect, useEffectEvent, useSyncExternalStore, mount };
}

// The site's own files, compiled with the project's Vite; each import is a stand-in given here (one
// without a stand-in fails loudly).
globalThis.__savedCartTest = {};
let loads = 0;
async function loadSrc(file, given) {
  assert.ok(has(file), `${file} is there`);
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const id = `${file}#${++loads}`;
  globalThis.__savedCartTest[id] = given;
  const body = code.replace(/^import\s+"[^"]+\.css";?[ \t]*$/gm, "").replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__savedCartTest[${JSON.stringify(id)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  assert.doesNotMatch(body, /^\s*import[\s{"]/m, `${file}: an import was left unread`);
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${body}\n// ${id}`)}`);
}
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

// The shop as one visit in one browser sees it: the cart as App.jsx keeps it, and the hook.
async function visit(b, { shop, user = null, saving = true, artworks, startCart }) {
  b.use();
  if (startCart) b.store.setItem("fonkiart-cart", JSON.stringify(startCart));
  const state = { user, saving, artworks };
  const listeners = new Set();
  const signs = { auth: { onAuthStateChange: (fn) => { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } } };
  const asked = [];
  const storeCall = async (op, body = {}, { signedIn = false } = {}) => {
    asked.push([op, body, signedIn]);
    if (state.offline) throw Object.assign(new Error("offline"), { status: 0 });
    return copy(await shop(op, body, signedIn ? state.user?.token : undefined));
  };
  const react = miniReact();
  const { useSavedCart } = await loadSrc("src/lib/useSavedCart.js", { react, "./supabase": { supabase: signs }, "./store": { storeCall }, "./cartMemory": b.lib });
  const page = react.mount(() => {
    const [cart, setCart] = react.useState(() => JSON.parse(b.store.getItem("fonkiart-cart") || "[]"));
    react.useEffect(() => { b.store.setItem("fonkiart-cart", JSON.stringify(cart)); }, [cart]);
    useSavedCart({ cart, setCart, user: state.user, artworks: state.artworks, saving: state.saving });
    return { cart, setCart };
  });
  const v = {
    asked, state, ids: () => page.out.cart.map((i) => i.id), close: page.close,
    ops: () => asked.map(([op, body]) => (op === "remember-cart" ? `${op} ${body.pieces.join(",")}` : op)),
    add: (a) => page.out.setCart((p) => [...p, a]), take: (id) => page.out.setCart((p) => p.filter((i) => i.id !== id)),
    async sign(u) { state.user = u; for (const fn of [...listeners]) fn(u ? "SIGNED_IN" : "SIGNED_OUT", u && {}); page.redraw(); await flush(); },
    async change(more) { Object.assign(state, more); page.redraw(); await flush(); },
  };
  await flush();
  return v;
}
const shopOf = async (db) => {
  const { STORE_OPS } = await server();
  return (op, body, token) => STORE_OPS[op](db, req(copy(body), token), mailbox());
};
const ANA_IN = { ...SIGNED, token: "ana-jwt" };
const [A, B, , , C] = ART(); // Flamingo Party (12), Mangrove Light (13), Reef Song (16)

test("2bb their art is waiting: laptop saves [A]; the phone signs in and finds it, its own pieces first; a piece taken out never comes back on reload", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const wait = async (ms = 1200) => { t.mock.timers.tick(ms); await flush(); };
  const db = fakeDb();
  const shop = await shopOf(db);
  const saved = () => db.tables.Leads.find((r) => r.email === "ana@example.com")?.cart?.flatMap((p) => p.id ?? []) ?? null;
  // The laptop: the welcome gift's email, and its pass; [A] is saved with it.
  const laptop = await browser();
  const desk = await visit(laptop, { shop, artworks: ART() });
  const gift = await logsOf(() => shop("welcome", { email: "ana@example.com" }));
  laptop.lib.remember("ana@example.com", { told: true, pass: gift.out.pass });
  desk.add(A);
  await flush(); await wait();
  assert.deepEqual(saved(), [12], "control: saved with the email");
  desk.close();
  // The phone, an empty cart: A is there. Nothing is sent: it is what the server has.
  const phone = await browser();
  let v = await visit(phone, { shop, artworks: ART() });
  await v.sign(ANA_IN);
  assert.deepEqual(v.ids(), [12]);
  await wait();
  assert.deepEqual([v.ops(), saved()], [["my-cart"], [12]]);
  assert.equal(JSON.parse(phone.store.getItem("fonkiart-cart"))[0].title, "Flamingo Party", "kept in the browser too");
  // Taken out: saved so, and it doesn't come back on reload.
  v.take(12);
  await flush(); await wait();
  assert.deepEqual(saved(), []);
  v.close();
  db.tables.Leads[0].cart = cartOf(12); db.tables.Leads[0].cart_at = new Date().toISOString(); // even if the laptop saves it again meanwhile
  v = await visit(phone, { shop, artworks: ART(), user: ANA_IN });
  await wait();
  assert.deepEqual([v.ids(), v.ops()], [[], []], "reload: not asked again, nothing sent");
  // Signed out and in again: a new sign-in, so it is asked for again.
  await v.sign(null);
  await v.sign(ANA_IN);
  assert.deepEqual([v.ids(), v.ops()], [[12], ["my-cart"]], "control: once per sign-in");
  v.close();
  // Another phone with [C] in it: [C, A], and saved as that.
  const other = await browser();
  v = await visit(other, { shop, artworks: ART(), startCart: [C] });
  await v.sign(ANA_IN);
  assert.deepEqual(v.ids(), [16, 12], "its own first, never removed");
  await wait();
  assert.deepEqual(saved(), [16, 12]);
  v.close();
  // A sold meanwhile: only [C].
  db.tables.Artworks.find((a) => a.id === 12).isSold = true;
  const last = await browser();
  v = await visit(last, { shop, artworks: db.tables.Artworks.map(copy), startCart: [B] });
  await v.sign(ANA_IN);
  assert.deepEqual(v.ids(), [13, 16]);
});

test("2bb a saved cart is never lost: nothing is saved for someone signed in until it has come back, not when it can't be asked, not while paying, not from a second tab", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const wait = async (ms = 1200) => { t.mock.timers.tick(ms); await flush(); };
  const rows = () => [LEAD({ cart: cartOf(12), cart_at: new Date().toISOString() })];
  const ids = (db) => db.tables.Leads[0].cart?.map((p) => p.id) ?? null;
  // Offline: three tries, then this visit saves nothing and the saved cart is untouched.
  let db = fakeDb({ leads: rows() });
  let v = await visit(await browser(), { shop: await shopOf(db), artworks: ART(), startCart: [B] });
  v.state.offline = true;
  await logsOf(async () => { await v.sign(ANA_IN); for (let i = 0; i < 12; i++) await wait(1000); v.take(13); await flush(); await wait(); });
  assert.deepEqual([v.ops(), v.ids(), ids(db)], [["my-cart", "my-cart", "my-cart"], [], [12]]);
  v.close();
  // Its sign-in doesn't get to the server (expired, Supabase out of its reach): the same, never "nothing saved".
  v = await visit(await browser(), { shop: await shopOf(db), artworks: ART(), startCart: [B] });
  await logsOf(async () => { await v.sign(SIGNED); for (let i = 0; i < 12; i++) await wait(1000); v.take(13); await flush(); await wait(); });
  assert.deepEqual([v.ops(), v.ids(), ids(db)], [["my-cart", "my-cart", "my-cart"], [], [12]]);
  v.close();
  // The artworks list hasn't loaded, or saving is off: nothing is asked and nothing is saved.
  for (const off of [{ artworks: [] }, { saving: false }]) {
    v = await visit(await browser(), { shop: await shopOf(db), artworks: ART(), startCart: [B], user: ANA_IN, ...off });
    await wait();
    assert.deepEqual([v.ops(), ids(db)], [[], [12]], JSON.stringify(off));
    await v.change({ artworks: ART(), saving: true }); // control: once it has, it is asked
    assert.deepEqual([v.ops(), v.ids()], [["my-cart"], [13, 12]]);
    v.close();
  }
  // The checkout is open: the cart being paid for doesn't change under them, and what they bought in it isn't put back.
  assert.match(read("src/components/CheckoutModal.jsx"), /"checkout-page-bg"/, "the checkout is still known by this class");
  db = fakeDb({ leads: rows() });
  const b = await browser();
  b.doc.paying = true;
  v = await visit(b, { shop: await shopOf(db), artworks: ART(), startCart: [A], user: ANA_IN });
  await wait(); await wait();
  assert.deepEqual([v.ids(), v.ops(), ids(db)], [[12], [], [12]]);
  db.tables.Orders.push({ id: 1, client_email: "ana@example.com", item_title: "Flamingo Party", status: "pending", notes: "Order Ref: FA-1900 · Ana · Paying by Zelle", created_at: new Date(Date.now() + 1000).toISOString() });
  v.take(12);
  await flush(); await wait();
  b.doc.paying = false;
  await wait(3000); await wait();
  assert.deepEqual([v.ids(), v.ops()], [[], ["my-cart"]], "asked once it closed; what they bought isn't put back");
  v.close();
  // Two tabs, signed in from one. The second, still on its own cart, adds a piece (which the site keeps
  // over the first one's): it asks for itself before it saves anything, so the first one's is never lost.
  db = fakeDb({ leads: rows() });
  const shop = await shopOf(db);
  const two = await browser();
  const first = await visit(two, { shop, artworks: ART(), startCart: [B] });
  const second = await visit(two, { shop, artworks: [] });
  await first.sign(ANA_IN); await second.sign(ANA_IN);
  assert.deepEqual([first.ids(), second.ids()], [[13, 12], [13]]);
  await wait();
  assert.deepEqual(ids(db), [13, 12]);
  second.add(C);
  await flush(); await wait();
  assert.deepEqual([second.ops(), ids(db)], [[], [13, 12]], "the second tab saves nothing yet");
  await second.change({ artworks: ART() });
  await wait();
  assert.deepEqual([second.ids(), second.ops(), ids(db)], [[13, 16, 12], ["my-cart", "remember-cart 13,16,12"], [13, 16, 12]]);
  first.close(); second.close();
  // A tab opened after it came back is not asked again: the cart it opened with has it.
  const third = await visit(two, { shop, artworks: ART(), user: ANA_IN });
  await wait();
  assert.deepEqual([third.ids(), third.ops(), ids(db)], [[13, 16, 12], [], [13, 16, 12]]);
  third.close();
  // Someone else signs in after them in the same browser: asked for themselves, never saved as the first one.
  const next = await visit(two, { shop, artworks: ART() });
  await next.sign({ ...COLLECTOR, token: "col-jwt" });
  assert.deepEqual(next.ops(), ["my-cart"]);
  next.close();
  // A piece added in the first tab and not saved yet, when the second one asks: it is in the second one's cart too.
  db = fakeDb({ leads: rows() });
  const tabs = await browser();
  const early = await visit(tabs, { shop: await shopOf(db), artworks: ART() });
  const slow = await visit(tabs, { shop: await shopOf(db), artworks: [] });
  await early.sign(ANA_IN); await slow.sign(ANA_IN);
  await wait();
  early.add(C);
  await flush();
  assert.deepEqual(ids(db), [12], "control: not saved yet");
  await slow.change({ artworks: ART() });
  assert.deepEqual(slow.ids(), [12, 16]);
  early.close(); slow.close();
  // The second tab can't ask: it saves nothing over what the first one has, signed in as they both are.
  db = fakeDb({ leads: rows() });
  const pair = await browser();
  const asks = await visit(pair, { shop: await shopOf(db), artworks: ART() });
  const cant = await visit(pair, { shop: await shopOf(db), artworks: ART(), startCart: [B] });
  cant.state.offline = true;
  await asks.sign(ANA_IN);
  await logsOf(async () => { await cant.sign(ANA_IN); for (let i = 0; i < 12; i++) await wait(1000); });
  cant.state.offline = false;
  cant.add(C);
  await flush(); await wait();
  assert.deepEqual([cant.ops(), ids(db)], [["my-cart", "my-cart", "my-cart"], [12]]);
  asks.close(); cant.close();
  // Opened with it here already; signed out, then in again from another tab, which gets it first: this tab asks for itself.
  db = fakeDb({ leads: rows() });
  const again = await browser();
  const opener = await visit(again, { shop: await shopOf(db), artworks: ART() });
  await opener.sign(ANA_IN); await wait();
  opener.close();
  const here = await visit(again, { shop: await shopOf(db), artworks: ART(), user: ANA_IN });
  const there = await visit(again, { shop: await shopOf(db), artworks: ART(), user: ANA_IN });
  await here.sign(null); await there.sign(null);
  db.tables.Leads[0].cart = cartOf(12, 13); // left on another device meanwhile
  await there.sign(ANA_IN);
  await here.sign(ANA_IN);
  assert.deepEqual([there.ops(), here.ops(), here.ids()], [["my-cart"], ["my-cart"], [12, 13]]);
});

// ── what the site says ──────────────────────────────────────────
const drawn = async (C2, props) => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(C2, props));
  return { html, words: html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,!?])/g, "$1").trim() };
};
const given = async (memory) => {
  const React = await import("react");
  const runtime = await import("react/jsx-runtime");
  const lib = { remember: () => true, toldEmail: () => "", onRemembered: () => () => {}, notMe: async () => {}, isBuyer: (u) => !!u?.id && !!(u.email_confirmed_at || u.confirmed_at), cameBack: () => false, ...memory };
  return { react: React, "react/jsx-runtime": runtime, "../lib/store": { storeCall: async () => ({}) }, "./Pic": { default: () => null }, "../lib/cartMemory": lib, "../lib/couponSize": { ownSizes: () => [], sizesWords: () => "" } };
};

test("6bb the Cart page: someone signed in is told their pieces are saved with their account, once they are; no 'Not you?'; a typed email only while truly saved", async () => {
  const line = async (memory, props) => (await drawn((await loadSrc("src/components/CartRemembered.jsx", await given(memory))).default, { count: 2, user: null, saving: true, ...props })).words;
  const back = { cameBack: (id) => id === "u-ana" || id === "u-col" };
  for (const user of [SIGNED, COLLECTOR]) assert.equal(await line(back, { user }), "Your pieces are saved with your account.");
  assert.equal(await line({ ...back, toldEmail: () => "bo@example.com" }, { user: SIGNED }), "Your pieces are saved with your account.", "their account, whatever was typed here before");
  for (const [why, memory, props] of [
    ["saving off", back, { user: SIGNED, saving: false }], ["an empty cart", back, { user: SIGNED, count: 0 }],
    ["what they left hasn't come back, so it isn't saved yet", {}, { user: SIGNED }],
    ["an email never confirmed", back, { user: { ...SIGNED, email_confirmed_at: null } }],
    ["nobody", back, {}],
  ]) assert.equal(await line(memory, props), "", why);
  assert.equal(await line({ toldEmail: () => "ana@example.com" }, {}), "Your pieces are saved for ana@example.com. Not you?", "a typed email, as before");
});

test("3bb the words for an email on the list already: 'Sign in and your cart is saved too.' and a button, in the box and the welcome window, only while saving is on; signed in, or truly saved, not", async () => {
  const base = await given({});
  const signIn = await loadSrc("src/components/SignInLine.jsx", base);
  const box = await loadSrc("src/components/CartEmailBox.jsx", { ...base, "./SignInLine": signIn });
  const RETURNING = { code: "FK-TEST-0001", returning: true, used: false, email: "ana@example.com", kept: false };
  const sent = async (props) => (await drawn(box.BoxSent, { done: RETURNING, saving: true, onSignIn() {}, onClose() {}, ...props })).words;
  assert.equal(await sent({}), "Your welcome code is still waiting for you: FK-TEST-0001 Copy Sign in and your cart is saved too. Sign in Keep shopping");
  assert.equal(await sent({ saving: false }), "Your welcome code is still waiting for you: FK-TEST-0001 Copy Keep shopping", "off: today's words");
  assert.equal(await sent({ onSignIn: undefined }), "Your welcome code is still waiting for you: FK-TEST-0001 Copy Keep shopping", "signed in already");
  assert.equal(await sent({ done: { ...RETURNING, kept: true } }), "Your welcome code is still waiting for you: FK-TEST-0001 Copy Your pieces are saved with your email. Keep shopping", "this browser's own email, with its pass");
  // What the button does: the box closes, then the sign-in window opens with that email.
  const did = [];
  const tree = box.BoxSent.toString(); // (its own source: the two in that order)
  assert.match(tree, /onClose\(\);\s*onSignIn\(v\);/);
  const React = await import("react");
  const el = signIn.default({ email: " Ana@Example.com ", onSignIn: (v) => did.push(v) });
  React.Children.toArray(el.props.children).find((x) => x.type === "button").props.onClick();
  assert.deepEqual(did, ["ana@example.com"]);
  assert.equal(signIn.default({ email: "ana@example.com" }), null, "nothing to open");
  const own = await loadSrc("src/components/SignInLine.jsx", await given({ toldEmail: () => "ana@example.com" }));
  assert.equal(own.default({ email: "Ana@example.com", onSignIn() {} }), null, "truly saved with it: no need");

  // The box and the welcome window, really filled in and sent (the hooks' stand-in): the pass is kept beside the email.
  const react = miniReact();
  const all = (node, pick, out = []) => { for (const n of [].concat(node ?? [])) if (Array.isArray(n)) all(n, pick, out); else if (n?.props) { if (pick(n)) out.push(n); all(n.props.children, pick, out); } return out; };
  const gave = [];
  const lib = { ...base["../lib/cartMemory"], remember: (...a) => { gave.push(a); return true; }, toldEmail: () => (gave.at(-1)?.[1].pass ? gave.at(-1)[0] : "") };
  for (const [answer, kept, saving] of [[{ code: "FK-1", returning: false, pass: "pass-1" }, true, true], [{ code: "FK-1", returning: true, used: false }, false, true], [{ code: "FK-1", returning: true, used: false }, false, false]]) {
    const files = { ...base, react: { ...react, useRef: () => ({ current: null }) }, "../lib/store": { storeCall: async () => answer }, "../lib/cartMemory": lib };
    globalThis.window = new EventTarget();
    const { default: Box } = await loadSrc("src/components/CartEmailBox.jsx", { ...files, "./SignInLine": signIn });
    const open = react.mount(() => Box({ cart: [], percent: 15, saving, onSignIn() {}, onClose() {} }));
    all(open.out, (n) => n.type === "input")[0].props.onChange({ target: { value: " Ana@Example.com" } });
    await flush();
    await all(open.out, (n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} });
    await flush();
    const done = all(open.out, (n) => n.props.done)[0].props.done;
    assert.deepEqual([done.email, done.kept], ["ana@example.com", kept]);
    assert.deepEqual(gave.at(-1), ["ana@example.com", { told: saving, pass: answer.pass }]);
    const { default: Welcome } = await loadSrc("src/components/WelcomeModal.jsx", { ...files, "./SignInLine": signIn });
    let closed = 0; const went = [];
    const gift = react.mount(() => Welcome({ onClose: () => { closed++; }, discount: 15, artworks: [], saving, onSignIn: (v) => went.push([v, closed]) }));
    all(gift.out, (n) => n.type === "input")[0].props.onChange({ target: { value: "Ana@Example.com" } });
    await flush();
    await all(gift.out, (n) => n.type === "button" && /Get My Coupon/.test(String(n.props.children)))[0].props.onClick();
    await flush();
    const lines = all(gift.out, (n) => n.type === signIn.default);
    assert.equal(lines.length, saving ? 1 : 0, "off: no line at all");
    if (lines.length) { lines[0].props.onSignIn("ana@example.com"); assert.deepEqual(went, [["ana@example.com", 1]], "the window closes first"); }
  }
  // App.jsx hands both the way to the sign-in window, none for someone signed in.
  const app = read("src/App.jsx");
  assert.match(app, /const signInAs = \(email\) => \{ setLoginNotice\(\{ email, text: "" \}\); setLoginModal\(true\); \};/);
  for (const part of ["WelcomeModal", "CartMemory"]) assert.match(app, new RegExp(`<${part} [^\\n]*onSignIn=\\{user \\? undefined : signInAs\\} />`), part);
  assert.match(app, /useEffect\(\(\) => \{ localStorage\.setItem\("fonkiart-cart", JSON\.stringify\(cart\)\); \}, \[cart\]\);\n[^\n]*\n\s*useSavedCart\(\{ cart, setCart, user, artworks, saving: cartSaving \}\);/, "the cart is kept in the browser first");
});

// ── 7bb: Admin -> Leads -> "+ Create Coupon" ────────────────────
test("7bb '+ Create Coupon': an email on the list with no code gets one on its own row; one with a code is told which; a list that can't be read says so", async () => {
  const { runAdmin, rows, sent, made } = await (async () => {
    const { recordQuery } = await import(new URL("src/lib/adminQuery.js", root).href);
    const { validateChain } = await import(new URL("api/_lib/adminOps.js", root).href);
    const { couponGift, unsubscribedLeads } = await import(new URL("api/_lib/leadsCoupon.js", root).href);
    const react = miniReact();
    const runtime = await import("react/jsx-runtime");
    const all = (node, pick, out = []) => { for (const n of [].concat(node ?? [])) if (Array.isArray(n)) all(n, pick, out); else if (n?.props) { if (pick(n)) out.push(n); all(n.props.children, pick, out); } return out; };
    const sent = [], made = [];
    const rows = (leads, fails) => fakeDb({ leads, fails });
    // Create a coupon for this email, as Andy would, and what the screen then says.
    const runAdmin = async (db, email, { mail = true } = {}) => {
      // The server's own checks and replay (api/_lib/adminOps.js), on the stand-in.
      const adminDb = { from: (table) => recordQuery(table, async ({ table: name, chain }) => { validateChain(name, chain); let q = db.from(name); for (const { m, a } of chain) q = q[m](...a); return q; }) };
      // The email itself: the server builds it from that person's own row (api/_lib/leadsCoupon.js).
      const adminAction = async (kind, body) => (kind === "coupon-gift" ? couponGift(db, body, { send: async (m) => { sent.push(m); } }) : kind === "unsubscribed" ? unsubscribedLeads(db, body) : assert.fail(kind));
      const { default: Leads } = await loadSrc("src/admin/LeadsTab.jsx", {
        react, "react/jsx-runtime": runtime, "../lib/adminDb": { adminDb, adminAction }, "../lib/couponSize": { ownSizes: () => [], sizesWords: () => "" },
        "../utils/helpers": { generateCouponCode: () => { made.push(`FK-MADE-${String(made.length).padStart(4, "0")}`); return made.at(-1); } },
      });
      const tab = react.mount(() => Leads({ discount: 15 }));
      const press = async (pick) => { await all(tab.out, (n) => n.type === "button" && pick(String(n.props.children)))[0].props.onClick(); await flush(); };
      await flush();
      await press((s) => s === "+ Create Coupon");
      all(tab.out, (n) => n.props.type === "email")[0].props.onChange({ target: { value: email } });
      if (!mail) all(tab.out, (n) => n.props.type === "checkbox")[0].props.onChange({ target: { checked: false } });
      await flush();
      const says = [];
      const watch = () => { const m = all(tab.out, (n) => /^(ok-msg|warn-msg|lead-said)$/.test(n.props.className))[0]; if (m && says.at(-1) !== m.props.children) says.push(m.props.children); };
      const done = press((s) => s === "Generate & Save");
      for (let i = 0; i < 8; i++) { await new Promise((r) => setImmediate(r)); watch(); }
      await done; watch();
      const open = all(tab.out, (n) => n.props.className === "crm-add-form").length;
      tab.close();
      return { says, open };
    };
    return { runAdmin, rows, sent, made };
  })();
  // On the list with no code (a cart saved while signed in makes such a row): it gets one, on its own row, and the email.
  let db = rows([LEAD({ id: 1, email: "else@example.com" }), LEAD({ coupon_code: null, source: "buyer-cart", cart: cartOf(12), cart_at: ago(DAY) })]);
  let { open, says } = await runAdmin(db, " Ana@Example.com ");
  assert.equal(made.length, 1);
  assert.deepEqual(db.tables.Leads.map((r) => [r.email, r.coupon_code, r.coupon_used, r.source]), [["else@example.com", "FK-AAAA-BBBB", false, "welcome-popup"], ["ana@example.com", made[0], false, "buyer-cart"]], "no second row, and the rest of it as it was");
  assert.deepEqual(db.tables.Leads[1].cart, cartOf(12));
  assert.deepEqual(sent.map((m) => [m.to, m.subject]), [["ana@example.com", "Your Exclusive Coupon — Fonkiart"]]);
  assert.match(sent[0].htmlContent, new RegExp(`${made[0]}<[\\s\\S]*15% off your purchase[\\s\\S]*\\?unsubscribe=`));
  assert.equal(open, 0, "made: the form closes, as it does for someone new");
  assert.equal(says.at(-1), `Coupon ${made[0]} created and emailed to ana@example.com.`, "and the page still says what it did");
  // The box not ticked: no email.
  ({ says } = await runAdmin(rows([LEAD({ coupon_code: null })]), "ana@example.com", { mail: false }));
  assert.deepEqual([sent.length, says.at(-1)], [1, `Coupon ${made.at(-1)} created.`]);
  // Two rows for one email, neither with a code: one of them gets it. A new code is never "used" yet.
  db = rows([LEAD({ id: 1, coupon_code: null, coupon_used: true }), LEAD({ id: 2, coupon_code: null })]);
  await runAdmin(db, "ana@example.com", { mail: false });
  assert.deepEqual(db.tables.Leads.map((r) => [r.id, r.coupon_code, r.coupon_used]), [[1, made.at(-1), false], [2, null, false]]);
  // With a code: today's message, nothing made, nothing sent, nothing written.
  db = rows([LEAD()]);
  const told = await runAdmin(db, "ana@example.com");
  assert.deepEqual([told.says.at(-1), told.open, db.writes, made.length, sent.length], ["This email already has coupon FK-AAAA-BBBB.", 1, [], 3, 1]);
  // Two rows for one email, one with a code: that one is named, never a third row.
  db = rows([LEAD({ id: 1, coupon_code: null }), LEAD({ id: 2, coupon_code: "FK-2222-2222" })]);
  assert.equal((await runAdmin(db, "ana@example.com")).says.at(-1), "This email already has coupon FK-2222-2222.");
  assert.deepEqual(db.writes, []);
  // Someone new: a new row, as before (control).
  db = rows([LEAD()]);
  await runAdmin(db, "new@example.com");
  assert.deepEqual(db.writes.map((w) => [w.op, w.payload]), [["insert", [{ email: "new@example.com", source: "manual", coupon_code: made.at(-1), coupon_used: false }]]]);
  // The list can't be read: it says so, and makes nothing (it made a second row before).
  db = rows([LEAD()], { "Leads.select": { message: "The list can't be read" } });
  assert.equal((await runAdmin(db, "ana@example.com")).says.at(-1), "The list can't be read");
  assert.deepEqual(db.writes, []);
  // The whole line of code: no new browser pop-up.
  const src = read("src/admin/LeadsTab.jsx");
  const create = src.slice(src.indexOf("const createCoupon"), src.indexOf("const unusedCount"));
  assert.ok(create.length > 200);
  assert.doesNotMatch(create, /confirm\(|alert\(|prompt\(/);
});

test("no new column and no SQL: what is saved is only the two columns Andy's SQL adds, and the site says 'saved' only where it is checked", () => {
  for (const f of ["api/_lib/cartPass.js", "src/lib/useSavedCart.js", "src/components/SignInLine.jsx"]) {
    assert.ok(has(f), `${f} is there`);
    assert.doesNotMatch(read(f), /alter table|\.rpc\(|create table/i, f);
  }
  const server8 = read("api/_lib/cartMemory.js");
  const written = [...server8.matchAll(/\.(?:update|insert)\(\[?\{([^}]*)\}/g)].map((m) => m[1].split(",").map((s) => s.trim().split(/[:\s]/)[0]).sort().join(" "));
  assert.deepEqual(written.sort(), ["cart cart_at", "cart cart_at", "cart cart_at coupon_code coupon_used email source"]);
  // Nothing about a person, and no pass, in any log line.
  for (const f of ["api/_lib/cartMemory.js", "api/_lib/cartPass.js", "api/_lib/reminders.js", "src/lib/cartMemory.js", "src/lib/useSavedCart.js"]) {
    for (const m of read(f).matchAll(/console\.\w+\(([^\n]*)/g)) assert.doesNotMatch(m[1], /\bemail\b|\bpass\b|\blead\b|\bname\b(?!s)/, `${f}: ${m[0]}`);
  }
  assert.match("console.warn(email)".replace("console.warn", ""), /\bemail\b/, "control: the log check sees one");
});
