// Knowing who a cart belongs to (Andy, 2026-11-22: "the one limit is skipped if we ask the customer
// to login after X amount of time for a fabulous discount then we know who the person is", and "if
// someone enters their email they should get a verify your email .. email , and inmediately that
// session is logged in and if they add something to cart now we know !!").
// - The cart of someone who gave their email (the welcome gift, the 5-minute box) or is signed in
//   as a buyer is saved with that email on their Leads row (db/2026-11-22-cart-email.sql). Nothing
//   is kept for anyone anonymous, nothing is saved until the SQL has run, and nothing about an
//   email ever comes back: the answer is { ok: true } and nothing else.
// - The welcome email carries "Verify my email": Supabase's own sign-in link, made on the server.
//   Tapping it signs them in as a BUYER, never a collector; a collector's sign-in gets no link.
// - The 5-minute box: its % and its 5 minutes each in one place, once a visit, never during
//   checkout, never a native dialog, nothing under 16px, no cream, no green, the art never cut.
// - Cart saving is on only once that SQL has run (the store action "cart-saving": one yes or no
//   for the whole site). While it is off nothing is sent and nothing on the site says a cart is
//   saved, and a cart is only ever saved with an email that was told so when it was given.
// Fakes only: no real Supabase, no real email. Every test fails on the shop before (3d36fc7),
// where none of these files exist and the welcome email has no button, and the on/off ones fail
// on e3f3e1d, which had no switch; each check below has a control that shows it can fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const has = (p) => existsSync(new URL(p, root));
// Loaded when each test runs, so the shop before this change fails each test by name, not the file.
const load = (p) => (has(p) ? import(new URL(p, root).href) : Promise.resolve(null));

// The browser's storage and events, for the browser-side libraries run here under Node.
function storage({ broken = false } = {}) {
  const m = new Map();
  const no = () => { throw new Error("storage refused"); };
  return {
    getItem: (k) => (broken ? no() : m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (broken ? no() : m.set(k, String(v))),
    removeItem: (k) => (broken ? no() : m.delete(k)),
    _map: m,
  };
}
globalThis.window = new EventTarget();
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();

// A stand-in for supabase-js with the service key: enough to run the real store code and see what
// it reads, writes and asks Supabase's sign-in service for.
function fakeDb({ leads = [], artworks = [], settings = { couponDiscount: 15 }, users = [], tokenUser = null,
  link = "https://proj.supabase.co/auth/v1/verify?token=tok-123&type=magiclink&redirect_to=https%3A%2F%2Ffonkiart.com",
  linkError = null, linkUser, readError = null, cartColumns = false } = {}) {
  // cartColumns: whether the SQL has run, for an EMPTY list (a row shows it by its own keys).
  // Asked for by name before it has run, the columns are refused the way PostgREST refuses them.
  const writes = [];
  const asked = { generateLink: [], updateUserById: 0, deleteUser: 0, listUsers: 0 };
  const tables = { Leads: leads, Artworks: artworks, Settings: [{ id: 1, ...settings }] };
  function from(table) {
    let op = "select", payload = null, lim = null, one = false, cols = "*";
    const filters = [];
    const b = {
      select(c = "*") { cols = c; return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { filters.push((r) => r[k] === v); return b; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return b; },
      not(k) { filters.push((r) => r[k] != null); return b; }, // .not(k, "is", null)
      order() { return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { one = true; return b; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    function run() {
      if (readError && op === "select" && table === "Leads") return { data: null, error: readError };
      if (op === "select" && table === "Leads" && cols !== "*" && /\bcart/.test(cols) && !cartColumns) {
        return { data: null, error: { code: "42703", message: "column Leads.cart does not exist" } };
      }
      const rows = tables[table] || [];
      if (op === "insert") { writes.push({ table, op, payload }); payload.forEach((r) => rows.push({ id: rows.length + 100, ...r })); return { error: null }; }
      if (op === "update") { writes.push({ table, op, payload }); rows.filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, payload)); return { error: null }; }
      let out = rows.filter((r) => filters.every((f) => f(r)))
        .map((r) => (cols === "*" ? { ...r } : Object.fromEntries(cols.split(",").map((c) => [c, r[c]]))));
      if (lim != null) out = out.slice(0, lim);
      return one ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    return b;
  }
  const auth = {
    getUser: async (t) => (tokenUser && t === "good-jwt" ? { data: { user: tokenUser }, error: null } : { data: {}, error: { message: "bad jwt" } }),
    admin: {
      listUsers: async ({ page = 1, perPage = 50 } = {}) => { asked.listUsers++; return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null }; },
      generateLink: async (args) => {
        asked.generateLink.push(args);
        if (linkError) return { data: null, error: linkError };
        const user = linkUser !== undefined ? linkUser : (users.find((u) => u.email === args.email) || { email: args.email, user_metadata: { ...args.options?.data } });
        return { data: { properties: { action_link: link }, user }, error: null };
      },
      updateUserById: async () => { asked.updateUserById++; return { data: null, error: null }; },
      deleteUser: async () => { asked.deleteUser++; return { data: null, error: null }; },
    },
  };
  return { from, auth, writes, asked, tables };
}
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };
const req = (body, token) => ({ body, headers: token ? { authorization: `Bearer ${token}` } : {} });
// What the code logs while fn runs: the link signs someone in, so it must never be there.
async function logsOf(fn) {
  const said = [];
  const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => said.push(a.map(String).join(" "));
  try { return { out: await fn(), said }; } finally { Object.assign(console, keep); }
}

const LEAD = (extra = {}) => ({ id: 7, email: "ana@example.com", source: "welcome-popup", coupon_code: "FK-AAAA-BBBB", coupon_used: false, ...extra });
const ART = [
  { id: 12, title: "Flamingo Party", price: 950, salePrice: null, image: "https://img.example/flamingo.jpg" },
  { id: 13, title: "Mangrove Light", price: 1200, salePrice: 990, image: "https://img.example/mangrove.jpg" },
];
const BUYER = { id: "u-1", email: "Ana@Example.com", email_confirmed_at: "2026-11-22T10:00:00Z", user_metadata: { role: "buyer" } };

// ── the SQL ─────────────────────────────────────────────────
test("the SQL: two nullable columns on Leads, safe to run twice, never run by the code", () => {
  const p = "db/2026-11-22-cart-email.sql";
  assert.ok(has(p), `${p} is there`);
  const sql = read(p);
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.match(code, /^alter table public\."Leads" add column if not exists cart jsonb;\s*alter table public\."Leads" add column if not exists cart_at timestamptz;$/);
  assert.doesNotMatch(code, /not null|default|drop|delete|update|insert/i, "nullable, nothing removed or filled in");
  assert.match(sql, /^-- /m, "it says what it is for");
  // Nothing in the code runs it: no SQL is sent from the site.
  for (const f of ["api/_lib/cartMemory.js", "api/_lib/verifyLink.js", "src/lib/cartMemory.js"]) assert.doesNotMatch(read(f), /alter table|\.rpc\(/i, f);
});

// ── remember-cart ───────────────────────────────────────────
test("remember-cart: an email on the list gets its cart, named as the shop names its pieces, and the answer is only { ok: true }", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const db = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })], artworks: ART });
  const out = await m.opRememberCart(db, req({ email: " Ana@Example.com ", pieces: [13, 12, 13, 99] }), new Date("2026-11-22T12:00:00Z"));
  assert.deepEqual(out, { ok: true });
  assert.equal(db.writes.length, 1);
  assert.deepEqual(db.writes[0].payload, {
    cart: [
      { id: 13, title: "Mangrove Light", price: 990, image: "https://img.example/mangrove.jpg" },
      { id: 12, title: "Flamingo Party", price: 950, image: "https://img.example/flamingo.jpg" },
    ],
    cart_at: "2026-11-22T12:00:00.000Z",
  }, "each piece once, an unknown piece dropped, the sale price the shop shows");
  // An empty cart (bought, or taken out) clears it, so nobody is followed up about it.
  await m.opRememberCart(db, req({ email: "ana@example.com", pieces: [] }));
  assert.deepEqual(db.writes[1].payload.cart, null);
});

test("remember-cart: before the SQL has run, nothing is saved and nothing breaks", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const db = fakeDb({ leads: [LEAD()], artworks: ART }); // a Leads row with no cart columns yet
  assert.deepEqual(await m.opRememberCart(db, req({ email: "ana@example.com", pieces: [12] })), { ok: true });
  const signed = fakeDb({ leads: [LEAD({ email: "other@example.com" })], artworks: ART, tokenUser: BUYER });
  assert.deepEqual(await m.opRememberCart(signed, req({ pieces: [12] }, "good-jwt")), { ok: true });
  assert.deepEqual([...db.writes, ...signed.writes], [], "no write at all");
  // Control: the same calls once the columns are there do write.
  const after = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })], artworks: ART });
  await m.opRememberCart(after, req({ email: "ana@example.com", pieces: [12] }));
  assert.equal(after.writes.length, 1);
});

test("remember-cart: nothing for anyone anonymous, nor for an email that never gave itself, and the same answer either way", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const db = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })], artworks: ART });
  const answers = [
    await m.opRememberCart(db, req({ pieces: [12] })),                                  // nobody
    await m.opRememberCart(db, req({ email: "stranger@example.com", pieces: [12] })),   // not on the list
    await m.opRememberCart(db, req({ email: "ana@example.com", pieces: [12] })),         // on the list
  ];
  assert.deepEqual(answers, [{ ok: true }, { ok: true }, { ok: true }], "it can't tell anyone who is on the list");
  assert.equal(db.writes.length, 1, "only the email on the list");
  assert.equal(db.writes[0].op, "update", "an email typed here never makes a Leads row");
});

test("remember-cart: a signed-in, confirmed buyer's cart goes with their own account; a collector's or an unconfirmed sign-in counts for nothing", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const probe = LEAD({ email: "someone@example.com", cart: null, cart_at: null });
  const db = fakeDb({ leads: [probe], artworks: ART, tokenUser: BUYER });
  assert.deepEqual(await m.opRememberCart(db, req({ pieces: [12] }, "good-jwt")), { ok: true });
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].op, "insert");
  assert.equal(db.writes[0].payload[0].email, "ana@example.com");
  assert.equal(db.writes[0].payload[0].source, "buyer-cart");
  assert.equal(db.writes[0].payload[0].coupon_code, null, "no new coupon");
  // The account wins over an email typed in the body.
  const own = fakeDb({ leads: [LEAD({ cart: null, cart_at: null }), LEAD({ id: 8, email: "victim@example.com", cart: null, cart_at: null })], artworks: ART, tokenUser: BUYER });
  await m.opRememberCart(own, req({ email: "victim@example.com", pieces: [12] }, "good-jwt"));
  assert.deepEqual(own.tables.Leads.map((r) => [r.email, r.cart?.length ?? 0]), [["ana@example.com", 1], ["victim@example.com", 0]]);
  for (const user of [
    { ...BUYER, user_metadata: { role: "collector" } },
    { ...BUYER, user_metadata: {} },
    { ...BUYER, email_confirmed_at: null, confirmed_at: null },
  ]) {
    const d = fakeDb({ leads: [probe], artworks: ART, tokenUser: user });
    await m.opRememberCart(d, req({ pieces: [12] }, "good-jwt"));
    assert.deepEqual(d.writes, [], JSON.stringify(user.user_metadata) + " " + user.email_confirmed_at);
  }
});

test("remember-cart: refuses what isn't a cart (ids only, whole numbers, at most 30) or an email", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const db = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })], artworks: ART });
  for (const pieces of [undefined, "12", [{ id: 12, title: "Free", price: 0 }], [1.5], [-1], [0], Array.from({ length: 31 }, (_, i) => i + 1)]) {
    await assert.rejects(m.opRememberCart(db, req({ email: "ana@example.com", pieces })), (e) => e.status === 400, JSON.stringify(pieces));
  }
  await assert.rejects(m.opRememberCart(db, req({ email: "not an email", pieces: [12] })), (e) => e.status === 400);
  assert.deepEqual(db.writes, []);
});

test("remember-cart is a store action, and cartsLeft gives (email, pieces, when), newest first; [] when it can't be read", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const store = await import(new URL("api/_lib/storeOps.js", root).href);
  assert.equal(typeof store.STORE_OPS["remember-cart"], "function");
  const db = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })], artworks: ART });
  assert.deepEqual(await store.STORE_OPS["remember-cart"](db, req({ email: "ana@example.com", pieces: [12] })), { ok: true });
  assert.equal(db.writes.length, 1);
  const rows = [
    LEAD({ cart: [{ id: 12, title: "Flamingo Party", price: 950, image: null }], cart_at: "2026-11-22T12:00:00.000Z" }),
    LEAD({ id: 9, email: "bo@example.com", cart: [], cart_at: "2026-11-22T11:00:00.000Z" }),
  ];
  assert.deepEqual(await m.cartsLeft(fakeDb({ leads: rows })), [
    { email: "ana@example.com", pieces: [{ id: 12, title: "Flamingo Party", price: 950, image: null }], at: "2026-11-22T12:00:00.000Z" },
  ]);
  const { out, said } = await logsOf(() => m.cartsLeft(fakeDb({ readError: { code: "42703", message: 'column "cart" does not exist' } })));
  assert.deepEqual(out, []);
  assert.match(said.join("\n"), /cartsLeft: not read \(42703\)/);
});

// ── cart saving: on or off ──────────────────────────────────
// Until db/2026-11-22-cart-email.sql has run nothing is saved, so nothing may SAY it is (the
// coordinator, 11-22: "the site would tell buyers something untrue"). One yes or no for the whole
// site, never per email, so it still tells nobody who is on the list.
test("cart-saving: one yes or no for the whole site: no until the SQL has run, yes after (an empty list too), and nothing about anyone", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m?.opCartSaving, "api/_lib/cartMemory.js has opCartSaving");
  const store = await import(new URL("api/_lib/storeOps.js", root).href);
  const op = store.STORE_OPS["cart-saving"];
  assert.equal(typeof op, "function", "a store action");
  assert.deepEqual(await op(fakeDb({ leads: [LEAD()] }), req({})), { on: false }, "before the SQL");
  assert.deepEqual(await op(fakeDb({ leads: [LEAD({ cart: null, cart_at: null })] }), req({})), { on: true }, "control: after it, the check says yes");
  assert.deepEqual(await op(fakeDb({ leads: [] }), req({})), { on: false }, "an empty list, before");
  assert.deepEqual(await op(fakeDb({ leads: [], cartColumns: true }), req({})), { on: true }, "an empty list, after");
  // Whatever email comes with it, the answer is the same and holds nothing else; it only reads.
  const db = fakeDb({ leads: [LEAD({ cart: null, cart_at: null })] });
  const answers = [await op(db, req({})), await op(db, req({ email: "ana@example.com" })), await op(db, req({ email: "stranger@example.com" }))];
  assert.deepEqual(answers, [{ on: true }, { on: true }, { on: true }]);
  assert.deepEqual(db.writes, []);
  // A list that can't be read is an error the server logs, never a quiet answer.
  await assert.rejects(op(fakeDb({ readError: { code: "XX000", message: "down" } }), req({})));
});

test("remember-cart agrees with cart-saving: a signed-in buyer's cart is saved on an empty list once the SQL has run, and not before", async () => {
  const m = await load("api/_lib/cartMemory.js");
  assert.ok(m, "api/_lib/cartMemory.js is there");
  const before = fakeDb({ leads: [], artworks: ART, tokenUser: BUYER });
  assert.deepEqual(await m.opRememberCart(before, req({ pieces: [12] }, "good-jwt")), { ok: true });
  assert.deepEqual(before.writes, [], "before the SQL: nothing");
  const after = fakeDb({ leads: [], artworks: ART, tokenUser: BUYER, cartColumns: true });
  assert.deepEqual(await m.opRememberCart(after, req({ pieces: [12] }, "good-jwt")), { ok: true });
  assert.equal(after.writes.length, 1, "control: the same call once the columns are there");
  assert.equal(after.writes[0].payload[0].email, "ana@example.com");
});

// ── "Verify my email" ───────────────────────────────────────
const LINK = "https://proj.supabase.co/auth/v1/verify?token=tok-123&type=magiclink&redirect_to=https%3A%2F%2Ffonkiart.com";

test("Verify my email: someone new gets Supabase's own sign-in link, made as a BUYER, in the one welcome email", async () => {
  const v = await load("api/_lib/verifyLink.js");
  assert.ok(v, "api/_lib/verifyLink.js is there");
  const store = await import(new URL("api/_lib/storeOps.js", root).href);
  const db = fakeDb({ settings: { couponDiscount: 20 } });
  const mail = mailbox();
  const { out, said } = await logsOf(() => store.opWelcome(db, { email: "New@Example.com" }, mail));
  assert.deepEqual(db.asked.generateLink, [{ type: "magiclink", email: "new@example.com", options: { data: { role: "buyer" }, redirectTo: "https://fonkiart.com" } }]);
  assert.equal(mail.sent.length, 1, "one email, not two");
  const html = mail.sent[0].htmlContent;
  assert.match(html, /Verify my email/);
  assert.ok(html.includes(`href="${LINK.replace(/&/g, "&amp;")}"`), "the button carries the link");
  assert.ok(html.includes(out.code), "the code is in the same email");
  assert.match(html, /20% off/);
  // The link signs someone in: never back to the browser, never in a log.
  assert.deepEqual(Object.keys(out).sort(), ["code", "returning"]);
  assert.doesNotMatch(JSON.stringify(out), /tok-123|verify/);
  assert.doesNotMatch(said.join("\n"), /tok-123|supabase\.co|new@example\.com/i);
  assert.equal(db.asked.updateUserById + db.asked.deleteUser, 0, "nobody's sign-in is changed");
});

test("Verify my email: a buyer gets their own link; a collector's sign-in (or anyone not a buyer) gets none, and nothing about it changes", async () => {
  const v = await load("api/_lib/verifyLink.js");
  assert.ok(v, "api/_lib/verifyLink.js is there");
  const buyer = fakeDb({ users: [{ id: "u-1", email: "ana@example.com", user_metadata: { role: "buyer" } }] });
  assert.equal(await v.buyerSignInLink(buyer, "ana@example.com"), LINK);
  for (const meta of [{}, { role: "collector" }, { role: "admin" }]) {
    const db = fakeDb({ users: [{ id: "u-2", email: "col@example.com", user_metadata: meta }] });
    assert.equal(await v.buyerSignInLink(db, "col@example.com"), null, JSON.stringify(meta));
    assert.deepEqual(db.asked.generateLink, [], "not even asked for: a collector's own pending link is never replaced");
    assert.equal(db.asked.updateUserById, 0);
  }
  // Made by someone else in the moment between: never hand out a link that is not a buyer's.
  const race = fakeDb({ linkUser: { email: "new@example.com", user_metadata: { role: "collector" } } });
  assert.equal(await v.buyerSignInLink(race, "new@example.com"), null);
  // Anything wrong: no link, and the welcome email still goes out with its code.
  const store = await import(new URL("api/_lib/storeOps.js", root).href);
  for (const db of [fakeDb({ linkError: { code: "signup_disabled", message: "Signups not allowed for this instance" } }),
    fakeDb({ link: "http://plain.example/verify" }), { ...fakeDb(), auth: {} }]) {
    const mail = mailbox();
    const { out, said } = await logsOf(() => store.opWelcome(db, { email: "new@example.com" }, mail));
    assert.equal(out.returning, false);
    assert.equal(mail.sent.length, 1);
    assert.doesNotMatch(mail.sent[0].htmlContent, /Verify my email/);
    assert.ok(mail.sent[0].htmlContent.includes(out.code));
    assert.doesNotMatch(said.join("\n"), /new@example\.com|plain\.example/);
  }
});

test("Verify my email: an email already on the list is answered as before, with no new email (nobody can flood an inbox by typing it again)", async () => {
  const v = await load("api/_lib/verifyLink.js");
  assert.ok(v, "api/_lib/verifyLink.js is there");
  const store = await import(new URL("api/_lib/storeOps.js", root).href);
  const db = fakeDb({ leads: [LEAD()] });
  const mail = mailbox();
  assert.deepEqual(await store.opWelcome(db, { email: "ana@example.com" }, mail), { returning: true, code: "FK-AAAA-BBBB", used: false });
  assert.deepEqual([mail.sent.length, db.asked.generateLink.length], [0, 0]);
});

test("the signed-in buyer lands in My Account, never the Collectors Room; the room is never this link's way in", () => {
  const app = read("src/App.jsx");
  const land = app.slice(app.indexOf("const land = (u) =>"), app.indexOf("supabase.auth.getSession()"));
  assert.ok(land.length > 0, "App.jsx land() is found");
  const buyer = land.indexOf('if (u.user_metadata?.role === "buyer") { setPage("buyer-dashboard"); return; }');
  assert.ok(buyer > 0, "a buyer goes to My Account and stops there");
  assert.ok(buyer < land.indexOf('setPage("collectors-room")'), "before anyone else is sent to the room");
  // The link is made with role "buyer" only, in one place.
  const link = read("api/_lib/verifyLink.js");
  assert.match(link, /options: \{ data: \{ role: "buyer" \}/);
  assert.doesNotMatch(link, /role: "collector"|isCollectorsOnly|collectors-room/);
  assert.equal((link.match(/generateLink\(/g) || []).length, 1, "one way a link is made");
});

test("the verify email: no green, no cream, nothing under 16px (and the checks can see them)", async () => {
  const T = await import(new URL("api/_lib/emails.js", root).href);
  const html = T.welcomeCoupon({ code: "FK-7QMR-K2PD", discount: 15, verifyLink: LINK });
  assert.match(html, /Verify my email/, "the button is there to check");
  assert.deepEqual(colours(html).filter(green), []);
  assert.deepEqual(colours(html).filter(cream), []);
  const sizes = [...html.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1]));
  assert.ok(sizes.length > 5 && sizes.every((n) => n >= 16), sizes.join(","));
  // Controls: the site's old green and a cream are seen.
  assert.deepEqual(colours('<a style="background:#2d6a4f;color:#fdfcf8">').map((c) => [green(c), cream(c)]), [[true, false], [false, true]]);
});

// ── the browser: who the cart belongs to ────────────────────
test("this browser remembers the email at once, says so to the page, and forgets it on 'Not you?'", async () => {
  const c = await load("src/lib/cartMemory.js");
  assert.ok(c, "src/lib/cartMemory.js is there");
  let heard = 0;
  const stop = c.onRemembered(() => { heard++; });
  assert.equal(c.remember("  Ana@Example.COM "), true);
  assert.equal(c.rememberedEmail(), "ana@example.com");
  assert.equal(localStorage.getItem("fonkiart-cart-email"), "ana@example.com");
  assert.equal(c.remember("nope"), false);
  assert.equal(c.rememberedEmail(), "ana@example.com", "a bad email changes nothing");
  localStorage.setItem("fonkiart-cart-sent", "ana@example.com|12");
  c.forget();
  assert.equal(c.rememberedEmail(), "");
  assert.equal(localStorage.getItem("fonkiart-cart-sent"), null, "the next email is sent afresh");
  assert.equal(heard, 2);
  stop();
  c.remember("bo@example.com");
  assert.equal(heard, 2, "stopped listening");
  c.forget();
  // A browser that keeps nothing (a private window): kept for this visit only.
  const keep = globalThis.localStorage;
  globalThis.localStorage = storage({ broken: true });
  try {
    assert.equal(c.remember("cy@example.com"), true);
    assert.equal(c.rememberedEmail(), "cy@example.com");
    c.forget();
    assert.equal(c.rememberedEmail(), "");
  } finally { globalThis.localStorage = keep; }
});

test("the cart is sent only for someone known, only when it changed, and nothing about the email ever comes back", async () => {
  const c = await load("src/lib/cartMemory.js");
  assert.ok(c, "src/lib/cartMemory.js is there");
  localStorage._map.clear();
  const calls = [];
  // Whatever the server said back, the browser keeps nothing of it.
  const ask = async (op, body, opts) => { calls.push([op, body, opts]); return { orders: [{ ref: "FA-1" }], address: "1 Main St" }; };
  const cart = [{ id: 12, title: "Flamingo Party" }, { id: 13 }, { id: 12 }];
  const on = { saving: true }; // cart saving switched on (its own test below)
  assert.equal(await c.saveCart(ask, cart, { user: null, email: "", ...on }), false, "anonymous: nothing is sent anywhere");
  assert.equal(await c.saveCart(ask, cart, { user: { ...BUYER, user_metadata: { role: "collector" } }, email: "", ...on }), false, "a collector's sign-in is not a buyer's");
  assert.deepEqual(calls, []);
  assert.equal(await c.saveCart(ask, cart, { user: null, email: "ana@example.com", ...on }), true);
  assert.equal(await c.saveCart(ask, cart, { user: null, email: "ana@example.com", ...on }), false, "unchanged: not sent again");
  assert.equal(await c.saveCart(ask, [...cart, { id: 14 }], { user: null, email: "ana@example.com", ...on }), true);
  assert.equal(await c.saveCart(ask, cart, { user: BUYER, email: "ana@example.com", ...on }), true, "signed in as a buyer: with the account");
  assert.equal(await c.saveCart(ask, [], { user: BUYER, email: "", ...on }), true, "emptied: cleared");
  assert.deepEqual(calls, [
    ["remember-cart", { email: "ana@example.com", pieces: [12, 13] }, undefined],
    ["remember-cart", { email: "ana@example.com", pieces: [12, 13, 14] }, undefined],
    ["remember-cart", { pieces: [12, 13] }, { signedIn: true }],
    ["remember-cart", { pieces: [] }, { signedIn: true }],
  ]);
  // An empty cart is never sent to someone just met: it would empty the cart they left elsewhere.
  assert.equal(c.shouldSend("bo@example.com", [], "ana@example.com|12"), false);
  assert.equal(c.shouldSend("ana@example.com", [], "ana@example.com|12"), true);
  assert.deepEqual([...localStorage._map.keys()].sort(), ["fonkiart-cart-sent"], "nothing from the answers is kept");
  assert.equal(c.isBuyer({ user_metadata: { role: "buyer" } }), false, "a buyer who hasn't confirmed their email is not signed in for this");
  assert.deepEqual(c.pieceIds(Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }))).length, 30);
});

test("the site asks once a visit whether cart saving is on; anything but a clear yes is no", async () => {
  const c = await load("src/lib/cartMemory.js");
  assert.ok(c?.cartSaving, "src/lib/cartMemory.js has cartSaving");
  const asker = (answer) => {
    const f = async (op) => { f.calls.push(op); if (answer instanceof Error) throw answer; return answer; };
    f.calls = [];
    return f;
  };
  const yes = asker({ on: true });
  assert.equal(await c.cartSaving(yes), true, "control: a yes is yes");
  assert.equal(await c.cartSaving(yes), true);
  assert.deepEqual(yes.calls, ["cart-saving"], "asked once a visit");
  for (const answer of [{ on: false }, {}, { on: "yes" }, null]) assert.equal(await c.cartSaving(asker(answer)), false, JSON.stringify(answer));
  const down = asker(new Error("Store 500"));
  assert.equal(await c.cartSaving(down), false, "can't be asked: no");
  assert.equal(await c.cartSaving(down), false);
  assert.equal(down.calls.length, 2, "a question that failed is asked again");
});

test("saving off: nothing is sent; and a cart is only saved with an email that was told so (given while saving was on)", async () => {
  const c = await load("src/lib/cartMemory.js");
  assert.ok(c?.toldEmail, "src/lib/cartMemory.js has toldEmail");
  localStorage._map.clear();
  c.forget();
  const calls = [];
  const ask = async (op, body) => { calls.push([op, body]); return { ok: true }; };
  const cart = [{ id: 12 }];
  assert.equal(await c.saveCart(ask, cart, { user: null, email: "ana@example.com", saving: false }), false, "off: not for an email");
  assert.equal(await c.saveCart(ask, cart, { user: BUYER, email: "", saving: false }), false, "off: not for a signed-in buyer");
  assert.deepEqual(calls, []);
  // Given while saving was off: known here, never saved with.
  c.remember("ana@example.com");
  assert.equal(c.rememberedEmail(), "ana@example.com");
  assert.equal(c.toldEmail(), "");
  assert.equal(await c.saveCart(ask, cart, { user: null, email: c.toldEmail(), saving: true }), false, "known, not told: nothing");
  // Given with the words that say so: saved with (control).
  c.remember("ana@example.com", { told: true });
  assert.equal(c.toldEmail(), "ana@example.com");
  assert.equal(await c.saveCart(ask, cart, { user: null, email: c.toldEmail(), saving: true }), true);
  assert.deepEqual(calls, [["remember-cart", { email: "ana@example.com", pieces: [12] }]]);
  // The same email given again stays told; another one is not; "Not you?" forgets both.
  c.remember("ana@example.com");
  assert.equal(c.toldEmail(), "ana@example.com");
  c.remember("bo@example.com");
  assert.equal(c.toldEmail(), "");
  c.remember("bo@example.com", { told: true });
  c.forget();
  assert.equal(c.toldEmail(), "");
  assert.equal(localStorage.getItem("fonkiart-cart-told"), null);
  // A browser that keeps nothing: the same, for this visit only.
  const keep = globalThis.localStorage;
  globalThis.localStorage = storage({ broken: true });
  try {
    c.remember("cy@example.com");
    assert.equal(c.toldEmail(), "");
    c.remember("cy@example.com", { told: true });
    assert.equal(c.toldEmail(), "cy@example.com");
    c.forget();
    assert.equal(c.toldEmail(), "");
  } finally { globalThis.localStorage = keep; }
});

// ── the 5-minute box ────────────────────────────────────────
test("the box: about 5 minutes with pieces in the cart, once a visit, never for someone known, never over checkout or another window", async () => {
  const b = await load("src/lib/cartBox.js");
  assert.ok(b, "src/lib/cartBox.js is there");
  assert.equal(b.BOX_AFTER_MS, 5 * 60 * 1000);
  const at = (mins, more = {}) => b.boxPlan({ count: 2, since: 0, now: mins * 60000, known: false, shown: false, busy: false, ...more });
  assert.deepEqual(at(1), { wait: 4 * 60000 }, "not yet: it waits for the rest");
  assert.deepEqual(at(5), { show: true });
  assert.deepEqual(at(6), { show: true });
  assert.ok(at(6, { busy: true }).wait > 0, "checkout or another window open: it looks again later, never on top");
  assert.deepEqual(at(6, { known: true }), {}, "known already");
  assert.deepEqual(at(6, { shown: true }), {}, "once a visit");
  assert.deepEqual(at(6, { count: 0 }), {}, "no pieces");
  // Since when: set with the first piece, kept, and started again once the cart is empty.
  sessionStorage._map.clear();
  assert.equal(b.cartSince(1, 1000), 1000);
  assert.equal(b.cartSince(3, 9000), 1000);
  assert.equal(b.cartSince(0, 9500), null);
  assert.equal(b.cartSince(1, 9900), 9900);
  assert.equal(b.boxShown(), false);
  b.markBoxShown();
  assert.equal(b.boxShown(), true);
  // The welcome gift's own %, from the same setting the welcome email uses.
  assert.equal(b.boxPercent({ couponDiscount: 20 }), 20);
  assert.equal(b.boxPercent({}), 15);
  assert.match(read("api/_lib/storeOps.js"), /return data\?\.couponDiscount \?\? 15;/, "the email's % comes from the same place");
});

test("the box's two dials live in one place: the 5 minutes and the % only in src/lib/cartBox.js", () => {
  const files = ["src/lib/cartBox.js", "src/lib/cartMemory.js", "src/components/CartMemory.jsx", "src/components/CartEmailBox.jsx", "src/components/CartRemembered.jsx"];
  for (const f of files) assert.ok(has(f), `${f} is there`);
  const others = files.slice(1).map(read).join("\n");
  assert.match(read("src/lib/cartBox.js"), /export const BOX_AFTER_MS = 5 \* 60 \* 1000;/);
  assert.doesNotMatch(others, /60 \* 1000|300000|couponDiscount|\b15\b/, "no second copy of either dial");
  assert.match(read("src/components/CartMemory.jsx"), /percent=\{boxPercent\(settings\)\}/);
});

test("the box's words, its email AT ONCE, and its ways out; no native dialog anywhere in this work", () => {
  const box = read("src/components/CartEmailBox.jsx");
  assert.match(box, /Leave your email and get <span className="cart-box-pct">\{percent\}%<\/span> off these pieces/);
  // (Its other words, drawn with cart saving on and off: "the words that say a cart is saved", below.)
  assert.match(box, /await storeCall\("welcome", \{ email: v \}\);\s*remember\(v, \{ told: saving \}\);/, "remembered the moment the gift is given");
  assert.match(box, /onSubmit=\{send\} noValidate/, "the browser's own pop-up bubble never shows");
  assert.match(box, /aria-label="Close" onClick=\{onClose\}/);
  assert.match(box, /className="cart-box-later" onClick=\{onClose\}>No thanks</);
  assert.match(box, /e\.key === "Escape"\) onClose\(\)/);
  assert.match(box, /className="cart-box-bg" onClick=\{onClose\}/, "a tap outside closes it");
  const welcome = read("src/components/WelcomeModal.jsx");
  assert.match(welcome, /await storeCall\("welcome", \{ email \}\);\s*remember\(email, \{ told: saving \}\);/, "the welcome gift remembers the email too");
  const mem = read("src/components/CartMemory.jsx");
  assert.match(mem, /\.modal-bg, \.cart-drawer, \.checkout-page-bg/, "it waits for the checkout and any other window");
  assert.match(mem, /markBoxShown\(\);\s*setOpen\(true\);/);
  assert.match(read("src/App.jsx"), /<CartMemory cart=\{cart\} user=\{user\} settings=\{mergedData\.settings\} quiet=\{LINK_PAGES\.has\(page\)\} saving=\{cartSaving\} \/>/);
  assert.match(read("src/App.jsx"), /savedFor=\{<CartRemembered count=\{cart\.length\} user=\{user\} saving=\{cartSaving\} \/>\}/);
  assert.match(read("src/pages/CartPage.jsx"), /<h1 className="cart-page-title">[^\n]*<\/h1>\n\s*\{savedFor\}\n/, "under the Cart page's title");
  // No alert, confirm or prompt (Andy: never a native dialog). Control: the scan sees one.
  const dialog = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  assert.equal(dialog.test('if (confirm("Sure?")) go();'), true);
  for (const f of ["src/components/CartEmailBox.jsx", "src/components/CartMemory.jsx", "src/components/CartRemembered.jsx", "src/lib/cartMemory.js", "src/lib/cartBox.js", "src/components/WelcomeModal.jsx"]) {
    assert.equal(dialog.test(read(f)), false, f);
  }
});

// The site's own .jsx files, compiled with the project's Vite and drawn by React's own server
// renderer. Each import becomes a stand-in given here; one without a stand-in fails loudly.
globalThis.__cartEmailTest = {};
let jsxLoads = 0;
async function loadJsx(file, given) {
  if (!has(file)) return null;
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const id = `${file}#${++jsxLoads}`;
  globalThis.__cartEmailTest[id] = given;
  const body = code
    .replace(/^import\s+"[^"]+\.css";?[ \t]*$/gm, "")
    .replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
      if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
      const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
      if (!m || (!m[1] && !m[2])) throw new Error(`${file}: can't read the import line: ${line}`);
      const mod = `globalThis.__cartEmailTest[${JSON.stringify(id)}][${JSON.stringify(from)}]`;
      return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
    });
  assert.doesNotMatch(body, /^\s*import[\s{"]/m, `${file}: an import was left unread`);
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${body}\n// ${id}`)}`);
}

test("the words that say a cart is saved show only while cart saving is on (drawn both ways); the offer, the code and 'Verify my email' stay", async () => {
  const React = await import("react");
  const runtime = await import("react/jsx-runtime");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const draw = (C, props) => renderToStaticMarkup(React.createElement(C, props)).replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,!?])/g, "$1").trim();
  const memory = (told) => ({ remember: () => true, toldEmail: () => told, onRemembered: () => () => {}, forget: () => {}, isBuyer: () => false });
  const given = (told) => ({ react: React, "react/jsx-runtime": runtime, "../lib/store": { storeCall: async () => ({}) }, "./Pic": { default: () => null }, "../lib/cartMemory": memory(told) });
  // Control: the drawing shows what a component says.
  assert.equal(draw(() => React.createElement("p", null, "We'll ", "say ", false, "it."), {}), "We'll say it.");

  // The box, before sending: the offer either way; the pieces remembered only while saving is on.
  const box = await loadJsx("src/components/CartEmailBox.jsx", given(""));
  assert.ok(box?.BoxSent, "CartEmailBox.jsx draws what comes after sending as BoxSent");
  const cart = [{ id: 31, title: "Flamingo Party", image: "/a.jpg" }];
  const form = (saving) => draw(box.default, { cart, percent: 15, saving, onClose() {} });
  for (const saving of [false, true]) assert.match(form(saving), /Leave your email and get 15% off these pieces/);
  assert.match(form(false), /We'll send your code to this email\. /);
  assert.doesNotMatch(form(false), /remember/i, "off: nothing says the pieces are remembered");
  assert.match(form(true), /We'll send your code to this email, and remember the pieces in your cart with it\./, "control: on, it says so");

  // After sending: the code and "Verify my email" either way; "saved" only while saving is on.
  const sent = (saving, done) => draw(box.BoxSent, { done, saving, onClose() {} });
  const NEW = { code: "FK-TEST-0001", returning: false, used: false };
  for (const saving of [false, true]) {
    assert.match(sent(saving, NEW), /FK-TEST-0001/);
    assert.match(sent(saving, NEW), /We sent it to your email, with a “Verify my email” button that signs you in\. No password needed\./);
  }
  assert.doesNotMatch(sent(false, NEW), /saved/i, "off: no saved line");
  assert.match(sent(true, NEW), /Your pieces are saved with your email\./, "control: on, the line is there");
  for (const done of [{ ...NEW, returning: true }, { ...NEW, returning: true, used: true }]) {
    assert.doesNotMatch(sent(false, done), /saved/i, JSON.stringify(done));
    assert.match(sent(true, done), /Your pieces are saved with your email\./, JSON.stringify(done));
  }

  // The Cart page line: only while saving is on, and only for an email that was told so.
  const kept = async (told) => (await loadJsx("src/components/CartRemembered.jsx", given(told))).default;
  const ana = await kept("ana@example.com");
  assert.equal(draw(ana, { count: 2, user: null, saving: false }), "", "off: no line");
  assert.match(draw(ana, { count: 2, user: null, saving: true }), /^Your pieces are saved for ana@example\.com\. Not you\?$/, "control: on, the line");
  assert.equal(draw(await kept(""), { count: 2, user: null, saving: true }), "", "on, but the email wasn't told: no line");

  // The welcome window's small print.
  const welcome = (await loadJsx("src/components/WelcomeModal.jsx", given(""))).default;
  const small = (saving) => draw(welcome, { onClose() {}, discount: 15, artworks: [], saving });
  assert.match(small(false), /No spam\. Unsubscribe anytime\.( |$)/);
  assert.doesNotMatch(small(false), /remember your cart/, "off: no promise about the cart");
  assert.match(small(true), /No spam\. Unsubscribe anytime\. We'll remember your cart with your email\./, "control: on, it says so");
});

// Colours written in some text: every #hex and rgb()/rgba(), as [r, g, b] laid over white.
function colours(text) {
  const out = [];
  for (const m of text.matchAll(/(?<![&\w])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)) {
    const h = m[1].length <= 4 ? [...m[1]].map((d) => d + d).join("") : m[1];
    const [r, g, b, a = 255] = h.match(/../g).map((x) => parseInt(x, 16));
    out.push([r, g, b].map((v) => (a / 255) * v + (1 - a / 255) * 255));
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/gi)) {
    const a = m[4] == null ? 1 : Number(m[4]);
    out.push([m[1], m[2], m[3]].map((v) => a * Number(v) + (1 - a) * 255));
  }
  return out;
}
// Green: a colour (not a grey) whose hue is between yellow-green and blue-green.
function green([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 24) return false;
  const h = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360 : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
  return h >= 70 && h <= 170;
}
// Cream or sand: light and warm (as tests/noCreamInline.test.js has it).
const cream = ([r, g, b]) => r >= 0xc0 && g >= 0xc0 && b >= 0xc0 && r >= g && g >= b && r - b >= 4;

test("the box and the Cart page line: nothing under 16px, no cream, no green, the art whole on white (and the checks can see them)", () => {
  assert.deepEqual(["#2d6a4f", "#27ae60", "rgb(46,125,50)", "#5b4a5c", "#9c3a76", "#b8923f", "#1c1a18", "#c0392b", "#e6e6e6", "#fff"].map((c) => green(colours(c)[0])),
    [true, true, true, false, false, false, false, false, false, false], "the green check: greens yes; plum, rose, gold, ink, red, grey, white no");
  assert.equal(cream(colours("#fdfcf8")[0]), true);
  const css = read("src/cartBox.css");
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const sizes = [...code.matchAll(/font-size:\s*([\d.]+)(px|rem|em)?/g)].map((x) => [Number(x[1]), x[2]]);
  assert.ok(sizes.length >= 10);
  assert.deepEqual(sizes.filter(([n, u]) => u !== "px" || n < 16), [], "every size in px, 16 or more");
  const inCss = colours(code);
  assert.ok(inCss.length >= 8, "its colours are read");
  assert.deepEqual(inCss.filter(green), []);
  assert.deepEqual(inCss.filter(cream), []);
  const pic = code.match(/\.cart-box-piece img \{([^}]*)\}/);
  assert.ok(pic, ".cart-box-piece img is there");
  assert.match(pic[1], /object-fit:contain;background:#fff;/);
  assert.doesNotMatch(code, /object-fit:\s*cover/);
  for (const f of ["src/components/CartEmailBox.jsx", "src/components/CartRemembered.jsx", "src/components/CartMemory.jsx"]) {
    const jsx = read(f);
    assert.deepEqual([...jsx.matchAll(/fontSize:\s*"?(\d+(?:\.\d+)?)/g)].map((x) => Number(x[1])).filter((n) => n < 16), [], f);
    assert.deepEqual(colours(jsx).filter((c) => green(c) || cream(c)), [], f);
  }
});
