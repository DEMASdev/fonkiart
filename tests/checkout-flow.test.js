// The checkout (src/components/CheckoutModal.jsx), the Cart page that opens it
// (src/pages/CartPage.jsx) and the Cart's card payment inside fonkiart.com
// (src/components/CardCheckout.jsx, PaidThanks.jsx, src/pages/CardReturnPage.jsx), run from the
// live source files.
//  1. A buyer who pays from the Cart page with Zelle, Venmo or Cash App sees the thank-you
//     screen, with the items and the Order Reference. The cart is emptied the moment the order
//     is placed.
//  2. Card payments OFF: the card button saves NOTHING and says so on the page. A Payment Link
//     in Settings or on a print is not used any more. Andy's standing rule: no browser pop-ups
//     (alert/confirm/prompt).
//  3. Card payments ON (the server and Stripe, api/_lib/cartCheckout.js): the card form opens
//     INSIDE fonkiart.com or not at all, and this tab never leaves (Andy, 2026-11-18: "i don't
//     want to be making the user jump to stripe then back"): Stripe.js first, and if it can't
//     load, or the server can't offer the form, nothing is saved or emailed and a calm word says
//     so. ONE order per cart however the buyer retries (a double tap, closing the card form or
//     the whole checkout, coming back from Stripe's page without paying, a card form that
//     couldn't open). The cart empties only once the server says paid, and the thank-you shows
//     the pieces first. Paid inside the card form, the thank-you shows right there. Continue,
//     with Card chosen, opens the card form at once: no page in between.
//  4. Every thank-you in the Cart page opens at its top, wherever the buyer had scrolled to.
//  5. Leaving and coming back (Andy, 2026-11-19, yes to: "there's no 'saved' message and no order
//     number until they pay, or tap 'I've Sent the Payment' ... When they come back, the checkout
//     looks normal, with their name and address already filled in"): no "saved" and no order
//     number before then, the details filled in again, and still ONE order however it is retried.
// Nothing is saved, emailed or charged: the server (storeCall), Stripe.js and the browser
// (storage, the address bar, window.open) are stand-ins that only record what they were asked.
//
// How it runs: each .jsx file is compiled with the project's own Vite (transformWithOxc) and run
// by the small stand-in for React below. It keeps the two things these tests lean on, as React
// 18+ does them: a component that leaves the screen loses its state, and the state changes of
// one tap land together in one re-render (checked by the first test). Clicks don't bubble (the
// checkout stops them at its box anyway), and a disabled button can't be clicked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import * as cartOrder from "../src/lib/cartOrder.js";
import * as couponSize from "../src/lib/couponSize.js";
import * as invoiceView from "../src/lib/invoiceView.js";
import { CARD_FORM_DOWN } from "../api/_lib/cartCheckout.js";

// ── a small stand-in for React ──────────────────────────────
const FRAGMENT = Symbol("Fragment");
const element = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
let drawing = null; // the component being drawn right now
let drawnRoot = null; // the root whose effects are running right now (its tree is already drawn)

const hooks = {
  useState(init) {
    const inst = drawing, i = inst.next++;
    if (!(i in inst.hooks)) inst.hooks[i] = typeof init === "function" ? init() : init;
    const set = (v) => {
      if (inst.gone) return; // as in React: a component that has left the screen ignores updates
      const next = typeof v === "function" ? v(inst.hooks[i]) : v;
      if (Object.is(next, inst.hooks[i])) return;
      inst.hooks[i] = next;
      inst.root.schedule();
    };
    return [inst.hooks[i], set];
  },
  useEffect(fn, deps) {
    const inst = drawing, i = inst.next++, old = inst.hooks[i];
    if (old && deps && old.deps && deps.length === old.deps.length && deps.every((d, k) => Object.is(d, old.deps[k]))) return;
    const slot = inst.hooks[i] = { effect: true, deps, cleanup: old?.cleanup };
    inst.root.effects.push(() => { slot.cleanup?.(); const c = fn(); slot.cleanup = typeof c === "function" ? c : null; });
  },
  // React runs these before the browser paints; with nothing painted here, the same as useEffect.
  useLayoutEffect(fn, deps) { return hooks.useEffect(fn, deps); },
  useRef(init) {
    const inst = drawing, i = inst.next++;
    if (!(i in inst.hooks)) inst.hooks[i] = { current: init };
    return inst.hooks[i];
  },
  // As React 19.2: the same function every time, always calling the latest one it was given.
  useEffectEvent(fn) {
    const inst = drawing, i = inst.next++;
    const slot = inst.hooks[i] ||= { call: (...args) => slot.fn(...args) };
    slot.fn = fn;
    return slot.call;
  },
};
const React = new Proxy(hooks, { get(t, name) { if (name in t) return t[name]; throw new Error(`the test's stand-in React has no ${String(name)}`); } });

const roots = []; // every one drawn since the last freshWorld()
function createRoot(App, onDraw) {
  const root = { live: new Map(), effects: [], queued: false, tree: null, nodes: new Map() };
  root.schedule = () => {
    if (root.queued) return;
    root.queued = true;
    queueMicrotask(() => { root.queued = false; draw(); });
  };
  function draw() {
    const seen = new Set(), refs = [];
    const expand = (node, path) => {
      if (node == null || typeof node === "boolean") return [];
      if (typeof node === "string" || typeof node === "number") return [String(node)];
      if (Array.isArray(node)) return node.flatMap((n, k) => expand(n, `${path}.${n?.key ?? k}`));
      if (typeof node.type === "function") {
        const id = `${path}/${node.type.name}`;
        let inst = root.live.get(id);
        if (!inst) root.live.set(id, inst = { hooks: [], root, gone: false });
        seen.add(id);
        const outer = drawing;
        drawing = inst; inst.next = 0;
        let out;
        try { out = node.type(node.props); } finally { drawing = outer; }
        return expand(out, id);
      }
      if (node.type === FRAGMENT) return expand(node.props.children, `${path}/#`);
      const { children, ...props } = node.props;
      if (typeof props.ref === "function") refs.push([props.ref, `${path}/${node.type}`]);
      return [{ type: node.type, props, children: expand(children, `${path}/${node.type}`) }];
    };
    root.tree = { type: "#root", props: {}, children: expand(element(App, {}), "") };
    // Callback refs, as React attaches them: once drawn, each gets its element (here, a stand-in).
    for (const [ref, at] of refs) { if (!root.nodes.has(at)) root.nodes.set(at, { id: at }); ref(root.nodes.get(at)); }
    for (const [id, inst] of root.live) {
      if (seen.has(id)) continue;
      inst.gone = true;
      root.live.delete(id);
      for (const h of inst.hooks) if (h?.effect) h.cleanup?.();
    }
    drawnRoot = root;
    for (const run of root.effects.splice(0)) run();
    onDraw?.(root);
  }
  // The page it is on closes: every component leaves the screen.
  root.close = () => {
    for (const inst of root.live.values()) { inst.gone = true; for (const h of inst.hooks) if (h?.effect) h.cleanup?.(); }
    root.live.clear();
  };
  roots.push(root);
  draw();
  return root;
}

// ── reading and using the screen ────────────────────────────
// What a person reads: the marks beside the ways to pay are pictures of the words next to them
// (aria-hidden), so they are not read twice.
const textOf = (n) => typeof n === "string" ? n : n.type === "br" ? "\n" : n.props["aria-hidden"] === "true" ? "" : n.children.map(textOf).join("");
const findAll = (n, want, out = []) => {
  if (typeof n !== "string") { if (want(n)) out.push(n); for (const c of n.children) findAll(c, want, out); }
  return out;
};
// The way back to the ways to pay is drawn in two places in the checkout, and the page's styles show
// one of them (src/index.css, "The way back"; tests/wayBack.test.js): the copy above the art is left
// out here, so this reads what a person sees.
const isWayBack = (n) => typeof n !== "string" && n.props.className === "way-back";
const shown = (n) => typeof n === "string" ? n
  : { ...n, children: n.children.filter(c => !(isWayBack(c) && String(n.props.className).includes("checkout-gallery"))).map(shown) };
const screen = (root) => textOf(shown(root.tree));
function only(root, what, want) {
  const hits = findAll(shown(root.tree), want);
  assert.equal(hits.length, 1, `expected one ${what} on the screen, found ${hits.length}. The screen:\n${screen(root)}`);
  return hits[0];
}
const button = (root, label) => only(root, `"${label}" button`, n => n.type === "button" && textOf(n).trim() === label);
const payOption = (root, label) => only(root, `"${label}" payment option`, n => n.type === "button" && String(n.props.className).includes("pay-row") && textOf(n).includes(label));
const field = (root, autoComplete) => only(root, `${autoComplete} field`, n => n.type === "input" && n.props.autoComplete === autoComplete);
const alerts = (root) => findAll(root.tree, n => n.props.role === "alert");
const statuses = (root) => findAll(root.tree, n => n.props.role === "status").map(textOf);
const buttons = (root) => findAll(shown(root.tree), n => n.type === "button").map(n => textOf(n).trim());
const pics = (root, className) => findAll(root.tree, n => n.type === "img" && n.props.className === className).map(n => n.props.src);
// The details form as the buyer sees it: each field (by its autocomplete name) and what is in it.
const filled = (root) => Object.fromEntries(findAll(root.tree, n => n.type === "input" && n.props.autoComplete && n.props.autoComplete !== "off").map(n => [n.props.autoComplete, n.props.value]));
const FORM = (c) => ({ "given-name": c.firstName, "family-name": c.lastName, email: c.email, tel: c.phone, "street-address": c.address, "address-level2": c.city, "address-level1": c.state, "postal-code": c.zip, "country-name": c.country });
// Nothing of a saved order said, nor its number, before paying (or before "I've Sent the Payment").
const NOT_BEFORE = /is saved|saved order|FA-1739|Order Number/;
function click(node) {
  assert.ok(!node.props.disabled, `"${textOf(node).trim()}" is disabled`);
  node.props.onClick?.({ stopPropagation() {}, preventDefault() {} });
}
const typeIn = (node, value) => node.props.onChange({ target: { value } });
// Lets the stand-in server answer and every re-render run.
const settle = async () => { for (let k = 0; k < 10; k++) await new Promise(r => setImmediate(r)); };

// ── the stand-ins: the server, the browser, Stripe.js ───────
const PRINT = { id: "t1", title: "Test Print Z", price: 1111, category: "Prints", image: "https://img.example.test/z.jpg" };
const PRINT2 = { id: "t2", title: "Test Print Y", price: 120, category: "Prints", image: "https://img.example.test/y.jpg" };
const PRICES = { "Test Print Z": 1000, "Test Print Y": 120 }; // the shop's own prices, which win over the browser's
const NO_LINK = { zelleContact: "shop-zelle@example.com", zelleLabel: "email", venmoHandle: "", cashAppHandle: "", stripeLink: "", couponDiscount: 15 };
const ITS_LINK = "https://pay.example.test/one-print";
const SHOP_LINK = "https://pay.example.test/whole-cart";
const CARD_SOON = "Card payment is being set up. Please use Zelle or contact Fonkiart directly.";
const NOT_NOW = "The card payment couldn't open right now. Please try again in a moment, or choose another way to pay.";
// The details as details() types them (the rest of the form left empty), and as an earlier card
// attempt kept them (savedEarlier: the address too).
const TYPED = { firstName: "Jane", lastName: "Smith", email: "jane@example.com", phone: "", address: "", city: "", state: "", zip: "", country: "" };
const SAVED_DETAILS = { ...TYPED, phone: "+1 305 000 0000", address: "1 Test St", city: "Testville", state: "FL", zip: "33000", country: "USA" };
const GONE = "This checkout had to start over. Your details are still filled in: please check them and tap Continue again.";
const TITLES = ["Test Print Z", "Test Print Y"];
const page = (n) => `cs_test_page${String(n).padStart(8, "0")}`;

// The browser's storage, where the cart's saved card order lives (src/lib/cartOrder.js).
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
};
const kept = () => cartOrder.readCardOrder();

// The shop's server, as api/_lib/cartCheckout.js answers: the card ops save, re-open and report on
// ONE order, priced by the shop, and only ever as the card form inside the page: with no public
// key (pk) or no Stripe.js in the browser, they refuse BEFORE saving anything. world: what the
// test can turn on or off. stripeJs: Stripe.js loads (true), doesn't (false), or a promise still
// loading.
let server, popups, opened, assigned, scrolls;
const everLeft = []; // every time ANY test's checkout tried to send this tab away: never
function freshWorld({ orderFails = false, cardOn = true, pk = true } = {}) {
  for (const r of roots.splice(0)) r.close(); // what an earlier test left open is gone with its world
  popups = []; opened = []; assigned = []; scrolls = [];
  storage.clear();
  freshTrail();
  delete window.Stripe;
  const calls = [];
  const world = { cardOn, pk, stripeJs: true, stripeDown: false, orders: [], pages: new Map(), emails: 0, hold: null, again: null, other: null, cardAnswer: null, orderState: null, paidAnswers: [], lose: null };
  let made = 0;
  const failed = (status, message) => Object.assign(new Error(message), { status });
  const view = (o) => ({ ref: o.ref, ids: o.ids, lines: o.lines, total: o.total });
  const newPage = (o) => {
    const id = page(++made);
    world.pages.set(id, { id, status: "open", ref: o.ref });
    return { session: id, clientSecret: `${id}_secret_FAKE`, publishableKey: "pk_test_FAKE" };
  };
  const noForm = (p) => p.embedded !== true || !world.pk;
  // The saved order the browser names: its reference, rows and email (the one the server last
  // gave, or the one typed last: savedCart), and the cart's own titles.
  const named = (p) => {
    const o = world.orders.find(x => x.ref === p.ref && JSON.stringify(x.ids) === JSON.stringify(p.ids) && [p.email, p.customer?.email?.trim()].includes(x.email)
      && JSON.stringify(x.lines.map(l => l.title).sort()) === JSON.stringify([...(p.titles || [])].sort()));
    if (!o || o.gone) throw failed(404, "We couldn't find that order.");
    return o;
  };
  // The details the checkout sends again go on the order's rows (withDetails).
  const takeDetails = (o, p) => { if (p.customer) { o.email = p.customer.email.trim(); o.customer = p.customer; } };
  const self = server = {
    calls, world, failed, view,
    orders: () => calls.filter(c => c.op === "order").map(c => c.payload),
    asked: (op) => calls.filter(c => c.op === op).map(c => c.payload),
    async call(op, payload) {
      calls.push({ op, payload });
      if (world.hold && op !== "next-ref") await world.hold;
      // lose: the server does all of it, and the answer never reaches the browser.
      if (world.lose === op) { world.lose = null; await self.answer(op, payload); throw new Error("the answer never arrived"); }
      return self.answer(op, payload);
    },
    async answer(op, payload) {
      if (op === "next-ref") return { ref: "FA-1739" };
      // Which of Stripe's ways it can open (src/lib/payWays.js): by default as today's server, which says nothing.
      if (op === "card-setup") return world.setup || { card: true, form: true, why: null };
      if (op === "order") { if (orderFails) throw new Error("Store 500"); world.emails += 2; return { ok: true }; }
      if (op === "cart-card") {
        if (!world.cardOn) throw failed(409, CARD_SOON);
        if (noForm(payload)) throw failed(409, CARD_FORM_DOWN);
        if (orderFails) throw new Error("Store 500");
        // A coupon the checkout sends counts (it sends one only once the shop said valid): 15% off each piece.
        const coupon = payload.couponCode || "";
        const lines = payload.items.map(i => ({ title: i.title, amount: Math.round(PRICES[i.title] * (coupon ? 0.85 : 1)) }));
        const o = { ref: "FA-1739", ids: lines.map((_, n) => 5001 + n), email: payload.customer.email.trim(), lines, total: lines.reduce((sum, l) => sum + l.amount, 0), status: "pending", customer: payload.customer };
        world.orders.push(o); // no email: a card order's emails wait until it is paid
        const took = coupon ? { coupon } : {};
        if (world.cardAnswer) return world.cardAnswer(o);
        if (world.stripeDown) return { ...view(o), ...took, cardError: NOT_NOW };
        return { ...view(o), ...took, ...newPage(o) };
      }
      if (op === "cart-again") {
        if (!world.cardOn) throw failed(409, CARD_SOON);
        const o = named(payload);
        if (world.again) return world.again(o);
        if (o.status === "paid") return { paid: true, ...view(o), name: "Jane" };
        if (noForm(payload)) throw failed(409, CARD_FORM_DOWN);
        const last = world.pages.get(payload.session);
        if (last?.status === "open") last.status = "expired";
        if (world.stripeDown) throw failed(502, NOT_NOW); // no new page: nothing written
        const made = newPage(o);
        takeDetails(o, payload); // once the new page is made
        return { ...view(o), email: o.email, ...made };
      }
      if (op === "cart-other") {
        if (world.other) return world.other(payload);
        const o = named(payload);
        if (o.status === "paid") return { paid: true, ...view(o), name: "Jane" };
        takeDetails(o, payload);
        const last = world.pages.get(payload.session);
        if (last?.status === "open") last.status = "expired";
        if (!o.way) { o.way = payload.method; o.mailedTo = o.email; world.emails += 2; } // the "order received" pair, once
        return { ok: true, ref: o.ref };
      }
      if (op === "cart-order") {
        if (world.orderState === "down") throw failed(502, NOT_NOW);
        if (world.orderState === "gone") throw failed(404, "We couldn't find that order.");
        const o = named(payload);
        const state = world.orderState || (o.status === "paid" ? "paid" : "open");
        return state === "closed" ? { state } : { state, ...view(o), name: "Jane", ...(state === "open" ? { email: o.email } : {}) };
      }
      if (op === "cart-paid") {
        const answer = world.paidAnswers.shift();
        if (typeof answer === "number") throw failed(answer, answer === 404 ? "We couldn't find that payment." : `Store ${answer}`);
        return answer;
      }
      throw new Error(`the checkout asked the server for "${op}"`);
    },
  };
}
// An order an earlier card attempt saved: on the server, and kept in this browser with its last
// page and the details as typed then. customer: null, an order kept before the details were.
function savedEarlier(cart, { customer = SAVED_DETAILS } = {}) {
  const lines = cart.map(i => ({ title: i.title, amount: PRICES[i.title] }));
  const o = { ref: "FA-1739", ids: lines.map((_, n) => 5001 + n), email: "jane@example.com", lines, total: lines.reduce((sum, l) => sum + l.amount, 0), status: "pending" };
  server.world.orders.push(o);
  server.world.pages.set(page(0), { id: page(0), status: "open", ref: o.ref });
  cartOrder.saveCardOrder({ ...o, session: page(0), ...(customer ? { customer } : {}) });
  return o;
}
const savedBody = (o, session = page(0), customer = SAVED_DETAILS) => ({ ref: o.ref, ids: o.ids, email: o.email, titles: TITLES, session, ...(customer ? { customer } : {}) });

globalThis.window = {
  open: (url, target) => { opened.push({ url, target }); everLeft.push(url); return null; },
  // This tab going anywhere (to Stripe's own page, say), and what the browser had kept then.
  location: { origin: "https://www.fonkiart.com", assign: (url) => { assigned.push({ url, session: kept()?.session }); everLeft.push(url); } },
  // The page scrolled, and which thank-you was on the screen by then (card: PaidThanks; another way: "Thank you!").
  scrollTo: (x, y) => {
    const text = drawnRoot ? screen(drawnRoot) : "";
    scrolls.push({ to: [x, y], thanks: /Congratulations, you made it yours!/.test(text) ? "paid" : /Thank you!/.test(text) ? "placed" : null });
  },
  // The browser's history, as a browser keeps it: a new entry drops the ones ahead of it, and Back
  // tells the page (popstate) once it has moved. trail.back(): the buyer presses Back.
  addEventListener: (type, fn) => { if (type === "popstate") trail.listeners.add(fn); },
  removeEventListener: (type, fn) => { trail.listeners.delete(fn); },
  history: {
    get state() { return trail.entries[trail.at]; },
    pushState: (state) => { trail.entries.splice(trail.at + 1, Infinity, state); trail.at++; },
    replaceState: (state) => { trail.entries[trail.at] = state; },
    back: () => { queueMicrotask(() => trail.back()); },
  },
};
let trail;
function freshTrail() {
  trail = {
    entries: [{ page: "catalog" }, { page: "cart" }], at: 1, listeners: new Set(), left: 0,
    back() {
      if (trail.at === 0) { trail.left++; return; }
      trail.at--;
      for (const fn of [...trail.listeners]) fn({ state: trail.entries[trail.at] });
    },
  };
}
freshTrail();
for (const name of ["alert", "confirm", "prompt"]) globalThis[name] = (message) => { popups.push({ name, message }); };

// Stripe.js as it behaves: one embedded form on a page at a time (another is refused until the
// first is destroyed); the form asks for its secret, then goes into its box. Paying in it
// (log.pay) calls the onComplete it was made with, as Stripe.js does once the page is paid, and
// nothing else: paid by card, a page made with redirect_on_completion "if_required" sends nobody
// anywhere (only Klarna leaves, for Klarna's own site). refuse: Stripe.js is there but won't make
// the form (a wrong key, say).
function fakeStripeJs({ refuse = false } = {}) {
  const log = [];
  let live = 0, form = null;
  window.Stripe = (pk) => ({
    async initEmbeddedCheckout({ fetchClientSecret, onComplete }) {
      if (refuse) throw new Error("Invalid publishable key");
      if (live) throw new Error("You cannot have multiple Embedded Checkout objects.");
      live++;
      const secret = await fetchClientSecret();
      log.push({ init: secret, pk, kept: kept()?.session });
      const made = form = { secret, onComplete, mounted: false, gone: false };
      return {
        mount: (box) => { made.mounted = true; log.push({ mount: typeof box?.id }); },
        destroy: () => { live--; made.gone = true; log.push({ destroy: secret }); },
      };
    },
  });
  Object.defineProperty(log, "pay", {
    value: () => {
      if (!form?.mounted || form.gone) throw new Error("no card form on the page to pay in");
      log.push({ paid: form.secret });
      form.onComplete?.();
    },
  });
  return log;
}
const quiet = async (fn) => { const warn = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = warn; } };

// Each import of the file becomes a read from the stand-ins given here; an import this test
// has no stand-in for fails loudly instead of being skipped.
globalThis.__checkoutTest = {};
async function load(file, given) {
  const src = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const { code } = await transformWithOxc(src, file, { lang: "jsx", jsx: { runtime: "automatic" } });
  globalThis.__checkoutTest[file] = given;
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    if (!m || (!m[1] && !m[2])) throw new Error(`${file}: can't read the import line: ${line}`);
    const mod = `globalThis.__checkoutTest[${JSON.stringify(file)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  assert.doesNotMatch(body, /^\s*import[\s{]/m, `${file}: an import was left unread`);
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
const runtime = { jsx: element, jsxs: element, Fragment: FRAGMENT };
const Pic = function Pic({ src, alt, className }) { return element("img", { src, alt, className }); };
const store = { storeCall: (...a) => server.call(...a) };
const stripeJs = { stripeJsReady: () => Promise.resolve(server.world.stripeJs) };
const payWays = await import("../src/lib/payWays.js");
const PayMarks = await load("components/PayMarks.jsx", { "react/jsx-runtime": runtime });
const PayRows = await load("components/PayRows.jsx", { "react/jsx-runtime": runtime, "./PayMarks": { default: PayMarks } });
const PayArt = await load("components/PayArt.jsx", { "react/jsx-runtime": runtime, "./Pic": { default: Pic }, "../lib/invoiceView": invoiceView });
const PaidThanks = await load("components/PaidThanks.jsx", { "react/jsx-runtime": runtime, "./PayArt": { default: PayArt }, "../lib/invoiceView": invoiceView });
const WayBack = await load("components/WayBack.jsx", { "react/jsx-runtime": runtime });
const payTries = await import("../src/lib/payTries.js");
const backInside = await import("../src/lib/backInside.js");
const CardCheckout = await load("components/CardCheckout.jsx", { react: React, "react/jsx-runtime": runtime, "./PayArt": { default: PayArt }, "./WayBack": { default: WayBack } });
const CheckoutModal = await load("components/CheckoutModal.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/supabase": { BREVO_SENDER: "shop@example.com" },
  "../lib/store": store, "../lib/stripeJs": stripeJs, "../lib/cartOrder": cartOrder, "../lib/couponSize": couponSize,
  "./CardCheckout": { default: CardCheckout }, "./PaidThanks": { default: PaidThanks }, "./Pic": { default: Pic },
  "./PayRows": { default: PayRows }, "../lib/payWays": payWays,
  "./WayBack": { default: WayBack }, "../lib/payTries": payTries, "../lib/backInside": backInside,
});
const CartPage = await load("pages/CartPage.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/store": store, "../lib/cartOrder": cartOrder,
  "../components/ArtworkModal": { default: function ArtworkModal() { return null; } },
  "../components/CheckoutModal": { default: CheckoutModal },
  "../components/PaidThanks": { default: PaidThanks },
  "../components/Pic": { default: Pic },
});
const CardReturnPage = await load("pages/CardReturnPage.jsx", {
  react: React, "react/jsx-runtime": runtime, "../lib/store": store, "../components/PaidThanks": { default: PaidThanks },
});

// The shop around the Cart page, as App.jsx has it: the cart lives above the page, removeFromCart
// drops one item through a functional update, and a card payment found paid takes exactly its
// pieces out and forgets the kept order (App.jsx paidCart).
function openShop(cart, { settings = NO_LINK, cancelledRef, artworks = [], startCheckout } = {}) {
  const log = { pages: [], draws: [], paid: [], started: 0 };
  function Shop() {
    const [inCart, setCart] = React.useState(cart);
    const [shown, setPage] = React.useState("cart");
    log.cart = inCart; log.page = shown;
    if (shown !== "cart") return element("main", { children: `The ${shown} page` });
    return element(CartPage, {
      cart: inCart, items: artworks, settings, cancelledRef, startCheckout, onStarted: () => { log.started++; },
      removeFromCart: (id) => setCart(prev => prev.filter(i => i.id !== id)),
      addToCart: (item) => setCart(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]),
      setPage: (p) => { log.pages.push(p); setPage(p); },
      onPaid: (titles) => { log.paid.push(titles); cartOrder.dropCardOrder(); setCart(prev => cartOrder.withoutTitles(prev, titles)); },
    });
  }
  const root = createRoot(Shop, (r) => log.draws.push({ cart: log.cart.length, thanks: screen(r).includes("Thank you!") }));
  return { root, log };
}
// Continue with Card chosen opens the card form at once: no page in between, no second tap.
async function fillIn(root, method) {
  await details(root);
  await choose(root, method);
}
async function details(root) {
  typeIn(field(root, "given-name"), "Jane");
  typeIn(field(root, "family-name"), "Smith");
  typeIn(field(root, "email"), "jane@example.com");
  await settle();
}
async function choose(root, method) {
  await pick(root, method);
  click(button(root, "Continue →")); await settle();
}
// The checkout asks one thing per step (src/components/CheckoutModal.jsx): 1, where to send it; 2, how
// to pay; 3, the payment. A way to pay is picked on step 2, so from step 1 Continue goes there first.
const payOptions = (root) => findAll(root.tree, n => n.type === "button" && String(n.props.className).includes("pay-row"));
async function pick(root, method) {
  if (!payOptions(root).length) { click(button(root, "Continue →")); await settle(); }
  click(payOption(root, method)); await settle();
}
// The thank-you once paid by card (PaidThanks): the pieces first, then the Order Reference.
function assertPaidThanks(root) {
  const text = screen(root);
  assert.match(text, /Congratulations, you made it yours!/);
  assert.match(text, /Hi Jane, here is your order from Fonkiart\./);
  assert.match(text, /Test Print Z\$1,000Test Print Y\$120Total Paid\$1,120/, "the pieces, then the total paid");
  assert.match(text, /Order ReferenceFA-1739Also in your confirmation email/);
  assert.match(text, /Thank you for your payment!Paid by card ✓/);
  assert.deepEqual(pics(root, "pay-art-pic"), [PRINT.image, PRINT2.image], "each piece's picture");
}

// ── the tests ───────────────────────────────────────────────
test("control: the stand-in React drops a component's state when it leaves the screen, and draws one tap's changes in one go", async () => {
  let draws = 0, setShow, setA, setB;
  function Counter() { const [n, setN] = React.useState(0); setB = setN; return element("b", { children: String(n) }); }
  function Top() {
    const [show, s1] = React.useState(true);
    const [a, s2] = React.useState(0);
    setShow = s1; setA = s2; draws++;
    return element("div", { children: [String(a), show ? element(Counter, {}) : null] });
  }
  const root = createRoot(Top);
  setB(5); await settle();
  assert.equal(screen(root), "05");
  setA(1); setA(n => n + 1); setB(7); await settle();
  assert.equal(screen(root), "27");
  assert.equal(draws, 3, "three changes from one tap: one re-render");
  setShow(false); await settle(); setShow(true); await settle();
  assert.equal(screen(root), "20", "back on the screen, it starts over");
});

test("control: the stand-in's useRef keeps its box, useEffectEvent always calls the latest function, and a callback ref gets its element once", async () => {
  const seen = [];
  let bump, refBox, calls = 0;
  function Top() {
    const [n, setN] = React.useState(0);
    bump = () => setN(v => v + 1);
    const box = React.useRef("first");
    refBox ??= box;
    const latest = React.useEffectEvent(() => seen.push(n));
    const reached = n >= 1;
    React.useEffect(() => { latest(); }, [reached]); // runs on the first draw and once n reaches 1
    return element("div", { ref: () => { calls++; }, children: String(n) });
  }
  const root = createRoot(Top);
  bump(); await settle(); bump(); await settle();
  assert.equal(screen(root), "2");
  assert.equal(refBox.current, "first");
  assert.deepEqual(seen, [0, 1], "the effect event saw the value of its own draw");
  assert.equal(calls, 3, "a callback ref is given the element on each draw (the same one)");
  assert.equal(root.nodes.size, 1);
});

test("Cart page: after the order is placed, the thank-you screen names the order and shows its reference; the cart is already empty", async () => {
  freshWorld();
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Zelle");
  click(button(root, "✓ I've Sent the Payment")); await settle();

  const saved = server.orders();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].orderRef, "FA-1739");
  assert.deepEqual(saved[0].items, [{ title: "Test Print Z", amount: 1111 }, { title: "Test Print Y", amount: 120 }]);
  const text = screen(root);
  assert.match(text, /Thank you!/);
  assert.match(text, /Your order for 2 items has been received\./);
  assert.match(text, /Order Reference\s*FA-1739\s*Also in your confirmation email/);
  // Emptied in the same moment: the very first screen that thanks the buyer has an empty cart behind it.
  assert.deepEqual(log.draws.find(d => d.thanks), { cart: 0, thanks: true });
  assert.deepEqual(log.cart, []);
  assert.deepEqual(scrolls, [...Array(3).fill({ to: [0, 0], thanks: null }), { to: [0, 0], thanks: "placed" }], "each step opens at the top of the page (the checkout, how to pay, the payment), and so does the thank-you (the buyer tapped at the bottom of the payment panel), once it is drawn");
  assert.deepEqual(log.pages, [], "it stays on the thank-you screen until Close");

  click(button(root, "Close")); await settle();
  assert.deepEqual(log.pages, ["catalog"]);
  assert.equal(screen(root), "The catalog page");
  assert.equal(server.orders().length, 1, "Close saves nothing more");
  assert.deepEqual(popups, []);
});

test("Cart page: one print: the thank-you screen names it", async () => {
  freshWorld();
  const { root, log } = openShop([PRINT]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Venmo");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.match(screen(root), /Your order for Test Print Z has been received\./);
  assert.equal(log.cart.length, 0);
});

test("Cart page: closing the checkout before placing the order just closes it", async () => {
  freshWorld();
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  click(button(root, "✕")); await settle();
  assert.match(screen(root), /Your Cart \(2\)/);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Zelle");
  click(button(root, "✕")); await settle();
  assert.match(screen(root), /Your Cart \(2\)/);
  assert.deepEqual(log.pages, []);
  assert.equal(log.cart.length, 2);
  assert.deepEqual(server.orders(), []);
});

test("Cart page: if the order can't be saved, there's no thank-you, the cart is kept, and the buyer is told on the page", async () => {
  await quiet(async () => {
    // Card: Continue itself asks for the card form (no second button to tap).
    for (const [method, pay, op] of [["Zelle", "✓ I've Sent the Payment", "order"], ["Card", null, "cart-card"]]) {
      freshWorld({ orderFails: true });
      const { root, log } = openShop([PRINT, PRINT2], { settings: { ...NO_LINK, stripeLink: SHOP_LINK } });
      click(button(root, "Checkout →")); await settle();
      await fillIn(root, method);
      if (pay) { click(button(root, pay)); await settle(); }
      assert.equal(server.asked(op).length, 1, `${method}: it tried once`);
      assert.doesNotMatch(screen(root), /Thank you/);
      assert.equal(log.cart.length, 2, `${method}: the cart is kept`);
      assert.deepEqual(log.pages, []);
      assert.deepEqual([opened, assigned], [[], []], `${method}: no card page opened`);
      assert.equal(kept(), null, `${method}: nothing kept to pay again`);
      // Zelle: said after "I've Sent the Payment", with the number to write to the shop with. Card:
      // before paying, so no number (the card form never opened).
      assert.deepEqual(alerts(root).map(textOf), [pay ? "We couldn't save your order. Please email shop@example.com with your order number FA-1739." : NOT_NOW], method);
      if (!pay) assert.doesNotMatch(screen(root), NOT_BEFORE, "card: no order number before paying");
    }
  });
});

for (const [what, cart, settings] of [
  ["two prints, no Payment Link anywhere", [PRINT, PRINT2], NO_LINK],
  ["one print with a Payment Link of its own", [{ ...PRINT, stripeLink: ITS_LINK }], NO_LINK],
  ["two prints and the shop's Payment Link in Settings", [PRINT, PRINT2], { ...NO_LINK, stripeLink: SHOP_LINK }],
]) {
  test(`card payments OFF (${what}): nothing saved, no pop-up, the words on the payment step; then Zelle saves ONE order`, async () => {
    await quiet(async () => {
      freshWorld({ cardOn: false });
      const { root, log } = openShop(cart, { settings });
      click(button(root, "Checkout →")); await settle();
      // Measured, not changed: the Card option is offered even while card payments are off.
      await fillIn(root, "Card");
      assert.equal(server.asked("cart-card").length, 1);
      assert.deepEqual([server.world.orders, server.world.emails], [[], 0], "no order saved, no email");
      assert.equal(kept(), null, "nothing kept");
      assert.deepEqual(popups, [], "no browser pop-up");
      assert.deepEqual([opened, assigned], [[], []], "no Payment Link and no page opened");
      const shown = alerts(root);
      assert.equal(shown.length, 1, "one message, said to screen readers too (role=alert)");
      assert.equal(shown[0].type, "p");
      assert.equal(textOf(shown[0]), CARD_SOON);
      assert.equal(shown[0].props.style.fontSize, 16);
      assert.equal(shown[0].props.style.color, "#c0392b");
      assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Try Again", "Choose Another Way to Pay"], "still on the payment step: another way, or Try Again");
      assert.doesNotMatch(screen(root), /Thank you/);
      assert.equal(log.cart.length, cart.length, "the cart is untouched");

      click(button(root, "← Choose another way to pay")); await settle();
      assert.deepEqual(alerts(root), [], "the message goes with the card");
      await choose(root, "Zelle");
      assert.deepEqual(alerts(root), [], "Continue clears the message");
      click(button(root, "✓ I've Sent the Payment")); await settle();
      assert.equal(server.orders().length, 1, "ONE order, not two");
      assert.match(screen(root), /Thank you!/);
      assert.equal(log.cart.length, 0);
      assert.deepEqual(popups, []);
    });
  });
}

// Andy's own test, 2026-11-18: the shop's public key was malformed, and the Cart sent him to
// Stripe's page. Now he stays, nothing is saved, and every other way to pay is still there.
test("NO JUMP: the server can't offer the card form (its public key missing or malformed): nothing saved or emailed, a calm word in place, Try Again and another way to pay", async () => {
  await quiet(async () => {
    freshWorld({ pk: false });
    const stripe = fakeStripeJs();
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");
    assert.doesNotMatch(screen(root), /Secure Credit Card via Stripe|securely by card, through Stripe|Pay Securely/, "no page in between: Continue asked for the card form itself");

    const [asked] = server.asked("cart-card");
    assert.deepEqual([asked.embedded, "site" in asked, asked.orderRef], [true, false, "FA-1739"], "Stripe.js was ready, so the server was asked (no return address: the server gives Stripe the shop's own)");
    assert.deepEqual([server.world.orders, server.world.emails], [[], 0], "no order saved, no email");
    assert.equal(kept(), null, "nothing kept");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN], "said calmly, in place");
    assert.deepEqual(alerts(root), [], "not an alarm");
    assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Try Again", "Choose Another Way to Pay"]);
    assert.deepEqual([assigned, opened, stripe], [[], [], []], "this tab never left, and no form was made");
    assert.equal(log.cart.length, 2, "the cart is untouched");
    assert.doesNotMatch(screen(root), /Thank you|Stripe's secure page|Stripe's own/);

    // Another way to pay: the details are still there, and Zelle saves ONE order, as always.
    click(button(root, "Choose Another Way to Pay")); await settle();
    assert.deepEqual(statuses(root), [], "the word goes with it");
    assert.ok(payOption(root, "Zelle"), "straight back to how to pay: nothing to type again");
    click(button(root, "← Back")); await settle();
    assert.equal(field(root, "email").props.value, "jane@example.com", "the details, a step back, still there");
    await choose(root, "Zelle");
    click(button(root, "✓ I've Sent the Payment")); await settle();
    assert.deepEqual([server.orders().length, server.world.emails], [1, 2]);
    assert.match(screen(root), /Thank you!/);
    assert.deepEqual([assigned, opened, popups], [[], [], []]);
  });
});

test("NO JUMP: even an answer naming Stripe's own page (an older server) is never followed: the order kept, a calm word, Try Again", async () => {
  await quiet(async () => {
    freshWorld();
    server.world.cardAnswer = (o) => ({ ...server.view(o), session: page(9), url: `https://checkout.stripe.example/c/pay/${page(9)}` });
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");
    assert.deepEqual([assigned, opened], [[], []], "this tab stays on fonkiart.com");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.equal(kept().session, page(9), "the saved order, kept to pay again in the form");
    assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Try Again", "Choose Another Way to Pay"]);
    assert.equal(log.cart.length, 2);
  });
});

test("NO JUMP: the server can't offer the form, then can (the key fixed): Try Again saves the order and opens the form in place", async () => {
  await quiet(async () => {
    freshWorld({ pk: false });
    const stripe = fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");
    click(button(root, "Try Again")); await settle();
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN], "still not: still nothing saved");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length], [2, 0]);

    server.world.pk = true;
    click(button(root, "Try Again")); await settle();
    assert.deepEqual(stripe, [{ init: `${page(1)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(1) }, { mount: "string" }], "kept, then made, then put in its box");
    assert.doesNotMatch(screen(root), NOT_BEFORE, "the card form, and no order number above it");
    assert.deepEqual(statuses(root), [], "the calm word is gone, and the form is in");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [3, 1, 0]);
    assert.deepEqual(assigned, []);
  });
});

test("card: a double tap on Continue makes ONE call; until the form is there the buyer sees 'Opening the secure card form…', with nothing to tap twice", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await details(root);
  await pick(root, "Card");
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  const go = button(root, "Continue →");
  click(go); click(go); // the same button twice, before the page can draw again
  await settle();
  assert.equal(server.asked("cart-card").length, 1);
  assert.deepEqual(statuses(root), ["Opening the secure card form…"]);
  assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay"], "no pay button to tap again; the way back is there the whole time");
  answer(); server.world.hold = null; await settle();
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "the form, in place");
  assert.deepEqual([server.world.orders.length, server.world.emails, assigned], [1, 0, []]);
});

test("card: Stripe.js comes FIRST: while it loads nothing is asked of the server (nothing saved), and the buyer sees 'Opening the secure card form…'", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  let loaded;
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  server.world.stripeJs = new Promise(r => { loaded = r; });
  await fillIn(root, "Card");
  assert.deepEqual(statuses(root), ["Opening the secure card form…"]);
  assert.deepEqual(server.asked("cart-card"), [], "nothing saved while Stripe.js loads");
  loaded(true); await settle();
  assert.equal(server.asked("cart-card").length, 1);
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  assert.deepEqual(assigned, []);
});

// The buyer walks away while the card payment is on its way (Stripe.js can take up to 15 s).
test("card: closing the checkout while Stripe.js loads: nothing is asked of the server (no order, no email), nothing kept, and no card form opens", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  let loaded;
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  server.world.stripeJs = new Promise(r => { loaded = r; });
  await fillIn(root, "Card");
  assert.deepEqual(statuses(root), ["Opening the secure card form…"]);
  click(button(root, "✕")); await settle();
  assert.match(screen(root), /Your Cart \(2\)/, "the checkout is closed");
  loaded(true); await settle();
  assert.deepEqual(server.asked("cart-card"), [], "the buyer walked away: no order saved, no email");
  assert.deepEqual([server.world.orders, kept(), stripe], [[], null, []], "nothing kept, no form made");
  assert.deepEqual([assigned, opened, log.cart.length], [[], [], 2]);
  click(button(root, "Checkout →")); await settle();
  assert.ok(field(root, "email"), "opened again, it starts afresh");
  assert.doesNotMatch(screen(root), /is saved/);
});

test("card: closing the checkout while the server saves the order: kept for next time (still ONE order), and no card form opens in a closed checkout", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  await fillIn(root, "Card");
  assert.equal(server.asked("cart-card").length, 1);
  click(button(root, "✕")); await settle();
  answer(); server.world.hold = null; await settle();
  assert.deepEqual(stripe, [], "no form made");
  assert.deepEqual([kept().ref, kept().session], ["FA-1739", page(1)], "kept: opening the checkout again pays THIS order");
  assert.equal(log.cart.length, 2);

  click(button(root, "Checkout →")); await settle();
  assert.doesNotMatch(screen(root), NOT_BEFORE, "the checkout looks as it always does");
  assert.deepEqual(filled(root), FORM(TYPED), "the details, filled in as typed");
  await choose(root, "Card");
  assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length, server.world.emails], [1, 1, 1, 0], "never a second order");
  assert.equal(server.world.pages.get(page(1)).status, "expired", "the page made as it closed can't take money any more");
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  assert.deepEqual(assigned, []);
});

// Andy: "after view card / checkout / pay with card ... jumps into another useless page ... instead
// of just going into the CC page". Continue, with Card chosen, IS the way into the card form.
test("STRAIGHT IN: Continue with Card chosen opens the card form at once: 'Opening the secure card form…', then the form; no page in between, no 'Pay Securely with Card →'", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  let loaded;
  server.world.stripeJs = new Promise(r => { loaded = r; });
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Card");
  assert.deepEqual(statuses(root), ["Opening the secure card form…"], "on its way, and said so");
  assert.deepEqual(scrolls, Array(3).fill({ to: [0, 0], thanks: null }), "each step at the top of the page (the checkout, how to pay, then the card form), not down where Continue was");
  assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay"], "nothing to tap in between but the way back");
  assert.doesNotMatch(screen(root), /Secure Credit Card via Stripe|securely by card, through Stripe|Pay Securely/, "no page in between");
  loaded(true); await settle();
  assert.equal(server.asked("cart-card").length, 1, "ONE order, asked by Continue itself");
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "the form, in place");
  assert.equal(stripe[0].init, `${page(1)}_secret_FAKE`);
  assert.doesNotMatch(screen(root), NOT_BEFORE, "no order number above the form (it shows on the thank-you)");
  assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Choose Another Way to Pay"], "the form and the way back, above it and at its end, nothing else");
  assert.deepEqual([assigned, opened, popups], [[], [], []]);
});

test("STRAIGHT IN: '← Choose another way to pay' goes back to the ways to pay (not an empty step); card again re-opens the SAME order, never a second one; another way pays THAT order", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Card");
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);

  click(button(root, "← Choose another way to pay")); await settle();
  assert.deepEqual(stripe.at(-1), { destroy: `${page(1)}_secret_FAKE` }, "the form is gone");
  assert.ok(payOption(root, "Zelle") && payOption(root, "Card") && button(root, "Continue →"), "the ways to pay, and Continue");
  assert.doesNotMatch(screen(root), NOT_BEFORE, "nothing said of a saved order, nor its number");
  assert.deepEqual([statuses(root), alerts(root)], [[], []], "no calm word, no alarm");
  assert.equal(buttons(root).includes("Try Again"), false);
  click(button(root, "← Back")); await settle();
  assert.deepEqual(filled(root), FORM(TYPED), "the details still filled in, a step back");

  await choose(root, "Card");
  assert.deepEqual(server.asked("cart-again"), [{ ...savedBody(server.world.orders[0], page(1), TYPED), embedded: true, way: "card" }], "THAT order, naming the page it just left, with the details as on the screen");
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount", "destroy", "init", "mount"], "straight into the form again");
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [1, 1, 0], "never a second pending order");
  assert.deepEqual([...server.world.pages.values()].map(p => [p.id, p.status]), [[page(1), "expired"], [page(2), "open"]], "only the newest page can take money");

  click(button(root, "← Choose another way to pay")); await settle();
  await choose(root, "Zelle");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual(server.asked("cart-other"), [{ ...savedBody(server.world.orders[0], page(2), TYPED), method: "zelle" }], "THAT order, paid by Zelle");
  assert.deepEqual([server.orders().length, server.world.orders.length, server.world.emails], [0, 1, 2], "no second order; its two emails, now");
  assert.equal(server.world.pages.get(page(2)).status, "expired");
  assert.match(screen(root), /Thank you!/);
  assert.deepEqual([log.cart.length, kept(), assigned], [0, null, []]);
});

test("card form INSIDE the page: the pieces first, then Stripe's form; leaving it or the checkout destroys it, and paying again re-opens the SAME order, naming its last page", async () => {
  await quiet(async () => {
    freshWorld();
    const stripe = fakeStripeJs();
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");

    assert.deepEqual(stripe, [{ init: `${page(1)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(1) }, { mount: "string" }], "kept, then made, then put in its box");
    const text = screen(root);
    assert.doesNotMatch(text, NOT_BEFORE, "no order number before paying");
    assert.match(text, /Test Print Z\$1,000Test Print Y\$120Total\$1,120/, "the shop's own prices");
    assert.doesNotMatch(text, /Opening the secure card form/, "the form is in");
    assert.deepEqual(pics(root, "checkout-piece-pic"), [PRINT.image, PRINT2.image], "the art, on the wall");
    assert.deepEqual(pics(root, "pay-art-pic"), [], "and not again in the card form");
    assert.equal(log.cart.length, 2);

    click(button(root, "← Choose another way to pay")); await settle();
    assert.deepEqual(stripe.at(-1), { destroy: `${page(1)}_secret_FAKE` });
    assert.ok(payOption(root, "Zelle"), "back at the ways to pay");
    assert.doesNotMatch(screen(root), NOT_BEFORE);
    await choose(root, "Card");
    assert.deepEqual(server.asked("cart-again").at(-1), { ...savedBody(server.world.orders[0], page(1), TYPED), embedded: true, way: "card" });
    assert.equal(server.world.pages.get(page(1)).status, "expired");
    assert.deepEqual(stripe.slice(-2), [{ init: `${page(2)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(2) }, { mount: "string" }]);

    // The whole checkout closed with the form open, then opened again.
    click(button(root, "✕")); await settle();
    assert.deepEqual(stripe.at(-1), { destroy: `${page(2)}_secret_FAKE` });
    click(button(root, "Checkout →")); await settle();
    assert.doesNotMatch(screen(root), NOT_BEFORE, "the checkout looks as it always does");
    assert.deepEqual(filled(root), FORM(TYPED), "the details filled in: nothing to type again");
    assert.deepEqual(server.asked("cart-order"), [savedBody(server.world.orders[0], page(2), TYPED)]);
    await choose(root, "Card");
    assert.equal(server.asked("cart-again").at(-1).session, page(2));
    assert.deepEqual(stripe.slice(-2), [{ init: `${page(3)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(3) }, { mount: "string" }]);
    assert.doesNotMatch(screen(root), /couldn't open here/, "Stripe never refused a second form: each one went before the next");

    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [1, 1, 0], "ONE order, and no email until it is paid");
    assert.deepEqual([...server.world.pages.values()].filter(p => p.status === "open").map(p => p.id), [page(3)], "only the newest page can take money");
    assert.equal(log.cart.length, 2);
    click(button(root, "✕")); await settle();
    assert.deepEqual(stripe.at(-1), { destroy: `${page(3)}_secret_FAKE` });
  });
});

test("card form couldn't be made after the order was saved: kept, a calm word (no alarm), 'Try Again' re-opens THAT order, never a second one", async () => {
  await quiet(async () => {
    freshWorld();
    server.world.stripeDown = true;
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");

    assert.deepEqual(statuses(root), [NOT_NOW], "said calmly, with no 'saved' and no number");
    assert.deepEqual(alerts(root), [], "not said as an error");
    assert.equal(kept().session, null, "kept, with no page to name yet");
    assert.ok(button(root, "Try Again"));
    assert.ok(button(root, "Choose Another Way to Pay"));

    click(button(root, "Try Again")); await settle(); // Stripe still away
    assert.equal("session" in server.asked("cart-again").at(-1), false);
    assert.deepEqual(statuses(root), [NOT_NOW]);
    assert.ok(button(root, "Try Again"));

    server.world.stripeDown = false;
    const stripe = fakeStripeJs();
    click(button(root, "Try Again")); await settle();
    assert.deepEqual(stripe, [{ init: `${page(1)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(1) }, { mount: "string" }], "the form, in place");
    assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length, server.world.emails], [1, 2, 1, 0]);
    assert.deepEqual(assigned, []);
    assert.equal(log.cart.length, 2);
  });
});

test("card page couldn't open: 'Choose Another Way to Pay' pays THAT order by Zelle: nothing saved again, and its 'order received' emails go now, once (cart-other)", async () => {
  freshWorld();
  server.world.stripeDown = true;
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Card");
  assert.deepEqual([server.world.orders.length, server.world.emails], [1, 0], "saved, and no email: it isn't paid");
  click(button(root, "Choose Another Way to Pay")); await settle();
  assert.doesNotMatch(screen(root), NOT_BEFORE);
  assert.ok(payOption(root, "Zelle"), "straight back to how to pay");
  click(button(root, "← Back")); await settle();
  assert.deepEqual(filled(root), FORM(TYPED), "the details, a step back, still there");
  await choose(root, "Zelle");
  assert.match(screen(root), /Send \$1,120 to shop-zelle@example\.com/, "the saved order's own total");
  assert.doesNotMatch(screen(root), NOT_BEFORE, "no order number before 'I've Sent the Payment'");
  assert.match(screen(root), /3\. Memo: write Test Print Z \+ 1 more in your Zelle memo\/note/, "the memo names the pieces instead");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  const o = server.world.orders[0];
  assert.deepEqual(server.asked("cart-other"), [{ ref: "FA-1739", ids: o.ids, email: "jane@example.com", titles: TITLES, customer: TYPED, method: "zelle" }], "THAT order (no page to name), paid by Zelle");
  assert.deepEqual([server.orders().length, server.world.orders.length, server.world.emails], [0, 1, 2], "no second order; its two emails, now");
  assert.match(screen(root), /Thank you!/);
  assert.match(screen(root), /FA-1739/);
  assert.equal(log.cart.length, 0);
  assert.equal(kept(), null, "done with");
});

test("a saved card order paid by Venmo instead: a double tap asks once ('Saving…'), its card page is closed and its emails sent once, and the thank-you", async () => {
  freshWorld();
  const o = savedEarlier([PRINT, PRINT2]);
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await choose(root, "Venmo");
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  const sent = button(root, "✓ I've Sent the Payment");
  click(sent); click(sent); // the same button twice, before the page can draw again
  await settle();
  assert.equal(server.asked("cart-other").length, 1, "one call");
  assert.equal(button(root, "Saving…").props.disabled, true, "nothing to tap twice");
  answer(); server.world.hold = null; await settle();
  assert.deepEqual(server.asked("cart-other"), [{ ...savedBody(o), method: "venmo" }], "THAT order, naming its last card page");
  assert.equal(server.world.pages.get(page(0)).status, "expired", "its card page can't take money any more");
  assert.deepEqual([server.orders().length, server.asked("cart-card").length, server.world.orders.length, server.world.emails], [0, 0, 1, 2]);
  assert.match(screen(root), /Thank you!/);
  assert.match(screen(root), /Order Reference\s*FA-1739/);
  assert.deepEqual([log.cart, kept(), popups], [[], null, []]);
});

test("paying a saved card order another way: paid by card after all: the paid thank-you; gone (404): start afresh, said; can't be paid here (409): said, kept; out of reach: said with its number, kept, and the next tap goes through", async () => {
  await quiet(async () => {
    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    const paid = openShop([PRINT, PRINT2]);
    click(button(paid.root, "Checkout →")); await settle();
    await choose(paid.root, "Zelle");
    server.world.orders[0].status = "paid";
    click(button(paid.root, "✓ I've Sent the Payment")); await settle();
    assertPaidThanks(paid.root);
    assert.deepEqual([paid.log.paid, paid.log.cart, kept(), server.world.emails], [[TITLES], [], null, 0], "the paid pair is its confirmation, not these");

    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    const gone = openShop([PRINT, PRINT2]);
    click(button(gone.root, "Checkout →")); await settle();
    await choose(gone.root, "Zelle");
    server.world.orders[0].gone = true;
    click(button(gone.root, "✓ I've Sent the Payment")); await settle();
    assert.ok(screen(gone.root).includes(GONE), "said, with no 'saved' and no number");
    assert.doesNotMatch(screen(gone.root), NOT_BEFORE);
    assert.deepEqual(filled(gone.root), FORM(SAVED_DETAILS), "the details still filled in");
    assert.deepEqual([kept(), gone.log.cart.length], [null, 2]);
    assert.doesNotMatch(screen(gone.root), /Thank you/);

    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    const shut = openShop([PRINT, PRINT2]);
    const NO_MORE = "This order can't be paid here any more. Please contact Fonkiart.";
    server.world.other = () => { throw server.failed(409, NO_MORE); };
    click(button(shut.root, "Checkout →")); await settle();
    await choose(shut.root, "Zelle");
    click(button(shut.root, "✓ I've Sent the Payment")); await settle();
    assert.deepEqual(alerts(shut.root).map(textOf), [NO_MORE]);
    assert.deepEqual([kept().ref, shut.log.cart.length], ["FA-1739", 2]);
    assert.doesNotMatch(screen(shut.root), /Thank you/);

    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    const away = openShop([PRINT, PRINT2]);
    server.world.other = () => { throw server.failed(502, "Store 502"); };
    click(button(away.root, "Checkout →")); await settle();
    await choose(away.root, "Zelle");
    click(button(away.root, "✓ I've Sent the Payment")); await settle();
    assert.deepEqual(alerts(away.root).map(textOf), ["We couldn't record that just now. Your order FA-1739 is saved: please try again in a moment, or email shop@example.com with your order number."]);
    assert.deepEqual([kept().ref, away.log.cart.length, server.world.emails], ["FA-1739", 2, 0]);
    assert.doesNotMatch(screen(away.root), /Thank you/);
    server.world.other = null;
    click(button(away.root, "✓ I've Sent the Payment")); await settle();
    assert.match(screen(away.root), /Thank you!/);
    assert.deepEqual([server.asked("cart-other").length, server.world.emails, kept(), away.log.cart.length], [2, 2, null, 0]);
    assert.deepEqual(popups, []);
  });
});

test("checkout opened again with a saved order: the server is asked once (cart-order), and Continue waits for its answer", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const o = savedEarlier([PRINT, PRINT2]);
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  assert.doesNotMatch(screen(root), NOT_BEFORE, "the checkout looks as it always does");
  assert.deepEqual(filled(root), FORM(SAVED_DETAILS), "with the details as typed then, address too");
  await choose(root, "Card");
  assert.deepEqual([server.asked("cart-again"), stripe, buttons(root).includes("Continue →")], [[], [], true], "Continue waited: still on the ways to pay, nothing asked");
  answer(); server.world.hold = null; await settle();
  click(button(root, "Continue →")); await settle();
  assert.deepEqual(server.asked("cart-order"), [savedBody(o)]);
  assert.equal(server.asked("cart-again")[0].session, page(0), "the last page, named");
  assert.equal(server.world.pages.get(page(0)).status, "expired");
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [0, 1, 0]);
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
});

test("checkout opened again: the saved order is paid by now: the thank-you, pieces first, and the cart empties", async () => {
  freshWorld();
  savedEarlier([PRINT, PRINT2]);
  server.world.orderState = "paid";
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  assertPaidThanks(root);
  assert.deepEqual(log.paid, [TITLES]);
  assert.deepEqual(log.cart, []);
  assert.equal(kept(), null);
  click(button(root, "Continue Shopping →")); await settle();
  assert.deepEqual(log.pages, ["catalog"]);
  assert.deepEqual([server.asked("cart-again").length, server.asked("cart-card").length], [0, 0]);
});

for (const [state, what] of [["closed", "closed by the shop"], ["gone", "unknown to the shop (404)"]]) {
  test(`checkout opened again: the saved order is ${what}: forgotten, the details are asked again, and card saves a NEW order`, async () => {
    await quiet(async () => {
      freshWorld();
      savedEarlier([PRINT, PRINT2]);
      server.world.orderState = state;
      const { root } = openShop([PRINT, PRINT2]);
      click(button(root, "Checkout →")); await settle();
      assert.equal(kept(), null);
      assert.doesNotMatch(screen(root), /is saved/);
      await fillIn(root, "Card");
      assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length], [1, 0, 2]);
    });
  });
}

test("checkout opened again: the server out of reach: the saved order stands, and card still re-opens it", async () => {
  await quiet(async () => {
    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    server.world.orderState = "down";
    const stripe = fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    assert.doesNotMatch(screen(root), NOT_BEFORE);
    assert.deepEqual(filled(root), FORM(SAVED_DETAILS));
    server.world.orderState = null;
    await choose(root, "Card");
    assert.deepEqual([server.asked("cart-again").length, server.asked("cart-card").length, assigned.length], [1, 0, 0]);
    assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  });
});

test("paying again: paid in the meantime: the thank-you and the cart empties; gone (404): start afresh, said; sold since (409): said, the order kept", async () => {
  await quiet(async () => {
    freshWorld();
    const { root, log } = openShop([PRINT, PRINT2]);
    savedEarlier([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await pick(root, "Card");
    server.world.orders[0].status = "paid";
    click(button(root, "Continue →")); await settle();
    assertPaidThanks(root);
    assert.deepEqual([log.paid, log.cart, kept()], [[TITLES], [], null]);

    freshWorld();
    const gone = openShop([PRINT, PRINT2]);
    savedEarlier([PRINT, PRINT2]);
    click(button(gone.root, "Checkout →")); await settle();
    await pick(gone.root, "Card");
    server.world.orders[0].gone = true;
    click(button(gone.root, "Continue →")); await settle();
    assert.ok(screen(gone.root).includes(GONE));
    assert.doesNotMatch(screen(gone.root), NOT_BEFORE);
    assert.deepEqual(filled(gone.root), FORM(SAVED_DETAILS), "the details still filled in");
    assert.equal(kept(), null);

    freshWorld();
    const sold = openShop([PRINT, PRINT2]);
    savedEarlier([PRINT, PRINT2]);
    const SOLD = "“Test Print Z” has already been sold, so this order can't be paid by card. Please contact Fonkiart.";
    server.world.again = () => { throw server.failed(409, SOLD); };
    click(button(sold.root, "Checkout →")); await settle();
    await choose(sold.root, "Card");
    assert.deepEqual(alerts(sold.root).map(textOf), [SOLD]);
    assert.equal(kept().ref, "FA-1739", "still the order to pay another way");
    assert.equal(sold.log.cart.length, 2);
  });
});

test("the card form couldn't open inside the page (Stripe.js refused it): a calm word in place; Try Again re-opens the SAME order's form, never Stripe's page", async () => {
  await quiet(async () => {
    freshWorld();
    fakeStripeJs({ refuse: true });
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(alerts(root), []);
    assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Try Again", "Choose Another Way to Pay"]);
    assert.equal(kept().session, page(1), "the order the server saved, kept to pay again");

    const stripe = fakeStripeJs(); // Stripe.js works again
    click(button(root, "Try Again")); await settle();
    const again = server.asked("cart-again").at(-1);
    assert.deepEqual([again.embedded, again.session], [true, page(1)]);
    assert.deepEqual(stripe, [{ init: `${page(2)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(2) }, { mount: "string" }]);
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, assigned], [1, 1, []]);
  });
});

test("NO JUMP: Stripe.js didn't load (a blocker, no network, too slow): the server is never asked, so NOTHING is saved or emailed; a calm word in place; Try Again loads it again", async () => {
  await quiet(async () => {
    freshWorld();
    server.world.stripeJs = false;
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Card");
    assert.deepEqual(server.calls.map(c => c.op).filter(op => op !== "next-ref" && op !== "card-setup"), [], "the server was never asked: nothing saved, nothing emailed");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(alerts(root), []);
    assert.deepEqual(buttons(root), ["✕", "← Choose another way to pay", "Try Again", "Choose Another Way to Pay"]);
    assert.deepEqual([assigned, opened, kept()], [[], [], null]);

    click(button(root, "Try Again")); await settle(); // still blocked
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(server.asked("cart-card"), []);

    server.world.stripeJs = true; // it loads this time
    const stripe = fakeStripeJs();
    click(button(root, "Try Again")); await settle();
    assert.equal(server.asked("cart-card").length, 1);
    assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
    assert.deepEqual([server.world.orders.length, server.world.emails, assigned, log.cart.length], [1, 0, [], 2]);
  });
});

test("back from Stripe's own page without paying (an order started there before): the SAME saved order (asked with cart-order), a calm word, the cart all there; Checkout re-opens that order in the form", async () => {
  freshWorld();
  const o = savedEarlier([PRINT, PRINT2]);
  const { root, log } = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739" });
  await settle();
  assert.deepEqual(server.asked("cart-order"), [savedBody(o)]);
  assert.deepEqual(statuses(root), ["No payment was takenYour cart is just as you left it. Tap Checkout to pay by card again, or with Zelle, Venmo or Cash App."], "no 'saved' and no number");
  assert.match(screen(root), /Your Cart \(2\)/);
  assert.deepEqual(alerts(root), []);
  const stripe = fakeStripeJs();
  click(button(root, "Checkout →")); await settle();
  await choose(root, "Card");
  assert.equal(server.asked("cart-again").at(-1).session, page(0));
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails, assigned.length], [0, 1, 0, 0]);
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "paid by card again: the form, in place");
  assert.equal(log.cart.length, 2);
  assert.deepEqual(popups, []);
});

test("back from Stripe's page: paid after all: the thank-you, pieces first, and only those pieces leave the cart", async () => {
  freshWorld();
  savedEarlier([PRINT, PRINT2]);
  server.world.orderState = "paid";
  const { root, log } = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739", artworks: [PRINT, PRINT2] });
  await settle();
  assertPaidThanks(root);
  assert.deepEqual([log.paid, log.cart, kept()], [[TITLES], [], null]);
  click(button(root, "Continue Shopping →")); await settle();
  assert.deepEqual(log.pages, ["catalog"]);
});

test("back from Stripe's page: the order closed by the shop, or no saved order here: a plain calm word, and Checkout starts afresh", async () => {
  await quiet(async () => {
    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    server.world.orderState = "closed";
    const closed = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739" });
    await settle();
    assert.deepEqual(statuses(closed.root), ["No payment was takenYour cart is just as you left it. Tap Checkout whenever you're ready."]);
    assert.equal(kept(), null);
    click(button(closed.root, "Checkout →")); await settle();
    assert.ok(field(closed.root, "email"), "the details are asked again");

    freshWorld(); // another address, or storage blocked: nothing kept to ask about
    const none = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739" });
    await settle();
    assert.deepEqual(statuses(none.root), ["No payment was takenYour cart is just as you left it. Tap Checkout whenever you're ready."]);
    assert.deepEqual(server.asked("cart-order"), [], "nothing to ask");

    freshWorld(); // a saved order for other pieces than this cart's
    savedEarlier([PRINT]);
    const other = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739" });
    await settle();
    assert.deepEqual(server.asked("cart-order"), []);
    assert.match(statuses(other.root)[0], /Your cart is just as you left it/);
  });
});

// ── back on fonkiart.com after paying (CardReturnPage) ─────
function openReturn(answers) {
  const log = { paid: [], pages: [] };
  server.world.paidAnswers = answers;
  const root = createRoot(function Back() {
    return element(CardReturnPage, { orderRef: "FA-1739", session: page(1), artworks: [PRINT, PRINT2], onPaid: (t) => log.paid.push(t), setPage: (p) => log.pages.push(p) });
  });
  return { root, log };
}
const PAID = { paid: true, ref: "FA-1739", lines: [{ title: "Test Print Z", amount: 1000 }, { title: "Test Print Y", amount: 120 }], total: 1120, name: "Jane" };
const UNPAID = { paid: false, ref: "FA-1739", lines: PAID.lines, total: 1120, name: "Jane" };

test("back after paying: the server checks the payment itself; paid: the pieces leave the cart ONCE and the thank-you shows, pieces first", async () => {
  freshWorld();
  const { root, log } = openReturn([PAID]);
  assert.deepEqual(statuses(root), ["Checking your payment…"]);
  await settle();
  assert.deepEqual(server.asked("cart-paid"), [{ ref: "FA-1739", session: page(1) }]);
  assertPaidThanks(root);
  await settle();
  assert.deepEqual(log.paid, [TITLES], "once, however often the page draws");
  click(button(root, "Continue Shopping →"));
  assert.deepEqual(log.pages, ["catalog"]);
});

test("back after paying: not paid yet: said calmly, the cart untouched, and Check Again asks again", async () => {
  freshWorld();
  const { root, log } = openReturn([UNPAID, PAID]);
  await settle();
  assert.match(screen(root), /We haven't received this payment yet/);
  assert.match(screen(root), /If you just paid, give it a moment and check again\. Your cart is just as you left it\./);
  assert.doesNotMatch(screen(root), NOT_BEFORE, "not paid: no 'saved', no number");
  assert.deepEqual(log.paid, []);
  click(button(root, "Check Again")); await settle();
  assert.equal(server.asked("cart-paid").length, 2);
  assertPaidThanks(root);
  assert.deepEqual(log.paid, [TITLES]);
});

test("back after paying: a payment the shop can't find, or a server out of reach: said, the cart untouched, a way back to it", async () => {
  await quiet(async () => {
    freshWorld();
    const missing = openReturn([404]);
    await settle();
    assert.match(screen(missing.root), /We couldn't find this payment/);
    assert.match(screen(missing.root), /contact Fonkiart with your order number, FA-1739\./);
    click(button(missing.root, "Back to My Cart"));
    assert.deepEqual([missing.log.pages, missing.log.paid], [["cart"], []]);

    freshWorld();
    const away = openReturn([500, PAID]);
    await settle();
    assert.match(screen(away.root), /We couldn't check your payment right now/);
    assert.doesNotMatch(screen(away.root), NOT_BEFORE);
    assert.deepEqual(away.log.paid, []);
    click(button(away.root, "Check Again")); await settle();
    assert.deepEqual(away.log.paid, [TITLES]);
  });
});

// ── paid INSIDE the card form: nobody leaves fonkiart.com ───
// Andy: "i don't want to be making the user jump to stripe then back , everything should and can
// happen in fonkiart.com seamlessly easily  and intuitively".
const CHECKOUT_BUTTONS = /Pay Securely|Try Again|Another Way|another way|← Back|Check Again|I've Sent/;
const checkoutButtons = (root) => buttons(root).filter(b => CHECKOUT_BUTTONS.test(b));
async function payInsideTheForm(answers) {
  freshWorld();
  const stripe = fakeStripeJs();
  const shop = openShop([PRINT, PRINT2]);
  click(button(shop.root, "Checkout →")); await settle();
  await fillIn(shop.root, "Card");
  assert.deepEqual(stripe.slice(-1), [{ mount: "string" }], "the form is in");
  assert.deepEqual(scrolls, Array(3).fill({ to: [0, 0], thanks: null }), "each step at the top of the page: the checkout, how to pay, then the card form");
  scrolls.length = 0;
  server.world.paidAnswers = answers;
  return { ...shop, stripe };
}

test("card form INSIDE the page, paid: the form goes, the server checks, and the thank-you shows right where it was, at its top; the tab never leaves fonkiart.com", async () => {
  const { root, log, stripe } = await payInsideTheForm([PAID]);
  let release;
  server.world.hold = new Promise(r => { release = r; });
  stripe.pay(); await settle();

  // While the server checks: the form is gone, nothing is left to choose, the pieces stay.
  assert.deepEqual(stripe.slice(-2), [{ paid: `${page(1)}_secret_FAKE` }, { destroy: `${page(1)}_secret_FAKE` }], "destroyed once paid");
  assert.deepEqual(statuses(root), ["Confirming your payment…"]);
  assert.deepEqual(checkoutButtons(root), [], "no card button, no way back, no other way to pay");
  assert.match(screen(root), /Test Print Z\$1,000Test Print Y\$120Total\$1,120/, "the art stays on the screen");
  assert.doesNotMatch(screen(root), NOT_BEFORE, "the number waits for the thank-you");
  assert.deepEqual([log.paid, log.cart.length, kept()?.session], [[], 2, page(1)], "the cart and the saved order stay until the server says paid");
  assert.deepEqual(scrolls, [], "the page stays put while it checks");
  release(); server.world.hold = null; await settle();

  assert.deepEqual(server.asked("cart-paid"), [{ ref: "FA-1739", session: page(1) }], "asked once, for the page it was paid on");
  assertPaidThanks(root);
  assert.deepEqual(scrolls, [{ to: [0, 0], thanks: "paid" }], "the thank-you opens at its top (the buyer was down at the form's Pay button), once it is drawn");
  assert.deepEqual([assigned, opened], [[], []], "the tab never left fonkiart.com, and nothing opened");
  assert.deepEqual(log.paid, [TITLES], "those pieces leave the cart, once");
  assert.deepEqual([log.cart.length, kept()], [0, null]);
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [1, 1, 0], "ONE order, and no 'order received' email: the server's paid pair confirms it");
  assert.equal(stripe.filter(e => "init" in e).length, 1, "no second form");
  assert.deepEqual(popups, []);
});

test("card form INSIDE the page, paid but not confirmed yet, or the server out of reach: a calm word and Check Again, never a second order; then the thank-you, still here", async () => {
  await quiet(async () => {
    const { root, log, stripe } = await payInsideTheForm([UNPAID, 502, PAID]);
    stripe.pay(); await settle();
    assert.ok(statuses(root).includes("We haven't received this payment yet. Please give it a moment, then check again."));
    assert.doesNotMatch(screen(root), NOT_BEFORE);
    assert.deepEqual([alerts(root), checkoutButtons(root)], [[], ["Check Again"]], "no alarm, and nothing else to choose");
    assert.deepEqual([log.paid, log.cart.length, kept()?.session], [[], 2, page(1)], "the cart and the saved order stand");

    click(button(root, "Check Again")); await settle();
    assert.ok(statuses(root).includes("We couldn't check your payment right now. Please check again in a moment."));
    assert.doesNotMatch(screen(root), NOT_BEFORE);
    assert.deepEqual([log.paid, checkoutButtons(root), scrolls], [[], ["Check Again"], []]);

    click(button(root, "Check Again")); await settle();
    assert.deepEqual(server.asked("cart-paid"), Array(3).fill({ ref: "FA-1739", session: page(1) }));
    assertPaidThanks(root);
    assert.deepEqual(scrolls, [{ to: [0, 0], thanks: "paid" }]);
    assert.deepEqual([log.paid, log.cart.length, kept(), assigned], [[TITLES], 0, null, []]);
    assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length, server.world.emails], [1, 0, 1, 0], "never a second order");
    assert.equal(stripe.filter(e => "init" in e).length, 1, "no second form");
  });
});

test("card form INSIDE the page, paid, then Check Again tapped twice: the server is asked once", async () => {
  await quiet(async () => {
    const { root, stripe } = await payInsideTheForm([UNPAID, PAID]);
    stripe.pay(); await settle();
    let release;
    server.world.hold = new Promise(r => { release = r; });
    const again = button(root, "Check Again");
    click(again); click(again); // the same button twice, before the page can draw again
    await settle();
    assert.equal(server.asked("cart-paid").length, 2, "the payment's own check, then ONE Check Again");
    release(); server.world.hold = null; await settle();
    assertPaidThanks(root);
  });
});

// The checkout as a gallery wall (Andy, 2026-11-21: "rethink that page if you haven't , make it nicer
// simpler more intuitive and artsy without making the art the person is buying small and 2nd
// page/hand"). The art is drawn once, big, for every step: each picture, its title and price, the
// total; the steps ask one thing each. Where each part sits is CSS (tests/checkout-layout.test.js);
// here, what is drawn, step by step.
const wallPics = (root) => findAll(root.tree, n => n.type === "section" && String(n.props.className).includes("checkout-wall"))
  .flatMap(a => findAll(a, n => n.type === "img" && n.props.className === "checkout-piece-pic").map(n => n.props.src));
const steps = (root) => only(root, "the steps", n => n.type === "div" && n.props.className === "checkout-steps");
test("GALLERY: the art is drawn once, big, for every step (each picture, title and price, the total); the steps ask one thing each: where to send it, how to pay, then the payment; the card form repeats no pictures", async () => {
  await quiet(async () => {
    freshWorld();
    const stripe = fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    // Step 1: the art first, then where to send it.
    assert.match(screen(root), /^✕Test Print Z\$1,111Test Print Y\$120Total\$1,231Purchase · Step 1 of 3← Back to CartWhere should we send it\?First Name \*/, "the art first, in the shop's prices, then the one question");
    assert.deepEqual(wallPics(root), [PRINT.image, PRINT2.image], "each piece's picture, once, on the wall");
    assert.deepEqual(pics(root, "pay-art-pic"), [], "no other pictures");
    assert.equal(payOptions(root).length, 0, "how to pay waits for step 2");

    // Step 2: how to pay, in words, with one main button; the art stays.
    await details(root);
    click(button(root, "Continue →")); await settle();
    assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3← BackHow would you like to pay\?ZelleInstant · FreeVenmoInstant · FreeCash AppInstant · FreeCardStripe · SecureKlarnaPay over timeContinue →$/);
    assert.deepEqual(payOptions(root).map(n => n.props["aria-checked"]), [false, false, false, false, false], "none chosen yet");
    assert.deepEqual(wallPics(root), [PRINT.image, PRINT2.image], "the art stays");
    click(payOption(root, "Zelle")); await settle();
    assert.deepEqual(payOptions(root).map(n => [n.props["aria-checked"], /\bsel\b/.test(n.props.className)]), [[true, true], [false, false], [false, false], [false, false], [false, false]], "the one chosen, plain to see");

    // Step 3 with Zelle: the payment; the art stays. Back goes back one step.
    click(button(root, "Continue →")); await settle();
    assert.match(textOf(steps(root)), /^Purchase · Step 3 of 3← Choose another way to paySend via Zelle\$1,231/);
    assert.deepEqual(wallPics(root), [PRINT.image, PRINT2.image], "the art stays for the payment");
    click(button(root, "← Choose another way to pay")); await settle();
    assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3/, "back to how to pay");

    // The card form: the art stays, now in the SERVER's prices, and nothing is drawn twice.
    await choose(root, "Card");
    assert.deepEqual(stripe.at(-1), { mount: "string" }, "the form is in");
    assert.deepEqual(wallPics(root), [PRINT.image, PRINT2.image]);
    assert.deepEqual(pics(root, "pay-art-pic"), [], "the card form repeats no pictures");
    assert.equal((screen(root).match(/Test Print Z/g) || []).length, 1, "each title once");
    assert.match(screen(root), /^✕Test Print Z\$1,000Test Print Y\$120Total\$1,120Purchase · Step 3 of 3← Choose another way to payPay by Card/, "the amounts the card is charged");
  });
});

test("GALLERY: one piece: its picture, its title, what it is and its price (no total line); a coupon shows on the piece, and its price is what is paid", async () => {
  freshWorld();
  server.call = ((call) => async (op, payload) => op === "coupon" ? { status: "valid" } : call(op, payload))(server.call);
  const ONE = { ...PRINT, medium: "Acrylic on canvas", dimensions: "24 × 36 in" };
  const { root } = openShop([ONE]);
  click(button(root, "Checkout →")); await settle();
  assert.match(screen(root), /^✕Test Print ZAcrylic on canvas · 24 × 36 in\$1,111Purchase · Step 1 of 3/);
  assert.deepEqual(wallPics(root), [PRINT.image]);
  await details(root);
  typeIn(only(root, "coupon field", n => n.type === "input" && n.props.placeholder === "FK-XXXX-XXXX"), "FK-TEST-0001");
  await settle();
  click(button(root, "Apply")); await settle();
  assert.match(screen(root), /^✕Test Print ZAcrylic on canvas · 24 × 36 in\$944✓ 15% offPurchase/, "15% off 1,111, rounded as the checkout always has");
});

// ── the ways to pay, as the server says ─────────────────────
// Stripe's rows show only the ways the server can open right now (src/lib/payWays.js): its
// card-setup answer names them in `ways`. A server that names none (one from before `ways`) opens
// cards and Klarna, never a bank transfer, so those two show then. Each row carries the footer's own
// mark for its way (src/components/PayMarks.jsx), a picture the screen reader skips.
const ALL_WAYS = { card: true, form: true, why: null, ways: ["card", "link", "klarna", "bank"] };
const rowLabels = (root) => payOptions(root).map(b => findAll(b, n => n.props.className === "pay-row-label").map(textOf).join(""));
const rowMarks = (root) => payOptions(root).map(b => findAll(b, n => n.type === "svg").map(s => s.props["aria-label"]));
// The Cart's checkout on step 2, the server's card-setup answer being `setup` (or failing).
async function atWays(setup, { setupFails = false } = {}) {
  freshWorld();
  if (setup) server.world.setup = setup;
  if (setupFails) server.call = ((call) => async (op, payload) => op === "card-setup" ? Promise.reject(new Error("out of reach")) : call(op, payload))(server.call);
  const stripe = fakeStripeJs();
  const { root } = openShop([PRINT]);
  click(button(root, "Checkout →")); await settle();
  await details(root);
  click(button(root, "Continue →")); await settle();
  return { root, stripe };
}
const SHOP_WAYS = ["Zelle", "Venmo", "Cash App"];

test("WAYS: a row for every way the server names, always in the same order; 'Card or Link' only when it names Link; no bank row unless it names a bank transfer", async () => {
  await quiet(async () => {
    const { root } = await atWays(ALL_WAYS);
    assert.deepEqual(rowLabels(root), [...SHOP_WAYS, "Card or Link", "Klarna", "Bank transfer (ACH)"]);
    assert.match(textOf(steps(root)), /Cash AppInstant · FreeCard or LinkStripe · SecureKlarnaPay over timeBank transfer \(ACH\)Clears in about 4 business daysContinue →$/, "what each is, in a line under it");
    assert.deepEqual(rowMarks(root), [["Zelle"], ["Venmo"], ["Cash App"], ["Visa", "Mastercard"], ["Klarna"], ["Bank"]], "each with the footer's own mark");
    for (const [ways, stripeRows] of [
      [["bank", "klarna", "link", "card"], ["Card or Link", "Klarna", "Bank transfer (ACH)"]],
      [["card", "klarna"], ["Card", "Klarna"]],
      [["card", "link"], ["Card or Link"]],
      [["card", "bank"], ["Card", "Bank transfer (ACH)"]],
      [["card"], ["Card"]],
      [[], []],
    ]) {
      const again = await atWays({ card: true, form: true, why: null, ways });
      assert.deepEqual(rowLabels(again.root), [...SHOP_WAYS, ...stripeRows], `ways ${JSON.stringify(ways)}`);
    }
  });
});

test("WAYS: a server that names no ways (one from before them), or that can't be reached: cards and Klarna, and NO bank row", async () => {
  await quiet(async () => {
    for (const [what, setup, opts] of [["names none", null, {}], ["out of reach", null, { setupFails: true }], ["not a list", { card: true, form: true, why: null, ways: "bank" }, {}]]) {
      const { root } = await atWays(setup, opts);
      assert.deepEqual(rowLabels(root), [...SHOP_WAYS, "Card", "Klarna"], what);
      assert.doesNotMatch(screen(root), /Bank transfer|ACH|Link/, `${what}: nothing promised that the server can't open`);
    }
  });
});

test("WAYS: Klarna or a bank transfer: Continue opens Stripe's form for THAT way; the server is told which (way); the step says it, and the wait says 'payment form'", async () => {
  await quiet(async () => {
    for (const [label, way, heading] of [["Klarna", "klarna", "Pay with Klarna"], ["Bank transfer (ACH)", "bank", "Pay by Bank Transfer"], ["Card or Link", "card", "Pay by Card"]]) {
      const { root, stripe } = await atWays(ALL_WAYS);
      click(payOption(root, label)); await settle();
      assert.deepEqual(payOptions(root).map(n => n.props["aria-checked"]), rowLabels(root).map(l => l === label), `${label}: chosen`);
      let answer;
      server.world.hold = new Promise(r => { answer = r; });
      click(button(root, "Continue →")); await settle();
      assert.match(textOf(steps(root)), new RegExp(`^Purchase · Step 3 of 3← Choose another way to pay${heading}`), `${label}: the step says which`);
      assert.deepEqual(statuses(root), [way === "card" ? "Opening the secure card form…" : "Opening the secure payment form…"], `${label}: on its way, and said so`);
      answer(); server.world.hold = null; await settle();
      assert.deepEqual(server.asked("cart-card").map(p => p.way), [way], `${label}: the server is told the way`);
      assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], `${label}: Stripe's form, in place`);
      assert.deepEqual([assigned, opened, popups], [[], [], []], `${label}: the tab never leaves`);
    }
  });
});

test("WAYS: a way chosen before the server answers, that it then says it can't open: no longer chosen, its row gone; a way it still opens stays chosen", async () => {
  await quiet(async () => {
    for (const [label, after] of [["Klarna", [false, false, false, false]], ["Card", [false, false, false, true]], ["Venmo", [false, true, false, false]]]) {
      freshWorld();
      let release;
      const later = new Promise(r => { release = r; });
      server.call = ((call) => async (op, payload) => op === "card-setup" ? later.then(() => ({ card: true, form: true, why: null, ways: ["card"] })) : call(op, payload))(server.call);
      fakeStripeJs();
      const { root } = openShop([PRINT]);
      click(button(root, "Checkout →")); await settle();
      await details(root);
      click(button(root, "Continue →")); await settle();
      assert.deepEqual(rowLabels(root), [...SHOP_WAYS, "Card", "Klarna"], "before the answer: cards and Klarna");
      click(payOption(root, label)); await settle();
      release(); await settle();
      assert.deepEqual(rowLabels(root), [...SHOP_WAYS, "Card"], `${label}: the server opens cards only, so Klarna's row is gone`);
      assert.deepEqual(payOptions(root).map(n => n.props["aria-checked"]), after, label === "Klarna" ? "and nothing is chosen in its place" : `${label} stays chosen`);
    }
  });
});

// ── a way Stripe won't open, and a bank payment still clearing ──
// Klarna or a bank payment, chosen, that Stripe won't open for this order (its amount, or the way
// not switched on for the shop): the server answers one calm line (api/_lib/stripe.js wayRefused),
// as cart-card's `refused` with its cardError (the order saved all the same), or as a 409 from
// cart-again and from the invoice's card-checkout. The buyer stays on the ways to pay, reads the
// line, gets no Try Again, and paying another way never makes a second order. A bank payment made,
// still clearing (cart-paid's or card-paid's `processing`, cart-order's state "processing", an
// invoice in status "processing"): "Payment processing" in the words of src/lib/invoiceView.js
// (BANK_CLEARING); the Cart's pieces leave the cart, and an invoice offers no way to pay.
const KLARNA_NO = "Klarna isn't available for this amount. Please choose another way.";
const BANK_NO = "Paying by bank (ACH) isn't available right now. Please choose another way.";
const ALL_ROWS = [...SHOP_WAYS, "Card or Link", "Klarna", "Bank transfer (ACH)"];
const CLEARING = { ...PAID, paid: false, processing: true };
const FAKE_PK = ["pk", "test", "FAKE"].join("_");
// The thank-you while a bank payment clears (PaidThanks): the pieces, what happens next, never "Paid".
function assertClearingThanks(root) {
  const text = screen(root);
  assert.match(text, /Thank you!We're holding your order while your bank payment clears\.Hi Jane, here is your order from Fonkiart\./);
  assert.match(text, /Test Print Z\$1,000Test Print Y\$120Total\$1,120/, "the pieces, then the total");
  assert.match(text, /Order ReferenceFA-1739Also in the email we send once it clears/);
  assert.match(text, /Payment processingA bank payment can take up to 4 business days to clear\. We'll email you as soon as yours does\./);
  assert.doesNotMatch(text, /Paid by|Total Paid|Congratulations|Thank you for your payment/, "nothing says paid before the bank does");
  assert.deepEqual(pics(root, "pay-art-pic"), [PRINT.image, PRINT2.image], "each piece's picture");
}

test("REFUSED: Klarna that Stripe won't open for this order: back on the ways to pay with its one line, nothing chosen, no Try Again; the next way pays THAT order, never a second", async () => {
  await quiet(async () => {
    const { root, stripe } = await atWays(ALL_WAYS);
    server.world.cardAnswer = (o) => ({ ...server.view(o), refused: "klarna", cardError: KLARNA_NO });
    click(payOption(root, "Klarna")); await settle();
    click(button(root, "Continue →")); await settle();
    const step = textOf(steps(root));
    assert.ok(step.startsWith(`Purchase · Step 2 of 3← BackHow would you like to pay?${KLARNA_NO}Zelle`), `the ways to pay, its line above them:\n${step}`);
    assert.deepEqual([statuses(root), alerts(root)], [[KLARNA_NO], []], "said calmly, once");
    assert.deepEqual(rowLabels(root), ALL_ROWS, "every way still offered");
    assert.deepEqual(payOptions(root).map(n => n.props["aria-checked"]), ALL_ROWS.map(() => false), "Klarna no longer chosen");
    assert.deepEqual(buttons(root).filter(b => /Try Again|Another Way/.test(b)), [], "no Try Again");
    assert.deepEqual([server.asked("cart-card").map(p => p.way), server.world.orders.length, stripe.length], [["klarna"], 1, 0], "one order saved, no form");
    assert.equal(kept().ref, "FA-1739", "kept, so the next way pays THAT order");
    assert.doesNotMatch(screen(root), NOT_BEFORE, "still no number before paying");

    click(payOption(root, "Card or Link")); await settle();
    click(button(root, "Continue →")); await settle();
    assert.deepEqual(server.asked("cart-again").map(p => [p.ref, p.way]), [["FA-1739", "card"]], "THAT order, by card");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length], [1, 1], "never a second order");
    assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "the card form, in place");
    assert.doesNotMatch(screen(root), /isn't available/, "the line went with Continue");
  });
});

test("REFUSED again: a bank payment for an order already saved (cart-again answers a 409): its line on the ways to pay, no Try Again; then Zelle pays THAT order, its emails once", async () => {
  await quiet(async () => {
    freshWorld();
    server.world.setup = ALL_WAYS;
    savedEarlier([PRINT, PRINT2]);
    server.world.again = () => { throw server.failed(409, BANK_NO); };
    const stripe = fakeStripeJs();
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await choose(root, "Bank transfer (ACH)");
    assert.ok(textOf(steps(root)).startsWith(`Purchase · Step 2 of 3← BackHow would you like to pay?${BANK_NO}Zelle`), textOf(steps(root)));
    assert.deepEqual([statuses(root), alerts(root)], [[BANK_NO], []]);
    assert.deepEqual(payOptions(root).map(n => n.props["aria-checked"]), ALL_ROWS.map(() => false));
    assert.deepEqual(buttons(root).filter(b => /Try Again|Another Way/.test(b)), []);
    assert.deepEqual([server.asked("cart-again").map(p => p.way), server.asked("cart-card").length, server.world.orders.length, stripe.length], [["bank"], 0, 1, 0]);
    assert.deepEqual([kept().ref, log.cart.length], ["FA-1739", 2], "the order and the cart, as they were");

    server.world.again = null;
    await choose(root, "Zelle");
    click(button(root, "✓ I've Sent the Payment")); await settle();
    assert.deepEqual(server.asked("cart-other").map(p => [p.ref, p.method]), [["FA-1739", "zelle"]], "THAT order");
    assert.deepEqual([server.world.orders.length, server.world.emails], [1, 2], "one order, its 'order received' pair once");
    assert.match(screen(root), /Thank you!/);
  });
});

test("STILL CLEARING: paying again an order whose bank payment is still clearing (cart-again and cart-other answer a 409): the server's line exactly as written, whichever way is chosen", async () => {
  await quiet(async () => {
    const STILL = "This order's bank payment is still clearing. We'll email you as soon as it does.";
    for (const [way, role] of [["Card", "alert"], ["Klarna", "status"], ["Zelle", "alert"]]) {
      freshWorld();
      savedEarlier([PRINT, PRINT2]);
      server.world.again = () => { throw server.failed(409, STILL); };
      server.world.other = () => { throw server.failed(409, STILL); };
      fakeStripeJs();
      const { root, log } = openShop([PRINT, PRINT2]);
      click(button(root, "Checkout →")); await settle();
      await choose(root, way);
      if (way === "Zelle") { click(button(root, "✓ I've Sent the Payment")); await settle(); }
      assert.deepEqual(role === "alert" ? alerts(root).map(textOf) : statuses(root), [STILL], `${way}: said as the server wrote it`);
      assert.deepEqual([server.world.orders.length, log.cart.length, kept().ref], [1, 2, "FA-1739"], `${way}: nothing saved again, the cart as it was`);
    }
  });
});

test("BANK CLEARING: a bank payment made in the form: the thank-you says 'Payment processing' and what happens next, never 'Paid'; those pieces leave the cart, once", async () => {
  freshWorld();
  server.world.setup = ALL_WAYS;
  const stripe = fakeStripeJs();
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Bank transfer (ACH)");
  assert.deepEqual([server.asked("cart-card").map(p => p.way), stripe.map(e => Object.keys(e)[0])], [["bank"], ["init", "mount"]]);
  server.world.paidAnswers = [CLEARING];
  stripe.pay(); await settle();
  assert.deepEqual(server.asked("cart-paid"), [{ ref: "FA-1739", session: page(1) }]);
  assertClearingThanks(root);
  assert.deepEqual([log.paid, log.cart.length, kept()], [[TITLES], 0, null], "the shop holds those pieces now");
  assert.deepEqual([server.world.orders.length, assigned, opened, popups], [1, [], [], []]);
});

test("BANK CLEARING, coming back: the saved order paid by bank and still clearing (cart-order 'processing'): the same thank-you, from the checkout or the Cart page, and the cart empties", async () => {
  freshWorld();
  savedEarlier([PRINT, PRINT2]);
  server.world.orderState = "processing";
  const shop = openShop([PRINT, PRINT2]);
  click(button(shop.root, "Checkout →")); await settle();
  assertClearingThanks(shop.root);
  assert.deepEqual([shop.log.paid, shop.log.cart, kept()], [[TITLES], [], null]);
  assert.deepEqual([server.asked("cart-again").length, server.asked("cart-card").length], [0, 0], "nothing asked of Stripe again");

  freshWorld();
  savedEarlier([PRINT, PRINT2]);
  server.world.orderState = "processing";
  const back = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739", artworks: [PRINT, PRINT2] });
  await settle();
  assertClearingThanks(back.root);
  assert.deepEqual([back.log.paid, back.log.cart, kept()], [[TITLES], [], null]);
  click(button(back.root, "Continue Shopping →")); await settle();
  assert.deepEqual(back.log.pages, ["catalog"]);
});

test("BANK CLEARING, back on fonkiart.com from paying away from it: 'Payment processing', and the pieces leave the cart once", async () => {
  freshWorld();
  const { root, log } = openReturn([CLEARING]);
  await settle();
  assertClearingThanks(root);
  await settle();
  assert.deepEqual(log.paid, [TITLES], "once, however often the page draws");
  click(button(root, "Continue Shopping →"));
  assert.deepEqual(log.pages, ["catalog"]);
});

// The invoice page (src/pages/InvoicePage.jsx) on the same stand-ins: an approved invoice for
// Test Print Z, $1,000, offering Zelle and Stripe's three ways. invoiceWorld: how the server
// answers it (refuse: the way Stripe won't open; clearingAtCheckout: paid by bank already, in
// another tab; paidAnswers: card-paid's answers, in turn).
const InvoicePage = await load("pages/InvoicePage.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/supabase": { BREVO_SENDER: "shop@example.com" }, "../lib/store": store, "../lib/invoiceView": invoiceView,
  "../lib/orderStatus": await import("../src/lib/orderStatus.js"), "../lib/tracking": await import("../src/lib/tracking.js"),
  "../lib/shipAddress": await import("../src/lib/shipAddress.js"), "../lib/invoiceNumber": await import("../src/lib/invoiceNumber.js"),
  "../components/Pic": { default: Pic }, "../components/CopyButton": { default: function CopyButton() { return null; } },
  "../components/CardCheckout": { default: CardCheckout }, "../components/PayRows": { default: PayRows },
  "../lib/stripeJs": stripeJs, "../lib/cartOrder": cartOrder, "../lib/payWays": payWays,
  "../lib/payTries": payTries, "../lib/backInside": backInside,
});
globalThis.requestAnimationFrame ??= (fn) => { fn(0); return 0; };
const INV_ORDER = { id: 30, invoice_token: "c-inv-token-30", client_name: "Jane Smith", client_email: "jane@example.com", item_title: "Test Print Z", amount: 1000,
  status: "confirmed", invoice_approved: true, payment_methods: "zelle,stripe", zelle_contact: "", created_at: "2026-11-20T15:00:00Z", due_date: null, notes: "" };
function invoiceWorld({ status = "confirmed", refuse = null, clearingAtCheckout = false, paidAnswers = [] } = {}) {
  freshWorld();
  const { world, failed } = server;
  world.order = { ...INV_ORDER, status };
  let made = 0;
  server.answer = async (op, payload) => {
    if (op === "invoice") return { order: { ...world.order }, settings: NO_LINK, cardReady: true };
    if (op === "card-setup") return ALL_WAYS;
    if (op === "card-checkout") {
      if (clearingAtCheckout) { world.order.status = "processing"; return { paid: false, processing: true }; }
      if (payload.way === refuse) throw failed(409, refuse === "bank" ? BANK_NO : KLARNA_NO);
      const id = page(++made);
      return { ref: "FA-20261120100000000", lines: [{ title: INV_ORDER.item_title, amount: INV_ORDER.amount }], total: INV_ORDER.amount, session: id, clientSecret: `${id}_secret_FAKE`, publishableKey: FAKE_PK };
    }
    if (op === "card-paid") {
      const answer = paidAnswers.shift();
      if (answer?.processing) world.order.status = "processing"; // as the server records it
      return answer;
    }
    throw new Error(`the invoice page asked the server for "${op}"`);
  };
}
const openInvoice = () => createRoot(function Invoice() { return element(InvoicePage, { token: INV_ORDER.invoice_token, artworks: [PRINT] }); });
const INV_ROWS = ["Zelle", "Card or Link", "Klarna", "Bank transfer (ACH)"];
// An invoice whose bank payment clears: "Payment processing" in place of the ways to pay.
function assertInvoiceClearing(root) {
  const text = screen(root);
  assert.match(text, /Payment processingA bank payment can take up to 4 business days to clear\. We'll email you as soon as yours does\./);
  assert.deepEqual(payOptions(root), [], "no way to pay offered");
  assert.doesNotMatch(text, /Send Payment To|Order Confirmed|Total Due|Total Paid|Paid by|Thank you for your payment|Confirm order/);
  assert.match(text, /Total\$1,000/, "the total, neither due nor paid");
}

test("INVOICE, REFUSED: Klarna that Stripe won't open for this invoice: its one line under the row, in place of its button: no Try Again; the other ways stay, and card opens as usual", async () => {
  await quiet(async () => {
    invoiceWorld({ refuse: "klarna" });
    const stripe = fakeStripeJs();
    const root = openInvoice(); await settle();
    assert.deepEqual(rowLabels(root), INV_ROWS, "control: the approved invoice offers its ways");
    click(payOption(root, "Klarna")); await settle();
    click(button(root, "Pay $1,000 with Klarna →")); await settle();
    assert.deepEqual(server.asked("card-checkout").map(p => p.way), ["klarna"]);
    assert.deepEqual([statuses(root), alerts(root)], [[KLARNA_NO], []], "said calmly, once");
    assert.deepEqual(buttons(root).filter(b => /Try Again|with Klarna|Another Way/.test(b)), [], "no Try Again, and no Klarna button to be refused again");
    assert.doesNotMatch(screen(root), /Secure payment form by Stripe/, "nor the word about a form that won't open");
    assert.deepEqual([rowLabels(root), stripe.length], [INV_ROWS, 0], "every way still there, no form");

    click(payOption(root, "Card or Link")); await settle();
    assert.doesNotMatch(screen(root), /isn't available/, "another way: the line goes");
    click(button(root, "Pay $1,000 by card →")); await settle();
    assert.deepEqual(server.asked("card-checkout").map(p => p.way), ["klarna", "card"]);
    assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  });
});

test("INVOICE, BANK CLEARING: paid by bank in the form, already in another tab, or opened again later: 'Payment processing' in place of the ways to pay; never 'Paid', nor 'Total Due'", async () => {
  await quiet(async () => {
    invoiceWorld({ paidAnswers: [{ paid: false, processing: true }] });
    const stripe = fakeStripeJs();
    const root = openInvoice(); await settle();
    click(payOption(root, "Bank transfer (ACH)")); await settle();
    click(button(root, "Pay $1,000 by bank transfer →")); await settle();
    assert.deepEqual([server.asked("card-checkout").map(p => p.way), stripe.map(e => Object.keys(e)[0])], [["bank"], ["init", "mount"]]);
    stripe.pay(); await settle();
    assert.deepEqual(server.asked("card-paid"), [{ token: INV_ORDER.invoice_token, session: page(1) }]);
    assertInvoiceClearing(root);
    const later = openInvoice(); await settle();
    assertInvoiceClearing(later);

    invoiceWorld({ clearingAtCheckout: true });
    const other = fakeStripeJs();
    const tab = openInvoice(); await settle();
    click(payOption(tab, "Card or Link")); await settle();
    click(button(tab, "Pay $1,000 by card →")); await settle();
    assertInvoiceClearing(tab);
    assert.equal(other.length, 0, "no form for an invoice already paid by bank");
  });
});

// ── the way back ────────────────────────────────────────────
// Andy, 2026-11-23: "make sure if the user selects credit card or any other method , the user can go
// and select another ... right now i went hit CC then tried to go back ... there's no way i'm
// trapped". The way back is at the top of the step (where it holds on the screen: src/index.css,
// tests/wayBack.test.js) and at its end, whichever way was chosen, also while the form is opening.
const STRIP = "← Choose another way to pay", FOOT = "Choose Another Way to Pay";
const EVERY_WAY = [["Zelle", "zelle"], ["Venmo", "venmo"], ["Cash App", "cashapp"], ["Card or Link", "card"], ["Klarna", "klarna"], ["Bank transfer (ACH)", "bank"]];
const chosen = (root) => payOptions(root).filter(n => n.props["aria-checked"]).map(n => textOf(n));
const holdServer = () => { let answer; server.world.hold = new Promise(r => { answer = r; }); return async () => { server.world.hold = null; answer(); await settle(); }; };

test("WAY BACK: every way to pay has it, at the top of the step and at its end, and each leads back to the ways to pay, that way still chosen; nothing is paid, placed or said", async () => {
  await quiet(async () => {
    for (const [label, way] of EVERY_WAY) for (const which of [STRIP, FOOT]) {
      const { root, stripe } = await atWays(ALL_WAYS);
      await choose(root, label);
      const here = buttons(root);
      assert.deepEqual([here.filter(b => b === STRIP).length, here.filter(b => b === FOOT).length], [1, 1], `${label}: above and below`);
      assert.ok(here.indexOf(STRIP) < here.indexOf(FOOT), `${label}: the strip first, the button last`);
      assert.equal(here.at(-1), FOOT, `${label}: the last thing on the step`);
      if (way === "card" || way === "klarna" || way === "bank") assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], `${label}: its form is open`);
      click(button(root, which)); await settle();
      assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3← BackHow would you like to pay\?/, `${label}, ${which}: the ways to pay`);
      assert.equal(chosen(root).length, 1);
      assert.ok(chosen(root)[0].startsWith(label), `${label}: still the one chosen`);
      assert.deepEqual([alerts(root), statuses(root), server.orders().length, server.world.emails], [[], [], 0, 0], `${label}: nothing placed, nothing said`);
      assert.ok(payOptions(root).every(n => !n.props.disabled), `${label}: every other way can be tapped`);
    }
  });
});

test("WAY BACK while Stripe.js loads: there from the first moment; back at the ways to pay at once, nothing is ever asked of the server and no form opens over the next choice", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  let loaded;
  server.world.stripeJs = new Promise(r => { loaded = r; });
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Card");
  assert.deepEqual([statuses(root), buttons(root)], [["Opening the secure card form…"], ["✕", STRIP]], "opening, and the way back is there");
  click(button(root, STRIP)); await settle();
  assert.ok(payOption(root, "Zelle") && button(root, "Continue →"), "the ways to pay, at once");
  await choose(root, "Zelle");
  assert.match(screen(root), /Send via Zelle/);
  loaded(true); await settle();
  assert.match(screen(root), /Send via Zelle/, "the form does not open over Zelle");
  assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, stripe.length, kept()], [0, 0, 0, null], "nothing was asked, saved or opened for the card");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual([server.orders().length, server.world.orders.length, server.world.emails], [1, 0, 2], "ONE order, by Zelle");
  assert.match(screen(root), /Thank you!/);
  assert.equal(log.cart.length, 0);
});

test("WAY BACK while the server answers: the ways to pay at once; the order it saves is kept, no form opens, nothing is said; Zelle then pays THAT order, never a second one", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await details(root);
  await pick(root, "Card");
  const answer = holdServer();
  click(button(root, "Continue →")); await settle();
  assert.equal(server.asked("cart-card").length, 1, "asked");
  assert.deepEqual(buttons(root), ["✕", STRIP]);
  click(button(root, STRIP)); await settle();
  assert.ok(payOption(root, "Venmo") && button(root, "Continue →"), "the ways to pay, before the answer");
  await answer();
  assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3/, "the answer moves no step");
  assert.deepEqual([stripe.length, statuses(root), alerts(root)], [0, [], []], "opens no form and says nothing");
  assert.equal(kept().session, page(1), "and the order is kept, naming its page");
  await choose(root, "Zelle");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual(server.asked("cart-other").map(p => [p.ref, p.session, p.method]), [["FA-1739", page(1), "zelle"]], "THAT order, by Zelle");
  assert.deepEqual([server.orders().length, server.world.orders.length, server.world.emails, server.world.pages.get(page(1)).status], [0, 1, 2, "expired"], "never a second one; its card page is closed");
  assert.match(screen(root), /Thank you!/);
});

test("WAY BACK while the server answers, and a coupon tried meanwhile: by its answer the order is saved at its price: too late, said plainly, nothing shown as taken off", async () => {
  await quiet(async () => {
    freshWorld();
    fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await details(root);
    await pick(root, "Card");
    const answer = holdServer();
    click(button(root, "Continue →")); await settle();
    click(button(root, STRIP)); await settle();
    click(button(root, "← Back")); await settle();
    const call = server.call;
    let say;
    server.call = (op, payload) => op === "coupon" ? new Promise(r => { say = () => r({ status: "valid" }); }) : call(op, payload);
    typeIn(couponField(root), "FK-TEST-0003"); await settle();
    click(button(root, "Apply")); await settle();
    await answer();        // the order, saved at its price
    say(); await settle(); // and only then the coupon's answer
    assert.match(screen(root), /A coupon can't be added now: the card payment already started at this price\./);
    assert.doesNotMatch(screen(root), /discount applied|% off/);
    assert.match(screen(root), /^✕Test Print Z\$1,000Test Print Y\$120Total\$1,120Purchase/, "the order's own price");
    assert.equal(kept().coupon, undefined);
  });
});

test("WAY BACK, then another way before the answer: the next try waits for it ('Saving…', 'Opening…'), the way back still there, then pays THAT order", async () => {
  for (const next of ["Zelle", "Card"]) {
    freshWorld();
    const stripe = fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await details(root);
    await pick(root, "Card");
    const answer = holdServer();
    click(button(root, "Continue →")); await settle();
    click(button(root, STRIP)); await settle();
    await choose(root, next);
    if (next === "Zelle") { click(button(root, "✓ I've Sent the Payment")); await settle(); }
    assert.deepEqual([server.asked("cart-other").length, server.asked("cart-again").length, server.asked("cart-card").length, server.orders().length], [0, 0, 1, 0], `${next}: it waits: nothing more is asked yet`);
    assert.ok(buttons(root).includes(STRIP), `${next}: and the way back is there`);
    assert.match(screen(root), next === "Zelle" ? /Saving…/ : /Opening the secure card form…/);
    await answer();
    if (next === "Zelle") {
      assert.deepEqual(server.asked("cart-other").map(p => [p.ref, p.session]), [["FA-1739", page(1)]], "THAT order");
      assert.match(screen(root), /Thank you!/);
    } else {
      assert.deepEqual(server.asked("cart-again").map(p => [p.ref, p.session]), [["FA-1739", page(1)]], "THAT order, naming the page it left");
      assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "one form, for the last choice");
      assert.equal(stripe[0].init, `${page(2)}_secret_FAKE`);
      assert.deepEqual([...server.world.pages.values()].filter(p => p.status === "open").map(p => p.id), [page(2)], "only the newest page can take money");
    }
    assert.deepEqual([server.world.orders.length, server.orders().length], [1, 0], `${next}: ONE order`);
  }
});

test("WAY BACK while a payment is being placed (Zelle): the answer still counts: the thank-you shows, once, with nothing placed again; an error is not said over the next choice", async () => {
  await quiet(async () => {
    freshWorld();
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Zelle");
    const answer = holdServer();
    click(button(root, "✓ I've Sent the Payment")); await settle();
    click(button(root, STRIP)); await settle();
    assert.ok(payOption(root, "Card"), "the ways to pay");
    await answer();
    assert.match(screen(root), /Thank you!/, "it was placed: said so");
    assert.deepEqual([server.orders().length, server.world.emails, log.cart.length], [1, 2, 0]);

    freshWorld({ orderFails: true });
    const bad = openShop([PRINT, PRINT2]);
    click(button(bad.root, "Checkout →")); await settle();
    await fillIn(bad.root, "Zelle");
    const no = holdServer();
    click(button(bad.root, "✓ I've Sent the Payment")); await settle();
    click(button(bad.root, STRIP)); await settle();
    await no();
    assert.deepEqual([alerts(bad.root), /We couldn't save/.test(screen(bad.root))], [[], false], "nothing said over the ways to pay");
    assert.equal(bad.log.cart.length, 2, "and the cart is kept");
  });
});

test("WAY BACK while the server answers, and it says the order is already paid: the thank-you; refused, down or gone: nothing is said, and the next choice starts clean", async () => {
  await quiet(async () => {
    freshWorld();
    savedEarlier([PRINT, PRINT2]);
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await pick(root, "Card");
    const answer = holdServer();
    click(button(root, "Continue →")); await settle();
    click(button(root, STRIP)); await settle();
    server.world.orders[0].status = "paid"; // paid in another tab meanwhile
    await answer();
    assertPaidThanks(root);
    assert.equal(log.cart.length, 0);

    for (const [what, again] of [["refused", () => { throw server.failed(409, "The Klarna payment isn't available for this amount. Please choose another way."); }],
      ["down", () => { throw server.failed(502, NOT_NOW); }], ["gone", () => { throw server.failed(404, "We couldn't find that order."); }]]) {
      freshWorld();
      savedEarlier([PRINT, PRINT2]);
      server.world.again = again;
      const it = openShop([PRINT, PRINT2]);
      click(button(it.root, "Checkout →")); await settle();
      await pick(it.root, "Klarna");
      const go = holdServer();
      click(button(it.root, "Continue →")); await settle();
      click(button(it.root, STRIP)); await settle();
      await go();
      assert.deepEqual([statuses(it.root), alerts(it.root)], [[], []], `${what}: nothing said`);
      assert.match(textOf(steps(it.root)), /^Purchase · Step 2 of 3/, `${what}: the buyer stays on the ways to pay`);
      assert.equal(kept() === null, what === "gone", `${what}: an order the shop no longer has is forgotten, any other is kept`);
      await choose(it.root, "Zelle");
      click(button(it.root, "✓ I've Sent the Payment")); await settle();
      assert.deepEqual([server.asked("cart-other").length, server.orders().length], what === "gone" ? [0, 1] : [1, 0], `${what}: ONE order, by Zelle`);
      assert.match(screen(it.root), /Thank you!/);
    }
  });
});

test("WAY BACK: gone once paid in the form: while it is being confirmed, and while it isn't yet, there is nothing to choose again", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  server.world.paidAnswers = [{ paid: false }];
  const { root } = openShop([PRINT]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Card");
  const answer = holdServer();
  stripe.pay(); await settle();
  assert.deepEqual([statuses(root), buttons(root)], [["Confirming your payment…"], ["✕"]]);
  await answer();
  assert.deepEqual(buttons(root), ["✕", "Check Again"]);
});

test("BACK on the phone or in the browser steps back INSIDE the checkout: the payment, the ways to pay, the details, then the cart; never out of it half-way, and the page's own buttons still work after it", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root, log } = openShop([PRINT, PRINT2]);
  assert.deepEqual([trail.entries.length, trail.at], [2, 1], "control: the catalog, then the cart");
  click(button(root, "Checkout →")); await settle();
  assert.deepEqual([trail.entries.length, trail.entries[2].inside, trail.entries[2].page], [3, true, "cart"], "the checkout's own entry, on the cart's page");
  await fillIn(root, "Card");
  assert.equal(trail.entries.length, 3, "one entry for the whole checkout");

  trail.back(); await settle();
  assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3/, "the card form: back to the ways to pay");
  assert.deepEqual(stripe.at(-1), { destroy: `${page(1)}_secret_FAKE` }, "and the form is gone");
  assert.deepEqual([trail.at, trail.entries.length], [2, 3], "still inside");
  trail.back(); await settle();
  assert.match(textOf(steps(root)), /^Purchase · Step 1 of 3/, "then the details");
  assert.deepEqual(filled(root), FORM(TYPED), "as typed");
  click(button(root, "Continue →")); await settle();
  click(button(root, "Continue →")); await settle();
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount", "destroy", "init", "mount"], "forward again with the page's buttons");
  assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length], [1, 1, 1], "the same order");
  trail.back(); await settle(); trail.back(); await settle(); trail.back(); await settle();
  assert.match(screen(root), /Your Cart \(2\)/, "and out to the cart");
  assert.deepEqual([trail.at, trail.left, log.pages], [1, 0, []], "on the cart's own entry, the shop never left");
  trail.back(); await settle();
  assert.equal(trail.at, 0, "Back from the cart goes to the page before it, as ever");
});

test("BACK while the form is opening, and while a payment is being confirmed: out of the opening, at once; never out of the confirming", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  server.world.paidAnswers = [{ paid: false }];
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await details(root);
  await pick(root, "Card");
  const answer = holdServer();
  click(button(root, "Continue →")); await settle();
  trail.back(); await settle();
  assert.match(textOf(steps(root)), /^Purchase · Step 2 of 3/);
  await answer();
  assert.deepEqual([stripe.length, kept().session], [0, page(1)], "no form, the order kept");
  click(button(root, "Continue →")); await settle();
  const check = holdServer();
  stripe.pay(); await settle();
  trail.back(); await settle();
  assert.deepEqual(statuses(root), ["Confirming your payment…"], "a moment: it stays");
  assert.equal(trail.at, 2, "still inside");
  await check();
  assert.ok(button(root, "Check Again"));
  trail.back(); await settle();
  assert.match(screen(root), /Your Cart \(2\)/, "not confirmed yet: Back is the ✕, to the cart; opening the checkout again asks the server");
});

test("BACK on the thank-you closes it, as its own button does; a checkout closed with the ✕ leaves Back where it was", async () => {
  freshWorld();
  const one = openShop([PRINT]);
  click(button(one.root, "Checkout →")); await settle();
  await fillIn(one.root, "Zelle");
  click(button(one.root, "✓ I've Sent the Payment")); await settle();
  assert.match(screen(one.root), /Thank you!/);
  trail.back(); await settle();
  assert.deepEqual(one.log.pages, ["catalog"], "the order is placed: to the shop, as Close does");

  freshWorld();
  const two = openShop([PRINT]);
  click(button(two.root, "Checkout →")); await settle();
  click(button(two.root, "✕")); await settle();
  assert.match(screen(two.root), /Your Cart \(1\)/);
  assert.deepEqual([trail.at, trail.entries[2].inside, trail.listeners.size], [2, true, 0], "closed: it listens no more, its entry marked");
  // As App.jsx does on Back: the entry under it is the same page again, so one more Back goes past it.
  trail.back();
  assert.equal(backInside.samePageAgain(trail.entries[trail.at]), true, "the cart again: go on");
  trail.back();
  assert.equal(backInside.samePageAgain(trail.entries[trail.at]), false, "the catalog: here");
});

test("STEP 1 of the Cart's checkout says the way out: '← Back to Cart'; the Collectors Room's window keeps its ✕ only", async () => {
  freshWorld();
  const { root } = openShop([PRINT]);
  click(button(root, "Checkout →")); await settle();
  click(button(root, "← Back to Cart")); await settle();
  assert.match(screen(root), /Your Cart \(1\)/);
  let closed = 0;
  const room = createRoot(function Room() { return element(CheckoutModal, { items: [PRINT], settings: NO_LINK, onClose: () => { closed++; } }); });
  await settle();
  assert.equal(buttons(room).some(b => /Back/.test(b)), false);
  click(button(room, "✕"));
  assert.equal(closed, 1);
});

test("CHECKOUT from a piece: the Cart page opens straight on its checkout, with the whole cart, once; with nothing in the cart, on the cart", async () => {
  freshWorld();
  const { root, log } = openShop([PRINT, PRINT2], { startCheckout: true });
  await settle();
  assert.match(screen(root), /Purchase · Step 1 of 3← Back to CartWhere should we send it\?/, "the first step, never a payment");
  assert.deepEqual(wallPics(root), [PRINT.image, PRINT2.image], "the whole cart");
  assert.equal(log.started, 1, "said so, once (App.jsx then forgets it)");
  click(button(root, "← Back to Cart")); await settle();
  assert.match(screen(root), /Your Cart \(2\)/);
  assert.equal(log.started, 1);
  const empty = openShop([], { startCheckout: true });
  await settle();
  assert.match(screen(empty.root), /Your cart is empty/);
});

test("INVOICE, WAY BACK: the card form has it above and at its end; another row tapped while the form is opening: no form opens over it, and the next one names the page that was made", async () => {
  invoiceWorld();
  const stripe = fakeStripeJs();
  const root = openInvoice(); await settle();
  click(payOption(root, "Card or Link")); await settle();
  click(button(root, "Pay $1,000 by card →")); await settle();
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  assert.deepEqual([buttons(root).filter(b => b === STRIP).length, buttons(root).filter(b => b === FOOT).length], [1, 1], "above and below the form");
  click(button(root, FOOT)); await settle();
  assert.deepEqual(rowLabels(root).filter(Boolean), INV_ROWS, "the invoice's ways again");
  click(button(root, "Pay $1,000 by card →")); await settle();
  click(button(root, STRIP)); await settle();
  assert.deepEqual(rowLabels(root).filter(Boolean), INV_ROWS);

  const answer = holdServer();
  const before = stripe.length;
  click(button(root, "Pay $1,000 by card →")); await settle();
  assert.equal(server.asked("card-checkout").length, 3);
  click(payOption(root, "Zelle")); await settle();
  assert.match(screen(root), /in the memo/, "Zelle, opened under its row");
  await answer();
  assert.equal(stripe.length, before, "no form opens over it");
  assert.match(screen(root), /in the memo/);
  click(payOption(root, "Klarna")); await settle();
  click(button(root, "Pay $1,000 with Klarna →")); await settle();
  assert.deepEqual(server.asked("card-checkout").at(-1), { token: INV_ORDER.invoice_token, embedded: true, way: "klarna", last: page(3) }, "the page made for the one left is named, so only one page can take the money");
  assert.deepEqual(stripe.slice(before).map(e => Object.keys(e)[0]), ["init", "mount"]);
});

test("INVOICE, BACK on the phone or in the browser: the card form closes and the invoice's ways are there; while a payment is being confirmed it stays", async () => {
  invoiceWorld({ paidAnswers: [{ paid: false }, { paid: true }] });
  trail.entries = [{ page: "home" }, { page: "invoice" }];
  const stripe = fakeStripeJs();
  const root = openInvoice(); await settle();
  assert.equal(trail.listeners.size, 0, "no form: Back is the page's own");
  click(payOption(root, "Card or Link")); await settle();
  click(button(root, "Pay $1,000 by card →")); await settle();
  assert.deepEqual([trail.at, trail.entries[2].inside], [2, true]);
  trail.back(); await settle();
  assert.deepEqual([rowLabels(root).filter(Boolean), trail.at, trail.listeners.size], [INV_ROWS, 1, 0], "the ways to pay, on the invoice's own entry");
  click(button(root, "Pay $1,000 by card →")); await settle();
  const check = holdServer();
  stripe.pay(); await settle();
  trail.back(); await settle();
  assert.deepEqual([statuses(root), trail.at], [["Confirming your payment…"], 2]);
  await check();
  assert.ok(button(root, "Check Again"));
});

// ── leaving and coming back ─────────────────────────────────
// Andy, 2026-11-19, yes to: "there's no 'saved' message and no order number until they pay, or tap
// 'I've Sent the Payment' for Zelle, Venmo or Cash App. When they come back, the checkout looks
// normal, with their name and address already filled in. Behind the scenes it's still one order
// per cart, so trying again never makes a second order."
async function typeAll(root, c) {
  for (const [name, value] of Object.entries(FORM(c))) typeIn(field(root, name), value);
  await settle();
}
const couponField = (root) => only(root, "coupon field", n => n.type === "input" && n.props.placeholder === "FK-XXXX-XXXX");
// The shop says any coupon is valid (the "coupon" op), for the tests that apply one.
function couponsValid() {
  const call = server.call;
  server.call = async (op, payload) => op === "coupon" ? (server.calls.push({ op, payload }), { status: "valid" }) : call(op, payload);
}

test("COMING BACK: the card form opened, the tab closed, Checkout again: no 'saved', no number, every detail filled in as typed; changed, they go with card again to THAT order; then Zelle: still ONE order, its emails once, to the email given last", async () => {
  await quiet(async () => {
    freshWorld();
    const stripe = fakeStripeJs();
    const first = openShop([PRINT, PRINT2]);
    click(button(first.root, "Checkout →")); await settle();
    await typeAll(first.root, SAVED_DETAILS);
    await choose(first.root, "Card");
    assert.deepEqual(stripe.at(-1), { mount: "string" }, "the card form, in place");
    assert.doesNotMatch(screen(first.root), NOT_BEFORE);
    click(button(first.root, "✕")); await settle();

    // The tab closed and opened again: a new page, with only what this browser kept.
    const back = openShop([PRINT, PRINT2]);
    click(button(back.root, "Checkout →")); await settle();
    assert.doesNotMatch(screen(back.root), NOT_BEFORE, "the checkout looks as it always does");
    assert.match(screen(back.root), /Purchase · Step 1 of 3← Back to CartWhere should we send it\?/, "the first step, as always");
    assert.deepEqual(filled(back.root), FORM(SAVED_DETAILS), "every detail filled in, the address too");

    // A new street and email, then card again: THAT order, with the details as on the screen.
    typeIn(field(back.root, "street-address"), "2 New St");
    typeIn(field(back.root, "email"), "jane.new@example.com");
    await settle();
    await choose(back.root, "Card");
    const now = { ...SAVED_DETAILS, address: "2 New St", email: "jane.new@example.com" };
    const o = server.world.orders[0];
    assert.deepEqual(server.asked("cart-again"), [{ ...savedBody(o, page(1), now), email: "jane@example.com", embedded: true, way: "card" }], "named by the email the server gave, with the details as on the screen");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [1, 1, 0], "ONE order, and no email yet");
    assert.deepEqual([o.email, o.customer], ["jane.new@example.com", now], "the order's own rows take the new details");
    assert.deepEqual([kept().email, kept().customer, kept().session], ["jane.new@example.com", now, page(2)], "kept: the email the order has now, the details as typed, the newest page");
    assert.deepEqual(stripe.at(-1), { mount: "string" });
    assert.doesNotMatch(screen(back.root), NOT_BEFORE);
    click(button(back.root, "✕")); await settle();

    // Once more, paid with Zelle this time: still THAT order; its emails go now, once.
    const again = openShop([PRINT, PRINT2]);
    click(button(again.root, "Checkout →")); await settle();
    assert.equal(server.asked("cart-order").at(-1).email, "jane.new@example.com");
    assert.deepEqual(filled(again.root), FORM(now));
    await choose(again.root, "Zelle");
    assert.doesNotMatch(screen(again.root), NOT_BEFORE, "no number before 'I've Sent the Payment'");
    click(button(again.root, "✓ I've Sent the Payment")); await settle();
    assert.match(screen(again.root), /Thank you!/);
    assert.match(screen(again.root), /Order Reference\s*FA-1739/, "the number, on the thank-you");
    assert.deepEqual([server.orders().length, server.asked("cart-card").length, server.world.orders.length, server.world.emails, o.mailedTo], [0, 1, 1, 2, "jane.new@example.com"], "never a second order; the 'order received' pair once, to the email given last");
    assert.deepEqual([again.log.cart.length, kept(), assigned, popups], [0, null, [], []]);
  });
});

test("COMING BACK, a retry never makes a second order: a changed email reached the order but its answer never came back; Try Again finds THAT order, and so does the checkout opened again", async () => {
  await quiet(async () => {
    freshWorld();
    const stripe = fakeStripeJs();
    const o = savedEarlier([PRINT, PRINT2]);
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    typeIn(field(root, "email"), "jane.new@example.com"); await settle();
    server.world.lose = "cart-again";
    await choose(root, "Card");
    assert.equal(o.email, "jane.new@example.com", "the server took the new email");
    assert.deepEqual(statuses(root), [NOT_NOW], "a calm word: the card payment couldn't open");
    assert.deepEqual([kept().email, kept().customer.email], ["jane@example.com", "jane.new@example.com"], "kept: the email the server last gave, and the one sent with the try");
    // Control: named only by the email the server last gave, the order is not found any more.
    await assert.rejects(server.answer("cart-order", savedBody(o, page(0), null) && { ...savedBody(o, page(0), null), email: "jane@example.com" }), { status: 404 });

    click(button(root, "Try Again")); await settle();
    assert.deepEqual(stripe.at(-1), { mount: "string" }, "Try Again: the card form, for THAT order");
    assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length, kept().email], [0, 2, 1, "jane.new@example.com"]);
    click(button(root, "✕")); await settle();

    // The same, then the tab closed before trying again: opened again, the checkout still finds THAT order.
    freshWorld();
    const stripe2 = fakeStripeJs();
    const o2 = savedEarlier([PRINT, PRINT2]);
    const left = openShop([PRINT, PRINT2]);
    click(button(left.root, "Checkout →")); await settle();
    typeIn(field(left.root, "email"), "jane.new@example.com"); await settle();
    server.world.lose = "cart-again";
    await choose(left.root, "Card");
    click(button(left.root, "✕")); await settle();
    const back = openShop([PRINT, PRINT2]);
    click(button(back.root, "Checkout →")); await settle();
    const asked = server.asked("cart-order").at(-1);
    assert.deepEqual([asked.email, asked.customer.email], ["jane@example.com", "jane.new@example.com"], "named by both");
    assert.equal(kept().email, "jane.new@example.com", "the email the order has, from the server's answer");
    assert.deepEqual(filled(back.root), FORM({ ...SAVED_DETAILS, email: "jane.new@example.com" }));
    assert.doesNotMatch(screen(back.root), NOT_BEFORE);
    await choose(back.root, "Card");
    assert.deepEqual(stripe2.at(-1), { mount: "string" });
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails, o2.email], [0, 1, 0, "jane.new@example.com"], "still THAT order, never a second one");
  });
});

test("COMING BACK: Zelle, Venmo and Cash App show no order number before 'I've Sent the Payment' (the memo names the piece instead); the thank-you shows it", async () => {
  for (const [method, memo] of [["Zelle", /3\. Memo: write Test Print Z in your Zelle memo\/note/], ["Venmo", /3\. Note: write Test Print Z in the Venmo note/], ["Cash App", /3\. Note: write Test Print Z in the Cash App note/]]) {
    freshWorld();
    const { root } = openShop([PRINT]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, method);
    assert.doesNotMatch(screen(root), NOT_BEFORE, `${method}: no order number yet`);
    assert.match(screen(root), memo, `${method}: the memo names the piece`);
    click(button(root, "✓ I've Sent the Payment")); await settle();
    assert.match(screen(root), /Order Reference\s*FA-1739\s*Also in your confirmation email/, `${method}: the number, on the thank-you`);
  }
});

test("COMING BACK with a coupon: shown applied as it was, and kept (no Remove: it is in the order's price); a coupon tried once a card payment started without one: said plainly, nothing taken off", async () => {
  await quiet(async () => {
    freshWorld();
    couponsValid();
    fakeStripeJs();
    const first = openShop([PRINT, PRINT2]);
    click(button(first.root, "Checkout →")); await settle();
    await details(first.root);
    typeIn(couponField(first.root), "FK-TEST-0001"); await settle();
    click(button(first.root, "Apply")); await settle();
    await choose(first.root, "Card");
    assert.equal(server.asked("cart-card")[0].couponCode, "FK-TEST-0001");
    assert.equal(kept().coupon, "FK-TEST-0001", "kept: the coupon the server took");
    click(button(first.root, "✕")); await settle();

    const back = openShop([PRINT, PRINT2]);
    click(button(back.root, "Checkout →")); await settle();
    assert.deepEqual([couponField(back.root).props.value, couponField(back.root).props.disabled], ["FK-TEST-0001", true], "the coupon, as it was");
    assert.match(screen(back.root), /✓ 15% discount applied/);
    assert.doesNotMatch(screen(back.root), /you save/, "no sum of the browser's own: the saving is in the server's prices");
    assert.equal(buttons(back.root).includes("Remove"), false, "kept: it is part of the order's price");
    assert.match(screen(back.root), /^✕Test Print Z\$850✓ 15% offTest Print Y\$102✓ 15% offTotal\$952✓ 15% offPurchase/, "the order's own amounts and total, the coupon in them");
    assert.doesNotMatch(screen(back.root), NOT_BEFORE);

    freshWorld();
    couponsValid();
    savedEarlier([PRINT, PRINT2]);
    const late = openShop([PRINT, PRINT2]);
    click(button(late.root, "Checkout →")); await settle();
    typeIn(couponField(late.root), "FK-TEST-0002"); await settle();
    click(button(late.root, "Apply")); await settle();
    assert.match(screen(late.root), /A coupon can't be added now: the card payment already started at this price\. Please contact Fonkiart to use it\./);
    assert.match(screen(late.root), /^✕Test Print Z\$1,000Test Print Y\$120Total\$1,120Purchase/, "the price stays the order's own");
    assert.doesNotMatch(screen(late.root), /discount applied|% off/);
  });
});

// ── a coupon with a size of its own ─────────────────────────
// Andy, 2026-11-22: "maybe we can discount $300 or something if we know the acquisition power of the
// person !!". The server's "coupon" answer says what that code gives (src/lib/couponSize.js); the
// checkout shows it, says it and sends it, and what is shown is what is charged.
const couponGives = (sizes) => {
  const call = server.call;
  server.call = async (op, payload) => op === "coupon" ? (server.calls.push({ op, payload }), { status: "valid", sizes }) : call(op, payload);
};
// The checkout open on these pieces, the coupon typed and applied.
async function withCoupon(cart, sizes) {
  freshWorld();
  if (sizes !== "none") couponGives(sizes); else couponsValid();
  const { root } = openShop(cart);
  click(button(root, "Checkout →")); await settle();
  await details(root);
  typeIn(couponField(root), "FK-TEST-0300"); await settle();
  click(button(root, "Apply")); await settle();
  return root;
}
const sentOrder = () => { const o = server.orders().at(-1); return { total: o.total, amounts: o.items.map(i => i.amount), couponCode: o.couponCode }; };

test("COUPON SIZE, one piece: $300 off shows on it, on step 1 and for Zelle, and the order takes exactly that", async () => {
  const root = await withCoupon([PRINT], [{ dollars: 300, of: 1111 }]);
  assert.match(screen(root), /^✕Test Print Z\$811✓ \$300 offPurchase/, "on the art wall");
  assert.match(screen(root), /✓ \$300 off applied — you save \$300/, "on step 1");
  assert.doesNotMatch(screen(root), /%/, "never a percent");
  await choose(root, "Zelle");
  assert.match(textOf(steps(root)), /Send via Zelle\$811✓ \$300 coupon applied/);
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual(sentOrder(), { total: 811, amounts: [811], couponCode: "FK-TEST-0300" });
  assert.deepEqual(Object.keys(server.orders()[0]).sort(), ["couponCode", "customer", "items", "orderRef", "total"], "only the code goes to the server, never how much it gives");
});

test("COUPON SIZE, several pieces: $300 comes off the ORDER, said once under the total; the prices shown add up to it, and are what is sent", async () => {
  const root = await withCoupon([PRINT, PRINT2], [{ percent: 15 }, { dollars: 300, of: 1111 }]);
  assert.match(screen(root), /^✕Test Print Z\$840Test Print Y\$91Total\$931✓ \$300 offPurchase/, "1,231 less 300: each piece its share, the words once");
  assert.match(screen(root), /✓ \$300 off applied — you save \$300/);
  await choose(root, "Venmo");
  assert.match(textOf(steps(root)), /Send via Venmo\$931✓ \$300 coupon applied/);
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual(sentOrder(), { total: 931, amounts: [840, 91], couponCode: "FK-TEST-0300" });
});

test("COUPON SIZE: the best of a code's sizes for THIS cart: on a small piece its 20% beats $300's share, and shows as a %", async () => {
  const root = await withCoupon([PRINT2], [{ percent: 20 }, { dollars: 150, of: 1111 }]);
  assert.match(screen(root), /^✕Test Print Y\$96✓ 20% offPurchase/, "20% off 120 is 24; $150's share of 120 is 16");
  assert.match(screen(root), /✓ 20% discount applied — you save \$24/);
});

test("COUPON SIZE: the total shown is the sum of the prices shown, never rounded on its own", async () => {
  const root = await withCoupon([{ ...PRINT, price: 10 }, { ...PRINT2, price: 10 }], "none");
  assert.match(screen(root), /^✕Test Print Z\$9✓ 15% offTest Print Y\$9✓ 15% offTotal\$18✓ 15% offPurchase/, "8.50 rounds to 9 on each; 15% off 20 alone would say 17");
  assert.match(screen(root), /you save \$2(?!\d)/);
  await choose(root, "Zelle");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual(sentOrder(), { total: 18, amounts: [9, 9], couponCode: "FK-TEST-0300" });
});

test("control, COUPON SIZE: an answer with no sizes (an older server), or with nothing that is one, gives the shop's % as before; Remove takes it all off again", async () => {
  for (const sizes of ["none", null, [], "20", [{ percent: 200 }, { dollars: 5 }, null]]) {
    const root = await withCoupon([PRINT], sizes);
    assert.match(screen(root), /^✕Test Print Z\$944✓ 15% offPurchase/, JSON.stringify(sizes));
    assert.match(screen(root), /✓ 15% discount applied — you save \$167/);
    click(button(root, "Remove")); await settle();
    assert.match(screen(root), /^✕Test Print Z\$1,111Purchase/, "the full price again");
    assert.doesNotMatch(screen(root), /% off|applied/);
  }
});

test("COMING BACK with a $300 coupon: the server's amounts and its words, on the wall, on step 1 and for Zelle; two copies of a piece keep their own amounts", async () => {
  await quiet(async () => {
    freshWorld();
    couponGives([{ dollars: 300, of: 1111 }]);
    const stripe = fakeStripeJs();
    // As the server prices it: 1,000 + 120, less $300.
    server.world.cardAnswer = (o) => {
      o.lines = [{ title: "Test Print Z", amount: 732 }, { title: "Test Print Y", amount: 88 }];
      o.total = 820;
      server.world.pages.set(page(1), { id: page(1), status: "open", ref: o.ref });
      return { ref: o.ref, ids: o.ids, lines: o.lines, total: 820, coupon: "FK-TEST-0300", couponWords: "$300 off", session: page(1), clientSecret: "cs_FAKE", publishableKey: FAKE_PK };
    };
    const first = openShop([PRINT, PRINT2]);
    click(button(first.root, "Checkout →")); await settle();
    await details(first.root);
    typeIn(couponField(first.root), "FK-TEST-0300"); await settle();
    click(button(first.root, "Apply")); await settle();
    await choose(first.root, "Card");
    assert.deepEqual(stripe.at(-1), { mount: "string" }, "the card form");
    assert.match(screen(first.root), /^✕Test Print Z\$732Test Print Y\$88Total\$820✓ \$300 offPurchase/, "the amounts the card is charged");
    assert.deepEqual([kept().coupon, kept().couponWords], ["FK-TEST-0300", "$300 off"], "kept with the order");
    click(button(first.root, "✕")); await settle();

    const back = openShop([PRINT, PRINT2]);
    click(button(back.root, "Checkout →")); await settle();
    assert.match(screen(back.root), /^✕Test Print Z\$732Test Print Y\$88Total\$820✓ \$300 offPurchase/);
    assert.match(screen(back.root), /✓ \$300 off applied/);
    assert.doesNotMatch(screen(back.root), /you save|%/, "no sum of the browser's own, and never a percent");
    await choose(back.root, "Zelle");
    assert.match(textOf(steps(back.root)), /Send via Zelle\$820✓ \$300 coupon applied/);
    assert.equal(kept().couponWords, "$300 off", "still kept, after the server was asked about the order");

    // Two copies of a print: each line of the order once, never the first one twice.
    freshWorld();
    fakeStripeJs();
    const copies = [PRINT, { ...PRINT, id: "t9" }];
    const o = { ref: "FA-1739", ids: [5001, 5002], email: "jane@example.com", total: 1001, status: "pending", lines: [{ title: "Test Print Z", amount: 501 }, { title: "Test Print Z", amount: 500 }] };
    server.world.orders.push(o);
    cartOrder.saveCardOrder({ ...o, customer: SAVED_DETAILS, coupon: "FK-TEST-0300", couponWords: "$999 off" });
    const two = openShop(copies);
    click(button(two.root, "Checkout →")); await settle();
    assert.match(screen(two.root), /^✕Test Print Z\$501Test Print Z\$500Total\$1,001✓ \$999 offPurchase/);
  });
});

test("COMING BACK: an order kept before the details were (its email only): the email filled in, the rest asked again; paying finds THAT order", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const o = savedEarlier([PRINT, PRINT2], { customer: null });
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  assert.doesNotMatch(screen(root), NOT_BEFORE);
  assert.deepEqual(filled(root), FORM({ ...TYPED, firstName: "", lastName: "" }), "the email it was saved with; the rest to fill in");
  click(button(root, "Continue →")); await settle();
  assert.equal(server.asked("cart-again").length, 0, "Continue asks for the name first");
  assert.match(screen(root), /Please enter your first and last name\./);
  assert.equal(payOptions(root).length, 0, "and stays on the first step until it is given");
  await details(root);
  await choose(root, "Card");
  assert.deepEqual(server.asked("cart-again"), [{ ...savedBody(o, page(0), null), customer: TYPED, embedded: true, way: "card" }]);
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length], [0, 1], "THAT order");
  assert.deepEqual(stripe.at(-1), { mount: "string" });
});

test("control: the Collectors Room's checkout (no onSuccess) still shows its own thank-you screen, and Close closes it", async () => {
  freshWorld();
  let closed = 0;
  const root = createRoot(function Room() { return element(CheckoutModal, { items: [PRINT], settings: NO_LINK, onClose: () => { closed++; } }); });
  await settle();
  await fillIn(root, "Zelle");
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.match(screen(root), /Your order for Test Print Z has been received\./);
  assert.match(screen(root), /FA-1739/);
  assert.deepEqual(scrolls, [], "a pop-up over the page: the page stays where it was");
  click(button(root, "Close"));
  assert.equal(closed, 1);
  assert.equal(server.orders().length, 1);
});

test("no browser pop-ups in the checkout, the Cart page or the card payment", () => {
  const POPUP = /\b(alert|confirm|prompt)\s*\(/;
  for (const file of ["components/CheckoutModal.jsx", "pages/CartPage.jsx", "components/CardCheckout.jsx", "components/PayArt.jsx",
    "components/PaidThanks.jsx", "pages/CardReturnPage.jsx", "lib/cartOrder.js", "lib/stripeJs.js"]) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), POPUP, file);
  }
  assert.match(`else alert("${CARD_SOON}");`, POPUP, "control: the check sees a pop-up when there is one");
});

test("NO JUMP: nothing in the checkout, the Cart page or the card form can send this tab anywhere", () => {
  const LEAVES = /location\.(assign|replace)\s*\(|location\.href\s*=(?!=)|\blocation\s*=(?!=)|window\.open\s*\(/;
  for (const file of ["components/CheckoutModal.jsx", "pages/CartPage.jsx", "components/CardCheckout.jsx", "components/PayArt.jsx",
    "components/PaidThanks.jsx", "lib/cartOrder.js", "lib/stripeJs.js"]) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), LEAVES, file);
  }
  for (const jump of ["else if (order.url) { setLeaving(order.url); window.location.assign(order.url); }", "window.location.href = url;", "location.replace(url)", "window.open(url, \"_self\")"]) {
    assert.match(jump, LEAVES, `control: the check sees a jump when there is one: ${jump}`);
  }
  assert.doesNotMatch("const site = window.location.origin;", LEAVES, "control: reading the address is not leaving it");
  assert.equal(CARD_FORM_DOWN, cartOrder.CARD_FORM_DOWN, "the browser and the server say the same calm words");
});

// Defined last, so it runs last: across every test above, the checkout never once tried to send
// this tab (or a new one) anywhere.
test("NO JUMP: across every flow above, the tab never left fonkiart.com", () => {
  assert.deepEqual(everLeft, []);
});
