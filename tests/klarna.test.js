// Klarna in fonkiart's own card form, for invoices AND the Cart (Andy, 2026-11-20: "Klarna is
// something we should try to push ... little payments"). Until now every page we asked for said
// cards only, with redirect_on_completion "never", which per Stripe disables any way to pay that
// has to leave the page, and Klarna does ("Paying with Klarna redirects customers to Klarna's
// site"). Now: cards and Klarna, "if_required", and a way back to the return paths the site
// already reads. Stripe is never called: fetch is a fake that records what would be sent and
// answers like Stripe. Fake data only; no email is sent.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCheckout, createCartCheckout } from "../api/_lib/stripe.js";
import { STORE_OPS } from "../api/_lib/storeOps.js";
import { readInvoiceParams } from "../src/lib/invoiceView.js";
import { readCardReturn } from "../src/lib/cartOrder.js";

const TOKEN = "85d82763-0000-4000-8000-0000000000aa";
// Fake keys, built in pieces: no key-shaped text in the repo (as tests/card-setup.test.js).
const SK = ["rk", "test", "FAKEKEYFORTESTS"].join("_");
const PK = ["pk", "test", "FAKEPUBLISHABLE"].join("_");
const PICTURE = "https://fonkiart.com/_vercel/image?url=x&w=640&q=75";
const PLACEHOLDER = "{CHECKOUT_SESSION_ID}"; // Stripe's own, swapped for the page's id when it sends the buyer back
const realFetch = globalThis.fetch;
const realWarn = console.warn, realError = console.error, realLog = console.log;
let calls, logs;

// Answers like Stripe: a new page (refuse(body) may answer an error instead), or a page's record.
function fakeStripe({ refuse = () => null, record = {} } = {}) {
  calls = [];
  let made = 0;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? new URLSearchParams(init.body) : null;
    calls.push({ url: String(url), method: init.method, body, raw: init.body || "" });
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
    if (init.method === "POST" && String(url).endsWith("/checkout/sessions")) {
      const no = refuse(body);
      if (no) return reply(no.status, { error: no.error });
      const id = `cs_test_klarna${String(++made).padStart(10, "0")}`;
      return reply(200, { id, client_secret: `${id}_secret_FAKE` });
    }
    const id = String(url).split("/").pop();
    return record[id] ? reply(200, { id, ...record[id] }) : reply(404, { error: { code: "resource_missing", message: "No such checkout.session" } });
  };
}
const posts = () => calls.filter(c => c.method === "POST");
const types = (body) => [...body.keys()].filter(k => k.startsWith("payment_method_types")).map(k => body.get(k));
const without = (body, ...keys) => [...body].filter(([k]) => !keys.some(x => k.startsWith(x)));

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = SK;
  process.env.STRIPE_PUBLISHABLE_KEY = PK;
  delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL;
  logs = [];
  console.warn = console.error = console.log = (...a) => logs.push(a.map(String).join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, { warn: realWarn, error: realError, log: realLog });
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "VERCEL_ENV", "VERCEL_URL"]) delete process.env[k];
});

const order = (over = {}) => ({
  id: 21, invoice_token: TOKEN, invoice_approved: true, status: "confirmed", item_title: "Frida the manatee",
  amount: 450, client_name: "Ana Lopez", client_email: "ana@example.com", payment_methods: "zelle,stripe",
  created_at: "2026-11-17T21:19:56.080514+00:00", ...over,
});
const LINES = [{ title: "Frida the manatee", amount: 500, image: PICTURE }, { title: "Madame Mango", amount: 300, image: PICTURE }];
const invoicePage = () => createCheckout({ order: order(), invNum: "FA-261117161956080", image: PICTURE });
const cartPage = () => createCartCheckout({ ref: "FA-1752", ids: [41, 42], lines: LINES, email: "jane@x.co" });
const BOTH = [
  ["invoice", invoicePage, `https://fonkiart.com/?invoice=${TOKEN}&card=${PLACEHOLDER}`],
  ["cart", cartPage, `https://fonkiart.com/?cart=FA-1752&card=${PLACEHOLDER}`],
];

test("the card form offers cards AND Klarna, for invoices and the Cart: 'if_required', and a way back on the site's own return path", async () => {
  for (const [label, make, back] of BOTH) {
    fakeStripe();
    const made = await make();
    assert.match(made.id, /^cs_test_klarna/, label);
    assert.equal(posts().length, 1, `${label}: asked once`);
    const { body, raw } = posts()[0];
    assert.deepEqual(types(body), ["card", "klarna"], `${label}: cards and Klarna, nothing else`);
    assert.equal(body.get("ui_mode"), "embedded", `${label}: still inside fonkiart.com`);
    assert.equal(body.get("redirect_on_completion"), "if_required", `${label}: a card stays; only Klarna leaves`);
    assert.equal(body.get("return_url"), back, `${label}: the way back`);
    // As the form field goes to Stripe: the whole address encoded once, so Stripe reads the literal
    // placeholder back ("card={CHECKOUT_SESSION_ID}"), never an already-encoded copy of it.
    assert.ok(raw.includes("card%3D%7BCHECKOUT_SESSION_ID%7D"), `${label}: Stripe's literal placeholder, sent as a form field`);
    assert.equal(raw.includes("%257B"), false, `${label}: not encoded twice`);
    for (const k of ["success_url", "cancel_url"]) assert.equal(body.has(k), false, `${label}: never Stripe's own page (${k})`);
  }
});

test("the way back is the shop's own address (as Stripe's own pages had it), NEVER one a browser sends", async () => {
  fakeStripe();
  await createCheckout({ order: order(), invNum: "FA-1", image: PICTURE, site: "https://evil.example" });
  await createCartCheckout({ ref: "FA-1752", ids: [41], lines: LINES.slice(0, 1), email: "jane@x.co", site: "https://evil.example" });
  for (const { body } of posts()) assert.match(body.get("return_url"), /^https:\/\/fonkiart\.com\/\?/, "an address handed in is ignored");
  // A preview deployment comes back to itself, as the old pages did (site.js); production to fonkiart.com.
  process.env.VERCEL_ENV = "preview"; process.env.VERCEL_URL = "fonkiart-git-x-demas.vercel.app";
  fakeStripe();
  await invoicePage();
  assert.equal(posts()[0].body.get("return_url"), `https://fonkiart-git-x-demas.vercel.app/?invoice=${TOKEN}&card=${PLACEHOLDER}`);
  process.env.VERCEL_ENV = "production";
  fakeStripe();
  await cartPage();
  assert.equal(posts()[0].body.get("return_url"), `https://fonkiart.com/?cart=FA-1752&card=${PLACEHOLDER}`);
  // Through the store's own ops: whatever the browser adds, the same address.
  delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL;
  fakeStripe();
  const db = fakeDb({ Orders: [order()], Artworks: [] });
  await STORE_OPS["card-checkout"](db, { body: { token: TOKEN, embedded: true, site: "https://evil.example", return_url: "https://evil.example/x" } }, mailbox());
  assert.equal(posts()[0].body.get("return_url"), `https://fonkiart.com/?invoice=${TOKEN}&card=${PLACEHOLDER}`);
});

test("card payments never break because of Klarna: refused with Klarna (a 400), the page is asked for again cards-only, sent nowhere, exactly as before", async () => {
  const klarnaRefusals = [
    { code: "payment_method_unactivated", param: "payment_method_types", message: "The payment method `klarna` is not activated for your account." },
    { code: "amount_too_large", param: "payment_method_types", message: "The amount is outside the range Klarna supports." },
    { code: "parameter_invalid_empty", message: "Klarna can't be used here." }, // no field named
  ];
  for (const [label, make] of BOTH) {
    for (const error of klarnaRefusals) {
      logs = [];
      fakeStripe({ refuse: (body) => (types(body).includes("klarna") ? { status: 400, error } : null) });
      const made = await make();
      assert.match(made.clientSecret, /_secret_FAKE$/, `${label}/${error.code}: a card form all the same`);
      const [first, second] = posts().map(c => c.body);
      assert.equal(posts().length, 2, `${label}/${error.code}: asked twice`);
      assert.deepEqual(types(second), ["card"], `${label}/${error.code}: cards only`);
      assert.equal(second.get("redirect_on_completion"), "never", `${label}/${error.code}: as before Klarna`);
      assert.equal(second.has("return_url"), false, `${label}/${error.code}: nowhere to send anyone`);
      assert.deepEqual(without(second, "payment_method_types", "redirect_on_completion", "return_url"),
        without(first, "payment_method_types", "redirect_on_completion", "return_url"), `${label}/${error.code}: the picture and everything else the same`);
      assert.ok(logs.some(l => l.includes("asking again with cards only, with pictures")), `${label}: the log says so`);
    }
    // Not a refusal (Stripe down, a bad key): asked once, never retried.
    for (const status of [401, 500]) {
      fakeStripe({ refuse: () => ({ status, error: { code: "x", message: "no" } }) });
      await assert.rejects(make(), (e) => e.httpStatus === status, `${label}: ${status}`);
      assert.equal(posts().length, 1, `${label}: ${status} asked once`);
    }
    // Stripe refuses the PICTURE (it names it): Klarna stays, the picture goes.
    fakeStripe({ refuse: (body) => ([...body.keys()].some(k => k.includes("[images]")) ? { status: 400, error: { code: "url_invalid", param: "line_items[0][price_data][product_data][images][0]", message: "Not a valid URL" } } : null) });
    await make();
    assert.equal(posts().length, 2, `${label}: picture refused, asked twice`);
    assert.deepEqual(types(posts()[1].body), ["card", "klarna"], `${label}: Klarna kept`);
    assert.equal([...posts()[1].body.keys()].some(k => k.includes("[images]")), false, `${label}: no picture`);
    // Stripe refuses everything: Klarna goes, then the picture, then it gives up (at most three asks).
    fakeStripe({ refuse: () => ({ status: 400, error: { code: "x", message: "no" } }) });
    await assert.rejects(make(), (e) => e.httpStatus === 400, `${label}: refused every time`);
    assert.deepEqual(posts().map(c => [types(c.body).join("+"), [...c.body.keys()].some(k => k.includes("[images]"))]), [["card+klarna", true], ["card", true], ["card", false]], `${label}: Klarna first, then the picture`);
  }
});

test("the card path is unchanged: the cards-only page is exactly the page we made before Klarna, and a card is still paid in place (onComplete)", async () => {
  for (const [label, make] of BOTH) {
    fakeStripe({ refuse: (body) => (types(body).includes("klarna") ? { status: 400, error: { code: "payment_method_unactivated", message: "no Klarna" } } : null) });
    await make();
    const [withKlarna, cardsOnly] = posts().map(c => c.body);
    // Klarna changes three fields and nothing else; a card's page is the one made before.
    const diff = [...new Set([...withKlarna.keys(), ...cardsOnly.keys()])].filter(k => withKlarna.get(k) !== cardsOnly.get(k)).sort();
    assert.deepEqual(diff, ["payment_method_types[1]", "redirect_on_completion", "return_url"], label);
    assert.equal(cardsOnly.get("payment_method_types[0]"), "card");
    assert.equal(cardsOnly.get("ui_mode"), "embedded");
  }
  // In the page: the form still gives Stripe.js onComplete, and both pages still ask the server
  // from it. Under "if_required" Stripe.js calls onComplete for a payment that never leaves (a
  // card), exactly as under "never"; only Klarna goes away and comes back.
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/components/CardCheckout.jsx"), /initEmbeddedCheckout\(\{\s*fetchClientSecret: async \(\) => pay\.clientSecret,\s*onComplete: \(\) => \{ if \(!gone\) completed\(\); \},/);
  assert.match(read("src/pages/InvoicePage.jsx"), /onComplete=\{cardComplete\}/);
  assert.match(read("src/pages/InvoicePage.jsx"), /storeCall\("card-paid", \{ token, session: page\.session \}\)/);
});

// ── back from Klarna: the return paths the site already reads ────────────────────────────────

// The address Stripe sends the buyer to, as Stripe makes it: the page's id in place of the placeholder.
const backFrom = (body, id) => new URL(body.get("return_url").replace(PLACEHOLDER, id));

test("back from Klarna on an invoice: ?invoice=<token>&card=<page id>, read by the invoice page, and Paid ONLY when Stripe says paid for the exact amount", async () => {
  fakeStripe();
  const made = await invoicePage();
  const back = backFrom(posts()[0].body, made.id);
  assert.equal(back.origin, "https://fonkiart.com");
  assert.deepEqual(readInvoiceParams(back.search), { token: TOKEN, shopView: false, card: made.id }, "the invoice page's own reader");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\("invoice"\)/, "App opens the invoice page for it");
  assert.match(readFileSync(new URL("../src/pages/InvoicePage.jsx", import.meta.url), "utf8"), /const \{ card \} = readInvoiceParams\(window\.location\.search\);\s*if \(card && !shopView\) \{\s*try \{\s*await storeCall\("card-paid", \{ token, session: card \}\);/, "...which asks card-paid with that page");

  const page = { payment_status: "paid", status: "complete", amount_total: 45000, currency: "usd", metadata: { invoice_token: TOKEN } };
  for (const [label, record, paid] of [
    ["Klarna not paid yet", { ...page, payment_status: "unpaid" }, false],
    ["paid, another amount", { ...page, amount_total: 100 }, false],
    ["paid, another invoice", { ...page, metadata: { invoice_token: "someone-else-0000" } }, false],
    ["paid, for this invoice and amount", page, true],
  ]) {
    fakeStripe({ record: { [made.id]: record } });
    const db = fakeDb({ Orders: [order()], Artworks: [] }), mail = mailbox();
    const out = await STORE_OPS["card-paid"](db, { body: { token: TOKEN, session: made.id } }, mail);
    assert.equal(out.paid, paid, label);
    assert.equal(db.tables.Orders[0].status, paid ? "paid" : "confirmed", `${label}: the order`);
    assert.equal(mail.sent.length, paid ? 2 : 0, `${label}: emails`);
  }
});

test("back from Klarna on a Cart order: ?cart=FA-...&card=<page id>, read by the card return page, and Paid ONLY when Stripe says paid for the exact amount", async () => {
  fakeStripe();
  const made = await cartPage();
  const back = backFrom(posts()[0].body, made.id);
  assert.equal(back.origin, "https://fonkiart.com");
  assert.deepEqual(readCardReturn(back.search), { ref: "FA-1752", session: made.id }, "the site's own reader (App.jsx -> CardReturnPage)");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /useState\(\(\) => readCardReturn\(window\.location\.search\)\)/);
  assert.match(app, /<CardReturnPage orderRef=\{cardReturn\.ref\} session=\{cardReturn\.session\}/);
  assert.match(readFileSync(new URL("../src/pages/CardReturnPage.jsx", import.meta.url), "utf8"), /storeCall\("cart-paid", \{ ref: orderRef, session \}\)/);

  const rows = () => [41, 42].map((id, n) => ({ id, item_title: LINES[n].title, amount: LINES[n].amount, status: "pending", client_email: "jane@x.co", ship_name: "Jane Doe", notes: "Order Ref: FA-1752 · Paying by card" }));
  const page = { status: "complete", payment_status: "paid", amount_total: 80000, currency: "usd", metadata: { cart_ref: "FA-1752", order_ids: "41,42" } };
  for (const [label, record, paid] of [
    ["Klarna not paid yet", { ...page, payment_status: "unpaid" }, false],
    ["paid, another amount", { ...page, amount_total: 500 }, false],
    ["paid, for these rows and amount", page, true],
  ]) {
    fakeStripe({ record: { [made.id]: record } });
    const db = fakeDb({ Orders: rows(), Artworks: [] }), mail = mailbox();
    const out = await STORE_OPS["cart-paid"](db, { body: { ref: "FA-1752", session: made.id } }, mail);
    assert.equal(out.paid, paid, label);
    assert.deepEqual(db.tables.Orders.map(r => r.status), paid ? ["paid", "paid"] : ["pending", "pending"], `${label}: the rows`);
    assert.equal(mail.sent.length, paid ? 2 : 0, `${label}: emails`);
  }
});

// ── fakes ────────────────────────────────────────────────────────────────────────────────────

const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };
// The shop's tables the way supabase-js reads and writes them; filters run when the query is awaited.
function fakeDb(tables) {
  const from = (table) => {
    const rows = (tables[table] ||= []);
    const tests = [];
    let op = "select", payload = null, returning = false, single = false, lim = null;
    const q = {
      select: () => { if (op !== "select") returning = true; return q; },
      update: (v) => { op = "update"; payload = v; return q; },
      insert: (v) => { op = "insert"; payload = v; return q; },
      eq: (k, v) => { tests.push(r => String(r[k]) === String(v)); return q; },
      in: (k, list) => { tests.push(r => list.map(String).includes(String(r[k]))); return q; },
      not: (k, o, v) => { tests.push(r => (v === null ? r[k] != null : r[k] !== v)); return q; },
      ilike: () => q, order: () => q,
      limit: (n) => { lim = n; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok, bad) => Promise.resolve().then(() => {
        const hit = rows.filter(r => tests.every(t => t(r)));
        if (op === "update") { hit.forEach(r => Object.assign(r, payload)); return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null }; }
        if (op === "insert") return { data: null, error: null };
        const out = hit.slice(0, lim ?? undefined).map(r => ({ ...r }));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }).then(ok, bad),
    };
    return q;
  };
  return { from, tables };
}
