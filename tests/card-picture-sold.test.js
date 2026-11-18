// The artwork's picture on Stripe's card page (Andy, 2026-11-17: "please also see if in stripe
// when going into their payment CC page they can show the picture of the art that is being sold").
// Stripe and the database are fakes: nothing real is called.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCheckout } from "../api/_lib/stripe.js";
import { opCardCheckout } from "../api/_lib/storeOps.js";
import { cardImage, cardPicture } from "../api/_lib/artworks.js";

const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const PHOTO = "https://aynesillxtejdvxucxdr.supabase.co/storage/v1/object/public/artworks/ocean-life/frida-1780000000000.jpg";
const PICTURE = `https://fonkiart.com/_vercel/image?url=${encodeURIComponent(PHOTO)}&w=640&q=75`;
const IMAGE0 = "line_items[0][price_data][product_data][images][0]";

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let calls, logs;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "rk_test_FAKEKEYFORTESTS";
  calls = []; logs = [];
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
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
const page = { id: SESSION, url: "https://checkout.stripe.com/c/pay/x" };
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
    for (const m of ["order", "single", "maybeSingle"]) step(m);
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

// ── the picture ─────────────────────────────────────────────────

test("Pay by card: the artwork's picture sits beside the item on Stripe's page, one 640px copy from fonkiart.com", async () => {
  fakeStripe(() => ({ json: page }));
  const db = fakeDb({ Orders: [order()], Artworks: [art(), art({ id: "2", title: "Madame Mango" })] });
  assert.deepEqual(await opCardCheckout(db, { token: TOKEN }), { url: page.url });
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
    assert.deepEqual(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: artworks }), { token: TOKEN }), { url: page.url }, label);
    assert.deepEqual(pictures(calls[0].body), [], label);
  }
  // createCheckout itself only takes an https address.
  for (const image of [undefined, null, "", "http://fonkiart.com/a.jpg", "javascript:alert(1)"]) {
    fakeStripe(() => ({ json: page }));
    await createCheckout({ order: order(), invNum: "FA-1", site: "https://fonkiart.com", image });
    assert.deepEqual(pictures(calls[0].body), [], String(image));
  }
});

test("a picture lookup that fails, throws or hangs still makes the page, without a picture", async () => {
  fakeStripe(() => ({ json: page }));
  assert.deepEqual(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }, { fail: { "Artworks.select": "connection reset" } }), { token: TOKEN }), { url: page.url });
  assert.deepEqual(pictures(calls[0].body), []);
  const base = fakeDb({ Orders: [order()] });
  const throwing = { from: (t) => { if (t === "Artworks") throw new Error("boom"); return base.from(t); } };
  fakeStripe(() => ({ json: page }));
  assert.deepEqual(await opCardCheckout(throwing, { token: TOKEN }), { url: page.url });
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
  assert.deepEqual(await opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }), { token: TOKEN }), { url: page.url });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.get(IMAGE0), PICTURE);
  assert.deepEqual(pictures(calls[1].body), []);
  const rest = (body) => [...body].filter(([k]) => !k.includes("[images]"));
  assert.deepEqual(rest(calls[1].body), rest(calls[0].body), "everything else the same");
  // Not about the picture (a bad key): asked once, and the client hears card isn't working.
  fakeStripe(() => ({ status: 401, json: { error: { code: "invalid_key", message: "Invalid API Key provided" } } }));
  await assert.rejects(opCardCheckout(fakeDb({ Orders: [order()], Artworks: [art()] }), { token: TOKEN }), /isn't working right now/);
  assert.equal(calls.length, 1);
  // Refused with no picture on it: nothing to leave out, so not asked twice.
  fakeStripe(() => ({ status: 400, json: { error: { code: "email_invalid", message: "Invalid email address" } } }));
  await assert.rejects(opCardCheckout(fakeDb({ Orders: [order()] }), { token: TOKEN }), /isn't working right now/);
  assert.equal(calls.length, 1);
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
