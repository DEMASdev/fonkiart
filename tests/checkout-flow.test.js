// The checkout (src/components/CheckoutModal.jsx) and the Cart page that opens it
// (src/pages/CartPage.jsx), run from the live source files. Two fixes, 2026-11-18:
//  1. A buyer who pays from the Cart page sees the thank-you screen, with the items and the
//     Order Reference. The cart is still emptied the moment the order is placed.
//  2. The card button with no card link saves NOTHING and says so on the page. Andy's standing
//     rule: no browser pop-ups (alert/confirm/prompt).
// Nothing is saved or emailed: the server (storeCall) and window.open are stand-ins that only
// record what they were asked.
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
};
const React = new Proxy(hooks, { get(t, name) { if (name in t) return t[name]; throw new Error(`the test's stand-in React has no ${String(name)}`); } });

function createRoot(App, onDraw) {
  const root = { live: new Map(), effects: [], queued: false, tree: null };
  root.schedule = () => {
    if (root.queued) return;
    root.queued = true;
    queueMicrotask(() => { root.queued = false; draw(); });
  };
  function draw() {
    const seen = new Set();
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
      return [{ type: node.type, props, children: expand(children, `${path}/${node.type}`) }];
    };
    root.tree = { type: "#root", props: {}, children: expand(element(App, {}), "") };
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
function click(node) {
  assert.ok(!node.props.disabled, `"${textOf(node).trim()}" is disabled`);
  node.props.onClick?.({ stopPropagation() {}, preventDefault() {} });
}
const typeIn = (node, value) => node.props.onChange({ target: { value } });
// Lets the stand-in server answer and every re-render run.
const settle = async () => { for (let k = 0; k < 10; k++) await new Promise(r => setImmediate(r)); };

// ── the stand-ins: server, browser, and the two files under test ──
let server, popups, opened;
function freshWorld({ orderFails = false } = {}) {
  popups = []; opened = [];
  const calls = [];
  server = {
    calls,
    orders: () => calls.filter(c => c.op === "order").map(c => c.payload),
    async call(op, payload) {
      calls.push({ op, payload });
      if (op === "next-ref") return { ref: "FA-1739" };
      if (op === "order") { if (orderFails) throw new Error("Store 500"); return { ok: true }; }
      throw new Error(`the checkout asked the server for "${op}"`);
    },
  };
}
globalThis.window = { open: (url, target) => { opened.push({ url, target, ordersBefore: server.orders().length }); return null; } };
for (const name of ["alert", "confirm", "prompt"]) globalThis[name] = (message) => { popups.push({ name, message }); };

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
const Pic = function Pic() { return null; };
const CheckoutModal = await load("components/CheckoutModal.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/supabase": { BREVO_SENDER: "shop@example.com" },
  "../lib/store": { storeCall: (...a) => server.call(...a) },
  "./Pic": { default: Pic },
});
const CartPage = await load("pages/CartPage.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../components/ArtworkModal": { default: function ArtworkModal() { return null; } },
  "../components/CheckoutModal": { default: CheckoutModal },
  "../components/Pic": { default: Pic },
});

const PRINT = { id: "t1", title: "Test Print Z", price: 1111, category: "Prints" };
const PRINT2 = { id: "t2", title: "Test Print Y", price: 120, category: "Prints" };
const NO_LINK = { zelleContact: "shop-zelle@example.com", zelleLabel: "email", venmoHandle: "", cashAppHandle: "", stripeLink: "", couponDiscount: 15 };
const ITS_LINK = "https://pay.example.test/one-print";
const SHOP_LINK = "https://pay.example.test/whole-cart";
const CARD_SOON = "Card payment is being set up. Please use Zelle or contact Fonkiart directly.";

// The shop around the Cart page, as App.jsx has it: the cart lives above the page, and
// removeFromCart drops one item through a functional update.
function openShop(cart, settings = NO_LINK) {
  const log = { pages: [], draws: [] };
  function Shop() {
    const [inCart, setCart] = React.useState(cart);
    const [page, setPage] = React.useState("cart");
    log.cart = inCart; log.page = page;
    if (page !== "cart") return element("main", { children: `The ${page} page` });
    return element(CartPage, {
      cart: inCart, items: [], settings,
      removeFromCart: (id) => setCart(prev => prev.filter(i => i.id !== id)),
      addToCart: (item) => setCart(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]),
      setPage: (p) => { log.pages.push(p); setPage(p); },
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
  click(payOption(root, method)); await settle();
  click(button(root, "Continue →")); await settle();
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
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const [method, pay, settings] of [["Zelle", "✓ I've Sent the Payment", NO_LINK], ["Credit Card", "Pay Securely with Card →", { ...NO_LINK, stripeLink: SHOP_LINK }]]) {
      freshWorld({ orderFails: true });
      const { root, log } = openShop([PRINT, PRINT2], settings);
      click(button(root, "Checkout →")); await settle();
      await fillIn(root, method);
      click(button(root, pay)); await settle();
      assert.equal(server.orders().length, 1, `${method}: it tried once`);
      assert.doesNotMatch(screen(root), /Thank you!/);
      assert.equal(log.cart.length, 2, `${method}: the cart is kept`);
      assert.deepEqual(log.pages, []);
      assert.deepEqual(opened, [], `${method}: no card page opened`);
      assert.deepEqual(alerts(root).map(textOf), ["We couldn't save your order. Please email shop@example.com with your order number FA-1739."]);
    }
  } finally { console.warn = warn; }
});

for (const [what, cart] of [
  ["two prints, no card link anywhere", [PRINT, PRINT2]],
  ["one print with no link of its own", [PRINT]],
  ["two prints, the first with its own link (a print's own link is for that print alone)", [{ ...PRINT, stripeLink: ITS_LINK }, PRINT2]],
]) {
  test(`card with no card link (${what}): nothing saved, no pop-up, the words on the payment step; then Zelle saves ONE order`, async () => {
    freshWorld();
    const { root, log } = openShop(cart);
    click(button(root, "Checkout →")); await settle();
    // Measured, not changed: the Credit Card option is offered even when there is no link.
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();

    assert.deepEqual(server.orders(), [], "no order saved");
    assert.deepEqual(popups, [], "no browser pop-up");
    assert.deepEqual(opened, [], "nothing opened");
    const shown = alerts(root);
    assert.equal(shown.length, 1, "one message, said to screen readers too (role=alert)");
    assert.equal(shown[0].type, "p");
    assert.equal(textOf(shown[0]), CARD_SOON);
    assert.equal(shown[0].props.style.fontSize, 16);
    assert.equal(shown[0].props.style.color, "#c0392b");
    assert.ok(button(root, "Pay Securely with Card →"), "still on the payment step");
    assert.doesNotMatch(screen(root), /Thank you!/);
    assert.equal(log.cart.length, cart.length, "the cart is untouched");

    click(button(root, "← Back")); await settle();
    click(payOption(root, "Zelle")); await settle();
    click(button(root, "Continue →")); await settle();
    assert.deepEqual(alerts(root), [], "Continue clears the message");
    click(button(root, "✓ I've Sent the Payment")); await settle();
    assert.equal(server.orders().length, 1, "ONE order, not two");
    assert.match(screen(root), /Thank you!/);
    assert.equal(log.cart.length, 0);
    assert.deepEqual(popups, []);
  });
}

for (const [what, cart, settings, link, named] of [
  ["one print with its own link", [{ ...PRINT, stripeLink: ITS_LINK }], NO_LINK, ITS_LINK, "Test Print Z"],
  ["two prints, the shop's link", [PRINT, PRINT2], { ...NO_LINK, stripeLink: SHOP_LINK }, SHOP_LINK, "2 items"],
]) {
  test(`card with a link (${what}): saved once, then the link opens, then the thank-you screen`, async () => {
    freshWorld();
    const { root, log } = openShop(cart, settings);
    click(button(root, "Checkout →")); await settle();
    await fillIn(root, "Credit Card");
    click(button(root, "Pay Securely with Card →")); await settle();
    assert.equal(server.orders().length, 1);
    assert.deepEqual(opened, [{ url: link, target: "_blank", ordersBefore: 1 }], "the link opens once, after the order is saved");
    assert.deepEqual(popups, []);
    assert.match(screen(root), new RegExp(`Your order for ${named} has been received\\.`));
    assert.match(screen(root), /FA-1739/);
    assert.equal(log.cart.length, 0);
    click(button(root, "Close")); await settle();
    assert.deepEqual(log.pages, ["catalog"]);
  });
}

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

test("no browser pop-ups in the checkout or the Cart page", () => {
  const POPUP = /\b(alert|confirm|prompt)\s*\(/;
  for (const file of ["components/CheckoutModal.jsx", "pages/CartPage.jsx"]) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), POPUP, file);
  }
  assert.match(`else alert("${CARD_SOON}");`, POPUP, "control: the check sees a pop-up when there is one");
});
