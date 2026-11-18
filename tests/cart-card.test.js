// The Cart's card payment (api/_lib/cartCheckout.js): Andy said yes to "Switch the Cart's 'Pay
// by card' button to the same Stripe page your invoices use?", then asked "can it be imbedded
// inside fonkiart instead of sending the customer away ?". Stripe and the database are fakes:
// nothing real is called, no email is sent.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { STORE_OPS, GET_OPS, opOrder } from "../api/_lib/storeOps.js";
import { CARD_SOON, cartPaidFor, isCartPage } from "../api/_lib/cartCheckout.js";
import { cartReceived, cartPaidShop } from "../api/_lib/cartEmails.js";
import { artPrice } from "../api/_lib/artworks.js";
import { publishableKey } from "../api/_lib/stripe.js";

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let logs;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "rk_test_FAKEKEYFORTESTS";
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
// and tells what it knows about one. refuse(body) can answer an error instead of a new page.
function fakeStripe({ refuse } = {}) {
  const sessions = new Map(), calls = [];
  let made = 0;
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? new URLSearchParams(init.body) : null;
    calls.push({ url: String(url), method: init.method, body });
    const path = String(url).replace("https://api.stripe.com/v1", "");
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
  return { calls, sessions, last, pay: (id = last().id, over = {}) => Object.assign(sessions.get(id), { status: "complete", payment_status: "paid" }, over) };
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
// The checkout's order, exactly as the browser sends it, with a browser price of $1 a piece.
const checkout = (over = {}) => ({
  customer: { firstName: "Jane", lastName: "Smith", email: "jane@x.co", phone: "305 555 0100", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  orderRef: "FA-1752",
  couponCode: "",
  items: [{ title: "Frida the manatee", amount: 1 }, { title: "Madame Mango", amount: 1 }],
  total: 2,
  ...over,
});
const cartCard = (db, body, mail = mailbox()) => STORE_OPS["cart-card"](db, { body }, mail);
const cartPaid = (db, body, mail = mailbox()) => STORE_OPS["cart-paid"](db, { body }, mail);
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

  // What the page shows: the server's prices, not the browser's.
  assert.deepEqual(out, { ref: "FA-1752", lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800, url: stripe.last().url });

  // Both "order received" emails, as for Zelle, with the server's prices.
  assert.deepEqual(mail.sent.map(m => m.to), ["jane@x.co", "shop@fonkiart.com"]);
  for (const m of mail.sent) {
    assert.match(m.htmlContent, /Total:<\/strong> \$800|Total: \$800/);
    assert.doesNotMatch(m.htmlContent, /\$2\b|— \$1\b/);
  }
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

// ── inside fonkiart.com, or Stripe's own page ───────────────────

test("with the publishable key set and Stripe.js ready, the card form opens INSIDE fonkiart.com", async () => {
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_FAKEPUBLISHABLE";
  const stripe = fakeStripe();
  const out = await cartCard(shop(), checkout({ embedded: true }));
  const body = stripe.calls[0].body;
  assert.equal(body.get("ui_mode"), "embedded");
  assert.equal(body.get("return_url"), "https://fonkiart.com/?cart=FA-1752&card={CHECKOUT_SESSION_ID}");
  assert.equal(body.has("success_url"), false);
  assert.equal(body.has("cancel_url"), false);
  assert.deepEqual(out, {
    ref: "FA-1752", lines: [{ title: "Frida the manatee", amount: 500 }, { title: "Madame Mango", amount: 300 }], total: 800,
    clientSecret: stripe.last().client_secret, publishableKey: "pk_test_FAKEPUBLISHABLE",
  });
});

test("until the key exists (or Stripe.js isn't there, or the key is the wrong mode), the same order goes to Stripe's own page", async () => {
  for (const [label, pk, embedded] of [
    ["no publishable key yet", undefined, true],
    ["the browser has no Stripe.js", "pk_test_FAKEPUBLISHABLE", undefined],
    ["a live publishable key with a test secret key", "pk_live_FAKEPUBLISHABLE", true],
    ["not a publishable key at all", "sk_test_NOTPUBLIC", true],
  ]) {
    if (pk) process.env.STRIPE_PUBLISHABLE_KEY = pk; else delete process.env.STRIPE_PUBLISHABLE_KEY;
    const stripe = fakeStripe();
    const out = await cartCard(shop(), checkout({ embedded }));
    const body = stripe.calls[0].body;
    assert.equal(body.has("ui_mode"), false, label);
    assert.equal(body.get("success_url"), "https://fonkiart.com/?cart=FA-1752&card={CHECKOUT_SESSION_ID}", label);
    assert.equal(body.get("cancel_url"), "https://fonkiart.com/?cart=FA-1752&card=cancelled", label);
    assert.equal(out.url, stripe.last().url, label);
    assert.equal(out.total, 800, label);
    assert.equal("clientSecret" in out || "publishableKey" in out, false, label);
    assert.doesNotMatch(JSON.stringify(out), /sk_test|rk_test|NOTPUBLIC/, `${label}: no key ever goes to the browser`);
  }
  assert.ok(logs.some(l => /STRIPE_PUBLISHABLE_KEY is a live key/.test(l)), "the mode mismatch is logged");
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

test("Stripe failing after the order is saved: the buyer is told it is saved and how to finish paying", async () => {
  fakeStripe({ refuse: () => ({ status: 503, message: "Stripe is down", code: "api_error" }) });
  const db = shop();
  await assert.rejects(cartCard(db, checkout()), (e) => e.status === 502
    && /Your order FA-1752 is saved, but the card payment couldn't open right now\. Please email shop@fonkiart\.com/.test(e.message));
  assert.equal(cartRows(db).length, 2, "the order stays saved: it can still be paid another way");
});

test("a picture Stripe refuses never stops the payment: the page is made again without pictures", async () => {
  const stripe = fakeStripe({ refuse: (body) => body.has("line_items[0][price_data][product_data][images][0]") ? { status: 400, message: "Invalid URL", code: "url_invalid" } : null });
  const out = await cartCard(shop(), checkout());
  assert.equal(stripe.calls.length, 2);
  assert.equal([...stripe.calls[1].body.keys()].some(k => k.includes("[images]")), false);
  assert.equal(out.url, stripe.last().url);
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

// ── the router and the emails ───────────────────────────────────

test("router: cart-card and cart-paid are store ops, POST only; the plain order op is unchanged", async () => {
  assert.equal(typeof STORE_OPS["cart-card"], "function");
  assert.equal(typeof STORE_OPS["cart-paid"], "function");
  assert.equal(GET_OPS.has("cart-card") || GET_OPS.has("cart-paid"), false);
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
