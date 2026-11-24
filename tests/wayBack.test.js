// Andy, 2026-11-23, on paying: "make sure if the user selects credit card or any other method , the
// user can go and select another ... right now i went hit CC then tried to go back ... there's no way
// i'm trapped"; and on the shop: "once a item is clicked ( the shop buttom ) , the button of that item
// should be checkout !".
//  1. One try to pay at a time that can be left (src/lib/payTries.js).
//  2. Back inside an open checkout (src/lib/backInside.js), and App.jsx's part in it.
//  3. The way back holds on the screen, and one of its two places shows at each width (src/index.css).
//  4. The shop's button: Shop, then Checkout (src/components/ShopButton.jsx, ArtworkModal.jsx).
// The checkout's own steps, run from its live files: tests/checkout-flow.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import { payTries } from "../src/lib/payTries.js";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const settle = async () => { for (let k = 0; k < 5; k++) await new Promise(r => setImmediate(r)); };
const gate = () => { let open; const wait = new Promise(r => { open = r; }); return { wait, open }; };

// ── 1. one try at a time ────────────────────────────────────
test("payTries: one at a time (a double tap counts once); it ends when it is over, and the next can start", async () => {
  const tries = payTries(), g = gate(), log = [];
  tries.start(async () => { log.push("first"); await g.wait; }, () => log.push("end"));
  tries.start(async () => { log.push("second"); }, () => log.push("end2"));
  assert.deepEqual(log, ["first"], "the second tap, at once, does nothing");
  g.open(); await settle();
  assert.deepEqual(log, ["first", "end"]);
  tries.start(async () => { log.push("third"); }, () => log.push("end3"));
  await settle();
  assert.deepEqual(log, ["first", "end", "third", "end3"]);
  assert.equal(tries.behind(), null, "nothing left behind");
});

test("payTries: a try that fails is over like any other, and never stops the next", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const tries = payTries(), log = [];
    tries.start(async () => { throw new Error("no"); }, () => log.push("end"));
    await settle();
    tries.start(async () => { log.push("next"); });
    await settle();
    assert.deepEqual(log, ["end", "next"]);
  } finally { console.warn = warn; }
});

test("payTries: left before it asked the server: told so (left), it ends without a word, and there is nothing to wait for", async () => {
  const tries = payTries(), g = gate(), log = [];
  let mine;
  tries.start(async (it) => { mine = it; await g.wait; log.push(it.left ? "left" : "still here"); }, () => log.push("end"));
  tries.leave();
  assert.deepEqual([mine.left, tries.behind()], [true, null]);
  tries.start(async () => { log.push("next"); }, () => log.push("next end"));
  await settle();
  assert.deepEqual(log, ["next", "next end"], "the next one starts at once");
  g.open(); await settle();
  assert.deepEqual(log, ["next", "next end", "left"], "and the one left never calls its end over it");
});

test("payTries: left after it asked the server: the next waits for it (behind), however many were left, and then there is nothing to wait for", async () => {
  const tries = payTries(), a = gate(), b = gate(), log = [];
  tries.start(async (it) => { it.asked = true; await a.wait; log.push("a answered"); });
  tries.leave();
  tries.start(async (it) => { it.asked = true; await b.wait; log.push("b answered"); });
  tries.leave();
  tries.start(async () => { await tries.behind(); log.push("c goes"); });
  b.open(); await settle();
  assert.deepEqual(log, ["b answered"], "still one to wait for");
  a.open(); await settle();
  assert.deepEqual(log, ["b answered", "a answered", "c goes"]);
  assert.equal(tries.behind(), null);
  tries.leave(); // nothing on its way: nothing to leave
  assert.equal(tries.behind(), null);
});

// ── 2. Back inside ──────────────────────────────────────────
// A browser's history: a new entry drops the ones ahead; Back and Forward move, then tell the page.
function browser(entries, at = entries.length - 1) {
  const listeners = new Set();
  const b = { entries, at, listeners, left: 0,
    go(by) { if (b.at + by < 0 || b.at + by >= b.entries.length) { b.left++; return; } b.at += by; for (const fn of [...listeners]) fn({ state: b.entries[b.at] }); } };
  globalThis.window = {
    addEventListener: (type, fn) => { if (type === "popstate") listeners.add(fn); }, removeEventListener: (type, fn) => listeners.delete(fn),
    history: { get state() { return b.entries[b.at]; }, pushState(s) { b.entries.splice(b.at + 1, Infinity, s); b.at++; }, replaceState(s) { b.entries[b.at] = s; }, back() { b.go(-1); } },
  };
  return b;
}
let fresh = 0;
const load = () => import(`../src/lib/backInside.js?${++fresh}`); // its own copy: it remembers what is open

test("Back inside a checkout: one entry of its own; each Back is a step, put back until it closes; closed, it listens no more", async () => {
  const { holdBack } = await load();
  const b = browser([{ page: "catalog" }, { page: "cart", adminTab: "orders" }]);
  let left = 2;
  const letGo = holdBack(() => left-- > 0);
  assert.deepEqual(b.entries[2], { page: "cart", adminTab: "orders", inside: true }, "its entry, on the page it opened on");
  b.go(-1); assert.deepEqual([b.at, b.entries.length], [2, 3], "a step back: still inside");
  b.go(-1); assert.deepEqual([b.at, b.entries.length], [2, 3], "another");
  b.go(-1); assert.deepEqual([b.at, left], [1, -1], "closed: on the page's own entry");
  letGo();
  assert.equal(b.listeners.size, 0);
  b.go(-1);
  assert.equal(b.entries[b.at].page, "catalog", "Back is the page's own again");
});

test("Back to another page altogether (held down, say) is not a step inside: it is left to the page", async () => {
  const { holdBack } = await load();
  const b = browser([{ page: "home" }, { page: "catalog" }, { page: "cart" }]);
  let steps = 0;
  holdBack(() => { steps++; return true; });
  b.go(-2);
  assert.deepEqual([steps, b.entries[b.at].page], [0, "catalog"]);
});

test("opened twice at once (React's development double start) it keeps ONE entry", async () => {
  const { holdBack } = await load();
  const b = browser([{ page: "catalog" }, { page: "cart" }]);
  holdBack(() => true)();
  holdBack(() => true);
  assert.deepEqual([b.entries.length, b.listeners.size], [3, 1]);
});

// App.jsx, as it keeps the history: run from its own lines, with a page and its checkout to open.
function appHistory({ firstEntry, newEntry, samePageAgain }) {
  const src = read("App.jsx");
  const pop = src.match(/const onPopState = \(e\) => \{([\s\S]*?)\n {4}\};/);
  const push = src.match(/useLayoutEffect\(\(\) => \{\n( {4}shown\.current = \{ page, adminTab \};[\s\S]*?)\n {2}\}, \[page, adminTab\]\);/);
  assert.ok(pop && push, "App.jsx keeps the history in a layout effect and a popstate listener");
  const app = { page: "home", adminTab: "dashboard" };
  const refs = { shown: { current: null }, isFirstRender: { current: true }, fromPopState: { current: false } };
  const given = ["page", "adminTab", "shown", "isFirstRender", "fromPopState", "firstEntry", "newEntry", "samePageAgain", "history", "window"];
  const effect = new Function(...given, push[1]);
  const drawn = () => effect(app.page, app.adminTab, refs.shown, refs.isFirstRender, refs.fromPopState, firstEntry, newEntry, samePageAgain, window.history, { location: { href: "" } });
  const set = (what) => (v) => { if (Object.is(app[what], v)) return; app[what] = v; drawn(); };
  const onPopState = new Function("e", "shown", "fromPopState", "samePageAgain", "history", "setPage", "setAdminTabState", pop[1]);
  window.addEventListener("popstate", (e) => onPopState(e, refs.shown, refs.fromPopState, samePageAgain, window.history, set("page"), set("adminTab")));
  app.start = (page) => { app.page = page; drawn(); };
  app.go = set("page");
  return app;
}

test("App.jsx: the ✕ (or the menu) closes a checkout, and no press of Back after it seems to do nothing: it goes past the checkout's own entry", async () => {
  const inside = await load();
  const b = browser([null], 0);
  const app = appHistory(inside);
  app.start("catalog");
  app.go("cart");
  const close = inside.holdBack(() => true);
  assert.deepEqual(b.entries.map(e => [e.page, !!e.inside]), [["catalog", false], ["cart", false], ["cart", true]]);
  close(); // ✕
  b.go(-1);
  assert.deepEqual([app.page, b.entries[b.at].page], ["catalog", "catalog"], "one Back: the shop, not the cart again");

  app.go("cart");
  const menu = inside.holdBack(() => true);
  app.go("home"); menu(); // the menu, with the checkout open
  b.go(-1);
  assert.equal(app.page, "cart", "Back from there: the cart");
  b.go(-1);
  assert.equal(app.page, "catalog", "and once more: what came before it");
  app.go("about");
  assert.deepEqual(b.entries.map(e => e.page), ["catalog", "about"], "and the next page adds its own entry: none is swallowed");
});

test("App.jsx: Back stepping inside a checkout changes no page, so the next page still adds its own entry (it was swallowed)", async () => {
  const inside = await load();
  const b = browser([null], 0);
  const app = appHistory(inside);
  app.start("catalog");
  app.go("cart");
  let open = true;
  const close = inside.holdBack(() => open);
  b.go(-1);
  assert.deepEqual([app.page, b.at], ["cart", 2], "a step back, inside");
  open = false; b.go(-1); close();
  assert.deepEqual([app.page, b.at], ["cart", 1], "out to the cart");
  app.go("contact");
  assert.deepEqual(b.entries.map(e => [e.page, !!e.inside]), [["catalog", false], ["cart", false], ["contact", false]]);
  b.go(-1);
  assert.equal(app.page, "cart");
  b.go(-1);
  assert.equal(app.page, "catalog");
});

test("App.jsx: a reload inside a checkout, and Forward onto a closed one's entry: Back goes past it", async () => {
  const inside = await load();
  const b = browser([{ page: "catalog" }, { page: "cart" }, { page: "cart", inside: true }]);
  const app = appHistory(inside);
  app.start("cart"); // the reload: the checkout is closed, the cart shows
  assert.equal(b.entries[2].inside, true, "its entry stays marked");
  b.go(-1);
  assert.equal(app.page, "catalog", "one Back");
  b.go(1); b.go(1);
  assert.deepEqual([app.page, b.at], ["cart", 2], "Forward again");
  b.go(-1);
  assert.equal(app.page, "catalog");
});

// ── 3. on the screen ────────────────────────────────────────
const css = read("index.css");
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`) >= 0 ? css.indexOf(`\n${selector} {`) : css.indexOf(`  ${selector} {`);
  assert.ok(at >= 0, `no rule for ${selector}`);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
};
test("the way back holds at the top of the screen (under the shop's bars on a page), on white, above the form; a finger can tap it; 16px, no cream, no green", () => {
  const strip = rule(".way-back");
  assert.match(strip, /position:sticky;top:0;/);
  assert.match(strip, /z-index:2;background:#fff;/);
  assert.match(rule(".checkout-fullpage .way-back, .inv-card-panel .way-back"), /top:calc\(var\(--marquee\) \+ var\(--topbar\)\);/);
  const btn = rule(".way-back-btn");
  assert.match(btn, /min-height:44px;/);
  assert.match(btn, /font-size:16px;/);
  assert.match(btn, /color:var\(--ink\);/);
  assert.match(rule(".checkout-gallery > .checkout-x"), /z-index:3;/, "the ✕ stays above it");
});
test("a phone holds it too: the page is clipped sideways without becoming a box of its own (a sticky part would never hold in it)", () => {
  assert.match(css, /@media \(max-width:900px\) \{\n {2}@supports \(overflow:clip\) \{ \.content:has\(\.way-back\) \{ overflow-x:clip; \} \}\n\}/);
});
test("it is drawn in two places in the checkout and ONE shows at each width: above the art where the art and the step are one column, else at the top of the step", () => {
  const from = css.indexOf(".checkout > .way-back { display:none; }");
  assert.ok(from > 0, "beside the art on a computer: not above it");
  const after = css.slice(from);
  assert.match(after, /@media \(max-width:899px\) \{\n {2}\.checkout > \.way-back \{ display:block;[^}]*\}\n {2}\.checkout > \.way-back \+ \.checkout-wall \{[^}]*\}\n {2}\.checkout-steps \.way-back \{ display:none; \}\n\}/);
  assert.match(after, /@media \(max-width:640px\) \{\n {2}\.checkout-side > \.way-back \{ display:none; \}\n {2}\.checkout-side > \.way-back \+ \.checkout-wall \{[^}]*\}\n {2}\.checkout-side \.checkout-steps \.way-back \{ display:block; \}\n\}/);
  const jsx = read("components/CheckoutModal.jsx");
  assert.equal((jsx.match(/\{wayBack\}/g) || []).length, 2, "two places");
  assert.match(jsx, /\{wayBack\}\n\s*\{wall\}/, "above the art");
  assert.match(jsx, /<p className="checkout-eyebrow">[^\n]*\n\s*\{wayBack\}/, "and at the top of the step");
});

// ── 4. the shop's button ────────────────────────────────────
// Run from the live files: a component is a function of its props, with one ref that lasts.
globalThis.__wayBackTest = {};
async function component(file, given) {
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  globalThis.__wayBackTest[file] = given;
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__wayBackTest[${JSON.stringify(file)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };
const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n !== "object" ? [n] : [n, ...flat(n.props?.children)];
const label = (n) => flat(n.props.children).filter(x => typeof x !== "object").join("");
const PIECE = { id: "p1", title: "Test Print Z", price: 1111, image: "https://img.example.test/z.jpg" };

const box = { current: 0 };
const ShopButton = await component("components/ShopButton.jsx", { react: { useRef: () => box }, "react/jsx-runtime": runtime });
function shopButton(item, inCart) {
  box.current = 0;
  const did = [];
  const props = { item, inCart, onAdd: (i) => did.push(["add", i.id]), onAsk: (i) => did.push(["ask", i.id]), onCheckout: () => did.push(["checkout"]) };
  const drawn = () => ShopButton(props);
  return { did, props, drawn, tap: () => { let stopped = false; drawn().props.onClick({ stopPropagation() { stopped = true; } }); assert.equal(stopped, true, "the card under it stays shut"); } };
}

test("the shop's button: 'Shop →' adds the piece; in the cart it says 'Checkout →' and goes there; no price: 'Inquire'; sold: 'Sold Out'", () => {
  const b = shopButton(PIECE, false);
  assert.deepEqual([label(b.drawn()), b.drawn().props.className], ["Shop →", "card-btn"]);
  b.tap();
  assert.deepEqual(b.did, [["add", "p1"]]);
  b.props.inCart = true;
  assert.deepEqual([label(b.drawn()), b.drawn().props.className], ["Checkout →", "card-btn is-checkout"], "never '✓ Added'");
  box.current = Date.now() - 5000;
  b.tap();
  assert.deepEqual(b.did, [["add", "p1"], ["checkout"]]);

  const already = shopButton(PIECE, true);
  already.tap();
  assert.deepEqual(already.did, [["checkout"]], "a piece in the cart since before goes straight there");
  const onSale = shopButton({ ...PIECE, price: null, salePrice: 900 }, false);
  assert.equal(label(onSale.drawn()), "Shop →");
  const ask = shopButton({ ...PIECE, price: null }, false);
  assert.equal(label(ask.drawn()), "Inquire");
  ask.tap();
  assert.deepEqual(ask.did, [["ask", "p1"]]);
  const sold = shopButton({ ...PIECE, isSold: true }, false);
  assert.deepEqual([label(sold.drawn()), sold.drawn().props.disabled, sold.drawn().props.onClick], ["Sold Out", true, undefined]);
});

test("a double tap on 'Shop →' only adds the piece: the second tap never falls through to the checkout", () => {
  const b = shopButton(PIECE, false);
  b.tap();
  b.props.inCart = true;
  b.tap();
  assert.deepEqual(b.did, [["add", "p1"]]);
  box.current -= 5000; // a while later
  b.tap();
  assert.deepEqual(b.did, [["add", "p1"], ["checkout"]]);
});

const ArtworkModal = await component("components/ArtworkModal.jsx", {
  react: { useState: (v) => [v, () => {}] }, "react/jsx-runtime": runtime, "./Pic": { default: "pic" }, "./KlarnaLine": { default: "klarna" },
  "../lib/klarnaLine": { priceCents: (i) => Math.round((i.salePrice || i.price || 0) * 100) },
});
test("a piece's own window says the same: 'Add to Cart', then 'Checkout →' once it is in the cart; 'Request Pricing' with no price; nothing to buy once sold", () => {
  const buy = (props) => flat(ArtworkModal({ item: PIECE, onClose() {}, ...props })).filter(n => n?.type === "button" && n.props.className === "buy-btn").map(n => [label(n), n.props.onClick]);
  const did = [];
  const onBuy = (i) => did.push(["buy", i.id]), onCheckout = () => did.push(["checkout"]);
  for (const [props, words] of [[{ onBuy, onCheckout }, "Add to Cart"], [{ onBuy, onCheckout, inCart: true }, "Checkout →"], [{ onBuy, inCart: true }, "Add to Cart"], [{ onBuy, onCheckout, item: { ...PIECE, price: null } }, "Request Pricing"]]) {
    const [[said, go], ...more] = buy(props);
    assert.deepEqual([said, more.length], [words, 0]);
    go();
  }
  assert.deepEqual(did, [["buy", "p1"], ["checkout"], ["buy", "p1"], ["buy", "p1"]]);
  assert.deepEqual(buy({ sold: true, inCart: true, onCheckout }), []);
});

test("every shop page uses it, and App.jsx sends 'Checkout →' to the checkout itself and 'View Cart' to the cart (also from inside the checkout)", () => {
  for (const page of ["CatalogPage", "NewCollectionsPage", "SpecialsPage"]) {
    const src = read(`pages/${page}.jsx`);
    assert.match(src, /<ShopButton item=\{item\} inCart=\{inCart\(item\)\} onAdd=\{addToCart\}( onAsk=\{setPriceInquiry\})? onCheckout=\{onCheckout\} \/>/, page);
    assert.match(src, /<ArtworkModal [^\n]*inCart=\{inCart\(selected\)\} onCheckout=\{onCheckout\}/, `${page}: the piece's window`);
    assert.doesNotMatch(src, /✓ Added|className="card-btn"/, `${page}: no button of its own`);
  }
  const app = read("App.jsx");
  assert.equal((app.match(/onCheckout=\{goCheckout\}/g) || []).length, 4, "the Catalog, Art Prints, New Collections and Specials");
  assert.match(app, /const goCheckout = \(\) => openCart\(true\);/);
  assert.match(app, /onViewCart=\{\(\) => openCart\(false\)\}/);
  assert.match(app, /const openCart = \(checkout\) => \{ setCartView\(v => \(\{ n: v\.n \+ 1, checkout \}\)\); setPage\("cart"\); \};/);
  assert.match(app, /<CartPage key=\{cartView\.n\} startCheckout=\{cartView\.checkout\} onStarted=\{\(\) => setCartView\(v => \(\{ \.\.\.v, checkout: false \}\)\)\}/);
});
