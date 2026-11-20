// A way back from the Collectors Room (Andy: "also when going to the collectors room there's no way
// back to the orders page / user page"). Opened from the Admin Panel, the room's header has
// "← Back to Orders", which opens Admin on its Orders tab; opened any other way (a collector signing
// in from the site), it does not. "← Back to Site" and "Sign Out" stay either way. The admin can be
// signed in to Admin with no site account, so the room's "Admin Panel" button never shows for them:
// without this they were stuck in the room.
//  1. The room itself (src/pages/CollectorsRoomPage.jsx), compiled with the project's own Vite and
//     drawn once by a tiny stand-in for React; its buttons are read and tapped.
//  2. App.jsx's wiring, read from the source: where the room was opened from is remembered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── the room, drawn once ─────────────────────────────────────
const element = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
const FRAGMENT = Symbol("Fragment");
const runtime = { jsx: element, jsxs: element, Fragment: FRAGMENT };
// Enough React for one drawing: state starts as given, effects don't run (nothing is fetched).
const React = { useState: (init) => [typeof init === "function" ? init() : init, () => {}], useEffect: () => {} };
globalThis.__roomTest = {};
async function load(file, given) {
  const src = read(`src/${file}`);
  const { code } = await transformWithOxc(src, file, { lang: "jsx", jsx: { runtime: "automatic" } });
  globalThis.__roomTest[file] = given;
  const body = code.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in given)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__roomTest[${JSON.stringify(file)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  assert.doesNotMatch(body, /^\s*import[\s{]/m, `${file}: an import was left unread`);
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`)).default;
}
const Room = await load("pages/CollectorsRoomPage.jsx", {
  react: React, "react/jsx-runtime": runtime,
  "../lib/store": { storeCall: () => Promise.resolve({}) },
  "../components/CheckoutModal": { default: function CheckoutModal() { return null; } },
  "../utils/hover": { mouseHover: () => ({}) },
  "../components/Pic": { default: function Pic() { return null; } },
});
const textOf = (n) => n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n)
  : Array.isArray(n) ? n.map(textOf).join("") : typeof n.type === "function" ? "" : textOf(n.props.children);
const findAll = (n, want, out = []) => {
  if (n == null || typeof n !== "object") return out;
  if (Array.isArray(n)) { for (const c of n) findAll(c, want, out); return out; }
  if (want(n)) out.push(n);
  findAll(n.props.children, want, out);
  return out;
};
// The header's buttons, in order (the strip at the top, before the room's own tabs).
function header(props) {
  const tree = Room({ user: null, artworks: [], settings: {}, onLogout() {}, onBack() {}, isAdmin: false, onAdminEnter() {}, ...props });
  const bar = tree.props.children[0];
  return findAll(bar, n => n.type === "button").map(b => ({ label: textOf(b).trim(), tap: b.props.onClick, style: b.props.style }));
}

test("opened from the Admin Panel (signed in to Admin, no site account): '← Back to Orders' in the header, and it takes the way back it was given", () => {
  let back = 0;
  const bar = header({ onBackToOrders: () => { back++; } });
  assert.deepEqual(bar.map(b => b.label), ["← Back to Orders", "← Back to Site", "Sign Out"], "the way back first; Back to Site and Sign Out stay");
  bar[0].tap();
  assert.equal(back, 1);
  assert.equal(bar[0].style.fontSize, 16, "16px, like the rest of the header");
  assert.equal(bar[0].style.whiteSpace, "nowrap", "the arrow stays with its words on a phone");
});

test("opened any other way (a collector signed in from the site): no '← Back to Orders'; the header as it was", () => {
  assert.deepEqual(header({}).map(b => b.label), ["← Back to Site", "Sign Out"]);
  assert.deepEqual(header({ isAdmin: true, user: { email: "fonkiart@gmail.com" } }).map(b => b.label), ["Admin Panel", "← Back to Site", "Sign Out"], "the site's own admin account still gets Admin Panel");
  assert.deepEqual(header({ isAdmin: true, user: { email: "fonkiart@gmail.com" }, onBackToOrders() {} }).map(b => b.label), ["← Back to Orders", "Admin Panel", "← Back to Site", "Sign Out"]);
});

// ── App.jsx: where the room was opened from ──────────────────
const app = read("src/App.jsx");
const one = (re, what) => { const hits = app.match(new RegExp(re.source, "g")) || []; assert.equal(hits.length, 1, `${what}: found ${hits.length} times`); return hits[0]; };

test("App: the Admin Panel's 🔑 Collectors Room remembers it was opened from Admin, and the room's way back opens Admin on its Orders tab", () => {
  one(/onViewRoom=\{\(\) => \{ setRoomFrom\("admin"\); setPage\("collectors-room"\); \}\}/, "Admin → room, remembered");
  one(/onBackToOrders=\{roomFrom === "admin" \? \(\) => \{ setAdminTab\("orders"\); setPage\("admin"\); \} : undefined\}/, "the room's way back: only from Admin, to its Orders");
  assert.doesNotMatch(app, /setPage\("collectors-room"\)\}/, "no other way into the room from Admin that forgets where it came from");
});

test("App: where the room was opened from is kept beside the page (a reload in the room still knows), and signing in sets it afresh", () => {
  one(/const ROOM_FROM = "fonkiart-room-from";/, "the key it is kept under");
  one(/useState\(\(\) => localStorage\.getItem\(ROOM_FROM\) \|\| ""\)/, "read back on load");
  one(/const setRoomFrom = \(from\) => \{ localStorage\.setItem\(ROOM_FROM, from\); setRoomFromState\(from\); \};/, "kept when set");
  // Signing in moves the page to the room: from Admin it is "admin", from the site "". Already in
  // the room (a token refresh, a reload), it is left as it is.
  const land = one(/const land = \(u\) => \{[\s\S]*?\n {4}\};/, "the sign-in route");
  assert.match(land, /if \(pageRef\.current !== "collectors-room"\) \{\s*const from = pageRef\.current === "admin" \? "admin" : "";\s*localStorage\.setItem\(ROOM_FROM, from\); setRoomFromState\(from\);/);
  assert.match(land, /setPage\("collectors-room"\);/);
  assert.equal((app.match(/land\(u\);/g) || []).length, 2, "both sign-in paths (the session on load, and every change) go through it");
  assert.doesNotMatch(app, /: "collectors-room"\);/, "no sign-in path into the room that skips it");
});

test("App: AdminPanel picks its tab from App's own (tab / setTab), so 'orders' set by the way back is the tab it opens on; its default is unchanged", () => {
  one(/const \[adminTab, setAdminTabState\] = useState\(\(\) => localStorage\.getItem\("fonkiart-admin-tab"\) \|\| "dashboard"\);/, "Admin's tab, default Dashboard");
  assert.match(app, /<AdminPage [^\n]*tab=\{adminTab\} setTab=\{setAdminTab\}/);
  assert.match(read("src/admin/AdminPage.jsx"), /<AdminPanel [^\n]*tab=\{tab\} setTab=\{setTab\}/);
  assert.match(read("src/admin/AdminPanel.jsx"), /className=\{`admin-tab\$\{tab==="orders"\?" active":""\}`\}/, "the Orders tab lights up when tab is 'orders'");
});
