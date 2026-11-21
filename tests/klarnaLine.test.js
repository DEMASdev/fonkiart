// Klarna's "pay in 4" line under the price on a piece's page (Andy, 2026-11-21: "Yes, add it"):
// Stripe's Payment Method Messaging Element (src/lib/klarnaLine.js), drawn by
// src/components/KlarnaLine.jsx inside src/components/ArtworkModal.jsx, and the server op that
// hands it the shop's PUBLIC key (op "klarna-line", api/_lib/storeOps.js).
//  1. The line sits right under the price and above ADD TO CART, only for a piece that can be
//     bought at a price, and Stripe gets the price the page shows, in cents.
//  2. Stripe.js failing, the op failing or saying no, or Stripe.js refusing: nothing is mounted,
//     nothing takes room, and nothing is thrown at the page.
//  3. The op answers the key only while the card form can open; otherwise null.
//  4. No key in any log, the server's or the page's.
//  5. Asked for only once a piece's page opens, never by the home page or the shop grid.
// Stripe is never called: window.Stripe is a stand-in that records what the page asks of it, and
// so is the server, except where the real /api/store handler answers (fake keys, no database
// read). The .jsx files are compiled with the project's own Vite and run by a small stand-in for
// React (as tests/checkout-flow.test.js does). Fake data only.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { transformWithOxc } from "vite";
import handler from "../api/store.js";
import { toCents } from "../api/_lib/stripe.js";

// The line's own code, imported as the page has it. Where it is missing (8d85f29), every test that
// needs it fails saying so, and the control below fails for the reason it is there.
let loadError = null;
const klarna = await import("../src/lib/klarnaLine.js").catch((e) => { loadError = e; return null; });
const need = () => {
  if (!klarna) throw new Error(`src/lib/klarnaLine.js didn't load: ${loadError?.message}`);
  return klarna;
};

// Fake keys, each with a mark at its start and its end, so a whole key, its start or its end in a
// log or an answer is caught. Built from pieces ON PURPOSE: GitHub refuses any push whose text
// holds something shaped like a real Stripe key. Do not join them back into one string.
const SK_LIVE = ["sk", "live", "SKHEADv3Mq72nYc8xB1dT5wSKTAIL"].join("_");
const SK_TEST = ["rk", "test", "RKHEADt6Lp14sQe9nH2uJ7aRKTAIL"].join("_");
const PK_LIVE = ["pk", "live", "PKHEADj8Wd25fGh3jN6pY1sPKTAIL"].join("_");
const PK_TEST = ["pk", "test", "PTHEADq4Xc81vBn2kL7rT3qPTTAIL"].join("_");
const PK = PK_TEST; // what the stand-in server answers the page
const KEYS = [SK_LIVE, SK_TEST, PK_LIVE, PK_TEST];
const ENV = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

// ── a small stand-in for React ──────────────────────────────
// Enough for these two files: state kept per call position between draws, and each effect run
// after a draw when its inputs changed (its cleanup first), as React does. A component inside the
// tree (Pic, KlarnaLine) is not run: each test sees exactly what its own file drew.
const FRAGMENT = Symbol("Fragment");
const element = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
const runtime = { jsx: element, jsxs: element, Fragment: FRAGMENT };
let drawing = null;
const hooks = {
  useState(init) {
    const it = drawing, i = it.at++;
    if (!(i in it.slots)) it.slots[i] = { value: typeof init === "function" ? init() : init };
    const slot = it.slots[i];
    return [slot.value, (v) => { if (!it.gone) slot.value = typeof v === "function" ? v(slot.value) : v; }];
  },
  useEffect(run, deps) {
    const it = drawing, i = it.at++, old = it.slots[i];
    if (old && deps.length === old.deps.length && deps.every((d, k) => Object.is(d, old.deps[k]))) return;
    const fx = it.slots[i] = { effect: true, run, deps, cleanup: old?.cleanup };
    it.due.push(fx);
  },
};
const React = new Proxy(hooks, { get(t, name) { if (name in t) return t[name]; throw new Error(`the test's stand-in React has no ${String(name)}`); } });
// One component: draw() runs it, then its effects that are due; unmount() runs every cleanup, as
// React does when it leaves the screen. A state change shows at the next draw().
function render(Component, props) {
  const it = { slots: [], due: [], at: 0, gone: false };
  return {
    draw() {
      it.at = 0; drawing = it;
      let tree;
      try { tree = Component(props); } finally { drawing = null; }
      for (const fx of it.due.splice(0)) { fx.cleanup?.(); const c = fx.run(); fx.cleanup = typeof c === "function" ? c : null; }
      return tree;
    },
    unmount() { it.gone = true; for (const s of it.slots) if (s?.effect) s.cleanup?.(); },
  };
}
// The elements of a drawn tree, in page order; and the text in one.
const kids = (node) => [node?.props?.children].flat(Infinity).filter(n => n && typeof n === "object");
const inOrder = (node, out = []) => { out.push(node); for (const k of kids(node)) inOrder(k, out); return out; };
const textOf = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(textOf).join("") : "");

// Each import of the file becomes a read from the stand-ins given here; an import this test has no
// stand-in for fails loudly instead of being skipped. Every load is a fresh copy of the file.
globalThis.__klarnaTest = {};
let loads = 0;
async function load(file, given) {
  const src = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const { code } = await transformWithOxc(src, file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const id = `${file}#${++loads}`;
  globalThis.__klarnaTest[id] = given;
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    if (!m || (!m[1] && !m[2])) throw new Error(`${file}: can't read the import line: ${line}`);
    const mod = `globalThis.__klarnaTest[${JSON.stringify(id)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  assert.doesNotMatch(body, /^\s*import[\s{]/m, `${file}: an import was left unread`);
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${body}\n// ${id}`)}`)).default;
}

// A piece's page (ArtworkModal), with stand-ins for its picture and for the line, so the test sees
// exactly where the page puts the line and what price it hands it.
function Pic() { return null; }
function KlarnaLineStandIn() { return null; }
const ArtworkModal = await load("components/ArtworkModal.jsx", {
  react: React, "react/jsx-runtime": runtime, "./Pic": { default: Pic },
  "./KlarnaLine": { default: KlarnaLineStandIn }, "../lib/klarnaLine": klarna ?? {},
});
const piece = (over = {}) => ({ id: "t1", title: "Test Tide", category: "Ocean", description: "A test piece.", medium: "Acrylic on canvas", dimensions: "24 × 36 in", image: "https://img.example.test/t.jpg", images: [], price: 1200, salePrice: null, ...over });
// The piece's page as drawn: the row of things in its info panel, where the price is in that row,
// and every Klarna line anywhere on it.
function piecePage(props) {
  const tree = render(ArtworkModal, { onClose() {}, ...props }).draw();
  const info = inOrder(tree).find(n => n.props?.className === "modal-info");
  const row = kids(info);
  const at = row.findIndex(n => inOrder(n).some(m => m.props?.className === "modal-price"));
  return { row, at, lines: inOrder(tree).filter(n => n.type === KlarnaLineStandIn), buy: inOrder(tree).find(n => n.props?.className === "buy-btn") };
}
const hasBuyButton = (node) => inOrder(node).some(n => n.type === "button" && n.props.className === "buy-btn");

// ── the stand-ins: the server, Stripe.js, the browser ───────
let steps = []; // what the line asked for, in order: "key" (the op), "Stripe.js", "Stripe" (an instance)
const settle = async () => { for (let k = 0; k < 10; k++) await new Promise(r => setImmediate(r)); };

// The server's op "klarna-line" as the page asks it (storeCall). Each answer is what one call gets:
// an answer, an Error (storeCall throws for a 4xx/5xx or no network), or a promise of an answer.
// The last answer repeats.
function fakeAsk(...answers) {
  if (!answers.length) answers = [{ publishableKey: PK }];
  const asks = [];
  const ask = async (op, payload) => {
    asks.push({ op, payload });
    steps.push("key");
    const answer = await answers[Math.min(asks.length - 1, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  ask.asks = asks;
  return ask;
}
// Loading Stripe.js (stripeJsReady): it loads (true), it can't (false), or a promise of either.
function fakeReady(loads = true) {
  const ready = async () => { ready.calls++; steps.push("Stripe.js"); return loads; };
  ready.calls = 0;
  return ready;
}

// ResizeObserver as browsers have it: it reports a box once when it starts watching it, then each
// time the box changes size, until disconnect.
const observers = new Set();
class FakeResizeObserver {
  constructor(report) { this.report = report; this.boxes = new Set(); observers.add(this); }
  observe(box) { this.boxes.add(box); setImmediate(() => { if (this.boxes.has(box)) this.report([{ target: box }], this); }); }
  disconnect() { this.boxes.clear(); observers.delete(this); }
}
const resized = (box) => { for (const o of observers) if (o.boxes.has(box)) o.report([{ target: box }], o); };
const emptyBox = () => ({ offsetHeight: 0 }); // the empty element under the price

// Stripe.js as the line uses it: Stripe(key) -> elements({ fonts, appearance }) ->
// create("paymentMethodMessaging", options) -> mount(box) / destroy(). Once mounted, Stripe draws
// Klarna's words a moment later and the box becomes `shows` pixels tall (0: Klarna doesn't take
// this price, so Stripe draws nothing); later: true waits for draw() instead. refuse: "key"
// (Stripe(key) throws, as for a key it won't take), "create" or "mount" (that step throws). Each
// refusal's words carry the key, as Stripe.js's own errors may: a log of them would show it.
function fakeStripeJs({ shows = 26, later = false, refuse = null } = {}) {
  const log = { instances: [], groups: [], made: [] };
  const no = (step, key) => Object.assign(new Error(`Stripe.js refused ${step} for ${key}`), { name: "IntegrationError" });
  const paint = (line) => { if (line.box && !line.destroyed) { line.box.offsetHeight = shows; resized(line.box); } };
  log.draw = () => log.made.forEach(paint);
  globalThis.window = {
    Stripe(key) {
      steps.push("Stripe");
      if (refuse === "key") throw no("the key", key);
      log.instances.push(key);
      return {
        elements(group) {
          log.groups.push(group);
          return {
            create(type, options) {
              if (refuse === "create") throw no("the line", key);
              const line = { type, options, box: null, destroyed: false };
              log.made.push(line);
              return {
                mount(box) {
                  if (refuse === "mount") throw no("the box", key);
                  line.box = box;
                  if (!later) setImmediate(() => paint(line));
                },
                destroy() { line.destroyed = true; },
              };
            },
          };
        },
      };
    },
  };
  return log;
}
const mounted = (log) => log.made.filter(l => l.box && !l.destroyed);

// Every console line while a test runs, as text (an Error with its words), to look for keys in.
const CONSOLE = ["log", "info", "warn", "error", "debug"];
const realConsole = Object.fromEntries(CONSOLE.map(m => [m, console[m]]));
const show = (x) => (x instanceof Error ? String(x.stack || x) : x !== null && typeof x === "object" ? JSON.stringify(x) : String(x));
let heard = [];
const captureLogs = () => { for (const m of CONSOLE) console[m] = (...a) => heard.push(a.map(show).join(" ")); return heard; };
// Anything in a text that is, or comes from, a key: a key's start, a start or end mark, or any 6
// characters of what follows its start (its tail: every key of a mode starts the same way).
const MARKS = /(sk|rk|pk)_(live|test)|SKHEAD|SKTAIL|RKHEAD|RKTAIL|PKHEAD|PKTAIL|PTHEAD|PTTAIL/;
const runs = (v) => Array.from({ length: Math.max(0, v.length - 5) }, (_, i) => v.slice(i, i + 6));
const tail = (key) => key.split("_").slice(2).join("_");
const leaked = (text) => MARKS.exec(text)?.[0] ?? KEYS.flatMap(k => runs(tail(k))).find(r => text.includes(r)) ?? null;
// ...and only a SECRET key's: the public key may be in an answer, a secret one never.
const secretIn = (text) => /(sk|rk)_(live|test)|SKHEAD|SKTAIL|RKHEAD|RKTAIL/.exec(text)?.[0]
  ?? [SK_LIVE, SK_TEST].flatMap(k => runs(tail(k))).find(r => text.includes(r)) ?? null;

// The real /api/store handler, as a browser asks it. No table is read: the store client is made
// but never used (a fake address nothing listens on).
async function askStore({ sk, pk, method = "POST", op = "klarna-line" }) {
  if (sk === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = sk;
  if (pk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = pk;
  const res = { code: 0, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, query: { op }, body: {} }, res);
  return { code: res.code, body: res.body, text: JSON.stringify(res.body) };
}

const saved = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = ["sb", "secret", "FAKEFORTESTS"].join("_");
  steps = []; heard = [];
  globalThis.ResizeObserver = FakeResizeObserver;
  delete globalThis.window;
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  Object.assign(console, realConsole);
  observers.clear();
  delete globalThis.ResizeObserver;
  delete globalThis.window;
});

// ── the tests ───────────────────────────────────────────────
test("control, fails on 8d85f29: a piece's page draws Klarna's line right under its price, above ADD TO CART, and the store answers op klarna-line", async () => {
  const { row, at } = piecePage({ item: piece(), onBuy() {} });
  assert.ok(at >= 0, "the price is on the page");
  assert.equal(row[at + 1]?.type, KlarnaLineStandIn, "Klarna's line right under the price");
  assert.equal(row[at + 1].props.cents, 120000, "for the price shown, in cents");
  assert.ok(hasBuyButton(row[at + 2]), "ADD TO CART right under the line");
  const got = await askStore({ sk: SK_LIVE, pk: PK_LIVE });
  assert.equal(got.code, 200, `the store knows op klarna-line (it answered ${got.code} ${got.text})`);
  assert.deepEqual(got.body, { publishableKey: PK_LIVE });
});

test("a piece's page: the line for the price shown, the sale price when on sale, under the whole price; everything else as before", () => {
  for (const [label, item, cents, shown] of [
    ["a price", piece(), 120000, "$1,200"],
    ["on sale: the sale price, under the crossed-out one too", piece({ price: 1500, salePrice: 1200 }), 120000, "$1,200$1,500"],
    ["a price in cents", piece({ price: 99.5 }), 9950, "$99.5"],
    ["a price as the database may hand it, in words", piece({ price: "2400" }), 240000, "$2,400"],
  ]) {
    const { row, at, lines, buy } = piecePage({ item, onBuy() {} });
    assert.equal(lines.length, 1, `${label}: one line`);
    assert.equal(row[at + 1], lines[0], `${label}: right under the price`);
    assert.equal(lines[0].props.cents, cents, `${label}: Stripe gets the price shown, in cents`);
    assert.equal(textOf(row[at]), shown, `${label}: the price itself as before`);
    assert.ok(hasBuyButton(row[at + 2]), `${label}: then ADD TO CART`);
    assert.equal(textOf(buy), "Add to Cart", `${label}: ADD TO CART as before`);
  }
});

test("no line where nothing can be bought at a price: sold, price on request, a price of 0, or a page with no way to buy", () => {
  for (const [label, props] of [
    ["sold (the archive)", { item: piece({ isSold: true }), sold: true }],
    ["sold, even if a buy button were handed in", { item: piece({ isSold: true }), sold: true, onBuy() {} }],
    ["price on request", { item: piece({ price: null }), onBuy() {} }],
    ["a price of 0", { item: piece({ price: 0 }), onBuy() {} }],
    ["no way to buy on this page", { item: piece() }],
  ]) {
    const { lines } = piecePage(props);
    assert.equal(lines.length, 0, `${label}: no line`);
  }
  const { buy } = piecePage({ item: piece({ price: null }), onBuy() {} });
  assert.equal(textOf(buy), "Request Pricing", "price on request: its button as before");
});

test("the amount Stripe is given: the price the page shows, in cents, the sale price when there is one; the same cents the server charges", () => {
  const { priceCents } = need();
  for (const [label, item, cents] of [
    ["a price", { price: 1200 }, 120000],
    ["on sale: the sale price", { price: 1500, salePrice: 1200 }, 120000],
    ["a price in words, as the database may hand it", { price: "1200" }, 120000],
    ["dollars and cents", { price: 19.99 }, 1999],
    ["no sale price", { price: 1200, salePrice: null }, 120000],
    ["a blank sale price", { price: 1200, salePrice: "" }, 120000],
    ["a sale price of 0 is no sale", { price: 1200, salePrice: 0 }, 120000],
    ["price on request", { price: null }, 0],
    ["no price at all", {}, 0],
    ["no piece", undefined, 0],
    ["not a number", { price: "ask us" }, 0],
    ["below zero", { price: -5 }, 0],
  ]) assert.equal(priceCents(item), cents, label);
  for (const p of [1, 35, 99.99, 1200, 1999.5, 2000, 12500]) assert.equal(priceCents({ price: p }), toCents(p), `$${p}: as stripe.js toCents`);
});

test("the line: the shop's key from op klarna-line first, then Stripe.js, then Stripe's messaging element for Klarna, for the price in cents, in the box under the price", async () => {
  const k = need();
  const stripe = fakeStripeJs({ later: true });
  const ask = fakeAsk(), ready = fakeReady(), box = emptyBox(), room = [];
  const stop = k.showKlarnaLine(box, 120000, { ask, ready, onRoom: (r) => room.push(r) });
  await settle();
  assert.deepEqual(ask.asks, [{ op: "klarna-line", payload: undefined }], "the op asked once, with nothing sent");
  assert.deepEqual(steps, ["key", "Stripe.js", "Stripe"], "the key first; only then Stripe.js");
  assert.deepEqual(stripe.instances, [PK], "Stripe.js given the key the server answered");
  assert.deepEqual(stripe.groups, [{ fonts: k.LINE_FONTS, appearance: k.LINE_LOOK }], "the site's font and look");
  assert.equal(stripe.made.length, 1);
  assert.equal(stripe.made[0].type, "paymentMethodMessaging");
  assert.deepEqual(stripe.made[0].options, { amount: 120000, currency: "USD", paymentMethodTypes: ["klarna"], countryCode: "US", logoColor: "color" });
  assert.equal(stripe.made[0].box, box, "in the box under the price");
  assert.ok(!room.includes(true), "no room before Stripe draws Klarna's words");
  stripe.draw(); await settle();
  assert.equal(room.at(-1), true, "room once Klarna's words are there");
  box.offsetHeight = 0; resized(box);
  assert.equal(room.at(-1), false, "and none again if Stripe takes them away");
  stop();
  assert.equal(stripe.made[0].destroyed, true, "the piece's page closed: the line goes");
  assert.equal(room.at(-1), false);
  assert.equal(observers.size, 0, "nothing left watching the box");
});

test("one question per page: the next piece opened uses the same answer and the same Stripe.js; a question that failed is asked again", async () => {
  const k = need();
  const stripe = fakeStripeJs();
  const ask = fakeAsk();
  const first = k.showKlarnaLine(emptyBox(), 120000, { ask, ready: fakeReady() });
  await settle(); first();
  k.showKlarnaLine(emptyBox(), 50000, { ask, ready: fakeReady() });
  await settle();
  assert.equal(ask.asks.length, 1, "asked once for two pieces");
  assert.deepEqual(stripe.instances, [PK], "one Stripe.js instance for the page");
  assert.deepEqual(stripe.made.map(l => l.options.amount), [120000, 50000], "a line for each piece, each with its own price");

  const flaky = fakeAsk(new Error("Store 503"), { publishableKey: PK });
  const again = fakeStripeJs();
  k.showKlarnaLine(emptyBox(), 120000, { ask: flaky, ready: fakeReady() });
  await settle();
  assert.equal(again.made.length, 0, "the server down: no line");
  k.showKlarnaLine(emptyBox(), 120000, { ask: flaky, ready: fakeReady() });
  await settle();
  assert.equal(flaky.asks.length, 2, "asked again for the next piece");
  assert.equal(mounted(again).length, 1, "and the line shows once the server answers");
});

test("nothing mounted, no room and nothing thrown when Stripe.js or the op fails, the op says no, or Stripe.js refuses", async () => {
  const k = need();
  for (const [label, { answer, loads = true, noStripe = false, refuse = null, asksStripeJs }] of [
    ["the op fails (server down, no network)", { answer: new Error("Store 503"), asksStripeJs: false }],
    ["the op says no (the card form isn't set up)", { answer: { publishableKey: null }, asksStripeJs: false }],
    ["the op answers no key at all", { answer: {}, asksStripeJs: false }],
    ["the op answers a blank key", { answer: { publishableKey: "  " }, asksStripeJs: false }],
    ["the op answers something that isn't a key", { answer: { publishableKey: 42 }, asksStripeJs: false }],
    ["Stripe.js can't load (a blocker, no network)", { loads: false, asksStripeJs: true }],
    ["Stripe.js loads, but brings no Stripe", { noStripe: true, asksStripeJs: true }],
    ["Stripe.js refuses the key", { refuse: "key", asksStripeJs: true }],
    ["Stripe.js refuses the line", { refuse: "create", asksStripeJs: true }],
    ["Stripe.js can't put the line in the box", { refuse: "mount", asksStripeJs: true }],
  ]) {
    captureLogs();
    const stripe = fakeStripeJs({ refuse });
    if (noStripe) globalThis.window = {};
    const ask = fakeAsk(answer ?? { publishableKey: PK }), ready = fakeReady(loads), box = emptyBox(), room = [];
    let stop;
    assert.doesNotThrow(() => { stop = k.showKlarnaLine(box, 120000, { ask, ready, onRoom: (r) => room.push(r) }); }, label);
    await settle();
    assert.equal(mounted(stripe).length, 0, `${label}: nothing mounted`);
    assert.equal(box.offsetHeight, 0, `${label}: the box stays empty`);
    assert.ok(!room.includes(true), `${label}: no room, so no gap`);
    assert.equal(ready.calls, asksStripeJs ? 1 : 0, `${label}: Stripe.js ${asksStripeJs ? "asked for" : "never even loaded"}`);
    if (!asksStripeJs) assert.equal(steps.includes("Stripe"), false, `${label}: Stripe never made`);
    assert.doesNotThrow(() => stop(), `${label}: closing the page is fine too`);
    assert.equal(leaked(heard.join("\n")), null, `${label}: no key in the log`);
    steps = []; heard = [];
    Object.assign(console, realConsole);
  }
});

test("nothing asked and nothing mounted with no price, once the page has closed, or in a browser too old to watch the box", async () => {
  const k = need();
  for (const cents of [0, -100, NaN, undefined]) {
    const stripe = fakeStripeJs(), ask = fakeAsk(), ready = fakeReady();
    k.showKlarnaLine(emptyBox(), cents, { ask, ready })();
    await settle();
    assert.deepEqual([ask.asks.length, ready.calls, stripe.made.length], [0, 0, 0], `no price (${cents}): nothing asked`);
  }
  // Closed before the server answers, then before Stripe.js loads: nothing goes on the page.
  let answer, loaded;
  const slowAsk = fakeAsk(new Promise(r => { answer = r; }));
  const early = fakeStripeJs();
  k.showKlarnaLine(emptyBox(), 120000, { ask: slowAsk, ready: fakeReady() })();
  answer({ publishableKey: PK }); await settle();
  assert.equal(early.made.length, 0, "closed before the key came: no line");
  const slowReady = fakeReady(new Promise(r => { loaded = r; }));
  const stop = k.showKlarnaLine(emptyBox(), 120000, { ask: fakeAsk(), ready: slowReady });
  await settle(); stop(); loaded(true); await settle();
  assert.equal(early.made.length, 0, "closed before Stripe.js came: no line");
  // A browser with no ResizeObserver can't tell whether Klarna drew anything: no line, no gap.
  delete globalThis.ResizeObserver;
  const old = fakeStripeJs(), oldAsk = fakeAsk();
  k.showKlarnaLine(emptyBox(), 120000, { ask: oldAsk, ready: fakeReady() });
  await settle();
  assert.deepEqual([oldAsk.asks.length, old.made.length], [0, 0], "too old a browser: nothing asked");
});

test("Klarna doesn't take the price: Stripe draws nothing in the box, and the page leaves no gap", async () => {
  const k = need();
  const stripe = fakeStripeJs({ shows: 0 });
  const room = [];
  k.showKlarnaLine(emptyBox(), 500000, { ask: fakeAsk(), ready: fakeReady(), onRoom: (r) => room.push(r) });
  await settle();
  assert.equal(stripe.made[0].options.amount, 500000, "Stripe was asked for $5,000");
  assert.ok(room.length > 0 && !room.includes(true), "it drew nothing: no room");
});

test("the page's line (KlarnaLine.jsx): an empty box first, asking for nothing; once on the page, Klarna's line in it, and the gap above ADD TO CART only with Klarna's words", async () => {
  const k = need();
  const world = { ask: fakeAsk(), ready: fakeReady() };
  const stripe = fakeStripeJs({ later: true });
  const KlarnaLine = await load("components/KlarnaLine.jsx", {
    react: React, "react/jsx-runtime": runtime, "../lib/klarnaLine": k,
    "../lib/store": { storeCall: (...a) => world.ask(...a) },
    "../lib/stripeJs": { stripeJsReady: (...a) => world.ready(...a) },
  });
  const line = render(KlarnaLine, { cents: 120000 });
  let tree = line.draw();
  assert.deepEqual([tree.type, tree.props.className, tree.props.style], ["div", "klarna-line", undefined], "an empty box, taking no room");
  await settle();
  assert.deepEqual([world.ask.asks.length, world.ready.calls], [0, 0], "nothing asked before the box is on the page");
  const box = emptyBox();
  tree.props.ref(box);
  line.draw(); // React draws again once the box is there, and the line starts
  await settle();
  assert.equal(stripe.made[0]?.box, box, "Klarna's line in the box");
  assert.equal(line.draw().props.style, undefined, "Stripe hasn't drawn Klarna's words yet: no gap");
  stripe.draw(); await settle();
  assert.deepEqual(line.draw().props.style, { marginBottom: 20 }, "Klarna's words there: a 20px gap above ADD TO CART, as under the price");
  line.unmount();
  assert.equal(stripe.made[0].destroyed, true, "the piece's page closed: the line goes");
});

test("the page's line (KlarnaLine.jsx) when Stripe.js can't load or the op fails or says no: an empty box, no gap, nothing thrown", async () => {
  const k = need();
  for (const [label, world] of [
    ["Stripe.js can't load", { ask: fakeAsk(), ready: fakeReady(false) }],
    ["the op fails", { ask: fakeAsk(new Error("Store 500")), ready: fakeReady() }],
    ["the op says no", { ask: fakeAsk({ publishableKey: null }), ready: fakeReady() }],
  ]) {
    const stripe = fakeStripeJs();
    const KlarnaLine = await load("components/KlarnaLine.jsx", {
      react: React, "react/jsx-runtime": runtime, "../lib/klarnaLine": k,
      "../lib/store": { storeCall: (...a) => world.ask(...a) },
      "../lib/stripeJs": { stripeJsReady: (...a) => world.ready(...a) },
    });
    const line = render(KlarnaLine, { cents: 120000 });
    line.draw().props.ref(emptyBox());
    assert.doesNotThrow(() => line.draw(), label);
    await settle();
    assert.equal(mounted(stripe).length, 0, `${label}: nothing mounted`);
    assert.equal(line.draw().props.style, undefined, `${label}: no gap`);
    assert.doesNotThrow(() => line.unmount(), label);
  }
});

test("op klarna-line: the shop's public key while the card form can open, else null; never anything else, and never a secret key", async () => {
  captureLogs(); // the server's own warning for a mismatch, kept out of the test's output (checked below)
  for (const [label, sk, pk, want] of [
    ["card form ready (live)", SK_LIVE, PK_LIVE, PK_LIVE],
    ["card form ready (test)", SK_TEST, PK_TEST, PK_TEST],
    ["spaces around the key are fine", SK_LIVE, ` ${PK_LIVE}\n`, PK_LIVE],
    ["no public key", SK_LIVE, undefined, null],
    ["an empty one", SK_LIVE, "  ", null],
    ["wrapped in quotes", SK_LIVE, `"${PK_LIVE}"`, null],
    ["the SECRET key pasted in its place", SK_LIVE, SK_LIVE, null],
    ["a restricted key pasted in its place", SK_TEST, SK_TEST, null],
    ["live public key, test secret key", SK_TEST, PK_LIVE, null],
    ["test public key, live secret key", SK_LIVE, PK_TEST, null],
    ["card payments off (no secret key)", undefined, PK_LIVE, null],
    ["nothing set", undefined, undefined, null],
  ]) {
    const got = await askStore({ sk, pk });
    assert.equal(got.code, 200, label);
    assert.deepEqual(got.body, { publishableKey: want }, label);
    assert.deepEqual(Object.keys(got.body), ["publishableKey"], `${label}: only the key`);
    assert.equal(secretIn(got.text), null, `${label}: no piece of a secret key`);
  }
  assert.equal(leaked(heard.join("\n")), null, "no key in the server's own warnings");
  const get = await askStore({ sk: SK_LIVE, pk: PK_LIVE, method: "GET" });
  assert.equal(get.code, 405, "only asked by POST, like every other op");
  assert.equal(leaked(get.text), null);
});

test("control: the log check sees a key, the start of one or a piece of one, also inside an Error, and passes a clean line", () => {
  assert.equal(leaked("Klarna line: not shown (IntegrationError)"), null);
  assert.equal(leaked("stripe: STRIPE_PUBLISHABLE_KEY is a live key and STRIPE_SECRET_KEY is not; the Cart's card form can't open"), null);
  assert.notEqual(leaked(PK_LIVE), null, "a whole key");
  assert.notEqual(leaked(`starts ${PK_TEST.slice(0, 7)}`), null, "its start");
  assert.notEqual(leaked(`a piece ${PK_LIVE.slice(12, 18)} of it`), null, "6 characters from its middle");
  assert.equal(secretIn(JSON.stringify({ publishableKey: PK_LIVE })), null, "a public key is not a secret one");
  assert.notEqual(secretIn(JSON.stringify({ publishableKey: SK_LIVE })), null, "a secret key in an answer is seen");
  assert.notEqual(secretIn(`a piece ${SK_TEST.slice(14, 20)} of it`), null, "and 6 characters of one");
  const lines = captureLogs();
  console.warn("Klarna line:", new Error(`Invalid API Key provided: ${PK}`));
  Object.assign(console, realConsole);
  assert.notEqual(leaked(lines.join("\n")), null, "the capture reads an Error's words");
});

test("no key in any log: the server in every setup, and the page's line in every way it can go and fail", async () => {
  const lines = captureLogs();
  for (const [sk, pk] of [[SK_LIVE, PK_LIVE], [SK_TEST, PK_LIVE], [SK_LIVE, PK_TEST], [SK_LIVE, SK_LIVE], [SK_LIVE, `"${PK_LIVE}"`], [undefined, PK_LIVE], [undefined, undefined]]) {
    await askStore({ sk, pk });
  }
  const k = need();
  for (const refuse of [null, "key", "create", "mount"]) {
    fakeStripeJs({ refuse });
    const stop = k.showKlarnaLine(emptyBox(), 120000, { ask: fakeAsk(), ready: fakeReady() });
    await settle(); stop();
  }
  for (const answer of [new Error(`Store 500 ${PK}`), { publishableKey: null }]) {
    fakeStripeJs();
    k.showKlarnaLine(emptyBox(), 120000, { ask: fakeAsk(answer), ready: fakeReady(false) });
    await settle();
  }
  Object.assign(console, realConsole);
  assert.ok(lines.some(l => l.startsWith("stripe: STRIPE_PUBLISHABLE_KEY is a live key")), "the server's own warning was heard: the capture reads it");
  assert.equal(lines.filter(l => l === "Klarna line: not shown (IntegrationError)").length, 3, "the page's own word, once for each refusal, heard too");
  assert.equal(leaked(lines.join("\n")), null, `a key in the log:\n${lines.join("\n")}`);
});

test("asked for only once a piece's page opens: never by the home page or the shop grid", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const walk = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })
    .flatMap(d => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.jsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const files = walk("src");
  assert.ok(files.length > 20 && files.includes("src/pages/HomePage.jsx"), "the scan reads the site's files");
  assert.doesNotMatch(read("index.html"), /js\.stripe\.com/, "no Stripe.js in the page every visitor loads");
  assert.deepEqual(files.filter(f => /from\s+"\.\.?\/(components\/)?KlarnaLine"/.test(read(f))), ["src/components/ArtworkModal.jsx"], "only a piece's page draws the line");
  for (const f of ["src/main.jsx", "src/App.jsx", "src/pages/HomePage.jsx", "src/pages/CatalogPage.jsx", "src/pages/NewCollectionsPage.jsx", "src/pages/SpecialsPage.jsx", "src/pages/CollectionsPage.jsx"]) {
    assert.doesNotMatch(read(f), /stripeJs|klarnaLine|KlarnaLine|klarna-line|js\.stripe\.com/, `${f}: nothing of the line or of Stripe.js`);
  }
  // Every page with a piece's page draws it only once a piece is chosen.
  const withModal = files.filter(f => /<ArtworkModal\b/.test(read(f)));
  assert.ok(withModal.length >= 5, "the pages that open a piece are found");
  for (const f of withModal) assert.match(read(f), /\{\s*(selected|deepModal)\b[^{}]*?&&\s*\(?\s*<ArtworkModal\b/, `${f}: a piece's page only once a piece is chosen`);
});

test("the line looks like the picture Andy approved: DM Sans, dark plum-grey #5b4a5c, 17px and nothing under 16px, on white, with Klarna's own pink badge; no cream or sand", () => {
  const k = need();
  const v = k.LINE_LOOK.variables;
  // The words' colour, measured off the approved picture (fonkiart-previews/2026-11-20/klarna-under-the-price.png).
  const muted = "#5b4a5c";
  assert.equal(v.colorText.toLowerCase(), muted, "Klarna's words in the approved dark plum-grey");
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
  assert.ok(1.05 / (lum(v.colorText.toLowerCase()) + 0.05) >= 4.5, "easy to read on white (at least 4.5:1)");
  assert.equal(v.colorBackground.toLowerCase(), "#ffffff", "on white");
  // Only those two colours: no cream, sand, beige or ivory (Andy, 2026-11-21).
  const colours = Object.entries(v).filter(([name]) => name.startsWith("color")).map(([, c]) => c.toLowerCase());
  assert.deepEqual([...new Set(colours)].sort(), [muted, "#ffffff"].sort());
  assert.match(v.fontFamily, /^DM Sans\b/);
  assert.match(k.LINE_FONTS[0].cssSrc, /^https:\/\/fonts\.googleapis\.com\/css2\?family=DM\+Sans:/, "DM Sans from Google Fonts, as the page has it");
  assert.equal(v.fontSizeBase, "17px", "17px, like the page's text");
  const sizes = Object.entries(v).filter(([name]) => name.startsWith("fontSize"));
  assert.ok(sizes.length >= 5, "every smaller size is set too");
  for (const [name, size] of sizes) assert.ok(/^\d+px$/.test(size) && Number.parseFloat(size) >= 16, `${name}: ${size}, nothing under 16px`);
  assert.equal(k.KLARNA_LINE.logoColor, "color", "Klarna's own pink badge, not Stripe's black logo");
  const jsx = readFileSync(new URL("../src/components/KlarnaLine.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(jsx, /fontSize|#[0-9a-fA-F]{3,8}\b|var\(--|rgba?\(/, "KlarnaLine.jsx sets no size or colour of its own");
});
