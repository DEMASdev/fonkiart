// The artwork's picture on Stripe's card page, and SOLD once an order is paid (Andy, 2026-11-17:
// "please also see if in stripe when going into their payment CC page they can show the picture
// of the art that is being sold" ... "also when an item is sold / paid for it should be marked as
// SOLD thx"). Stripe and the database are fakes: nothing real is called.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCheckout } from "../api/_lib/stripe.js";
import { opCardCheckout, opCardPaid, STORE_OPS } from "../api/_lib/storeOps.js";
import { cardImage, cardPicture, findArtworkByTitle, markSoldForOrder, queryMarkingSold, PAID_STATUSES } from "../api/_lib/artworks.js";
import { isPaid, ORDER_STATUSES, statusChange } from "../src/lib/orderStatus.js";
import { issueAdminToken } from "../api/_lib/adminToken.js";
import adminHandler from "../api/admin.js";

const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_"); // in pieces: no key-shaped text in the repo
const FORM = { token: TOKEN, embedded: true }; // the invoice page's card form, inside the page
const PHOTO = "https://aynesillxtejdvxucxdr.supabase.co/storage/v1/object/public/artworks/ocean-life/frida-1780000000000.jpg";
const PICTURE = `https://fonkiart.com/_vercel/image?url=${encodeURIComponent(PHOTO)}&w=640&q=75`;
const IMAGE0 = "line_items[0][price_data][product_data][images][0]";

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let calls, logs;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "rk_test_FAKEKEYFORTESTS";
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  calls = []; logs = [];
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  Object.assign(console, realConsole);
});

// Answers like Stripe and records what we would have sent.
function fakeStripe(answer) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? new URLSearchParams(init.body) : null });
    const { status = 200, json } = answer(url, init);
    return { ok: status < 400, status, json: async () => json };
  };
}
const page = { id: SESSION, client_secret: `${SESSION}_secret_FAKE` };
const formOf = (out) => [out.session, out.clientSecret]; // the card form the invoice page opens
const FORM_MADE = [SESSION, `${SESSION}_secret_FAKE`];
const paidPage = (over = {}) => ({ id: SESSION, payment_status: "paid", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN }, ...over });
const webhook = (db, mail) => STORE_OPS["stripe-event"](db, { body: { type: "checkout.session.completed", data: { object: { id: SESSION } } } }, mail);
const back = { token: TOKEN, session: SESSION };
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };
const pictures = (body) => [...body.keys()].filter(k => k.includes("[images]"));

const order = (over = {}) => ({
  id: 21, invoice_token: TOKEN, invoice_approved: true, status: "confirmed", item_title: "Frida the manatee",
  amount: 450, client_name: "Ana Lopez", client_email: "ana@example.com", payment_methods: "zelle,stripe",
  created_at: "2026-11-17T21:19:56.080514+00:00", ...over,
});
const art = (over = {}) => ({ id: "1780000000000", title: "Frida the manatee", image: PHOTO, isSold: false, category: "Ocean life", ...over });

// Orders + Artworks the way supabase-js reads and writes them. Filters run when the query is
// awaited, like the real database. fail: { "Artworks.select": "message" } makes that fail;
// hang: { Artworks: true } makes its reads never answer.
function fakeDb(tables = {}, { fail = {}, hang = {} } = {}) {
  const reads = [], writes = [];
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const steps = [], tests = [];
    let op = "select", payload = null, lim = null, returning = false;
    const q = {};
    const step = (m, fn) => { q[m] = (...a) => { steps.push([m, ...a]); fn?.(...a); return q; }; };
    const is = (r, k, v) => (v === null ? r[k] == null : r[k] === v);
    step("select", () => { if (op !== "select") returning = true; });
    step("insert", (v) => { op = "insert"; payload = v; });
    step("upsert", (v) => { op = "upsert"; payload = v; });
    step("update", (v) => { op = "update"; payload = v; });
    step("eq", (k, v) => tests.push(r => String(r[k]) === String(v)));
    step("in", (k, list) => tests.push(r => list.includes(r[k])));
    step("is", (k, v) => tests.push(r => is(r, k, v)));
    step("not", (k, o, v) => { assert.equal(o, "is"); tests.push(r => !is(r, k, v)); });
    step("limit", (n) => { lim = n; });
    for (const m of ["order", "range", "single", "maybeSingle"]) step(m);
    q.then = (ok, bad) => {
      if (op === "select" && hang[table]) return new Promise(() => {});
      return Promise.resolve().then(() => {
        if (fail[`${table}.${op}`]) return { data: null, error: { message: fail[`${table}.${op}`] } };
        const hit = rows.filter(r => tests.every(t => t(r)));
        if (op === "select") { reads.push({ table, steps }); return { data: hit.slice(0, lim ?? undefined).map(r => ({ ...r })), error: null }; }
        writes.push({ table, op, payload, steps, changed: op === "update" ? hit.length : 1 });
        if (op === "update") { hit.forEach(r => Object.assign(r, payload)); return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null }; }
        [].concat(payload).forEach(r => rows.push({ id: rows.length + 100, ...r }));
        return { data: null, error: null };
      }).then(ok, bad);
    };
    return q;
  };
  return { from, reads, writes };
}
const soldWrites = (db) => db.writes.filter(w => w.table === "Artworks");

// ── the picture ─────────────────────────────────────────────────

test("Pay by card: the artwork's picture sits beside the item in Stripe's card form, one 640px copy from fonkiart.com", async () => {
  fakeStripe(() => ({ json: page }));
  const db = fakeDb({ Orders: [order()], Artworks: [art(), art({ id: "2", title: "Madame Mango" })] });
  assert.deepEqual(formOf(await opCardCheckout(db, FORM, mailbox())), FORM_MADE);
  assert.equal(calls[0].body.get(IMAGE0), PICTURE);
  assert.deepEqual(pictures(calls[0].body), [IMAGE0], "one picture");
  assert.deepEqual(db.reads.find(r => r.table === "Artworks").steps,
    [["select", "id,title,image,isSold,category"], ["eq", "title", "Frida the manatee"], ["limit", 2]], "found by its exact title");
  assert.equal(db.writes.length, 0, "making a payment page marks nothing");
});

test("no picture field at all unless exactly one artwork has exactly that title, with a picture in the shop's bucket", async () => {
  for (const [label, artworks] of [
    ["no artwork has that title", [art({ title: "Madame Mango" })]],
    ["only in other capitals", [art({ title: "frida the manatee" })]],
    ["only with an extra space", [art({ title: "Frida the manatee " })]],
    ["two artworks have it", [art({ id: "1" }), art({ id: "2", image: `${PHOTO}?2` })]],
    ["it has no picture", [art({ image: "" })]],
    ["its picture is somewhere else", [art({ image: "https://example.com/frida.jpg" })]],
  ]) {
    fakeStripe(() => ({ json: page }));
    assert.deepEqual(formOf(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: artworks }), FORM, mailbox())), FORM_MADE, label);
    assert.deepEqual(pictures(calls[0].body), [], label);
  }
  // createCheckout itself only takes an https address.
  for (const image of [undefined, null, "", "http://fonkiart.com/a.jpg", "javascript:alert(1)"]) {
    fakeStripe(() => ({ json: page }));
    await createCheckout({ order: order(), invNum: "FA-1", image });
    assert.deepEqual(pictures(calls[0].body), [], String(image));
  }
});

test("a picture lookup that fails, throws or hangs still makes the page, without a picture", async () => {
  fakeStripe(() => ({ json: page }));
  assert.deepEqual(formOf(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }, { fail: { "Artworks.select": "connection reset" } }), FORM, mailbox())), FORM_MADE);
  assert.deepEqual(pictures(calls[0].body), []);
  const base = fakeDb({ Orders: [order()] });
  const throwing = { from: (t) => { if (t === "Artworks") throw new Error("boom"); return base.from(t); } };
  fakeStripe(() => ({ json: page }));
  assert.deepEqual(formOf(await opCardCheckout(throwing, FORM, mailbox())), FORM_MADE);
  assert.deepEqual(pictures(calls[0].body), []);
  // A database that never answers is given up on, not waited for.
  const started = Date.now();
  assert.equal(await cardPicture(fakeDb({ Artworks: [art()] }, { hang: { Artworks: true } }), "Frida the manatee", { waitMs: 20 }), null);
  assert.ok(Date.now() - started < 1000);
  assert.equal(await cardPicture(null, "Frida the manatee"), null, "no database at all");
  assert.equal(await cardPicture(fakeDb({ Artworks: [art()] }), "Frida the manatee"), PICTURE, "control: a healthy lookup finds it");
});

test("Stripe refuses the page with the picture: it's made again without it, so the client can still pay", async () => {
  fakeStripe((url, init) => new URLSearchParams(init.body).has(IMAGE0)
    ? { status: 400, json: { error: { type: "invalid_request_error", code: "url_invalid", param: IMAGE0, message: "Not a valid URL" } } }
    : { json: page });
  assert.deepEqual(formOf(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }), FORM, mailbox())), FORM_MADE);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.get(IMAGE0), PICTURE);
  assert.deepEqual(pictures(calls[1].body), []);
  const rest = (body) => [...body].filter(([k]) => !k.includes("[images]"));
  assert.deepEqual(rest(calls[1].body), rest(calls[0].body), "everything else the same");
  // Not about the picture (a bad key): asked once, and the client hears card isn't working.
  fakeStripe(() => ({ status: 401, json: { error: { code: "invalid_key", message: "Invalid API Key provided" } } }));
  await assert.rejects(opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }), FORM, mailbox()), /isn't working right now/);
  assert.equal(calls.length, 1);
  // Refused with no picture on it: asked once more with cards only (Klarna left out,
  // tests/klarna.test.js), then nothing left to leave out, so not asked a third time.
  fakeStripe(() => ({ status: 400, json: { error: { code: "email_invalid", message: "Invalid email address" } } }));
  await assert.rejects(opCardCheckout(fakeDb({ Orders: [order()] }), FORM, mailbox()), /isn't working right now/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.get("payment_method_types[1]"), null, "the second time, cards only");
});

test("the picture's address is one Vercel will make: the shop's own bucket (vercel.json), at an allowed width", () => {
  const { images } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(images.sizes.includes(640));
  const [p] = images.remotePatterns;
  assert.deepEqual([p.protocol, p.hostname, p.pathname], ["https", "aynesillxtejdvxucxdr.supabase.co", "/storage/v1/object/public/**"]);
  assert.equal(cardImage(PHOTO), PICTURE);
  for (const other of ["https://example.com/a.jpg", PHOTO.replace("https:", "http:"), PHOTO.replace("/public/", "/sign/"), "", null, undefined, 42]) {
    assert.equal(cardImage(other), null, String(other));
  }
});

// ── SOLD on the card path ───────────────────────────────────────

test("card, the client comes back paid: the artwork is marked Sold once; a reload doesn't touch it again", async () => {
  fakeStripe(() => ({ json: paidPage() }));
  const piece = art(), other = art({ id: "2", title: "Madame Mango" });
  const db = fakeDb({ Orders: [order()], Artworks: [piece, other] });
  assert.deepEqual(await opCardPaid(db, back, mailbox()), { paid: true });
  assert.equal(piece.isSold, true);
  assert.equal(other.isSold, false);
  assert.deepEqual(soldWrites(db).map(w => w.payload), [{ isSold: true }]);
  assert.deepEqual(soldWrites(db)[0].steps.slice(1), [["eq", "id", piece.id], ["not", "isSold", "is", true], ["select", "id"]], "this piece, only if not Sold yet");
  assert.deepEqual(await opCardPaid(db, back, mailbox()), { paid: true });
  assert.equal(soldWrites(db).length, 1, "a reload writes nothing");
  assert.equal(db.reads.filter(r => r.table === "Artworks").length, 1, "and doesn't even look");
});

test("card: Stripe's message alone, or with the client coming back, in either order or at the same moment: Sold changes once", async () => {
  for (const [label, run] of [
    ["Stripe's message alone", (db) => webhook(db, mailbox())],
    ["client, then Stripe", async (db) => { await opCardPaid(db, back, mailbox()); await webhook(db, mailbox()); }],
    ["Stripe, then client", async (db) => { await webhook(db, mailbox()); await opCardPaid(db, back, mailbox()); }],
    ["both at once", (db) => Promise.all([opCardPaid(db, back, mailbox()), webhook(db, mailbox())])],
  ]) {
    fakeStripe(() => ({ json: paidPage() }));
    const piece = art();
    const db = fakeDb({ Orders: [order()], Artworks: [piece] });
    await run(db);
    assert.equal(piece.isSold, true, label);
    assert.equal(soldWrites(db).filter(w => w.changed).length, 1, label);
  }
});

test("card, not paid (or not this amount): nothing is marked", async () => {
  const piece = art();
  const db = fakeDb({ Orders: [order()], Artworks: [piece] });
  fakeStripe(() => ({ json: paidPage({ payment_status: "unpaid" }) }));
  assert.deepEqual(await opCardPaid(db, back, mailbox()), { paid: false });
  fakeStripe(() => ({ json: paidPage({ amount_total: 100 }) }));
  assert.deepEqual(await webhook(db, mailbox()), { received: true, ignored: "not paid" });
  assert.equal(piece.isSold, false);
  assert.equal(db.reads.filter(r => r.table === "Artworks").length, 0);
});

test("marking Sold never undoes a payment: the artwork failing leaves the order Paid, the emails sent and Stripe answered 200", async () => {
  for (const fail of [{ "Artworks.select": "connection reset" }, { "Artworks.update": "permission denied" }]) {
    fakeStripe(() => ({ json: paidPage() }));
    logs = [];
    const row = order(), mail = mailbox();
    assert.deepEqual(await opCardPaid(fakeDb({ Orders: [row], Artworks: [art()] }, { fail }), back, mail), { paid: true });
    assert.equal(row.status, "paid");
    assert.equal(mail.sent.length, 2);
    const row2 = order();
    assert.deepEqual(await webhook(fakeDb({ Orders: [row2], Artworks: [art()] }, { fail }), mailbox()), { received: true, paid: true });
    assert.equal(row2.status, "paid");
    assert.ok(logs.some(l => /could not be marked Sold/.test(l)), "a line in the log");
  }
});

// ── the rules for SOLD ──────────────────────────────────────────

test("Sold needs EXACTLY the order's title, on exactly one artwork; otherwise nothing, and one line in the log", async () => {
  const paid = order({ status: "paid" });
  for (const [label, artworks] of [
    ["no artwork has it", [art({ title: "Madame Mango" })]],
    ["only in other capitals", [art({ title: "frida the manatee" })]],
    ["only with an extra space", [art({ title: "Frida the manatee " })]],
    ["two artworks have it", [art({ id: "1" }), art({ id: "2" })]],
  ]) {
    const db = fakeDb({ Artworks: artworks });
    logs = [];
    assert.equal((await markSoldForOrder(db, paid)).marked, false, label);
    assert.equal(db.writes.length, 0, label);
    assert.ok(artworks.every(a => a.isSold === false), label);
    assert.equal(logs.length, 1, label);
    assert.match(logs[0], /nothing marked Sold/, label);
  }
  // Control: the exact title is marked, and only that piece.
  const exact = art({ id: "1" }), shouting = art({ id: "2", title: "FRIDA THE MANATEE" });
  assert.deepEqual(await markSoldForOrder(fakeDb({ Artworks: [exact, shouting] }), paid), { marked: true, id: "1" });
  assert.deepEqual([exact.isSold, shouting.isSold], [true, false]);
  assert.deepEqual(await findArtworkByTitle(fakeDb({ Artworks: [art()] }), "Frida the manatee"), art());
  assert.equal(await findArtworkByTitle(fakeDb({ Artworks: [art({ id: "1" }), art({ id: "2" })] }), "Frida the manatee"), null);
});

test("already Sold: no write at all. Never marked before (empty): marked", async () => {
  const sold = art({ isSold: true });
  const db = fakeDb({ Artworks: [sold] });
  assert.deepEqual(await markSoldForOrder(db, order({ status: "paid" })), { marked: false, why: "already sold" });
  assert.equal(db.writes.length, 0);
  const blank = art({ isSold: null });
  assert.equal((await markSoldForOrder(fakeDb({ Artworks: [blank] }), order({ status: "paid" }))).marked, true);
  assert.equal(blank.isSold, true);
});

test("unpaid statuses never mark (nothing is even read); Paid, Shipped and Delivered do, the same list as the browser's", async () => {
  for (const [status] of ORDER_STATUSES) assert.equal(PAID_STATUSES.has(status), isPaid(status), status);
  for (const status of [undefined, null, "", "pending", "confirmed", "cancelled", "PAID"]) {
    const db = fakeDb({ Artworks: [art()] });
    assert.equal((await markSoldForOrder(db, order({ status }))).marked, false, String(status));
    assert.equal(db.reads.length + db.writes.length, 0, String(status));
  }
  for (const status of ["paid", "shipped", "delivered"]) {
    assert.equal((await markSoldForOrder(fakeDb({ Artworks: [art()] }), order({ status }))).marked, true, status);
  }
});

test("a print is never marked Sold by its own sale, so one print sale can't take the rest off the shop", async () => {
  const print = art({ category: "Art Prints" });
  const db = fakeDb({ Artworks: [print] });
  assert.deepEqual(await markSoldForOrder(db, order({ status: "paid" })), { marked: false, why: "print" });
  assert.equal(db.writes.length, 0);
  const original = art({ category: "Blueprints" }); // the word "print" inside another word is not a print
  assert.equal((await markSoldForOrder(fakeDb({ Artworks: [original] }), order({ status: "paid" }))).marked, true);
});

// ── SOLD from the admin (Admin -> Orders) ───────────────────────

const update = (status, method) => ({ m: "update", a: [statusChange(status, method)] });
const byId = (id) => ({ m: "eq", a: ["id", id] });
const addOrder = (status, method) => [{ m: "insert", a: [[{ client_email: "ana@example.com", item_title: "Frida the manatee", amount: 450, status, notes: "", ...statusChange(status, method) }]] }];

test("Admin: ✓ Mark paid, or Shipped / Delivered straight from Confirmed, marks the artwork Sold once the order is saved", async () => {
  for (const [status, method] of [["paid", "zelle"], ["shipped"], ["delivered"]]) {
    const row = order(), piece = art();
    const db = fakeDb({ Orders: [row], Artworks: [piece] });
    assert.deepEqual(await queryMarkingSold(db, "Orders", [update(status, method), byId(21)]), { data: null, count: null, error: null }, "the admin gets the usual answer");
    assert.equal(row.status, status);
    assert.equal(piece.isSold, true, status);
    assert.deepEqual(db.writes.map(w => w.table), ["Orders", "Artworks"], "the order first, then the artwork");
  }
});

test("Admin: + Add Order saved as Paid (or Shipped, Delivered) marks it; saved as Pending or Confirmed doesn't", async () => {
  for (const [status, method, want] of [["paid", "cash", true], ["shipped", undefined, true], ["delivered", undefined, true], ["pending", undefined, false], ["confirmed", undefined, false]]) {
    const piece = art();
    const db = fakeDb({ Orders: [], Artworks: [piece] });
    assert.equal((await queryMarkingSold(db, "Orders", addOrder(status, method))).error, null);
    assert.equal(db.writes[0].table, "Orders");
    assert.equal(piece.isSold, want, status);
  }
});

test("Admin: no Sold when the order was paid already, goes back to unpaid, or wasn't saved; reads and other tables are left alone", async () => {
  // Paid -> Shipped: it didn't just get paid, and Andy may have unticked Sold on purpose.
  let piece = art(), db = fakeDb({ Orders: [order({ status: "paid" })], Artworks: [piece] });
  await queryMarkingSold(db, "Orders", [update("shipped"), byId(21)]);
  assert.equal(piece.isSold, false);
  assert.equal(soldWrites(db).length, 0);
  // Back to Pending: nothing is un-marked either.
  piece = art({ isSold: true }); db = fakeDb({ Orders: [order({ status: "paid" })], Artworks: [piece] });
  await queryMarkingSold(db, "Orders", [update("pending"), byId(21)]);
  assert.equal(piece.isSold, true);
  assert.equal(soldWrites(db).length, 0);
  // The database refuses the order: nothing is marked, and the admin sees the refusal.
  piece = art(); db = fakeDb({ Orders: [order()], Artworks: [piece] }, { fail: { "Orders.update": "violates check constraint" } });
  assert.equal((await queryMarkingSold(db, "Orders", [update("paid", "zelle"), byId(21)])).error.message, "violates check constraint");
  assert.equal(piece.isSold, false);
  // The order can't be read first: the status change is still saved, just nothing marked.
  const row = order(); piece = art(); db = fakeDb({ Orders: [row], Artworks: [piece] }, { fail: { "Orders.select": "timeout" } });
  assert.equal((await queryMarkingSold(db, "Orders", [update("paid", "zelle"), byId(21)])).error, null);
  assert.deepEqual([row.status, piece.isSold], ["paid", false]);
  // A plain read, and a write to another table: the admin's query and nothing more.
  db = fakeDb({ Orders: [order()], Artworks: [art()] });
  await queryMarkingSold(db, "Orders", [{ m: "select", a: ["*"] }]);
  await queryMarkingSold(db, "Artworks", [{ m: "update", a: [{ price: 500, status: "paid" }] }, byId("1780000000000")]);
  assert.deepEqual([db.reads.length, db.writes.length, db.writes[0].payload], [1, 1, { price: 500, status: "paid" }]);
  // A query the admin may not run is refused before anything is read.
  db = fakeDb({ Orders: [order()], Artworks: [art()] });
  await assert.rejects(queryMarkingSold(db, "Orders", [update("paid", "bitcoin"), byId(21)]), /Bad payment method/);
  await assert.rejects(queryMarkingSold(db, "Orders", [update("paid", "zelle"), { m: "rpc", a: [] }]), /Not allowed: rpc/);
  assert.deepEqual([db.reads.length, db.writes.length], [0, 0]);
});

test("Admin: a write cut short by limit or range marks nothing: which orders it reached can't be told beforehand", async () => {
  for (const cut of [{ m: "limit", a: [1] }, { m: "range", a: [0, 0] }]) {
    const row = order(), piece = art();
    const db = fakeDb({ Orders: [row], Artworks: [piece] });
    assert.equal((await queryMarkingSold(db, "Orders", [update("paid", "zelle"), byId(21), cut])).error, null, cut.m);
    assert.deepEqual([row.status, piece.isSold, soldWrites(db).length], ["paid", false, 0], `${cut.m}: the order is saved, nothing marked`);
  }
  assert.equal(logs.filter(l => /write with a limit .*nothing marked Sold/.test(l)).length, 2, "one line in the log each time");
});

// The real door (api/admin.js) with the real database client, talking to a tiny stand-in for
// Supabase's REST API: proves the wiring, and the exact requests the database is sent.
function fakeSupabase(tables) {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const table = decodeURIComponent(u.pathname.split("/rest/v1/")[1] || "");
    const method = String(init.method || "GET").toUpperCase();
    const params = Object.fromEntries(u.searchParams);
    const body = init.body ? JSON.parse(init.body) : undefined;
    seen.push({ method, table, params, body });
    const reply = (status, json) => new Response(json === undefined ? null : JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    if (!tables[table]) return reply(404, { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });
    const tests = [...u.searchParams].filter(([k]) => !["select", "limit"].includes(k)).map(([k, v]) => {
      const [, not, op, val] = /^(not\.)?(eq|is)\.(.*)$/.exec(v);
      const hit = op === "eq" ? (r) => String(r[k]) === val : (r) => r[k] === JSON.parse(val);
      return not ? (r) => !hit(r) : hit;
    });
    const rows = tables[table].filter(r => tests.every(t => t(r)));
    const pick = (r) => (params.select && params.select !== "*" ? Object.fromEntries(params.select.split(",").map(c => [c, r[c]])) : r);
    if (method === "GET") return reply(200, rows.slice(0, Number(params.limit) || undefined).map(pick));
    if (method === "PATCH") {
      rows.forEach(r => Object.assign(r, body));
      return /return=representation/.test(new Headers(init.headers).get("prefer") || "") ? reply(200, rows.map(pick)) : reply(204);
    }
    return reply(405, { message: "not in this stand-in" });
  };
  return seen;
}

test("api/admin.js with the real database client: ✓ Mark paid saves the order, then marks exactly that artwork Sold", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FAKEKEYFORTESTS", ADMIN_PASSWORD: "test-only-admin-password", VITE_SUPABASE_URL: undefined };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  const put = (vals) => { for (const [k, v] of Object.entries(vals)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  put(env);
  try {
    const row = order(), piece = art(), other = art({ id: "2", title: "Madame Mango" });
    const seen = fakeSupabase({ Orders: [row], Artworks: [piece, other] });
    const res = { code: null, body: null, status(c) { res.code = c; return res; }, json(b) { res.body = b; return res; } };
    await adminHandler({ method: "POST", headers: { authorization: `Bearer ${issueAdminToken(env.ADMIN_PASSWORD)}` },
      body: { kind: "query", table: "Orders", chain: [update("paid", "zelle"), byId(21)] } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { data: null, count: null, error: null });
    assert.deepEqual(seen.filter(s => s.table !== "admin_auth"), [
      { method: "GET", table: "Orders", params: { select: "id,item_title,status", id: "eq.21" }, body: undefined },
      { method: "PATCH", table: "Orders", params: { id: "eq.21" }, body: { status: "paid", paid_method: "zelle" } },
      { method: "GET", table: "Artworks", params: { select: "id,title,image,isSold,category", title: "eq.Frida the manatee", limit: "2" }, body: undefined },
      { method: "PATCH", table: "Artworks", params: { id: "eq.1780000000000", isSold: "not.is.true", select: "id" }, body: { isSold: true } },
    ]);
    assert.deepEqual([row.status, piece.isSold, other.isSold], ["paid", true, false]);
  } finally {
    put(before);
  }
});
