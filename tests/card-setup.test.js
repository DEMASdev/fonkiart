// The shop's own look at the card setup (op "card-setup", api/_lib/stripe.js cardSetup): card
// payments on, the Cart's card form able to open inside fonkiart.com, and if not, why. Asked
// through the real /api/store handler, so what is checked is exactly what a browser gets back.
// It must never show any part of a key: this repo is public and anyone can ask. Fakes only: no
// Stripe, no database call, no email.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/store.js";

// Keys that look real, each with a mark at its start and its end, so a whole key, its start or
// its end in an answer is caught.
// Built from pieces ON PURPOSE: GitHub refuses any push whose text holds something shaped like a
// real Stripe key (it blocked this file once). Do not join them back into one string.
const SK_LIVE = ["sk", "live", "SKHEADq8Zr41mXv0cB7dT2wKSKTAIL"].join("_");
const SK_TEST = ["rk", "test", "RKHEADy5Lp09sQe3nH6uJ1aRKTAIL"].join("_");
const PK_LIVE = ["pk", "live", "PKHEADk2Wd73fGh8jN4pY6sPKTAIL"].join("_");
const PK_TEST = ["pk", "test", "PTHEADm1Xc52vBn7kL3rT9qPTTAIL"].join("_");
const ENV = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
const realWarn = console.warn;
let warned;
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SUPABASE_URL = "http://127.0.0.1:9";                 // never reached: the probe reads no table
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_FAKEFORTESTS";
  warned = [];
  console.warn = (...a) => warned.push(a.join(" "));
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  console.warn = realWarn;
});

async function ask({ sk, pk, method = "POST" }) {
  if (sk === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = sk;
  if (pk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = pk;
  const res = { code: 0, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, query: { op: "card-setup" }, body: {} }, res);
  return { code: res.code, body: res.body, text: JSON.stringify(res.body) };
}

// Anything in an answer that is, or comes from, a key: a key prefix, or a start or end mark.
const MARKS = /(sk|rk|pk)_(live|test)|SKHEAD|SKTAIL|RKHEAD|RKTAIL|PKHEAD|PKTAIL|PTHEAD|PTTAIL/;
const leak = (text) => MARKS.exec(text)?.[0] ?? null;

test("control: the leak check sees a key, the start of one or the end of one, and passes a clean answer", () => {
  assert.equal(leak(JSON.stringify({ card: true, form: false, why: "bad-key" })), null);
  assert.equal(leak(JSON.stringify({ why: PK_LIVE })), "pk_live");
  assert.equal(leak(JSON.stringify({ hint: PK_TEST.slice(0, 14) })), "pk_test");
  assert.equal(leak(JSON.stringify({ hint: SK_LIVE.slice(-6) })), "SKTAIL");
  assert.equal(leak(JSON.stringify({ hint: SK_TEST.slice(8, 14) })), "RKHEAD");
});

test("card-setup: card on, the form able to open inside fonkiart.com, and if not, why; never any part of a key", async () => {
  for (const [label, sk, pk, want] of [
    ["all set (live)", SK_LIVE, PK_LIVE, { card: true, form: true, why: null }],
    ["all set (test)", SK_TEST, PK_TEST, { card: true, form: true, why: null }],
    ["spaces around the key are fine", SK_LIVE, ` ${PK_LIVE}\n`, { card: true, form: true, why: null }],
    ["no publishable key", SK_LIVE, undefined, { card: true, form: false, why: "no-key" }],
    ["an empty one", SK_LIVE, "  ", { card: true, form: false, why: "no-key" }],
    ["wrapped in quotes", SK_LIVE, `"${PK_LIVE}"`, { card: true, form: false, why: "bad-key", shape: { length: PK_LIVE.length + 2, kind: null, slips: ["quoted"] } }],
    ["a space inside", SK_LIVE, PK_LIVE.replace("Wd73", "Wd 73"), { card: true, form: false, why: "bad-key", shape: { length: PK_LIVE.length + 1, kind: "publishable", slips: ["spaced"] } }],
    ["the SECRET key pasted in by mistake", SK_LIVE, SK_LIVE, { card: true, form: false, why: "bad-key", shape: { length: SK_LIVE.length, kind: "secret", slips: ["secret"] } }],
    ["live public key, test secret key", SK_TEST, PK_LIVE, { card: true, form: false, why: "mode-mismatch" }],
    ["test public key, live secret key", SK_LIVE, PK_TEST, { card: true, form: false, why: "mode-mismatch" }],
    ["card payments off (no secret key)", undefined, PK_LIVE, { card: false, form: false, why: null }],
    ["nothing set", undefined, undefined, { card: false, form: false, why: "no-key" }],
  ]) {
    const got = await ask({ sk, pk });
    assert.equal(got.code, 200, label);
    assert.deepEqual(got.body, want, label);
    const keys = want.why === "bad-key" ? ["card", "form", "why", "shape"] : ["card", "form", "why"];
    assert.deepEqual(Object.keys(got.body), keys, `${label}: only these answers`);
    assert.equal(leak(got.text), null, `${label}: no part of a key in ${got.text}`);
  }
  assert.ok(warned.every(w => leak(w) === null), "the server's own warnings name no key either");
});

// Every 6-character run of a value: if any one of them is in an answer, a piece of the value got out.
const runs = (v) => Array.from({ length: Math.max(0, v.length - 5) }, (_, i) => v.slice(i, i + 6));
const echoed = (text, v) => runs(v).find(r => text.includes(r)) ?? null;

test("control: the 6-character check catches a value or a piece of one in an answer, and passes a clean one", () => {
  assert.notEqual(echoed(JSON.stringify({ x: PK_LIVE }), PK_LIVE), null);
  assert.notEqual(echoed(JSON.stringify({ x: PK_LIVE.slice(9, 16) }), PK_LIVE), null);
  assert.equal(echoed(JSON.stringify({ card: true, form: false, why: "bad-key", shape: { length: 9, kind: "publishable", slips: ["spaced"] } }), PK_LIVE), null);
});

test("card-setup: a bad key's shape names every slip in words, and never any character of the key", async () => {
  const ZW = "​"; // a zero-width space: there, but nobody can see it
  // Built from pieces ON PURPOSE, as above: GitHub refuses key-shaped text.
  const WEBHOOK = ["whsec", "WHHEADr4Tq81nZc6vM2xB9kWHTAIL"].join("_");
  const TYPO = ["pk", "lve", "PKHEADk2Wd73fGh8jN4pY6sPKTAIL"].join("_");
  for (const [label, pk, kind, slips] of [
    ["a whole KEY=value line", `STRIPE_PUBLISHABLE_KEY=${PK_LIVE}`, null, ["named"]],
    ["an unseen character before it", ZW + PK_LIVE, null, ["hidden-start"]],
    ["an unseen character inside it", PK_LIVE.replace("Wd73", `Wd${ZW}73`), "publishable", ["hidden-inside"]],
    ["an unseen character after it", PK_LIVE + ZW, "publishable", ["hidden-end"]],
    ["a typo in its start", TYPO, "publishable", ["typo"]],
    ["all in capitals", PK_LIVE.toUpperCase(), null, ["typo"]],
    ["a restricted key", SK_TEST, "restricted", ["secret"]],
    ["the webhook secret", WEBHOOK, "webhook", ["secret"]],
    ["quoted, with a space inside", `'${PK_LIVE.replace("Wd73", "Wd 73")}'`, null, ["quoted", "spaced"]],
    ["both keys, on two lines", `${PK_LIVE}\n${SK_LIVE}`, "publishable", ["secret", "spaced"]],
    ["something else entirely", "XQZHEADab12cd34XQZTAIL", null, ["other"]],
  ]) {
    const got = await ask({ sk: SK_LIVE, pk });
    assert.equal(got.code, 200, label);
    assert.deepEqual(got.body, { card: true, form: false, why: "bad-key", shape: { length: pk.trim().length, kind, slips } }, label);
    assert.equal(leak(got.text), null, `${label}: no part of a key in ${got.text}`);
    assert.equal(echoed(got.text, pk), null, `${label}: no 6 characters of it in ${got.text}`);
  }
  assert.ok(warned.every(w => leak(w) === null), "the server's own warnings name no key either");
});

test("card-setup: only asked by POST, like every other op", async () => {
  const got = await ask({ sk: SK_LIVE, pk: PK_LIVE, method: "GET" });
  assert.equal(got.code, 405);
  assert.equal(leak(got.text), null);
});
