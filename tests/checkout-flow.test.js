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
//     the pieces first.
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
import * as invoiceView from "../src/lib/invoiceView.js";
import { CARD_FORM_DOWN } from "../api/_lib/cartCheckout.js";

// ── a small stand-in for React ──────────────────────────────
const FRAGMENT = Symbol("Fragment");
const element = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
let drawing = null; // the component being drawn right now

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
    for (const run of root.effects.splice(0)) run();
    onDraw?.(root);
  }
  draw();
  return root;
}

// ── reading and using the screen ────────────────────────────
const textOf = (n) => typeof n === "string" ? n : n.type === "br" ? "\n" : n.children.map(textOf).join("");
const findAll = (n, want, out = []) => {
  if (typeof n !== "string") { if (want(n)) out.push(n); for (const c of n.children) findAll(c, want, out); }
  return out;
};
const screen = (root) => textOf(root.tree);
function only(root, what, want) {
  const hits = findAll(root.tree, want);
  assert.equal(hits.length, 1, `expected one ${what} on the screen, found ${hits.length}. The screen:\n${screen(root)}`);
  return hits[0];
}
const button = (root, label) => only(root, `"${label}" button`, n => n.type === "button" && textOf(n).trim() === label);
const payOption = (root, label) => only(root, `"${label}" payment option`, n => n.type === "button" && String(n.props.className).includes("pay-opt") && textOf(n).includes(label));
const field = (root, autoComplete) => only(root, `${autoComplete} field`, n => n.type === "input" && n.props.autoComplete === autoComplete);
const alerts = (root) => findAll(root.tree, n => n.props.role === "alert");
const statuses = (root) => findAll(root.tree, n => n.props.role === "status").map(textOf);
const buttons = (root) => findAll(root.tree, n => n.type === "button").map(n => textOf(n).trim());
const pics = (root, className) => findAll(root.tree, n => n.type === "img" && n.props.className === className).map(n => n.props.src);
const fields = (root) => findAll(root.tree, n => n.type === "input").length;
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
const SAVED_BUT = `Your order FA-1739 is saved, but the card payment couldn't open right now. Please try again in a moment, or choose another way to pay.`;
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
let server, popups, opened, assigned;
const everLeft = []; // every time ANY test's checkout tried to send this tab away: never
function freshWorld({ orderFails = false, cardOn = true, pk = true } = {}) {
  popups = []; opened = []; assigned = [];
  storage.clear();
  delete window.Stripe;
  const calls = [];
  const world = { cardOn, pk, stripeJs: true, stripeDown: false, orders: [], pages: new Map(), emails: 0, hold: null, again: null, cardAnswer: null, orderState: null, paidAnswers: [] };
  let made = 0;
  const failed = (status, message) => Object.assign(new Error(message), { status });
  const view = (o) => ({ ref: o.ref, ids: o.ids, lines: o.lines, total: o.total });
  const newPage = (o) => {
    const id = page(++made);
    world.pages.set(id, { id, status: "open", ref: o.ref });
    return { session: id, clientSecret: `${id}_secret_FAKE`, publishableKey: "pk_test_FAKE" };
  };
  const noForm = (p) => p.embedded !== true || !world.pk;
  // The saved order the browser names: its reference, rows and email, and the cart's own titles.
  const named = (p) => {
    const o = world.orders.find(x => x.ref === p.ref && JSON.stringify(x.ids) === JSON.stringify(p.ids) && x.email === p.email
      && JSON.stringify(x.lines.map(l => l.title).sort()) === JSON.stringify([...(p.titles || [])].sort()));
    if (!o || o.gone) throw failed(404, "We couldn't find that order.");
    return o;
  };
  server = {
    calls, world, failed, view,
    orders: () => calls.filter(c => c.op === "order").map(c => c.payload),
    asked: (op) => calls.filter(c => c.op === op).map(c => c.payload),
    async call(op, payload) {
      calls.push({ op, payload });
      if (world.hold && op !== "next-ref") await world.hold;
      if (op === "next-ref") return { ref: "FA-1739" };
      if (op === "order") { if (orderFails) throw new Error("Store 500"); world.emails += 2; return { ok: true }; }
      if (op === "cart-card") {
        if (!world.cardOn) throw failed(409, CARD_SOON);
        if (noForm(payload)) throw failed(409, CARD_FORM_DOWN);
        if (orderFails) throw new Error("Store 500");
        const lines = payload.items.map(i => ({ title: i.title, amount: PRICES[i.title] }));
        const o = { ref: "FA-1739", ids: lines.map((_, n) => 5001 + n), email: payload.customer.email.trim(), lines, total: lines.reduce((sum, l) => sum + l.amount, 0), status: "pending" };
        world.orders.push(o); world.emails += 2;
        if (world.cardAnswer) return world.cardAnswer(o);
        if (world.stripeDown) return { ...view(o), cardError: SAVED_BUT };
        return { ...view(o), ...newPage(o) };
      }
      if (op === "cart-again") {
        if (!world.cardOn) throw failed(409, CARD_SOON);
        const o = named(payload);
        if (world.again) return world.again(o);
        if (o.status === "paid") return { paid: true, ...view(o), name: "Jane" };
        if (noForm(payload)) throw failed(409, CARD_FORM_DOWN);
        const last = world.pages.get(payload.session);
        if (last?.status === "open") last.status = "expired";
        if (world.stripeDown) throw failed(502, NOT_NOW);
        return { ...view(o), ...newPage(o) };
      }
      if (op === "cart-order") {
        if (world.orderState === "down") throw failed(502, NOT_NOW);
        if (world.orderState === "gone") throw failed(404, "We couldn't find that order.");
        const o = named(payload);
        const state = world.orderState || (o.status === "paid" ? "paid" : "open");
        return state === "closed" ? { state } : { state, ...view(o), name: "Jane" };
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
// An order an earlier card attempt saved: on the server, and kept in this browser with its last page.
function savedEarlier(cart) {
  const lines = cart.map(i => ({ title: i.title, amount: PRICES[i.title] }));
  const o = { ref: "FA-1739", ids: lines.map((_, n) => 5001 + n), email: "jane@example.com", lines, total: lines.reduce((sum, l) => sum + l.amount, 0), status: "pending" };
  server.world.orders.push(o); server.world.emails += 2;
  server.world.pages.set(page(0), { id: page(0), status: "open", ref: o.ref });
  cartOrder.saveCardOrder({ ...o, session: page(0) });
  return o;
}
const savedBody = (o, session = page(0)) => ({ ref: o.ref, ids: o.ids, email: o.email, titles: TITLES, session });

globalThis.window = {
  open: (url, target) => { opened.push({ url, target }); everLeft.push(url); return null; },
  // This tab going anywhere (to Stripe's own page, say), and what the browser had kept then.
  location: { origin: "https://www.fonkiart.com", assign: (url) => { assigned.push({ url, session: kept()?.session }); everLeft.push(url); } },
};
for (const name of ["alert", "confirm", "prompt"]) globalThis[name] = (message) => { popups.push({ name, message }); };

// Stripe.js as it behaves: one embedded form on a page at a time (another is refused until the
// first is destroyed); the form asks for its secret, then goes into its box. refuse: Stripe.js
// is there but won't make the form (a wrong key, say).
function fakeStripeJs({ refuse = false } = {}) {
  const log = [];
  let live = 0;
  window.Stripe = (pk) => ({
    async initEmbeddedCheckout({ fetchClientSecret }) {
      if (refuse) throw new Error("Invalid publishable key");
      if (live) throw new Error("You cannot have multiple Embedded Checkout objects.");
      live++;
      const secret = await fetchClientSecret();
      log.push({ init: secret, pk, kept: kept()?.session });
      return { mount: (box) => log.push({ mount: typeof box?.id }), destroy: () => { live--; log.push({ destroy: secret }); } };
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
const PayArt = await load("components/PayArt.jsx", { "react/jsx-runtime": runtime, "./Pic": { default: Pic }, "../lib/invoiceView": invoiceView });
const PaidThanks = await load("components/PaidThanks.jsx", { "react/jsx-runtime": runtime, "./PayArt": { default: PayArt }, "../lib/invoiceView": invoiceView });
const CardCheckout = await load("components/CardCheckout.jsx", { react: React, "react/jsx-runtime": runtime, "./PayArt": { default: PayArt } });
const CheckoutModal = await load("components/CheckoutModal.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/supabase": { BREVO_SENDER: "shop@example.com" },
  "../lib/store": store, "../lib/stripeJs": stripeJs, "../lib/cartOrder": cartOrder,
  "./CardCheckout": { default: CardCheckout }, "./PaidThanks": { default: PaidThanks }, "./Pic": { default: Pic },
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
function openShop(cart, { settings = NO_LINK, cancelledRef, artworks = [] } = {}) {
  const log = { pages: [], draws: [], paid: [] };
  function Shop() {
    const [inCart, setCart] = React.useState(cart);
    const [shown, setPage] = React.useState("cart");
    log.cart = inCart; log.page = shown;
    if (shown !== "cart") return element("main", { children: `The ${shown} page` });
    return element(CartPage, {
      cart: inCart, items: artworks, settings, cancelledRef,
      removeFromCart: (id) => setCart(prev => prev.filter(i => i.id !== id)),
      addToCart: (item) => setCart(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]),
      setPage: (p) => { log.pages.push(p); setPage(p); },
      onPaid: (titles) => { log.paid.push(titles); cartOrder.dropCardOrder(); setCart(prev => cartOrder.withoutTitles(prev, titles)); },
    });
  }
  const root = createRoot(Shop, (r) => log.draws.push({ cart: log.cart.length, thanks: screen(r).includes("Thank you!") }));
  return { root, log };
}
async function fillIn(root, method) {
  typeIn(field(root, "given-name"), "Jane");
  typeIn(field(root, "family-name"), "Smith");
  typeIn(field(root, "email"), "jane@example.com");
  await settle();
  await choose(root, method);
}
async function choose(root, method) {
  click(payOption(root, method)); await settle();
  click(button(root, "Continue →")); await settle();
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
    for (const [method, pay, op] of [["Zelle", "✓ I've Sent the Payment", "order"], ["Credit Card", "Pay Securely with Card →", "cart-card"]]) {
      freshWorld({ orderFails: true });
      const { root, log } = openShop([PRINT, PRINT2], { settings: { ...NO_LINK, stripeLink: SHOP_LINK } });
      click(button(root, "Checkout →")); await settle();
      await fillIn(root, method);
      click(button(root, pay)); await settle();
      assert.equal(server.asked(op).length, 1, `${method}: it tried once`);
      assert.doesNotMatch(screen(root), /Thank you/);
      assert.equal(log.cart.length, 2, `${method}: the cart is kept`);
      assert.deepEqual(log.pages, []);
      assert.deepEqual([opened, assigned], [[], []], `${method}: no card page opened`);
      assert.equal(kept(), null, `${method}: nothing kept to pay again`);
      assert.deepEqual(alerts(root).map(textOf), ["We couldn't save your order. Please email shop@example.com with your order number FA-1739."]);
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
      // Measured, not changed: the Credit Card option is offered even while card payments are off.
      await fillIn(root, "Credit Card");
      click(button(root, "Pay Securely with Card →")); await settle();

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
      assert.ok(button(root, "Pay Securely with Card →"), "still on the payment step");
      assert.doesNotMatch(screen(root), /Thank you/);
      assert.equal(log.cart.length, cart.length, "the cart is untouched");

      click(button(root, "← Back")); await settle();
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
    await fillIn(root, "Credit Card");
    assert.match(screen(root), /Pay for 2 items \(\$1,231\) securely by card, through Stripe\./);
    click(button(root, "Pay Securely with Card →")); await settle();

    const [asked] = server.asked("cart-card");
    assert.deepEqual([asked.embedded, asked.site, asked.orderRef], [true, "https://www.fonkiart.com", "FA-1739"], "Stripe.js was ready, so the server was asked");
    assert.deepEqual([server.world.orders, server.world.emails], [[], 0], "no order saved, no email");
    assert.equal(kept(), null, "nothing kept");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN], "said calmly, in place");
    assert.deepEqual(alerts(root), [], "not an alarm");
    assert.deepEqual(buttons(root), ["✕", "← Back", "Try Again", "Choose Another Way to Pay"]);
    assert.deepEqual([assigned, opened, stripe], [[], [], []], "this tab never left, and no form was made");
    assert.equal(log.cart.length, 2, "the cart is untouched");
    assert.doesNotMatch(screen(root), /Thank you|Stripe's secure page|Stripe's own/);

    // Another way to pay: the details are still there, and Zelle saves ONE order, as always.
    click(button(root, "Choose Another Way to Pay")); await settle();
    assert.deepEqual(statuses(root), [], "the word goes with it");
    assert.equal(field(root, "email").props.value, "jane@example.com", "nothing to type again");
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
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.deepEqual([assigned, opened], [[], []], "this tab stays on fonkiart.com");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.equal(kept().session, page(9), "the saved order, kept to pay again in the form");
    assert.deepEqual(buttons(root), ["✕", "← Back", "Try Again", "Choose Another Way to Pay"]);
    assert.equal(log.cart.length, 2);
  });
});

test("NO JUMP: the server can't offer the form, then can (the key fixed): Try Again saves the order and opens the form in place", async () => {
  await quiet(async () => {
    freshWorld({ pk: false });
    const stripe = fakeStripeJs();
    const { root } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    click(button(root, "Try Again")); await settle();
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN], "still not: still nothing saved");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length], [2, 0]);

    server.world.pk = true;
    click(button(root, "Try Again")); await settle();
    assert.deepEqual(stripe, [{ init: `${page(1)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(1) }, { mount: "string" }], "kept, then made, then put in its box");
    assert.match(screen(root), /Your order FA-1739/);
    assert.deepEqual(statuses(root), [], "the calm word is gone, and the form is in");
    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [3, 1, 2]);
    assert.deepEqual(assigned, []);
  });
});

test("card: a double tap makes ONE call; until the form is there the buyer sees 'Opening the secure card form…', with nothing to tap twice", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Credit Card");
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  const pay = button(root, "Pay Securely with Card →");
  click(pay); click(pay); // the same button twice, before the page can draw again
  await settle();
  assert.equal(server.asked("cart-card").length, 1);
  assert.deepEqual(statuses(root), ["Opening the secure card form…"]);
  assert.deepEqual(buttons(root), ["✕"], "no pay button to tap again, and no Back half-way");
  answer(); server.world.hold = null; await settle();
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"], "the form, in place");
  assert.deepEqual([server.world.orders.length, server.world.emails, assigned], [1, 2, []]);
});

test("card: Stripe.js comes FIRST: while it loads nothing is asked of the server (nothing saved), and the buyer sees 'Opening the secure card form…'", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  let loaded;
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Credit Card");
  server.world.stripeJs = new Promise(r => { loaded = r; });
  click(button(root, "Pay Securely with Card →")); await settle();
  assert.deepEqual(statuses(root), ["Opening the secure card form…"]);
  assert.deepEqual(server.asked("cart-card"), [], "nothing saved while Stripe.js loads");
  loaded(true); await settle();
  assert.equal(server.asked("cart-card").length, 1);
  assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
  assert.deepEqual(assigned, []);
});

test("card form INSIDE the page: the pieces first, then Stripe's form; leaving it or the checkout destroys it, and paying again re-opens the SAME order, naming its last page", async () => {
  await quiet(async () => {
    freshWorld();
    const stripe = fakeStripeJs();
    const { root, log } = openShop([PRINT, PRINT2]);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();

    assert.deepEqual(stripe, [{ init: `${page(1)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(1) }, { mount: "string" }], "kept, then made, then put in its box");
    const text = screen(root);
    assert.match(text, /Your order FA-1739/);
    assert.match(text, /Test Print Z\$1,000Test Print Y\$120Total\$1,120/, "the shop's own prices");
    assert.doesNotMatch(text, /Opening the secure card form/, "the form is in");
    assert.deepEqual(pics(root, "pay-art-pic"), [PRINT.image, PRINT2.image]);
    assert.equal(log.cart.length, 2);

    click(button(root, "← Choose another way to pay")); await settle();
    assert.deepEqual(stripe.at(-1), { destroy: `${page(1)}_secret_FAKE` });
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.deepEqual(server.asked("cart-again").at(-1), { ...savedBody(server.world.orders[0], page(1)), embedded: true, site: "https://www.fonkiart.com" });
    assert.equal(server.world.pages.get(page(1)).status, "expired");
    assert.deepEqual(stripe.slice(-2), [{ init: `${page(2)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(2) }, { mount: "string" }]);

    // The whole checkout closed with the form open, then opened again.
    click(button(root, "✕")); await settle();
    assert.deepEqual(stripe.at(-1), { destroy: `${page(2)}_secret_FAKE` });
    click(button(root, "Checkout →")); await settle();
    assert.match(screen(root), /Your order FA-1739 is saved/);
    assert.equal(fields(root), 0, "no details to fill in again");
    assert.deepEqual(server.asked("cart-order"), [savedBody(server.world.orders[0], page(2))]);
    await choose(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.equal(server.asked("cart-again").at(-1).session, page(2));
    assert.deepEqual(stripe.slice(-2), [{ init: `${page(3)}_secret_FAKE`, pk: "pk_test_FAKE", kept: page(3) }, { mount: "string" }]);
    assert.doesNotMatch(screen(root), /couldn't open here/, "Stripe never refused a second form: each one went before the next");

    assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [1, 1, 2], "ONE order, ONE pair of emails");
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
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();

    assert.deepEqual(statuses(root), [SAVED_BUT]);
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
    assert.deepEqual([server.asked("cart-card").length, server.asked("cart-again").length, server.world.orders.length, server.world.emails], [1, 2, 1, 2]);
    assert.deepEqual(assigned, []);
    assert.equal(log.cart.length, 2);
  });
});

test("card page couldn't open: 'Choose Another Way to Pay' pays THAT order by Zelle, with nothing saved or emailed again", async () => {
  freshWorld();
  server.world.stripeDown = true;
  const { root, log } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  await fillIn(root, "Credit Card");
  click(button(root, "Pay Securely with Card →")); await settle();
  click(button(root, "Choose Another Way to Pay")); await settle();
  assert.match(screen(root), /Your order FA-1739 is saved/);
  assert.equal(fields(root), 0);
  await choose(root, "Zelle");
  assert.match(screen(root), /Send \$1,120 to shop-zelle@example\.com/, "the saved order's own total");
  assert.match(screen(root), /Order NumberFA-1739/);
  click(button(root, "✓ I've Sent the Payment")); await settle();
  assert.deepEqual([server.orders().length, server.world.orders.length, server.world.emails], [0, 1, 2], "no second order, no second email");
  assert.match(screen(root), /Thank you!/);
  assert.match(screen(root), /FA-1739/);
  assert.equal(log.cart.length, 0);
  assert.equal(kept(), null, "done with");
});

test("checkout opened again with a saved order: the server is asked once (cart-order), and Continue waits for its answer", async () => {
  freshWorld();
  const stripe = fakeStripeJs();
  const o = savedEarlier([PRINT, PRINT2]);
  let answer;
  server.world.hold = new Promise(r => { answer = r; });
  const { root } = openShop([PRINT, PRINT2]);
  click(button(root, "Checkout →")); await settle();
  assert.match(screen(root), /Your order FA-1739 is saved/);
  await choose(root, "Credit Card");
  assert.equal(buttons(root).includes("Pay Securely with Card →"), false, "Continue waited");
  answer(); server.world.hold = null; await settle();
  click(button(root, "Continue →")); await settle();
  click(button(root, "Pay Securely with Card →")); await settle();
  assert.deepEqual(server.asked("cart-order"), [savedBody(o)]);
  assert.equal(server.asked("cart-again")[0].session, page(0), "the last page, named");
  assert.equal(server.world.pages.get(page(0)).status, "expired");
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails], [0, 1, 2]);
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
      await fillIn(root, "Credit Card");
      click(button(root, "Pay Securely with Card →")); await settle();
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
    assert.match(screen(root), /Your order FA-1739 is saved/);
    server.world.orderState = null;
    await choose(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
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
    await choose(root, "Credit Card");
    server.world.orders[0].status = "paid";
    click(button(root, "Pay Securely with Card →")); await settle();
    assertPaidThanks(root);
    assert.deepEqual([log.paid, log.cart, kept()], [[TITLES], [], null]);

    freshWorld();
    const gone = openShop([PRINT, PRINT2]);
    savedEarlier([PRINT, PRINT2]);
    click(button(gone.root, "Checkout →")); await settle();
    await choose(gone.root, "Credit Card");
    server.world.orders[0].gone = true;
    click(button(gone.root, "Pay Securely with Card →")); await settle();
    assert.match(screen(gone.root), /We couldn't find your saved order\. Please enter your details again\./);
    assert.equal(fields(gone.root) > 0, true, "the details form is back");
    assert.equal(kept(), null);

    freshWorld();
    const sold = openShop([PRINT, PRINT2]);
    savedEarlier([PRINT, PRINT2]);
    const SOLD = "“Test Print Z” has already been sold, so this order can't be paid by card. Please contact Fonkiart.";
    server.world.again = () => { throw server.failed(409, SOLD); };
    click(button(sold.root, "Checkout →")); await settle();
    await choose(sold.root, "Credit Card");
    click(button(sold.root, "Pay Securely with Card →")); await settle();
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
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(alerts(root), []);
    assert.deepEqual(buttons(root), ["✕", "← Back", "Try Again", "Choose Another Way to Pay"]);
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
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.deepEqual(server.calls.map(c => c.op).filter(op => op !== "next-ref"), [], "the server was never asked: nothing saved, nothing emailed");
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(alerts(root), []);
    assert.deepEqual(buttons(root), ["✕", "← Back", "Try Again", "Choose Another Way to Pay"]);
    assert.deepEqual([assigned, opened, kept()], [[], [], null]);

    click(button(root, "Try Again")); await settle(); // still blocked
    assert.deepEqual(statuses(root), [CARD_FORM_DOWN]);
    assert.deepEqual(server.asked("cart-card"), []);

    server.world.stripeJs = true; // it loads this time
    const stripe = fakeStripeJs();
    click(button(root, "Try Again")); await settle();
    assert.equal(server.asked("cart-card").length, 1);
    assert.deepEqual(stripe.map(e => Object.keys(e)[0]), ["init", "mount"]);
    assert.deepEqual([server.world.orders.length, server.world.emails, assigned, log.cart.length], [1, 2, [], 2]);
  });
});

test("back from Stripe's own page without paying (an order started there before): the SAME saved order (asked with cart-order), a calm word, the cart all there; Checkout re-opens that order in the form", async () => {
  freshWorld();
  const o = savedEarlier([PRINT, PRINT2]);
  const { root, log } = openShop([PRINT, PRINT2], { cancelledRef: "FA-1739" });
  await settle();
  assert.deepEqual(server.asked("cart-order"), [savedBody(o)]);
  assert.deepEqual(statuses(root), ["No payment was takenYour order FA-1739 is saved, and your cart is just as you left it. Tap Checkout to pay by card again, or with Zelle, Venmo or Cash App."]);
  assert.match(screen(root), /Your Cart \(2\)/);
  assert.deepEqual(alerts(root), []);
  const stripe = fakeStripeJs();
  click(button(root, "Checkout →")); await settle();
  await choose(root, "Credit Card");
  click(button(root, "Pay Securely with Card →")); await settle();
  assert.equal(server.asked("cart-again").at(-1).session, page(0));
  assert.deepEqual([server.asked("cart-card").length, server.world.orders.length, server.world.emails, assigned.length], [0, 1, 2, 0]);
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
  assert.match(screen(root), /Your order FA-1739 is saved, and your cart is just as you left it\./);
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
    assert.deepEqual(away.log.paid, []);
    click(button(away.root, "Check Again")); await settle();
    assert.deepEqual(away.log.paid, [TITLES]);
  });
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
