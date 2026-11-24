// Contact: "Message sent!" is said only when the message reached the shop (kept under Admin -> Requests,
// or emailed to it). It used to be said even when nothing had gone anywhere.
// FAKE data only: every person and email is made up, and nothing is sent anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { transformWithOxc } from "vite";
import { opRequest } from "../api/_lib/storeOps.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const FORM = { kind: "contact", name: "Ana Test", email: "ana@example.com", message: "Please erase what you keep about me." };
const SHOP = "shop@example.com";

async function logsOf(fn) {
  const said = [], keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(keep)) console[k] = (...a) => said.push(a.map(String).join(" "));
  try { return { out: await fn().then((v) => ({ v }), (e) => ({ e })), said: said.join("\n") }; } finally { Object.assign(console, keep); }
}
const db = (refuses, rows = []) => ({ rows, from: () => ({ insert: async (v) => { if (refuses) return { error: { message: refuses } }; rows.push(...v); return { error: null }; } }) });
const mailer = (failFor = () => false) => {
  const sent = [];
  return { sender: SHOP, sent, send: async (m) => { if (failFor(m.to)) throw new Error("Brevo 500"); sent.push(m); return {}; } };
};

test("the shop: kept, the shop is told, and then the person is", async () => {
  const d = db(), mail = mailer();
  const { out } = await logsOf(() => opRequest(d, { ...FORM }, mail));
  assert.deepEqual(out.v, { ok: true });
  assert.deepEqual(d.rows, [{ name: FORM.name, email: FORM.email, message: FORM.message, status: "new" }]);
  assert.deepEqual(mail.sent.map((m) => m.to), [SHOP, FORM.email]);
  assert.equal(mail.sent[0].replyTo, FORM.email);
});

test("the shop: kept or emailed is enough, one without the other", async () => {
  const onlyKept = db(), noMail = mailer(() => true);
  assert.deepEqual((await logsOf(() => opRequest(onlyKept, { ...FORM }, noMail))).out.v, { ok: true });
  assert.equal(onlyKept.rows.length, 1);
  const onlyMailed = mailer();
  assert.deepEqual((await logsOf(() => opRequest(db("no such table"), { ...FORM }, onlyMailed))).out.v, { ok: true });
  assert.deepEqual(onlyMailed.sent.map((m) => m.to), [SHOP, FORM.email]);
});

test("the shop: neither, so it isn't called sent, and the person isn't told it was received", async () => {
  const mail = mailer((to) => to === SHOP);
  const { out, said } = await logsOf(() => opRequest(db("no such table"), { ...FORM }, mail));
  assert.ok(out.e, "refused");
  assert.match(out.e.message, /reached nobody/);
  assert.deepEqual(mail.sent, [], "no \"We received your message\"");
  assert.ok(!said.includes(FORM.email) && !said.includes(FORM.message), "the log names nobody");
});

test("the shop: the person's own copy failing changes nothing", async () => {
  const d = db(), mail = mailer((to) => to === FORM.email);
  assert.deepEqual((await logsOf(() => opRequest(d, { ...FORM }, mail))).out.v, { ok: true });
  assert.deepEqual(mail.sent.map((m) => m.to), [SHOP]);
});

// ── the page ────────────────────────────────────────────────────
let drawing = null;
const React = { useState(init) {
  const d = drawing, n = d.at++;
  if (!(n in d.hooks)) d.hooks[n] = init;
  return [d.hooks[n], (v) => { d.hooks[n] = typeof v === "function" ? v(d.hooks[n]) : v; d.draw(); }];
} };
const FRAGMENT = Symbol("Fragment");
const jsx = (type, props) => ({ type, props: props || {} });
async function page(storeCall) {
  const file = "src/pages/ContactPage.jsx";
  assert.ok(existsSync(new URL(file, root)));
  globalThis.__contactTest = { react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: FRAGMENT }, "lucide-react": { Mail: "svg", Heart: "svg" }, "../lib/store": { storeCall } };
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const body = code.replace(/^import\s+\{([^}]*)\}\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__contactTest[${JSON.stringify(from)}];`);
  assert.doesNotMatch(body, /^import /m);
  const Page = (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${body}\n// ${Math.random()}`)}`)).default;
  const d = { hooks: [], at: 0, tree: null };
  const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n === "object" ? (n.type === FRAGMENT ? flat(n.props.children) : [{ type: n.type, props: n.props, children: flat(n.props.children) }]) : [String(n)];
  d.draw = () => { const outer = drawing; drawing = d; d.at = 0; try { d.tree = { type: "#", props: {}, children: flat(Page({ data: { settings: { zelleContact: SHOP } } })) }; } finally { drawing = outer; } };
  d.draw();
  const find = (want, n = d.tree) => typeof n === "string" ? [] : [...(want(n) ? [n] : []), ...n.children.flatMap((x) => find(want, x))];
  const text = (n = d.tree) => typeof n === "string" ? n : n.children.map((x) => text(x)).join(" ");
  const fill = () => ["name", "email", "message"].forEach((k, i) => find((n) => n.type === "input" || n.type === "textarea")[i].props.onChange({ target: { value: FORM[k] } }));
  return { fill, find, text: () => text().replace(/\s+/g, " ").trim(), values: () => find((n) => n.type === "input" || n.type === "textarea").map((n) => n.props.value), send: () => find((n) => n.type === "button")[0].props.onClick() };
}

test("the page: says it was sent only when it was", async () => {
  const calls = [];
  const p = await page(async (...a) => { calls.push(a); return { ok: true }; });
  p.fill();
  await logsOf(() => p.send());
  assert.deepEqual(calls, [["request", FORM]]);
  assert.match(p.text(), /Message sent!/);
});

test("the page: it didn't go through, so it says so and keeps what they wrote; then it can be sent", async () => {
  let up = false;
  const p = await page(async () => { if (!up) throw new Error("Something went wrong"); return { ok: true }; });
  p.fill();
  await logsOf(() => p.send());
  assert.doesNotMatch(p.text(), /Message sent!/);
  assert.match(p.text(), /That didn't go through\. Please try again\./);
  const [said] = p.find((n) => n.props.role === "alert");
  assert.deepEqual([said.type, said.props.className], ["p", "contact-err"], "read out, in plain red words as on the shop's other forms");
  assert.match(read("src/index.css"), /\n\.contact-err \{ font-size:16px;line-height:1\.5;color:#c0392b;margin-bottom:12px; \}\n/, "no box, so no cream one");
  assert.deepEqual(p.values(), [FORM.name, FORM.email, FORM.message]);
  assert.match(p.text(), /Send Message/, "the button is ready again");
  up = true;
  await logsOf(() => p.send());
  assert.match(p.text(), /Message sent!/);
});
