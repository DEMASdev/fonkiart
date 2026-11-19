// The Cart's card payment (api/_lib/cartCheckout.js): Andy said yes to "Switch the Cart's 'Pay
// by card' button to the same Stripe page your invoices use?", then asked "can it be imbedded
// inside fonkiart instead of sending the customer away ?", and then (2026-11-18): "i don't want to
// be making the user jump to stripe then back". So the card form opens inside fonkiart.com or
// the card payment doesn't start, and nothing is saved. Stripe and the database are fakes:
// nothing real is called, no email is sent.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { STORE_OPS, GET_OPS, opOrder } from "../api/_lib/storeOps.js";
import { CARD_SOON, CARD_FORM_DOWN, CARD_NOTE, cartPaidFor, isCartPage } from "../api/_lib/cartCheckout.js";
import { cartReceived, cartPaidShop } from "../api/_lib/cartEmails.js";
import { readSlot } from "../api/_lib/emails.js";
import { artPrice } from "../api/_lib/artworks.js";
import { publishableKey } from "../api/_lib/stripe.js";

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let logs;
// The shop's public key, as Vercel holds it: the card form can open inside fonkiart.com. Built
// from pieces: GitHub refuses a push holding anything shaped like a real Stripe key.
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_");

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "rk_test_FAKEKEYFORTESTS";
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  logs = [];
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  Object.assign(console, realConsole);
});

// ── fakes ───────────────────────────────────────────────────────

// Answers like Stripe: makes payment pages (remembering them, with the total of their lines),
// tells what it knows about one, and closes an open one ("expire"; anything else is refused, as
// Stripe does). refuse(body) can answer an error instead of a new page; onExpire(page) can answer
// one instead of closing it; fake.down = true answers every call "Stripe is down".
function fakeStripe({ refuse, onExpire } = {}) {
  const sessions = new Map(), calls = [];
  let made = 0;
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
  const fake = { calls, sessions, down: false };
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? new URLSearchParams(init.body) : null;
    calls.push({ url: String(url), method: init.method, body });
    if (fake.down) return reply(503, { error: { message: "Stripe is down", code: "api_error" } });
    const path = String(url).replace("https://api.stripe.com/v1", "");
    const closing = /^\/checkout\/sessions\/([^/?]+)\/expire$/.exec(path);
    if (init.method === "POST" && closing) {
      const s = sessions.get(closing[1]);
      if (!s) return reply(404, { error: { code: "resource_missing", message: "No such checkout.session" } });
      const no = onExpire?.(s);
      if (no) return reply(no.status, { error: { message: no.message, code: no.code } });
      if (s.status !== "open") return reply(400, { error: { code: "checkout_session_not_open", message: "Only open Checkout Sessions can be expired" } });
      s.status = "expired";
      return reply(200, { ...s });
    }
    if (init.method === "POST" && path === "/checkout/sessions") {
      const no = refuse?.(body, calls.length);
      if (no) return reply(no.status, { error: { message: no.message, code: no.code } });
      const id = `cs_test_cart${String(++made).padStart(14, "0")}`;
      let total = 0;
      for (let i = 0; body.has(`line_items[${i}][quantity]`); i++) {
        total += Number(body.get(`line_items[${i}][price_data][unit_amount]`)) * Number(body.get(`line_items[${i}][quantity]`));
      }
      const metadata = {};
      for (const [k, v] of body) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) metadata[m[1]] = v; }
      // Every test is a guard too: a Cart order never asks for Stripe's own page.
      if (metadata.cart_ref && body.get("ui_mode") !== "embedded") throw new Error(`a Cart order asked Stripe for its own page (the buyer would leave fonkiart.com): ${metadata.cart_ref}`);
      const s = { id, object: "checkout.session", status: "open", payment_status: "unpaid", amount_total: total, currency: body.get("line_items[0][price_data][currency]"), metadata };
      if (body.get("ui_mode") === "embedded") s.client_secret = `${id}_secret_FAKE`;
      else s.url = `https://checkout.stripe.com/c/pay/${id}`;
      sessions.set(id, s);
      return reply(200, s);
    }
    const one = /^\/checkout\/sessions\/([^/?]+)$/.exec(path);
    if (init.method === "GET" && one) {
      const s = sessions.get(one[1]);
      return s ? reply(200, { ...s }) : reply(404, { error: { code: "resource_missing", message: "No such checkout.session" } });
    }
    throw new Error(`unexpected Stripe call: ${init.method} ${url}`);
  };
  const last = () => [...sessions.values()].at(-1);
  return Object.assign(fake, { last, pay: (id = last().id, over = {}) => Object.assign(sessions.get(id), { status: "complete", payment_status: "paid" }, over) });
}

// The shop's tables the way supabase-js reads and writes them; filters run when the query is
// awaited, like the real database. fail: { "Orders.update": "message" } makes that fail.
function fakeDb(tables, { fail = {} } = {}) {
  const writes = [];
  let nextId = 1000;
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const tests = [];
    let op = "select", payload = null, returning = false, single = false, lim = null, sort = null;
    const q = {
      select: () => { if (op !== "select") returning = true; return q; },
      insert: (v) => { op = "insert"; payload = v; return q; },
      update: (v) => { op = "update"; payload = v; return q; },
      eq: (k, v) => { tests.push(r => String(r[k]) === String(v)); return q; },
      in: (k, list) => { tests.push(r => list.map(String).includes(String(r[k]))); return q; },
      not: (k, o, v) => { assert.equal(o, "is"); tests.push(r => (v === null ? r[k] != null : r[k] !== v)); return q; },
      order: (k, { ascending = true } = {}) => { sort = { k, ascending }; return q; },
      limit: (n) => { lim = n; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        if (fail[`${table}.${op}`]) return { data: null, error: { message: fail[`${table}.${op}`] } };
        let hit = rows.filter(r => tests.every(t => t(r)));
        if (op === "select") {
          if (sort) hit = [...hit].sort((a, b) => (a[sort.k] - b[sort.k]) * (sort.ascending ? 1 : -1));
          hit = hit.slice(0, lim ?? undefined).map(r => ({ ...r }));
          return { data: single ? (hit[0] ?? null) : hit, error: null };
        }
        if (op === "update") {
          hit.forEach(r => Object.assign(r, payload));
          writes.push({ table, op, payload, ids: hit.map(r => r.id) });
          return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null };
        }
        const added = [].concat(payload).map(r => ({ id: nextId++, ...r }));
        rows.push(...added);
        writes.push({ table, op, payload });
        return { data: returning ? added.map(r => ({ id: r.id })) : null, error: null };
      }).then(ok, bad),
    };
    return q;
  };
  return { from, tables, writes };
}

const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };

// ── the shop ────────────────────────────────────────────────────

const PHOTO = (name) => `https://aynesillxtejdvxucxdr.supabase.co/storage/v1/object/public/artworks/ocean-life/${name}.jpg`;
const PICTURE = (name) => `https://fonkiart.com/_vercel/image?url=${encodeURIComponent(PHOTO(name))}&w=640&q=75`;
const art = (over) => ({ id: "1", title: "Frida the manatee", image: PHOTO("frida"), isSold: false, category: "Ocean life", price: 500, salePrice: null, ...over });
const artworks = () => [
  art({}),
  art({ id: "2", title: "Madame Mango", image: PHOTO("mango"), price: "350", salePrice: "300" }), // on sale: 300
  art({ id: "3", title: "Sea Turtle Print", image: PHOTO("turtle"), category: "Art Prints", price: 45 }),
];
const shop = (over = {}, opts = {}) => fakeDb({
  Settings: [{ id: 1, couponDiscount: 15 }],
  Leads: [{ id: 7, email: "jane@x.co", coupon_code: "FK-1111-2222", coupon_used: false }],
  Orders: [{ id: 41, item_title: "An older order", amount: 90, status: "paid", client_email: "old@x.co" }],
  Clients: [],
  Artworks: artworks(),
  ...over,
}, opts);
// The checkout's order, exactly as the browser sends it, with a browser price of $1 a piece and
// Stripe.js ready to show the card form inside the page.
const checkout = (over = {}) => ({
  customer: { firstName: "Jane", lastName: "Smith", email: "jane@x.co", phone: "305 555 0100", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  orderRef: "FA-1752",
  couponCode: "",
  items: [{ title: "Frida the manatee", amount: 1 }, { title: "Madame Mango", amount: 1 }],
  total: 2,
  embedded: true,
  ...over,
});
const cartCard = (db, body, mail = mailbox()) => STORE_OPS["cart-card"](db, { body }, mail);
const cartPaid = (db, body, mail = mailbox()) => STORE_OPS["cart-paid"](db, { body }, mail);
const cartAgain = (db, body, mail = mailbox()) => STORE_OPS["cart-again"](db, { body }, mail);
const cartOrder = (db, body, mail = mailbox()) => STORE_OPS["cart-order"](db, { body }, mail);
const cartOther = (db, body, mail = mailbox()) => STORE_OPS["cart-other"](db, { body }, mail);
// What the checkout keeps after "Pay by card" (src/lib/cartOrder.js) and sends to pay it again.
const kept = (out, over = {}) => ({ ref: out.ref, ids: out.ids, email: "jane@x.co", titles: out.lines.map(l => l.title), session: out.session, embedded: true, ...over });
const inserts = (db) => db.writes.filter(w => w.table === "Orders" && w.op === "insert").length;
const webhook = (db, id, mail = mailbox()) => STORE_OPS["stripe-event"](db, { body: { type: "checkout.session.completed", data: { object: { id } } } }, mail);
const cartRows = (db) => db.tables.Orders.filter(r => r.id >= 1000);
const orderWrites = (db) => db.writes.filter(w => w.table === "Orders");
const line = (body, n, field) => body.get(`line_items[${n}][price_data]${field}`);

// ── the price comes from the shop, never from the browser ───────

test("the charged amounts come from the Artworks table: a browser price of $1 for a $500 piece is still charged $500", async () => {
  const stripe = fakeStripe();
  const db = shop(), mail = mailbox();
  const out = await cartCard(db, checkout(), mail);

  const body = stripe.calls[0].body;
  assert.equal(line(body, 0, "[unit_amount]"), "50000", "Frida: her price, $500");
  assert.equal(line(body, 1, "[unit_amount]"), "30000", "Madame Mango: her sale price, $300");
  assert.equal(stripe.last().amount_total, 80000);
  for (const n of [0, 1]) {
    assert.equal(line(body, n, "[currency]"), "usd");
    assert.equal(body.get(`line_items[${n}][quantity]`), "1");
  }
  assert.equal(line(body, 0, "[product_data][name]"), "Frida the manatee");
  assert.equal(line(body, 1, "[product_data][name]"), "Madame Mango");
  assert.equal(line(body, 0, "[product_data][images][0]"), PICTURE("frida"), "each line has its own picture");
  assert.equal(line(body, 1, "[product_data][images][0]"), PICTURE("mango"));
  assert.equal(body.has("line_items[2][quantity]"), false, "one line per piece");
  assert.equal(body.get("mode"), "payment");
  assert.equal(body.get("payment_method_types[0]"), "card");
  assert.equal(body.get("customer_email"), "jane@x.co");

  // The rows are saved with the server's prices, and Stripe's page names exactly them.
  const rows = cartRows(db);
  assert.deepEqual(rows.map(r => [r.item_title, r.amount, r.status]), [["Frida the manatee", 500, "pending"], ["Madame Mango", 300, "pending"]]);
  assert.equal(body.get("metadata[order_ids]"), rows.map(r => r.id).join(","));
  assert.equal(body.get("metadata[cart_ref]"), "FA-1752");
  assert.equal(body.get("client_reference_id"), "FA-1752");
  assert.match(rows[0].notes, /^Order Ref: FA-1752 · Jane Smith/);

  // What the page shows: the server's prices, not the browser's. ids and session: what the
  // checkout keeps to pay this same order again.
  assert.deepEqual(out, {
    ref: "FA-1752", ids: rows.map(r => r.id), session: stripe.last().id,
    lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800,
    clientSecret: stripe.last().client_secret, publishableKey: PK,
  });

  // No email yet (Andy's rule, 2026-11-18: a card order's emails only once it is paid). The rows
  // say so in their notes until it is paid, by card or another way.
  assert.deepEqual(mail.sent, [], "no 'order received' email for a card order that isn't paid");
  assert.ok(rows.every(r => r.notes.endsWith(CARD_NOTE)), "the notes say it is being paid by card");
});

test("artPrice: the sale price when there is one, else the price; nothing above zero = no price", () => {
  assert.equal(artPrice({ price: 500, salePrice: null }), 500);
  assert.equal(artPrice({ price: "350", salePrice: "300" }), 300);
  assert.equal(artPrice({ price: 350, salePrice: "" }), 350);
  assert.equal(artPrice({ price: 350, salePrice: 0 }), 350);
  assert.equal(artPrice({ price: 49.99 }), 49.99);
  for (const none of [{}, { price: "" }, { price: 0 }, { price: "abc" }, { price: -5 }, null]) assert.equal(artPrice(none), null);
});

test("the coupon only counts as the server checks it: right code, right email, not used yet", async () => {
  // Valid: 15% off each piece, in whole dollars as the checkout shows it; the coupon is used up.
  let stripe = fakeStripe();
  let db = shop();
  let out = await cartCard(db, checkout({ couponCode: "FK-1111-2222" }));
  assert.deepEqual(out.lines.map(l => l.amount), [425, 255]);
  assert.equal(out.total, 680);
  assert.equal(stripe.last().amount_total, 68000);
  assert.deepEqual(cartRows(db).map(r => r.amount), [425, 255]);
  assert.equal(db.tables.Leads[0].coupon_used, true);
  assert.match(cartRows(db)[0].notes, /15% coupon applied/);

  // Not valid: full price, whatever the browser claims, and the coupon stays unused.
  for (const [label, over, leads] of [
    ["another buyer's coupon", { couponCode: "FK-1111-2222", customer: { ...checkout().customer, email: "other@x.co" } }, null],
    ["a used coupon", { couponCode: "FK-1111-2222" }, [{ id: 7, email: "jane@x.co", coupon_code: "FK-1111-2222", coupon_used: true }]],
    ["a made-up coupon", { couponCode: "FK-9999-9999" }, null],
    ["no coupon, a browser that 'discounted' anyway", { items: [{ title: "Frida the manatee", amount: 425 }, { title: "Madame Mango", amount: 255 }], total: 680 }, null],
  ]) {
    stripe = fakeStripe();
    db = shop(leads ? { Leads: leads } : {});
    out = await cartCard(db, checkout(over));
    assert.equal(out.total, 800, label);
    assert.equal(stripe.last().amount_total, 80000, label);
    assert.deepEqual(cartRows(db).map(r => r.amount), [500, 300], label);
    if (!leads) assert.equal(db.tables.Leads[0].coupon_used, false, label);
  }
});

test("a piece that is sold, can't be found or has no price refuses the card payment, and NOTHING is saved", async () => {
  for (const [label, arts, said] of [
    ["sold", [art({ isSold: true }), ...artworks().slice(1)], /“Frida the manatee” has already been sold\. Please remove it from your cart\./],
    ["not in the shop", artworks().slice(1), /couldn't find “Frida the manatee”.*Zelle, Venmo or Cash App/],
    ["two pieces with that title", [art({}), art({ id: "9" }), ...artworks().slice(1)], /couldn't find “Frida the manatee”/],
    ["only in other capitals", [art({ title: "frida the manatee" }), ...artworks().slice(1)], /couldn't find “Frida the manatee”/],
    ["no price", [art({ price: null }), ...artworks().slice(1)], /“Frida the manatee” has no price yet.*Zelle, Venmo or Cash App/],
  ]) {
    const stripe = fakeStripe();
    const db = shop({ Artworks: arts }), mail = mailbox();
    await assert.rejects(cartCard(db, checkout({ couponCode: "FK-1111-2222" }), mail), (e) => e.status === 409 && said.test(e.message), label);
    assert.equal(orderWrites(db).length, 0, `${label}: no order saved`);
    assert.equal(db.tables.Clients.length, 0, `${label}: no client saved`);
    assert.equal(db.tables.Leads[0].coupon_used, false, `${label}: the coupon is still there`);
    assert.equal(mail.sent.length, 0, `${label}: no email`);
    assert.equal(stripe.calls.length, 0, `${label}: Stripe never asked`);
  }
});

test("card payments OFF: today's message, and nothing is saved or asked of Stripe", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const stripe = fakeStripe();
  const db = shop(), mail = mailbox();
  await assert.rejects(cartCard(db, checkout(), mail), (e) => e.status === 409 && e.message === CARD_SOON);
  assert.equal(CARD_SOON, "Card payment is being set up. Please use Zelle or contact Fonkiart directly.");
  assert.equal(db.writes.length, 0);
  assert.equal(mail.sent.length, 0);
  assert.equal(stripe.calls.length, 0);
});

// ── inside fonkiart.com, or not at all ──────────────────────────

test("with the publishable key set and Stripe.js ready, the card form opens INSIDE fonkiart.com", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const out = await cartCard(db, checkout());
  const body = stripe.calls[0].body;
  assert.equal(body.get("ui_mode"), "embedded");
  assert.equal(body.get("return_url"), "https://fonkiart.com/?cart=FA-1752&card={CHECKOUT_SESSION_ID}");
  assert.equal(body.has("success_url"), false);
  assert.equal(body.has("cancel_url"), false);
  assert.deepEqual(out, {
    ref: "FA-1752", ids: cartRows(db).map(r => r.id), session: stripe.last().id,
    lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800,
    clientSecret: stripe.last().client_secret, publishableKey: PK,
  });
  assert.doesNotMatch(JSON.stringify(out), /rk_test|FAKEKEYFORTESTS/, "the secret key never goes to the browser");
});

// Andy's own test on 2026-11-18 went to Stripe's page: the live public key was malformed
// ("bad-key"), and the Cart sent him there instead. Now nothing is saved and he stays.
test("NO JUMP: when the card form can't open inside fonkiart.com, the card payment is refused (409) BEFORE anything is saved, emailed or asked of Stripe", async () => {
  for (const [label, pk, embedded, why] of [
    ["no publishable key", undefined, true, "publishable key: no-key"],
    ["a malformed one (quotes pasted in)", `"${PK}"`, true, "publishable key: bad-key"],
    ["not a publishable key at all", "sk_test_NOTPUBLIC", true, "publishable key: bad-key"],
    ["a live publishable key with a test secret key", PK.replace("_test_", "_live_"), true, "publishable key: mode-mismatch"],
    ["the browser has no Stripe.js", PK, false, "the browser has no Stripe.js ready"],
    ["...or says nothing about it", PK, undefined, "the browser has no Stripe.js ready"],
    ["...or not quite true", PK, "true", "the browser has no Stripe.js ready"],
  ]) {
    if (pk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = pk;
    logs = [];
    const stripe = fakeStripe();
    const db = shop(), mail = mailbox();
    await assert.rejects(cartCard(db, checkout({ embedded, couponCode: "FK-1111-2222" }), mail), (e) => e.status === 409 && e.message === CARD_FORM_DOWN, label);
    assert.equal(db.writes.length, 0, `${label}: nothing saved`);
    assert.equal(db.tables.Clients.length, 0, `${label}: no client saved`);
    assert.equal(db.tables.Leads[0].coupon_used, false, `${label}: the coupon is still there`);
    assert.equal(mail.sent.length, 0, `${label}: no email`);
    assert.equal(stripe.calls.length, 0, `${label}: Stripe never asked`);
    assert.ok(logs.some(l => l.includes(`store cart-card: the card form can't open inside fonkiart.com (${why}); nothing saved`)), `${label}: the log says why`);
    assert.doesNotMatch(logs.join("\n"), /FAKEPUBLISHABLE|NOTPUBLIC|FAKEKEYFORTESTS/, `${label}: never a key in the log`);
  }
  assert.equal(CARD_FORM_DOWN, "The secure card form couldn't open right now. Nothing was charged. Please try again, or choose another way to pay.");

  // Control: the same order, key and Stripe.js right: saved, and the form opens.
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  const stripe = fakeStripe();
  const out = await cartCard(shop(), checkout({ couponCode: "FK-1111-2222" }));
  assert.equal(out.clientSecret, stripe.last().client_secret);
});

test("once paid, Stripe brings the buyer back to the shop address they paid from (each keeps its own cart), never anywhere else", async () => {
  for (const [label, site, want] of [
    ["www", "https://www.fonkiart.com", "https://www.fonkiart.com"],
    ["the bare address", "https://fonkiart.com", "https://fonkiart.com"],
    ["nothing sent", undefined, "https://fonkiart.com"],
    ["someone else's site", "https://evil.example", "https://fonkiart.com"],
    ["a look-alike", "https://fonkiart.com.evil.example", "https://fonkiart.com"],
    ["not https", "http://www.fonkiart.com", "https://fonkiart.com"],
    ["with a path", "https://www.fonkiart.com/x", "https://fonkiart.com"],
    ["not text", ["https://www.fonkiart.com"], "https://fonkiart.com"],
  ]) {
    const stripe = fakeStripe();
    const db = shop();
    const first = await cartCard(db, checkout({ site }));
    await cartAgain(db, kept(first, { site }));
    const made = stripe.calls.filter(c => c.method === "POST" && c.url.endsWith("/checkout/sessions"));
    assert.equal(made.length, 2, label);
    for (const { body } of made) {
      assert.equal(body.get("ui_mode"), "embedded", label);
      assert.equal(body.get("return_url"), `${want}/?cart=FA-1752&card={CHECKOUT_SESSION_ID}`, label);
      assert.equal(body.has("success_url") || body.has("cancel_url"), false, `${label}: no way to Stripe's own page`);
    }
  }
});

test("publishableKey: only a pk_ key of the same mode as the secret key, and only while card payments are on", () => {
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_ABC";
  assert.equal(publishableKey(), "pk_test_ABC");
  process.env.STRIPE_SECRET_KEY = "sk_live_XYZ";
  assert.equal(publishableKey(), null, "test public key, live secret key");
  process.env.STRIPE_PUBLISHABLE_KEY = " pk_live_ABC ";
  assert.equal(publishableKey(), "pk_live_ABC");
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(publishableKey(), null, "no secret key: no card payments");
});

test("Stripe failing after the order is saved: the checkout keeps the order and says so; paying again later is the SAME order", async () => {
  const stripe = fakeStripe();
  stripe.down = true;
  const db = shop(), mail = mailbox();
  const out = await cartCard(db, checkout(), mail);
  assert.deepEqual(out, {
    ref: "FA-1752", ids: cartRows(db).map(r => r.id),
    lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800,
    cardError: "Your order FA-1752 is saved, but the card payment couldn't open right now. Please try again in a moment, or choose another way to pay.",
  });
  assert.equal(cartRows(db).length, 2, "the order stays saved: it can be paid again, by card or another way");
  assert.equal(mail.sent.length, 0, "no email: it isn't paid");

  // Stripe back: paying again opens a page for those rows (no page to vouch for them, so
  // today's prices do), and saves nothing more.
  stripe.down = false;
  const again = await cartAgain(db, kept(out), mail);
  assert.equal(again.clientSecret, stripe.last().client_secret);
  assert.equal(stripe.last().amount_total, 80000);
  assert.equal(stripe.last().metadata.order_ids, out.ids.join(","));
  assert.equal(inserts(db), 1);
  assert.equal(mail.sent.length, 0);
});

test("a picture Stripe refuses never stops the payment: the page is made again without pictures", async () => {
  const stripe = fakeStripe({ refuse: (body) => body.has("line_items[0][price_data][product_data][images][0]") ? { status: 400, message: "Invalid URL", code: "url_invalid" } : null });
  const out = await cartCard(shop(), checkout());
  assert.equal(stripe.calls.length, 2);
  assert.equal([...stripe.calls[1].body.keys()].some(k => k.includes("[images]")), false);
  assert.equal(out.clientSecret, stripe.last().client_secret);
  assert.equal(stripe.last().amount_total, 80000);
});

test("no order reference from the browser: the server predicts one, as the checkout does", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const out = await cartCard(db, checkout({ orderRef: "" }));
  assert.equal(out.ref, "FA-1752", "the newest order is 41, so the next is 42 + 1710");
  assert.equal(stripe.calls[0].body.get("metadata[cart_ref]"), "FA-1752");
  assert.match(cartRows(db)[0].notes, /^Order Ref: FA-1752 ·/);
});

// ── back on fonkiart.com: Paid, SOLD, one email each ────────────

test("the return check marks every row of the cart Paid by card exactly once, marks the pieces SOLD, and sends ONE email each", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const three = checkout({ items: [{ title: "Frida the manatee", amount: 1 }, { title: "Madame Mango", amount: 1 }, { title: "Sea Turtle Print", amount: 1 }], total: 3 });
  await cartCard(db, three);
  const { id } = stripe.pay();

  const mail = mailbox();
  const back = await cartPaid(db, { ref: "FA-1752", session: id }, mail);
  assert.deepEqual(back, {
    paid: true, ref: "FA-1752", name: "Jane", total: 845,
    lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }, { title: "Sea Turtle Print", amount: 45 }],
  });
  assert.deepEqual(cartRows(db).map(r => [r.status, r.paid_method]), [["paid", "card"], ["paid", "card"], ["paid", "card"]]);
  const flips = orderWrites(db).filter(w => w.op === "update");
  assert.equal(flips.length, 1, "one write turns the whole cart Paid");
  assert.deepEqual(flips[0].payload, { status: "paid", paid_method: "card" });

  // ONE email to the buyer and ONE to the shop, for the whole cart.
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.equal(mail.sent[0].subject, "Paid by card ✓ — FA-1752: 3 pieces · $845");
  assert.equal(mail.sent[1].subject, "Payment received — 3 pieces · Fonkiart");
  for (const m of mail.sent) for (const t of ["Frida the manatee", "Madame Mango", "Sea Turtle Print", "FA-1752", "$845"]) assert.ok(m.htmlContent.includes(t), `${m.to}: ${t}`);
  assert.match(mail.sent[0].htmlContent, /already marked all 3 pieces <strong>Paid<\/strong>/);

  // SOLD: the originals, never the print.
  const sold = Object.fromEntries(db.tables.Artworks.map(a => [a.title, a.isSold]));
  assert.deepEqual(sold, { "Frida the manatee": true, "Madame Mango": true, "Sea Turtle Print": false });

  // Coming back again (a reload, a second tab): the same answer, no email, no write.
  const writes = db.writes.length;
  const again = mailbox();
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, again)).paid, true);
  assert.equal(again.sent.length, 0);
  assert.equal(db.writes.length, writes);
});

test("the return check believes Stripe, not the link: the page must be this cart's, paid, in dollars, for the rows' exact cents", async () => {
  const stripe = fakeStripe();
  const db = shop();
  await cartCard(db, checkout());
  const { id } = stripe.last();

  // Not paid yet: nothing changes.
  let mail = mailbox();
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, mail)).paid, false);
  assert.deepEqual(cartRows(db).map(r => r.status), ["pending", "pending"]);
  assert.equal(mail.sent.length, 0);

  // Another reference in the link, a made-up page, an id that isn't one: "not found".
  stripe.pay(id);
  for (const [label, body] of [
    ["another reference", { ref: "FA-1753", session: id }],
    ["no reference", { session: id }],
    ["a page Stripe doesn't have", { ref: "FA-1752", session: "cs_test_nosuchpage0000000000" }],
    ["not a page id", { ref: "FA-1752", session: "https://evil.example/" }],
  ]) {
    await assert.rejects(cartPaid(db, body, mail), (e) => e.status === 404, label);
  }
  // An invoice's page is not a Cart order.
  stripe.sessions.set("cs_test_invoice00000000000", { id: "cs_test_invoice00000000000", payment_status: "paid", amount_total: 80000, currency: "usd", metadata: { invoice_token: "85d82763-0000-4000-8000-0000000000aa" } });
  await assert.rejects(cartPaid(db, { ref: "FA-1752", session: "cs_test_invoice00000000000" }, mail), (e) => e.status === 404);

  // Paid, but not the rows' cents, or not dollars: not Paid.
  for (const [label, over] of [["a different amount", { amount_total: 100 }], ["another currency", { currency: "eur" }]]) {
    const s = stripe.sessions.get(id), keep = { ...s };
    Object.assign(s, over);
    assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, mail)).paid, false, label);
    Object.assign(s, keep);
  }
  assert.deepEqual(cartRows(db).map(r => r.status), ["pending", "pending"]);
  assert.equal(mail.sent.length, 0);
  assert.equal(db.tables.Artworks.some(a => a.isSold), false, "nothing marked Sold");

  // A row changed by hand after the page was made: the cents no longer match, so not Paid.
  cartRows(db)[1].amount = 250;
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, mail)).paid, false);
  assert.deepEqual(cartRows(db).map(r => r.status), ["pending", "pending"]);
});

test("cartPaidFor and isCartPage", () => {
  const rows = [{ amount: 500 }, { amount: 49.99 }];
  assert.equal(cartPaidFor({ payment_status: "paid", currency: "USD", amount_total: 54999 }, rows), true);
  assert.equal(cartPaidFor({ payment_status: "unpaid", currency: "usd", amount_total: 54999 }, rows), false);
  assert.equal(cartPaidFor({ payment_status: "paid", currency: "usd", amount_total: 55000 }, rows), false);
  assert.equal(cartPaidFor(null, rows), false);
  assert.equal(isCartPage({ metadata: { cart_ref: "FA-1752", order_ids: "1000,1001" } }), true);
  for (const metadata of [{}, { cart_ref: "FA-1752" }, { order_ids: "1000" }, { cart_ref: "FA-1752", order_ids: "1000,x" }, { cart_ref: "<b>", order_ids: "1000" }, { cart_ref: "FA-1752", order_ids: "" }]) {
    assert.equal(isCartPage({ metadata }), false, JSON.stringify(metadata));
  }
  assert.equal(isCartPage(null), false);
});

// ── Stripe's own "paid" message ─────────────────────────────────

test("Stripe's message finds a Cart order: Paid, SOLD and the two emails, and the buyer coming back after sends none", async () => {
  const stripe = fakeStripe();
  const db = shop();
  await cartCard(db, checkout());
  const { id } = stripe.pay();

  const first = mailbox();
  assert.deepEqual(await webhook(db, id, first), { received: true, paid: true });
  assert.deepEqual(cartRows(db).map(r => [r.status, r.paid_method]), [["paid", "card"], ["paid", "card"]]);
  assert.deepEqual(first.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.equal(db.tables.Artworks.filter(a => a.isSold).length, 2);

  const later = mailbox();
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, later)).paid, true);
  assert.deepEqual(await webhook(db, id, later), { received: true, paid: true }, "Stripe sending it again");
  assert.equal(later.sent.length, 0, "no second email");
});

test("the buyer back first, then Stripe's message: still one email each", async () => {
  const stripe = fakeStripe();
  const db = shop();
  await cartCard(db, checkout());
  const { id } = stripe.pay();
  const mail = mailbox();
  await cartPaid(db, { ref: "FA-1752", session: id }, mail);
  await webhook(db, id, mail);
  await webhook(db, id, mail);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
});

test("the buyer back and Stripe's message at the very same moment: the rows turn Paid once, one email each", async () => {
  const stripe = fakeStripe();
  const db = shop();
  await cartCard(db, checkout());
  const { id } = stripe.pay();
  const mail = mailbox();
  const [back, message] = await Promise.all([cartPaid(db, { ref: "FA-1752", session: id }, mail), webhook(db, id, mail)]);
  assert.equal(back.paid, true);
  assert.deepEqual(message, { received: true, paid: true });
  assert.deepEqual(mail.sent.map(m => m.to).sort(), ["jane@x.co", "shop@fonkiart.com"]);
  const flips = orderWrites(db).filter(w => w.op === "update");
  assert.equal(flips.length, 2, "both tried");
  assert.deepEqual(flips.map(w => w.ids.length).sort(), [0, 2], "only one of them changed the rows");
});

test("Stripe's message: not paid, or rows that aren't there, is answered 200 and ignored", async () => {
  const stripe = fakeStripe();
  const db = shop();
  await cartCard(db, checkout());
  const { id } = stripe.last();
  const mail = mailbox();
  assert.deepEqual(await webhook(db, id, mail), { received: true, ignored: "not paid" });
  stripe.pay(id);
  db.tables.Orders = db.tables.Orders.filter(r => r.id < 1000); // the rows were deleted by hand
  assert.deepEqual(await webhook(db, id, mail), { received: true, ignored: "unknown order" });
  assert.equal(mail.sent.length, 0);
});

test("the database refusing the change: Stripe's message gets a 500 and no email (Stripe retries); the buyer's return emails the shop to mark it by hand", async () => {
  let stripe = fakeStripe();
  let db = shop({}, { fail: { "Orders.update": "database is read-only" } });
  // fakeDb's fail applies to every Orders update; the order itself is an insert, so it saves.
  await cartCard(db, checkout());
  let { id } = stripe.pay();
  let mail = mailbox();
  await assert.rejects(webhook(db, id, mail), (e) => e.status === 500);
  assert.equal(mail.sent.length, 0);

  stripe = fakeStripe();
  db = shop({}, { fail: { "Orders.update": "database is read-only" } });
  await cartCard(db, checkout());
  ({ id } = stripe.pay());
  mail = mailbox();
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: id }, mail)).paid, true, "Stripe says paid: the buyer is told so");
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.match(mail.sent[0].htmlContent, /could not mark the order Paid/);
});

// ── ONE order per cart, however the buyer retries ───────────────

const TWO = [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }];

test("paying again re-opens the SAME order: no second order or email, the same rows and cents, and the page before is closed first", async () => {
  const stripe = fakeStripe();
  const db = shop(), mail = mailbox();
  const first = await cartCard(db, checkout(), mail);
  assert.equal(mail.sent.length, 0, "no 'order received' email: it isn't paid");

  // Closing the card form and opening it again, back from Stripe's page without paying, a reload.
  let again = first;
  for (let n = 0; n < 3; n++) {
    const before = again.session;
    again = await cartAgain(db, kept(first, { session: before }), mail);
    assert.equal(stripe.sessions.get(before).status, "expired", "the page before can't take money any more");
    assert.notEqual(again.session, before);
    assert.equal(stripe.sessions.get(again.session).status, "open");
  }
  assert.equal(inserts(db), 1, "still ONE order");
  assert.deepEqual(cartRows(db).map(r => [r.item_title, r.amount, r.status]), [["Frida the manatee", 500, "pending"], ["Madame Mango", 300, "pending"]]);
  assert.equal(mail.sent.length, 0, "still no email");
  assert.deepEqual(again, { ref: "FA-1752", ids: first.ids, session: stripe.last().id, lines: TWO, total: 800, clientSecret: stripe.last().client_secret, publishableKey: PK });
  assert.equal([...stripe.sessions.values()].filter(p => p.status === "open").length, 1, "only one page can be paid");
  const body = stripe.calls.at(-1).body;
  assert.equal(body.get("metadata[order_ids]"), first.ids.join(","));
  assert.equal(body.get("metadata[cart_ref]"), "FA-1752");
  assert.equal(line(body, 0, "[unit_amount]"), "50000");
  assert.equal(line(body, 1, "[unit_amount]"), "30000");
  assert.equal(line(body, 0, "[product_data][images][0]"), PICTURE("frida"), "the pictures again");

  // Paying the newest page: Paid once, one email each, exactly as for the first page.
  stripe.pay(again.session);
  const back = mailbox();
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: again.session }, back)).paid, true);
  assert.deepEqual(back.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.deepEqual(cartRows(db).map(r => r.status), ["paid", "paid"]);
});

test("paying again opens the card form inside fonkiart.com too; when it can't, nothing changes: no new page, and the page before stays as it was", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  const again = await cartAgain(db, kept(first));
  assert.equal(stripe.calls.at(-1).body.get("ui_mode"), "embedded");
  assert.deepEqual([again.clientSecret, again.publishableKey], [stripe.last().client_secret, PK]);
  assert.equal("url" in again, false);
  assert.equal(stripe.sessions.get(first.session).status, "expired");

  for (const [label, over, pk] of [
    ["the browser has no Stripe.js", { embedded: false }, PK],
    ["...or says nothing about it", { embedded: undefined }, PK],
    ["the publishable key gone", {}, undefined],
    ["a malformed one", {}, `${PK} `.replace("_test_", "-test-")],
  ]) {
    if (pk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = pk;
    const pages = stripe.sessions.size, posts = stripe.calls.filter(c => c.method === "POST").length;
    const mail = mailbox();
    await assert.rejects(cartAgain(db, kept(first, { session: again.session, ...over }), mail), (e) => e.status === 409 && e.message === CARD_FORM_DOWN, label);
    assert.equal(stripe.sessions.get(again.session).status, "open", `${label}: the page before is not closed`);
    assert.equal(stripe.sessions.size, pages, `${label}: no new page`);
    assert.equal(stripe.calls.filter(c => c.method === "POST").length, posts, `${label}: nothing asked of Stripe but a look`);
    assert.equal(mail.sent.length, 0, `${label}: no email`);
  }
  assert.equal(inserts(db), 1);

  // A page paid in the meantime is still recorded, form or no form: the buyer sees the thank-you.
  stripe.pay(again.session);
  const mail = mailbox();
  assert.equal((await cartAgain(db, kept(first, { session: again.session, embedded: false }), mail)).paid, true);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
});

test("paying again needs the order exactly as saved: its reference, rows and email, and the cart's own pieces", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  const other = await cartCard(db, checkout({ orderRef: "FA-1760", items: [{ title: "Sea Turtle Print", amount: 1 }], total: 1 }));
  const pages = stripe.sessions.size;
  for (const [label, over] of [
    ["another email", { email: "someone@x.co" }],
    ["no email", { email: "" }],
    ["another reference", { ref: "FA-1753" }],
    ["a reference that only starts the same", { ref: "FA-175" }],
    ["titles that aren't the rows'", { titles: ["Frida the manatee", "Sea Turtle Print"] }],
    ["the same title twice", { titles: ["Frida the manatee", "Frida the manatee"] }],
    ["one title fewer", { titles: ["Frida the manatee"] }],
    ["another order's row", { ids: [first.ids[0], other.ids[0]], titles: ["Frida the manatee", "Sea Turtle Print"] }],
    ["a row that isn't there", { ids: [first.ids[0], 999999] }],
    ["the same row twice", { ids: [first.ids[0], first.ids[0]] }],
    ["ids that aren't numbers", { ids: first.ids.map(String) }],
    ["no ids", { ids: undefined }],
    ["another order's payment page", { session: other.session }],
    ["a page Stripe doesn't have", { session: "cs_test_nosuchpage0000000000" }],
    ["not a page id", { session: "https://evil.example/" }],
  ]) {
    await assert.rejects(cartAgain(db, kept(first, over)), (e) => e.status === 404 && e.message === "We couldn't find that order.", label);
  }
  assert.equal(stripe.sessions.size, pages, "no page made");
  assert.ok([...stripe.sessions.values()].every(p => p.status === "open"), "no page closed");
  assert.equal(inserts(db), 2);

  // Control: the same order, the email in other capitals and spaces, the cart in another order.
  const ok = await cartAgain(db, kept(first, { email: " Jane@X.co ", titles: ["Madame Mango", "Frida the manatee"] }));
  assert.equal(ok.clientSecret, stripe.last().client_secret);
});

test("paying again: only while every row is still Pending and no piece has been sold since", async () => {
  for (const [label, change, said] of [
    ["cancelled by the shop", (rows) => { rows[0].status = "cancelled"; }, /^This order can't be paid here any more\. Please contact Fonkiart\.$/],
    ["confirmed on an invoice", (rows) => { rows[1].status = "confirmed"; }, /can't be paid here any more/],
    ["one piece marked Paid by hand", (rows) => { rows[0].status = "paid"; }, /can't be paid here any more/],
    ["a piece sold since", (rows, db) => { db.tables.Artworks[1].isSold = true; }, /^“Madame Mango” has already been sold, so this order can't be paid by card\. Please contact Fonkiart\.$/],
  ]) {
    const stripe = fakeStripe();
    const db = shop();
    const first = await cartCard(db, checkout());
    change(cartRows(db), db);
    await assert.rejects(cartAgain(db, kept(first)), (e) => e.status === 409 && said.test(e.message), label);
    assert.equal(stripe.sessions.size, 1, `${label}: no new page`);
  }
});

test("rows a browser priced (the plain order op) never get a card page; the shop's own prices do, with or without a page", async () => {
  // A plain order at $1 a piece, then "pay by card again" for it: refused, Stripe never asked.
  let stripe = fakeStripe();
  let db = shop();
  await STORE_OPS.order(db, { body: checkout() }, mailbox());
  const crafted = (d) => ({ ref: "FA-1752", ids: cartRows(d).map(r => r.id), email: "jane@x.co", titles: ["Frida the manatee", "Madame Mango"], embedded: true });
  await assert.rejects(cartAgain(db, crafted(db)), (e) => e.status === 409
    && e.message === "This order can't be paid by card here. You can still pay it with Zelle, Venmo or Cash App, or contact Fonkiart.");
  assert.equal(stripe.calls.length, 0);

  // Control: the same plain order at the shop's own prices: today's prices vouch for it.
  stripe = fakeStripe();
  db = shop();
  await STORE_OPS.order(db, { body: checkout({ items: TWO, total: 800 }) }, mailbox());
  assert.equal((await cartAgain(db, crafted(db))).clientSecret, stripe.last().client_secret);
  assert.equal(stripe.last().amount_total, 80000);

  // A coupon order: its own page vouches for the 15% off...
  stripe = fakeStripe();
  db = shop();
  const coupon = await cartCard(db, checkout({ couponCode: "FK-1111-2222" }));
  assert.equal((await cartAgain(db, kept(coupon))).total, 680);
  assert.equal(stripe.last().amount_total, 68000);
  // ...and with no page (Stripe failed as it was saved), nothing can: Zelle, Venmo or Cash App.
  stripe = fakeStripe();
  db = shop({ Leads: [{ id: 7, email: "jane@x.co", coupon_code: "FK-1111-2222", coupon_used: false }] });
  stripe.down = true;
  const failed = await cartCard(db, checkout({ couponCode: "FK-1111-2222" }));
  assert.ok(failed.cardError);
  stripe.down = false;
  await assert.rejects(cartAgain(db, kept(failed)), (e) => e.status === 409 && /Zelle, Venmo or Cash App/.test(e.message));
  assert.equal(stripe.sessions.size, 0);
});

test("paying again when the page before was paid after all: recorded Paid with one email each, and no new page", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  stripe.pay(first.session);
  const mail = mailbox();
  assert.deepEqual(await cartAgain(db, kept(first), mail), { paid: true, ref: "FA-1752", name: "Jane", lines: TWO, total: 800 });
  assert.equal(stripe.sessions.size, 1, "no new page");
  assert.deepEqual(cartRows(db).map(r => [r.status, r.paid_method]), [["paid", "card"], ["paid", "card"]]);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  const later = mailbox();
  assert.equal((await cartAgain(db, kept(first), later)).paid, true);
  assert.equal(later.sent.length, 0, "no second email");
});

test("paying again while the page before is being paid: Stripe won't close it, so that payment is recorded and no new page is made", async () => {
  // The payment lands between our look at the page and our "close it".
  const stripe = fakeStripe({ onExpire: (page) => { Object.assign(page, { status: "complete", payment_status: "paid" }); return { status: 400, message: "Only open Checkout Sessions can be expired", code: "checkout_session_not_open" }; } });
  const db = shop();
  const first = await cartCard(db, checkout());
  const mail = mailbox();
  const out = await cartAgain(db, kept(first), mail);
  assert.equal(out.paid, true);
  assert.equal(stripe.sessions.size, 1);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);

  // Stripe failing to close an open page: no new page (two could be paid), and the buyer is told to try again.
  const stuck = fakeStripe({ onExpire: () => ({ status: 503, message: "Stripe is down", code: "api_error" }) });
  const db2 = shop();
  const o2 = await cartCard(db2, checkout());
  await assert.rejects(cartAgain(db2, kept(o2)), (e) => e.status === 502 && /try again in a moment/.test(e.message));
  assert.equal(stuck.sessions.size, 1);
  assert.equal(stuck.sessions.get(o2.session).status, "open");
});

test("asking about a saved order: open (the rows' prices), paid, or closed; a page Stripe says is paid is recorded right there", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  assert.deepEqual(await cartOrder(db, kept(first)), { state: "open", ref: "FA-1752", lines: TWO, total: 800 });
  assert.equal(stripe.sessions.get(first.session).status, "open", "asking changes nothing");

  // Stripe out of reach: the rows answer.
  stripe.down = true;
  assert.equal((await cartOrder(db, kept(first))).state, "open");
  stripe.down = false;

  // Paid, then the tab closed before coming back, Stripe's own message not here yet.
  stripe.pay(first.session);
  const mail = mailbox();
  assert.deepEqual(await cartOrder(db, kept(first), mail), { state: "paid", ref: "FA-1752", name: "Jane", lines: TWO, total: 800 });
  assert.deepEqual(cartRows(db).map(r => r.status), ["paid", "paid"]);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  const later = mailbox();
  assert.equal((await cartOrder(db, kept(first), later)).state, "paid");
  assert.equal(later.sent.length, 0, "no second email");

  // Closed by the shop: the checkout starts afresh. Not this buyer's: not found.
  fakeStripe();
  const db2 = shop();
  const o2 = await cartCard(db2, checkout());
  cartRows(db2)[0].status = "cancelled";
  assert.deepEqual(await cartOrder(db2, kept(o2)), { state: "closed" });
  await assert.rejects(cartOrder(db2, kept(o2, { email: "someone@x.co" })), (e) => e.status === 404);
});

// ── paid another way after all: its "order received" emails then, once ──
// Andy, 2026-11-18: a card order's emails only once it is PAID. Paid by card, the paid pair is
// its confirmation; paid with Zelle, Venmo or Cash App instead (cart-other), the pair an order
// placed with Zelle gets goes out then, once.

// The "order received" pair's subjects (opOrder): never for a card order that isn't paid.
const RECEIVED = /^(Order Received — |🎨 New Order )/;
const otherWay = (out, method, over = {}) => ({ ...kept(out, over), method });

test("a card order paid by card: the paid pair is its ONLY confirmation (never 'Order Received'), each email showing exactly its pieces", async () => {
  const stripe = fakeStripe();
  const db = shop(), mail = mailbox();
  const first = await cartCard(db, checkout(), mail);
  const again = await cartAgain(db, kept(first), mail);
  stripe.pay(again.session);
  assert.equal((await cartPaid(db, { ref: "FA-1752", session: again.session }, mail)).paid, true);
  await webhook(db, again.session, mail);
  assert.deepEqual(mail.sent.map(m => m.subject), ["Paid by card ✓ — FA-1752: 2 pieces · $800", "Payment received — 2 pieces · Fonkiart"]);
  assert.equal(mail.sent.some(m => RECEIVED.test(m.subject)), false, "no 'Order Received' or 'New Order' email, ever");
  for (const m of mail.sent) assert.deepEqual(readSlot(m.htmlContent).titles, ["Frida the manatee", "Madame Mango"], `${m.to}: its own pieces at the top`);
});

test("paid another way after all (cart-other): its card page is closed, then the 'order received' pair goes out ONCE, exactly as for an order placed with Zelle", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout({ couponCode: "FK-1111-2222" }));
  const mail = mailbox();
  assert.deepEqual(await cartOther(db, otherWay(first, "zelle"), mail), { ok: true, ref: "FA-1752" });
  assert.equal(stripe.sessions.get(first.session).status, "expired", "the card page can't take money any more");
  assert.equal(stripe.sessions.size, 1, "no page made");

  // To the letter, the pair an order placed with Zelle at these prices gets (opOrder).
  const zelle = mailbox();
  await opOrder(shop(), checkout({ couponCode: "FK-1111-2222", items: first.lines, total: first.total }), zelle);
  assert.deepEqual(mail.sent.map(m => [m.to, m.subject]), [["jane@x.co", "Order Received — 2 items · Fonkiart"], ["shop@fonkiart.com", "🎨 New Order FA-1752: 2 items — Jane Smith"]]);
  assert.deepEqual(mail.sent, zelle.sent, "the same two emails, word for word");
  for (const m of mail.sent) assert.deepEqual(readSlot(m.htmlContent).titles, ["Frida the manatee", "Madame Mango"], `${m.to}: its own pieces at the top`);
  for (const t of ["FA-1752", "$425", "$255", "$680", "15% coupon applied", "1 Main, Miami, FL, 33101, USA"]) assert.ok(mail.sent[0].htmlContent.includes(t), t);

  // The rows say how it is being paid; still Pending: Andy marks it Paid once the money is in.
  assert.deepEqual(cartRows(db).map(r => [r.status, r.notes]), [0, 1].map(() => ["pending", "Order Ref: FA-1752 · Jane Smith · 305 555 0100 · 1 Main, Miami, FL, 33101, USA · 15% coupon applied · Paying by Zelle"]));

  // A second tap, a second tab, another way: nothing more is sent or saved.
  const later = mailbox();
  assert.deepEqual(await cartOther(db, otherWay(first, "venmo"), later), { ok: true, ref: "FA-1752" });
  assert.equal(later.sent.length, 0, "no second email");
  assert.ok(cartRows(db).every(r => r.notes.endsWith(" · Paying by Zelle")));
  assert.equal(inserts(db), 1, "still ONE order");
});

test("paid another way: the same checks as paying again (reference, rows, email, the cart's own pieces, every row Pending), and only Zelle, Venmo or Cash App", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  const mail = mailbox();
  for (const [label, over] of [
    ["another email", { email: "someone@x.co" }],
    ["another reference", { ref: "FA-1753" }],
    ["titles that aren't the rows'", { titles: ["Frida the manatee", "Sea Turtle Print"] }],
    ["one title fewer", { titles: ["Frida the manatee"] }],
    ["a row that isn't there", { ids: [first.ids[0], 999999] }],
    ["no ids", { ids: undefined }],
    ["a page Stripe doesn't have", { session: "cs_test_nosuchpage0000000000" }],
    ["not a page id", { session: "https://evil.example/" }],
  ]) {
    await assert.rejects(cartOther(db, otherWay(first, "zelle", over), mail), (e) => e.status === 404 && e.message === "We couldn't find that order.", label);
  }
  for (const method of [undefined, "", "card", "paypal", "Zelle", "toString", "__proto__", ["zelle"]]) {
    await assert.rejects(cartOther(db, otherWay(first, method), mail), (e) => e.status === 400 && e.message === "Bad payment method", String(method));
  }
  for (const [label, change] of [["cancelled by the shop", "cancelled"], ["confirmed on an invoice", "confirmed"]]) {
    cartRows(db)[0].status = change;
    await assert.rejects(cartOther(db, otherWay(first, "zelle"), mail), (e) => e.status === 409 && e.message === "This order can't be paid here any more. Please contact Fonkiart.", label);
  }
  assert.equal(mail.sent.length, 0, "nothing sent");
  assert.equal(stripe.sessions.get(first.session).status, "open", "its page untouched");
  assert.ok(cartRows(db).every(r => r.notes.endsWith(CARD_NOTE)), "nothing noted");
  assert.equal(orderWrites(db).filter(w => w.op === "update").length, 0);

  // Control: the same order, the email in other capitals and spaces, the cart in another order.
  cartRows(db)[0].status = "pending";
  assert.deepEqual(await cartOther(db, otherWay(first, "cashapp", { email: " Jane@X.co ", titles: ["Madame Mango", "Frida the manatee"] }), mail), { ok: true, ref: "FA-1752" });
  assert.equal(mail.sent.length, 2);
});

test("paid another way, but the card page was paid after all: recorded Paid by card with the paid pair only, never an 'order received' email", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  stripe.pay(first.session);
  const mail = mailbox();
  assert.deepEqual(await cartOther(db, otherWay(first, "zelle"), mail), { paid: true, ref: "FA-1752", name: "Jane", lines: TWO, total: 800 });
  assert.deepEqual(cartRows(db).map(r => [r.status, r.paid_method]), [["paid", "card"], ["paid", "card"]]);
  assert.deepEqual(mail.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.equal(mail.sent.some(m => RECEIVED.test(m.subject)), false);
  const later = mailbox();
  assert.equal((await cartOther(db, otherWay(first, "zelle"), later)).paid, true);
  assert.equal(later.sent.length, 0, "no second email");

  // The payment landing between our look at the page and our "close it".
  const racing = fakeStripe({ onExpire: (page) => { Object.assign(page, { status: "complete", payment_status: "paid" }); return { status: 400, message: "Only open Checkout Sessions can be expired", code: "checkout_session_not_open" }; } });
  const db2 = shop();
  const o2 = await cartCard(db2, checkout());
  const mail2 = mailbox();
  assert.equal((await cartOther(db2, otherWay(o2, "venmo"), mail2)).paid, true);
  assert.deepEqual(mail2.sent.map(m => m.to), ["shop@fonkiart.com", "jane@x.co"]);
  assert.ok(cartRows(db2).every(r => r.notes.endsWith(CARD_NOTE)), "not noted as Venmo");
  assert.equal(racing.sessions.size, 1);
});

test("paid another way with Stripe out of reach, or no card page at all: the switch still goes through (the money may be on its way), the pair goes once, and the log says the page closes by itself", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  stripe.down = true;
  logs = [];
  const mail = mailbox();
  assert.deepEqual(await cartOther(db, otherWay(first, "cashapp"), mail), { ok: true, ref: "FA-1752" });
  assert.deepEqual(mail.sent.map(m => m.to), ["jane@x.co", "shop@fonkiart.com"]);
  assert.ok(cartRows(db).every(r => r.notes.endsWith(" · Paying by Cash App")));
  assert.ok(logs.some(l => l.includes("couldn't ask Stripe about FA-1752's card page; it closes by itself within a day")), logs.join("\n"));
  assert.equal(stripe.sessions.get(first.session).status, "open", "Stripe closes it by itself within a day");

  // Stripe answering, but refusing to close the page.
  const stuck = fakeStripe({ onExpire: () => ({ status: 503, message: "Stripe is down", code: "api_error" }) });
  const db2 = shop();
  const o2 = await cartCard(db2, checkout());
  logs = [];
  const mail2 = mailbox();
  assert.deepEqual(await cartOther(db2, otherWay(o2, "zelle"), mail2), { ok: true, ref: "FA-1752" });
  assert.equal(mail2.sent.length, 2);
  assert.ok(logs.some(l => l.includes("couldn't close FA-1752's card page (api_error); it closes by itself within a day")), logs.join("\n"));
  assert.equal(stuck.sessions.get(o2.session).status, "open");

  // No card page at all (Stripe failed as the order was saved), and card payments switched off since.
  const none = fakeStripe();
  none.down = true;
  const db3 = shop();
  const o3 = await cartCard(db3, checkout());
  assert.ok(o3.cardError);
  none.down = false;
  delete process.env.STRIPE_SECRET_KEY;
  const mail3 = mailbox();
  assert.deepEqual(await cartOther(db3, otherWay(o3, "venmo"), mail3), { ok: true, ref: "FA-1752" });
  assert.equal(mail3.sent.length, 2);
  assert.ok(cartRows(db3).every(r => r.notes.endsWith(" · Paying by Venmo")));
});

test("paid another way: an order saved before this rule (its emails went out as it was saved) gets none again, and its card page is still closed", async () => {
  const stripe = fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  for (const r of cartRows(db)) r.notes = r.notes.slice(0, -CARD_NOTE.length); // as saved before 2026-11-18
  const before = cartRows(db).map(r => r.notes);
  const mail = mailbox();
  assert.deepEqual(await cartOther(db, otherWay(first, "zelle"), mail), { ok: true, ref: "FA-1752" });
  assert.equal(stripe.sessions.get(first.session).status, "expired");
  assert.equal(mail.sent.length, 0, "its emails went out long ago");
  assert.deepEqual(cartRows(db).map(r => r.notes), before, "its notes as they were");
});

test("paid another way from two tabs at the very same moment: the notes change once, so ONE pair of emails", async () => {
  fakeStripe();
  const db = shop();
  const first = await cartCard(db, checkout());
  const mail = mailbox();
  const both = await Promise.all([cartOther(db, otherWay(first, "zelle"), mail), cartOther(db, otherWay(first, "venmo"), mail)]);
  assert.deepEqual(both, [{ ok: true, ref: "FA-1752" }, { ok: true, ref: "FA-1752" }]);
  assert.deepEqual(mail.sent.map(m => m.to), ["jane@x.co", "shop@fonkiart.com"]);
  const noted = orderWrites(db).filter(w => w.op === "update" && "notes" in w.payload);
  assert.deepEqual(noted.map(w => w.ids.length).sort(), [0, 2], "both tried; only one of them changed the rows");
});

// ── the router and the emails ───────────────────────────────────

test("router: cart-card, cart-paid, cart-again, cart-order and cart-other are store ops, POST only; the plain order op is unchanged", async () => {
  for (const op of ["cart-card", "cart-paid", "cart-again", "cart-order", "cart-other"]) {
    assert.equal(typeof STORE_OPS[op], "function", op);
    assert.equal(GET_OPS.has(op), false, op);
  }
  // The plain "order" op (Zelle, Venmo, Cash App) still saves the browser's order as before and
  // answers the same; nothing from a browser can hand it a price function.
  const db = shop();
  assert.deepEqual(await STORE_OPS.order(db, { body: checkout({ price: () => { throw new Error("never called"); } }) }, mailbox()), { ok: true, saved: true });
  assert.deepEqual(cartRows(db).map(r => r.amount), [1, 1]);
  assert.deepEqual(await opOrder(shop(), checkout(), mailbox()), { ok: true, saved: true });
});

test("the cart emails escape every title and read right for one piece", () => {
  const view = { ref: "FA-1752", lines: [{ title: "Sun & <Sea>", amount: 1200 }], total: 1200, name: "Jane" };
  const buyer = cartReceived(view), shopMail = cartPaidShop({ ...view, who: "Jane <Smith>", email: "jane@x.co" });
  for (const html of [buyer, shopMail]) {
    assert.ok(html.includes("Sun &amp; &lt;Sea&gt;"));
    assert.ok(!html.includes("<Sea>"));
    assert.ok(html.includes("$1,200"));
  }
  assert.ok(shopMail.includes("Jane &lt;Smith&gt;"));
  assert.match(buyer, /payment of <strong>\$1,200<\/strong> for <strong>Sun &amp; &lt;Sea&gt;<\/strong>/);
  assert.match(shopMail, /already marked the order <strong>Paid<\/strong>\. Ship it/);
  // Nothing under 16px (Andy, 2026-11-17).
  for (const html of [buyer, shopMail]) for (const [, px] of html.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px) >= 16, `font-size ${px}px`);
});
