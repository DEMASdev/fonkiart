// "Inquiry Sent!", "You're on the list" and "Request Received" are said only when they are true. The
// first two used to be said even when nothing had gone anywhere; the third said nothing when it failed.
// Most of the art is "Price on request", so the inquiry is how most of it is bought.
// FAKE data only: every person and email is made up, and nothing is sent anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import { opRequest } from "../api/_lib/storeOps.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const SHOP = "shop@example.com";
const ART = { id: 7, title: "Flamingo Party", category: "Paintings", price: null };
const ASK = { kind: "inquiry", artworkId: 7, name: "Ana Test", email: "ana@example.com", phone: "305 555 0100", message: "Is it framed?" };

async function logsOf(fn) {
  const said = [], keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(keep)) console[k] = (...a) => said.push(a.map(String).join(" "));
  try { return { out: await fn().then((v) => ({ v }), (e) => ({ e })), said: said.join("\n") }; } finally { Object.assign(console, keep); }
}

// ── the shop ────────────────────────────────────────────────────
const db = (refuses, rows = []) => ({ rows, from: (table) => table === "Artworks"
  ? { select: () => ({ eq: (col, id) => ({ maybeSingle: async () => ({ data: String(id) === String(ART.id) ? ART : null, error: null }) }) }) }
  : { insert: async (v) => { if (refuses) return { error: { message: refuses } }; rows.push(...v); return { error: null }; } } });
const mailer = (failFor = () => false) => {
  const sent = [];
  return { sender: SHOP, sent, send: async (m) => { if (failFor(m.to)) throw new Error("Brevo 500"); sent.push(m); return {}; } };
};

test("the shop: an inquiry is kept, the shop is told, and then the person is", async () => {
  const d = db(), mail = mailer();
  const { out } = await logsOf(() => opRequest(d, { ...ASK }, mail));
  assert.deepEqual(out.v, { ok: true });
  assert.deepEqual(d.rows, [{ name: ASK.name, email: ASK.email, status: "new", message: 'Price inquiry for "Flamingo Party" — Is it framed?. Phone: 305 555 0100.' }]);
  assert.deepEqual(mail.sent.map((m) => [m.to, m.subject]), [[SHOP, "Enquiry about Flamingo Party"], [ASK.email, "Your inquiry — Flamingo Party · Fonkiart"]]);
});

test("the shop: an inquiry kept or emailed is enough, one without the other", async () => {
  const onlyKept = db();
  assert.deepEqual((await logsOf(() => opRequest(onlyKept, { ...ASK }, mailer(() => true)))).out.v, { ok: true });
  assert.equal(onlyKept.rows.length, 1);
  const onlyMailed = mailer();
  assert.deepEqual((await logsOf(() => opRequest(db("no such table"), { ...ASK }, onlyMailed))).out.v, { ok: true });
  assert.deepEqual(onlyMailed.sent.map((m) => m.to), [SHOP, ASK.email]);
});

test("the shop: neither, so the inquiry isn't called sent, and the person isn't told it was received", async () => {
  const mail = mailer((to) => to === SHOP);
  const { out, said } = await logsOf(() => opRequest(db("no such table"), { ...ASK }, mail));
  assert.ok(out.e, "refused");
  assert.match(out.e.message, /reached nobody/);
  assert.deepEqual(mail.sent, [], "no \"Your inquiry\"");
  for (const theirs of [ASK.name, ASK.email, ASK.phone, ASK.message]) assert.ok(!said.includes(theirs), "the log names nobody");
});

test("the shop: the person's own copy of an inquiry failing changes nothing", async () => {
  const d = db(), mail = mailer((to) => to === ASK.email);
  assert.deepEqual((await logsOf(() => opRequest(d, { ...ASK }, mail))).out.v, { ok: true });
  assert.deepEqual([d.rows.length, mail.sent.map((m) => m.to)], [1, [SHOP]]);
});

// ── the pages ───────────────────────────────────────────────────
let drawing = null;
const React = {
  useState(init) { const d = drawing, n = d.at++; if (!(n in d.hooks)) d.hooks[n] = init; return [d.hooks[n], (v) => { d.hooks[n] = typeof v === "function" ? v(d.hooks[n]) : v; d.draw(); }]; },
  useRef(init) { const d = drawing, n = d.at++; if (!(n in d.hooks)) d.hooks[n] = { current: init }; return d.hooks[n]; },
  useEffect() { drawing.at++; },
};
const FRAGMENT = Symbol("Fragment");
const jsx = (type, props) => ({ type, props: props || {} });
async function page(file, props, storeCall) {
  assert.ok(existsSync(new URL(file, root)), file);
  globalThis.__inquiryTest = { react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: FRAGMENT }, "../lib/store": { storeCall }, "../utils/hover": { mouseHover: () => ({}) },
    "../components/CheckoutModal": () => null, "../components/Pic": () => null };
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const body = code
    .replace(/^import\s+\{([^}]*)\}\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__inquiryTest[${JSON.stringify(from)}];`)
    .replace(/^import\s+(\w+)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, name, from) => `const ${name} = globalThis.__inquiryTest[${JSON.stringify(from)}];`);
  assert.doesNotMatch(body, /^import /m, "every import has a stand-in");
  const Page = (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${body}\n// ${Math.random()}`)}`)).default;
  const d = { hooks: [], at: 0, tree: null };
  const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n === "object"
    ? typeof n.type === "function" ? flat(n.type(n.props)) : n.type === FRAGMENT ? flat(n.props.children) : [{ type: n.type, props: n.props, children: flat(n.props.children) }]
    : [String(n)];
  d.draw = () => { const outer = drawing; drawing = d; d.at = 0; try { d.tree = { type: "#", props: {}, children: flat(Page(props)) }; } finally { drawing = outer; } };
  d.draw();
  const find = (want, n = d.tree) => typeof n === "string" ? [] : [...(want(n) ? [n] : []), ...n.children.flatMap((x) => find(want, x))];
  const words = (n = d.tree) => typeof n === "string" ? n : n.children.map((x) => words(x)).join(" ");
  const text = (n) => words(n).replace(/\s+/g, " ").trim();
  const boxes = () => find((n) => n.type === "input" || n.type === "textarea");
  const button = (label) => { const b = find((n) => n.type === "button" && label.test(text(n))); assert.equal(b.length, 1, String(label)); return b[0].props; };
  return { find, text, boxes, button, values: () => boxes().map((n) => n.props.value), type: (...all) => all.forEach((v, i) => boxes()[i].props.onChange({ target: { value: v } })),
    alerts: () => find((n) => n.props.role === "alert").map((n) => text(n)) };
}
// The server's answers, one by one: true = ok, false = it didn't go through.
const server = (...answers) => {
  const calls = [];
  return { calls, call: async (...a) => { calls.push(a); if (!(answers.length ? answers.shift() : true)) throw new Error("Something went wrong"); return { ok: true }; } };
};
const pricing = (s) => page("src/components/PriceInquiryModal.jsx", { item: { id: 7, title: "Flamingo Party", category: "Paintings" }, onClose() {} }, s.call);
const TYPED = [ASK.name, ASK.email, ASK.phone, ASK.message];
const SORRY = "That didn't go through. Please try again.";

test("Request Pricing: it is called sent only when it was", async () => {
  const s = server(true), p = await pricing(s);
  p.type(...TYPED);
  await logsOf(() => p.button(/^Send Inquiry$/).onClick());
  assert.deepEqual(s.calls, [["request", ASK]]);
  assert.match(p.text(), /Inquiry Sent!.*Aliana will reply to ana@example\.com/);
});

test("Request Pricing: it didn't go through, so it says so and keeps what they wrote; then it can be sent", async () => {
  const s = server(false, true), p = await pricing(s);
  p.type(...TYPED);
  const { said } = await logsOf(() => p.button(/^Send Inquiry$/).onClick());
  assert.doesNotMatch(p.text(), /Inquiry Sent!/);
  assert.deepEqual(p.alerts(), [SORRY]);
  assert.deepEqual(p.find((n) => n.props.role === "alert").map((n) => [n.type, n.props.className]), [["p", "contact-err"]], "plain red words, as on Contact");
  assert.deepEqual(p.values(), TYPED);
  assert.ok(!said.includes(ASK.email), "the log names nobody");
  await logsOf(() => p.button(/^Send Inquiry$/).onClick());
  assert.match(p.text(), /Inquiry Sent!/);
  assert.equal(s.calls.length, 2);
});

test("Request Pricing: half an email is said before anything is sent, and typing takes the words away", async () => {
  const s = server(), p = await pricing(s);
  p.type(ASK.name, "ana@gmail", "", "");
  await logsOf(() => p.button(/^Send Inquiry$/).onClick());
  assert.deepEqual(p.alerts(), ["Please enter a valid email address."]);
  assert.deepEqual(s.calls, []);
  p.type(ASK.name, ASK.email);
  assert.deepEqual(p.alerts(), []);
  await logsOf(() => p.button(/^Send Inquiry$/).onClick());
  assert.match(p.text(), /Inquiry Sent!/);
});

const club = (s) => page("src/components/CollectorsSection.jsx", {}, s.call);
test("Collectors Club: on the list only when they are; if not, it says so and their email stays", async () => {
  const s = server(false, true), p = await club(s);
  p.type(ASK.email);
  const { said } = await logsOf(() => p.button(/^Join the Collectors Club/).onClick());
  assert.doesNotMatch(p.text(), /on the list/);
  assert.deepEqual([p.alerts(), p.values()], [[SORRY], [ASK.email]]);
  assert.ok(!said.includes(ASK.email), "the log names nobody");
  await logsOf(() => p.button(/^Join the Collectors Club/).onClick());
  assert.match(p.text(), /You're on the list/);
  assert.deepEqual(s.calls, Array(2).fill(["collectors", { email: ASK.email, source: "collectors-section" }]));
});

test("Collectors Club: half an email is said before anything is sent; Enter twice is one", async () => {
  const s = server(), p = await club(s);
  p.type("ana@gmail");
  await logsOf(() => p.button(/^Join the Collectors Club/).onClick());
  assert.deepEqual([p.alerts(), s.calls], [["Enter a valid email."], []]);
  p.type(ASK.email);
  const enter = p.boxes()[0].props.onKeyDown;
  await logsOf(async () => { const all = [enter({ key: "Enter" }), enter({ key: "Enter" }), p.boxes()[0].props.onKeyDown({ key: "Enter" })]; await Promise.all(all); });
  assert.equal(s.calls.length, 1);
  assert.match(p.text(), /You're on the list/);
});

test("Collectors Room: a commission that didn't go through says so and keeps what they wrote; then it is received", async () => {
  const s = server(false, true);
  const p = await page("src/pages/CollectorsRoomPage.jsx", { user: { email: ASK.email }, artworks: [], settings: {} }, s.call);
  p.button(/^Commission$/).onClick();
  p.type(ASK.name, ASK.email, "$2,000", "A turtle");
  await logsOf(() => p.button(/^Send Commission Request/).onClick());
  assert.doesNotMatch(p.text(), /Request Received/);
  assert.deepEqual([p.alerts(), p.values()], [[SORRY], [ASK.name, ASK.email, "$2,000", "A turtle"]]);
  await logsOf(() => p.button(/^Send Commission Request/).onClick());
  assert.match(p.text(), /Request Received/);
  assert.deepEqual(p.alerts(), []);
});

test("the problem words can be read on their own background", () => {
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const said = (file) => read(file).match(/role="alert"[^>]*color:"(#[0-9a-f]{6})"/)[1];
  assert.ok(contrast(said("src/components/CollectorsSection.jsx"), "#ffcdf4") >= 4.5, "the Collectors Club's pink");
  assert.ok(contrast(said("src/pages/CollectorsRoomPage.jsx"), "#0f0e0c") >= 4.5, "the Collectors Room's dark");
});
