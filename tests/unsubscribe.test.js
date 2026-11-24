// "Unsubscribe" in every email that carries a coupon (Andy, 2026-11-23, "1bc yes"): one link, one
// button, no sign-in, and after that the shop can't send that person a coupon, even by mistake.
//  1. The link: sealed, for one email only, and it names nobody.
//  2. Asking: one small private note, which outlives everything else the shop keeps about them.
//  3. Every way a coupon is emailed (the welcome gift, both lists on Admin -> Orders, Leads, and an
//     Admin page open since before) asks first, and carries the link; when it can't ask, nothing goes.
//     An email about an order or an invoice is never stopped by it.
//  4. The page the link opens, the site around it, and what Admin and the popups say.
// FAKE data only: every person, email, code and key here is made up; the database, Storage and Brevo
// are stand-ins, and nothing is sent anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { transformWithOxc } from "vite";
import { CARD_NOTE } from "../src/lib/orderRow.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
// Loaded when each test runs, so a shop without it fails each test by name, not the file.
const load = async (p) => { assert.ok(existsSync(new URL(p, root)), `${p} is there`); return import(new URL(p, root).href); };
const unsub = () => load("api/_lib/unsubscribe.js");
const KEY = ["made", "up", "for", "tests"].join("-"); // the server's key, made up
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
const NOW = new Date("2026-11-23T21:20:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
async function logsOf(fn) {
  const said = [];
  const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => said.push(a.map(String).join(" "));
  try { return { out: await fn(), said: said.join("\n") }; } finally { Object.assign(console, keep); }
}
const quiet = async (fn) => (await logsOf(fn)).out;
const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.jsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));

// ── stand-ins ───────────────────────────────────────────────────

// supabase-js as the shop uses it: rows, and Storage with the server's private notes. log: every read
// and write, in order. down: Storage refuses reads (not "not found"). full: it refuses writes.
function fakeDb(tables = {}, { notes = {} } = {}) {
  const files = { ...notes }, log = [];
  const db = { tables, files, log, down: null, full: null, links: [] };
  let nextId = 1000;
  db.from = (table) => {
    let op = "select", payload = null, lim = null, single = false, returning = null, sort = null;
    const tests = [];
    const b = {
      select(c) { if (op !== "select") returning = c || "*"; return b; },
      insert(v) { op = "insert"; payload = v; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { tests.push((r) => String(r[k]) === String(v)); return b; },
      in(k, vs) { tests.push((r) => vs.map(String).includes(String(r[k]))); return b; },
      not(k) { tests.push((r) => r[k] != null); return b; },
      order(k, { ascending = true } = {}) { sort = { k, way: ascending ? 1 : -1 }; return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(ok, bad) { return Promise.resolve().then(run).then(ok, bad); },
    };
    function run() {
      log.push(`${op} ${table}`);
      const rows = (tables[table] ||= []);
      if (op === "insert") {
        const added = [].concat(payload).map((r) => ({ id: nextId++, ...r }));
        rows.push(...added);
        return { data: returning ? added.map((r) => ({ id: r.id })) : null, error: null };
      }
      let hit = rows.filter((r) => tests.every((t) => t(r)));
      if (op === "update") {
        hit.forEach((r) => Object.assign(r, structuredClone(payload)));
        return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      if (sort) hit = [...hit].sort((x, y) => (String(x[sort.k] ?? "") < String(y[sort.k] ?? "") ? -1 : 1) * sort.way);
      const out = hit.slice(0, lim ?? undefined).map((r) => structuredClone(r));
      return { data: single ? out[0] ?? null : out, error: null };
    }
    return b;
  };
  db.storage = {
    async createBucket(name, opts) { log.push(`bucket ${name} ${JSON.stringify(opts)}`); return { data: {}, error: null }; },
    from: (bucket) => ({
      async download(path) {
        log.push(`download ${bucket}/${path}`);
        if (db.down) return { data: null, error: { message: db.down, statusCode: "500" } };
        return files[path] == null ? { data: null, error: { message: "Object not found", statusCode: "404" } } : { data: new Blob([files[path]]), error: null };
      },
      async list(dir, { limit = 100, offset = 0 } = {}) {
        log.push(`list ${bucket}/${dir} ${offset}`);
        if (db.down) return { data: null, error: { message: db.down, statusCode: "500" } };
        const names = Object.keys(files).filter((f) => f.startsWith(`${dir}/`)).map((f) => ({ name: f.slice(dir.length + 1) })).sort((a, c) => (a.name < c.name ? -1 : 1));
        return { data: names.slice(offset, offset + limit), error: null };
      },
      async upload(path, blob) {
        log.push(`upload ${bucket}/${path}`);
        if (db.full) return { data: null, error: { message: db.full } };
        files[path] = await blob.text();
        return { data: { path }, error: null };
      },
    }),
  };
  db.auth = { admin: {
    listUsers: async () => ({ data: { users: [] }, error: null }),
    generateLink: async ({ email }) => { db.links.push(email); return { data: { properties: { action_link: "https://proj.supabase.co/auth/v1/verify?token=made-up" }, user: { email, user_metadata: { role: "buyer" } } }, error: null }; },
  } };
  db.writes = () => log.filter((l) => /^(insert|update|upload|bucket)/.test(l));
  db.note = () => JSON.parse(files["coupons-sent.json"] || "null");
  db.lead = (email) => (tables.Leads || []).find((l) => l.email === email);
  return db;
}
// mail.fail: the next email is refused, as Brevo can. mail.before: runs as it goes.
const mailbox = () => { const mail = { sender: "shop@fonkiart.com", sent: [], fail: null, send: async (m) => { if (mail.fail) throw new Error(mail.fail); mail.sent.push(m); } }; return mail; };

const ANA = "ana.test@example.com", BO = "bo.test@example.com", CY = "cy.test@example.com";
const ART = () => [
  { id: 12, title: "Flamingo Party", price: 950, salePrice: null, image: "https://img.test/flamingo.jpg", isSold: false },
  { id: 13, title: "Mangrove Light", price: 990, salePrice: null, image: "https://img.test/mangrove.jpg", isSold: false },
];
const lead = (id, email, over = {}) => ({ id, email, source: "welcome-popup", coupon_code: null, coupon_used: false, created_at: ago(20 * DAY), cart: null, cart_at: null, coupon_size: null, ...over });
const order = (id, email, ref, title) => ({ id, client_email: email, ship_name: "Ana Test", item_title: title, amount: 1, status: "pending", created_at: ago(DAY), notes: `Order Ref: ${ref} · Ana Test${CARD_NOTE}` });
const shop = (over = {}, opts = {}) => fakeDb({ Leads: [], Artworks: ART(), Orders: [order(41, ANA, "FA-1760", "Flamingo Party"), order(42, BO, "FA-1761", "Mangrove Light")], Clients: [], Settings: [{ id: 1, couponDiscount: 15 }], ...over }, opts);
const cart = (...ids) => ids.map((id) => ({ id }));
// They tapped the button, as the store action does it.
async function asks(db, email) {
  const u = await unsub();
  assert.deepEqual(await u.opUnsubscribe(db, { token: tokenIn(u.linkFor(email)) }, NOW), { ok: true });
}
const tokenIn = (text) => /[?&]unsubscribe=([A-Za-z0-9_-]+)/.exec(text)?.[1];

// ── 1. the link ─────────────────────────────────────────────────

test("the link: sealed, opens to that one email and no other, and names nobody", async () => {
  const { linkFor, emailOf } = await unsub();
  const { readUnsubscribe } = await load("src/lib/unsubscribeLink.js");
  for (const [typed, email] of [["ana@example.com", "ana@example.com"], ["  Ana@Example.COM ", "ana@example.com"], ["añá+x@exämple.com", "añá+x@exämple.com"], [`${"a".repeat(242)}@example.com`, `${"a".repeat(242)}@example.com`], ["é".repeat(254), "é".repeat(254)]]) {
    const link = linkFor(typed);
    assert.match(link, /^https:\/\/fonkiart\.com\/\?unsubscribe=[A-Za-z0-9_-]+$/);
    const token = readUnsubscribe(new URL(link).search);
    assert.equal(token, tokenIn(link), "what the site reads from the address bar");
    assert.equal(emailOf(token), email);
    assert.ok(!decodeURIComponent(link).includes(email), "not in plain sight");
    assert.ok(!Buffer.from(token, "base64url").toString("latin1").includes(Buffer.from(email, "utf8").toString("latin1")), "nor just written another way");
  }
  assert.notEqual(linkFor(ANA), linkFor(ANA), "two links for one person look nothing alike");
  assert.equal(emailOf(tokenIn(linkFor(ANA))), emailOf(tokenIn(linkFor(ANA))), "and both work");
});

test("anything that isn't one of our links opens to nobody: junk, changed, cut short, made with another key or for another use", async () => {
  const { linkFor, emailOf } = await unsub();
  const token = tokenIn(linkFor(ANA));
  assert.equal(emailOf(token), ANA, "control");
  for (const junk of [undefined, null, "", "x", 5, {}, [], [token], { toString: () => token }, ` ${token}`, `${token} `, `${token}=`, `${token}\n`, "A".repeat(39), "A".repeat(60), "A".repeat(1501), "x".repeat(1e6)]) assert.equal(emailOf(junk), null, String(junk).slice(0, 40));
  for (let i = 0; i < token.length; i += 3) {
    const c = token[i] === "A" ? "B" : "A";
    assert.equal(emailOf(token.slice(0, i) + c + token.slice(i + 1)), null, `one letter changed, at ${i}`);
  }
  for (const n of [1, 2, 4, 20]) assert.equal(emailOf(token.slice(0, -n)), null, `cut by ${n}`);
  for (const more of ["A", "AA", "AAA", "AAAA"]) assert.equal(emailOf(token + more), null, "made longer");
  // The last letter can carry bits that say nothing: written any other way, it isn't one we made.
  const ends = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"].filter((c) => emailOf(token.slice(0, -1) + c) !== null);
  assert.deepEqual(ends, [token.at(-1)]);
  // The same key and the same email, sealed for something else.
  const key = crypto.createHmac("sha256", KEY).update("fonkiart unsubscribe link").digest();
  const sealed = (what) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv); c.setAAD(Buffer.from(what)); const t = Buffer.concat([c.update(ANA, "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), t]).toString("base64url"); };
  assert.equal(emailOf(sealed("fonkiart unsubscribe:1")), ANA, "control: sealed by hand as the server does it");
  assert.equal(emailOf(sealed("something else")), null);
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = `${KEY}-changed`;
    assert.equal(emailOf(token), null, "another key");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(emailOf(token), null, "no key");
    assert.throws(() => linkFor(ANA), /no key for the Unsubscribe link/, "and none is made");
  } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
  assert.doesNotMatch(read("api/_lib/unsubscribe.js"), /createCipheriv\("aes-256-(?!gcm)/, "sealed so that a changed one can't open");
});

test("the address bar: the link is read from it, and taken out leaving everything else", async () => {
  const { readUnsubscribe, withoutUnsubscribe, unsubscribeLink } = await load("src/lib/unsubscribeLink.js");
  assert.equal(readUnsubscribe("?unsubscribe=abc-_9"), "abc-_9");
  for (const none of ["", "?", "?unsubscribe=", "?artwork=12", "?x=unsubscribe"]) assert.equal(readUnsubscribe(none), null, none);
  assert.equal(withoutUnsubscribe("?unsubscribe=abc"), "");
  assert.equal(withoutUnsubscribe("?a=1&unsubscribe=abc&b=2"), "?a=1&b=2");
  assert.equal(withoutUnsubscribe("?a=1"), "?a=1");
  assert.equal(unsubscribeLink("https://fonkiart.com", "abc"), "https://fonkiart.com/?unsubscribe=abc");
});

// ── 2. asking ───────────────────────────────────────────────────

test("asking: one small private note that names nobody; twice is the same as once; the answer says nothing about them", async () => {
  const u = await unsub();
  const db = shop({ Leads: [lead(1, ANA, { coupon_code: "FK-TEST-AAAA" })] });
  const { out, said } = await logsOf(() => u.opUnsubscribe(db, { token: tokenIn(u.linkFor("Ana.Test@Example.com")) }, NOW));
  assert.deepEqual([out, said], [{ ok: true }, ""]);
  const [name] = Object.keys(db.files);
  assert.equal(Object.keys(db.files).length, 1);
  assert.match(name, /^unsub\/[0-9a-f]{64}\.json$/);
  assert.deepEqual(JSON.parse(db.files[name]), { at: NOW.toISOString() }, "only when");
  assert.ok(!JSON.stringify(db.files).includes("ana"), "nothing of the email in it");
  assert.equal(await u.isUnsubscribed(db, " ANA.test@example.com"), true, "any capitals, spaces around it");
  assert.equal(await u.isUnsubscribed(db, "ana.test@example.co"), false);
  assert.deepEqual(db.log.filter((l) => / (Leads|Orders|Clients)/.test(l)), [], "the shop's lists aren't touched, or even read");
  await u.opUnsubscribe(db, { token: tokenIn(u.linkFor(ANA)) }, new Date(NOW.getTime() + DAY));
  assert.deepEqual(JSON.parse(db.files[name]), { at: NOW.toISOString() }, "asked again: the first day stays");
  assert.equal(Object.keys(db.files).length, 1);
  // It is private: the bucket the server keeps for itself.
  assert.match(read("api/_lib/systemNote.js"), /createBucket\(BUCKET, \{ public: false \}\)/);
  // It outlives their Leads row, a changed server key, and someone typing their email again.
  db.tables.Leads.length = 0;
  assert.equal(await u.isUnsubscribed(db, ANA), true);
  try { process.env.SUPABASE_SERVICE_ROLE_KEY = `${KEY}-changed`; assert.equal(await u.isUnsubscribed(db, ANA), true, "a changed key never forgets who asked"); } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
});

test("a link that isn't ours is refused before anything is read; a note that can't be read or saved is never taken for done", async () => {
  const u = await unsub();
  const { STORE_OPS, GET_OPS } = await load("api/_lib/storeOps.js");
  assert.equal(typeof STORE_OPS.unsubscribe, "function", "a store action");
  assert.ok(!GET_OPS.has("unsubscribe"), "never by just opening an address: mail programs open links by themselves");
  const good = tokenIn(u.linkFor(ANA));
  for (const token of [undefined, null, "", "x", `${good}A`, good.slice(1), 5, {}]) {
    const db = shop();
    await assert.rejects(STORE_OPS.unsubscribe(db, { body: { token } }, mailbox()), (e) => e.status === 404 && e.message === "This link doesn't work", String(token));
    assert.deepEqual(db.log, [], "nothing read, nothing written");
  }
  await assert.rejects(STORE_OPS.unsubscribe(shop(), {}, mailbox()), (e) => e.status === 404);
  for (const trouble of ["down", "full"]) {
    const db = shop();
    db[trouble] = "Storage is down";
    await assert.rejects(u.opUnsubscribe(db, { token: good }, NOW), (e) => !e.status && /Storage is down/.test(e.message), trouble);
    assert.deepEqual(db.files, {});
  }
  const db = shop();
  assert.deepEqual(await STORE_OPS.unsubscribe(db, { body: { token: good } }, mailbox()), { ok: true }, "control");
  assert.equal(await u.isUnsubscribed(db, ANA), true);
});

test("who asked, for Admin's lists: however many there are, and only those on the list in hand", async () => {
  const u = await unsub();
  const db = shop();
  await asks(db, ANA);
  assert.deepEqual([...(await u.unsubscribedAmong(db, ["Ana.Test@example.com", BO]))], ["Ana.Test@example.com"], "as the list writes it");
  const fileOf = Object.keys(db.files)[0];
  // 2,300 others, so theirs is on the third page Storage answers.
  for (let i = 0; i < 2300; i++) db.files[`unsub/${String(i).padStart(64, "0")}.json`] = "{}";
  db.files[fileOf.replace(/unsub\/./, "unsub/f")] = "{}";
  db.log.length = 0;
  assert.deepEqual([...(await u.unsubscribedAmong(db, [BO, ANA]))], [ANA]);
  assert.deepEqual(db.log, ["list system/unsub 0", "list system/unsub 1000", "list system/unsub 2000"]);
  db.log.length = 0;
  assert.equal((await u.unsubscribedAmong(db, [])).size, 0);
  assert.deepEqual(db.log, [], "nobody on the list: nothing to read");
  db.down = "Storage is down";
  await assert.rejects(u.unsubscribedAmong(db, [ANA]), /Storage is down/, "never 'nobody asked'");
});

// ── 3. every way a coupon is emailed ────────────────────────────

test("the only way out: the person's own link is in it; asked for no more, or can't be checked: nothing is built, nothing goes", async () => {
  const u = await unsub();
  const db = shop(), mail = mailbox();
  const built = [];
  const send = (to) => u.sendCouponEmail(db, mail, { to, subject: "Hi", html: async (link) => { built.push(link); return `<a href="${link}">x</a>`; } });
  assert.deepEqual(await send(ANA), { sent: true });
  assert.deepEqual([mail.sent.length, mail.sent[0].to, mail.sent[0].subject], [1, ANA, "Hi"]);
  assert.equal(u.emailOf(tokenIn(mail.sent[0].htmlContent)), ANA, "theirs");
  await asks(db, ANA);
  assert.deepEqual(await send("ANA.test@example.com"), { sent: false, why: "out" });
  assert.deepEqual(await send(BO), { sent: true }, "nobody else");
  for (const trouble of [() => { db.down = "Storage is down"; }, () => { db.down = null; db.files[Object.keys(db.files)[0]] = "{not json"; }]) {
    trouble();
    const { out, said } = await logsOf(() => send(ANA));
    assert.deepEqual(out, { sent: false, why: "unchecked" });
    assert.match(said, /coupon email not sent: couldn't check who unsubscribed/);
    assert.ok(!said.includes(ANA), "nobody's email in the log");
  }
  assert.deepEqual([built.length, mail.sent.length], [2, 2]);
  mail.fail = "Brevo is down";
  await assert.rejects(send(BO), /Brevo is down/, "an email that doesn't go is never 'sent'");
});

test("every coupon email has the line, in letters of 16px or more, and can't be built without the link", async () => {
  const T = await load("api/_lib/emails.js");
  const link = "https://fonkiart.com/?unsubscribe=made-up_9-x";
  const builders = {
    welcomeCoupon: (unsubscribe) => T.welcomeCoupon({ code: "FK-TEST-AAAA", discount: 15, verifyLink: "https://x.test/v", unsubscribe }),
    unfinishedCoupon: (unsubscribe) => T.unfinishedCoupon({ firstName: "Ana", titles: ["Flamingo Party"], code: "FK-TEST-AAAA", words: "$300 off", unsubscribe }),
    couponGift: (unsubscribe) => T.couponGift({ code: "FK-TEST-AAAA", words: "15% off", unsubscribe }),
  };
  for (const [name, build] of Object.entries(builders)) {
    const html = build(link);
    assert.match(html, /Don't want coupons by email\? <a href="https:\/\/fonkiart\.com\/\?unsubscribe=made-up_9-x" style="[^"]*text-decoration:underline;">Unsubscribe<\/a>/, name);
    assert.equal(html.match(/unsubscribe=/g).length, 1, `${name}: once`);
    assert.ok(html.indexOf("Unsubscribe</a>") > html.indexOf("FONKIART.COM</a>"), `${name}: at its end`);
    for (const px of html.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px[1]) >= 16, `${name}: ${px[0]}`);
    const line = /<p [^>]*>Don't want coupons[\s\S]*?<\/p>/.exec(html)[0];
    assert.doesNotMatch(line, /green|#2d6a4f|cream|beige|ivory|#f[0-9a-f]{5}/i, name);
    for (const none of [undefined, null, "", "x", "javascript:alert(1)", "http://fonkiart.com/?unsubscribe=x", " https://x"]) assert.throws(() => build(none), /a coupon email needs its Unsubscribe link/, `${name}: ${none}`);
    assert.ok(!build('https://x.test/"><b>').includes('"><b>'), `${name}: the link can't break out of its place`);
  }
  // No other email has it.
  assert.doesNotMatch(T.contactBuyer({ name: "Ana", message: "hi", sender: "shop@fonkiart.com" }), /nsubscribe/);
  assert.doesNotMatch(T.adminFrame("Invoice", "<p>x</p>", ["Flamingo Party"]), /nsubscribe/);
});

test("and no coupon goes any other way: each builder is only ever called inside sendCouponEmail, and nothing in the browser writes one", () => {
  const files = [...walk("api"), ...walk("src")];
  const calls = /\bT\.(welcomeCoupon|unfinishedCoupon|couponGift)\(/g;
  const users = files.filter((f) => read(f).match(calls));
  assert.deepEqual(users, ["api/_lib/couponMail.js", "api/_lib/leadsCoupon.js", "api/_lib/storeOps.js"]);
  for (const f of users) {
    const src = read(f);
    for (const m of src.matchAll(calls)) {
      const at = src.lastIndexOf("sendCouponEmail(db, mail, {", m.index);
      assert.ok(at > 0 && /html: (?:async )?\(unsubscribe\) =>\s*$/.test(src.slice(at, m.index)), `${f}: ${m[0]} is inside sendCouponEmail`);
      assert.match(src.slice(m.index, src.indexOf("\n", m.index)), /unsubscribe \}\)/, `${f}: with its link`);
    }
  }
  for (const f of ["api/_lib/couponMail.js", "api/_lib/leadsCoupon.js"]) assert.doesNotMatch(read(f), /mail\.send\(/, f);
  assert.equal((read("api/_lib/unsubscribe.js").match(/mail\.send\(/g) || []).length, 1);
  assert.deepEqual(files.filter((f) => /couponEmail\b/.test(read(f))), [], "Admin no longer writes one itself");
  assert.deepEqual(files.filter((f) => f.startsWith("src/") && /A Gift From Fonkiart/.test(read(f))), []);
  // Controls: the readers see what they look for.
  assert.deepEqual("await mail.send({ htmlContent: T.couponGift({ code }) })".match(calls), ["T.couponGift("]);
});

test("the welcome gift: someone who asked still gets their code on the screen, no email, and nothing says one went", async () => {
  const u = await unsub();
  const { opWelcome } = await load("api/_lib/storeOps.js");
  const db = shop(), mail = mailbox();
  const first = await quiet(() => opWelcome(db, { email: "Cy.Test@example.com" }, mail));
  assert.deepEqual([mail.sent.length, "emailed" in first], [1, false], "control: as before");
  assert.equal(u.emailOf(tokenIn(mail.sent[0].htmlContent)), CY);
  assert.match(mail.sent[0].htmlContent, /Verify my email/);
  // Asked, and their row deleted since: typed again, it is a new row.
  await asks(db, CY);
  db.tables.Leads.length = 0; db.links.length = 0;
  const again = await quiet(() => opWelcome(db, { email: CY }, mail));
  assert.deepEqual([again.returning, again.emailed, typeof again.pass], [false, false, "string"]);
  assert.equal(again.code, db.lead(CY).coupon_code);
  assert.deepEqual([mail.sent.length, db.links], [1, []], "no email, and no sign-in link made for nothing");
  // It can't be checked: the same, for anyone.
  db.down = "Storage is down";
  const blind = await quiet(() => opWelcome(db, { email: "dee.test@example.com" }, mail));
  assert.deepEqual([blind.emailed, typeof blind.code, mail.sent.length], [false, "string", 1]);
});

test("Admin -> Orders, both lists: to someone who asked nothing is made, saved, sent or noted, and the answer says so", async () => {
  const { couponSend } = await load("api/_lib/unfinishedCoupon.js");
  const { cartCouponSend } = await load("api/_lib/cartCoupon.js");
  const lists = {
    "Didn't finish paying": (db, mail) => couponSend(db, { id: 41, dollars: 300 }, mail, NOW),
    "Left in the cart": (db, mail) => cartCouponSend(db, { email: ANA, dollars: 300 }, mail, NOW),
  };
  // No order of theirs on the cart's list; a lead with a cart, with or without a code of their own.
  const start = (over, name) => shop({ Leads: [lead(1, ANA, { cart: cart(12), cart_at: ago(DAY), ...over })], ...(name === "Left in the cart" && { Orders: [] }) });
  for (const [name, send] of Object.entries(lists)) {
    for (const over of [{}, { coupon_code: "FK-TEST-AAAA", coupon_size: [{ percent: 20 }] }]) {
      const db = start(over, name), mail = mailbox();
      await asks(db, ANA);
      const before = structuredClone([db.tables.Leads, db.files]);
      db.log.length = 0;
      assert.deepEqual(await send(db, mail), { sent: false, why: "out" }, name);
      assert.deepEqual([db.tables.Leads, db.files], before, `${name}: no code made, no size saved, nothing noted`);
      assert.deepEqual([mail.sent, db.writes()], [[], []], name);
      // Control: it goes to someone who didn't ask, with their own link.
      const on = start(over, name);
      assert.equal((await send(on, mail)).sent, true, name);
      assert.equal((await unsub()).emailOf(tokenIn(mail.sent[0].htmlContent)), ANA);
      // It can't be checked: nothing is made or sent, and it says why.
      for (const trouble of [(d) => { d.down = "Storage is down"; }]) {
        const blind = start(over, name), was = structuredClone(blind.tables.Leads), none = mailbox();
        trouble(blind);
        await assert.rejects(quiet(() => send(blind, none)), /nothing was sent/, name);
        assert.deepEqual([blind.tables.Leads, none.sent, blind.writes()], [was, [], []], name);
      }
      const odd = start(over, name), was = structuredClone(odd.tables.Leads), none = mailbox();
      await asks(odd, ANA);
      odd.files[Object.keys(odd.files)[0]] = "{not json";
      await assert.rejects(quiet(() => send(odd, none)), /couldn't check whether they asked for no more coupons, so nothing was sent/, name);
      assert.deepEqual([odd.tables.Leads, none.sent], [was, []], name);
    }
  }
});

test("they ask in the moment between: the email doesn't go, their code gives again what it gave, and nothing is noted", async () => {
  const { couponSend } = await load("api/_lib/unfinishedCoupon.js");
  for (const [made, want] of [["out", { sent: false, why: "out" }], ["down", /couldn't check whether they asked for no more coupons, so nothing was sent/]]) {
    const db = shop({ Leads: [lead(1, ANA, { coupon_code: "FK-TEST-AAAA", coupon_size: [{ percent: 20 }] })] }), mail = mailbox();
    // As their amount is saved on their row, they tap the button (or Storage goes down).
    const from = db.from;
    let saved = false;
    db.from = (t) => { const q = from(t); if (t !== "Leads") return q; const update = q.update; q.update = (v) => { saved ||= !!v.coupon_size; if (made === "down") db.down = "Storage is down"; return update(v); }; return q; };
    const send = async () => {
      const pending = couponSend(db, { id: 41, dollars: 300 }, mail, NOW);
      if (made === "out") { while (!saved) await new Promise((r) => setImmediate(r)); }
      return pending;
    };
    if (made === "out") {
      const down = db.storage.from;
      const u = await unsub(); const token = tokenIn(u.linkFor(ANA));
      db.storage.from = (b) => { const s = down(b); return { ...s, async download(p) { if (saved && p.startsWith("unsub/") && !Object.keys(db.files).some((f) => f.startsWith("unsub/"))) { db.storage.from = down; await u.opUnsubscribe(db, { token }, NOW); } return down(b).download(p); } }; };
    }
    if (want instanceof RegExp) await assert.rejects(quiet(send), want);
    else assert.deepEqual(await quiet(send), want);
    assert.equal(saved, true, "control: the amount had been saved");
    assert.deepEqual([db.lead(ANA).coupon_size, mail.sent, db.note()], [[{ percent: 20 }], [], null], made);
  }
});

test("the lists say who asked, and only them; when that can't be read they are still the whole lists (the sending checks)", async () => {
  const { couponStatus } = await load("api/_lib/unfinishedCoupon.js");
  const { cartsForAdmin } = await load("api/_lib/cartCoupon.js");
  const { unsubscribedLeads } = await load("api/_lib/leadsCoupon.js");
  const db = shop({ Leads: [lead(1, ANA, { cart: cart(12), cart_at: ago(DAY) }), lead(2, CY, { cart: cart(13), cart_at: ago(2 * DAY) })] });
  await asks(db, ANA); await asks(db, CY);
  const status = async () => Object.fromEntries(Object.entries((await couponStatus(db, { ids: [41, 42] })).coupons).map(([id, c]) => [id, c.out]));
  assert.deepEqual(await status(), { 41: true, 42: undefined });
  db.tables.Orders = [];
  const carts = async () => (await cartsForAdmin(db, NOW)).carts.map((c) => [c.email, c.out]);
  assert.deepEqual(await carts(), [[ANA, true], [CY, true]]);
  assert.deepEqual(await unsubscribedLeads(db, { emails: [BO, "ANA.Test@example.com", CY] }), { emails: ["ANA.Test@example.com", CY] });
  // "Left in the cart" itself is read from the note of coupons sent too, so only the list of who asked goes down here.
  db.storage.from = ((from) => (b) => ({ ...from(b), list: async () => ({ data: null, error: { message: "Storage is down", statusCode: "500" } }) }))(db.storage.from);
  const { out, said } = await logsOf(carts);
  assert.deepEqual(out, [[ANA, undefined], [CY, undefined]]);
  assert.match(said, /couldn't read who unsubscribed/);
  await assert.rejects(unsubscribedLeads(db, { emails: [ANA] }), /Storage is down/);
  for (const emails of [[5], [{}], ["x".repeat(255)], Array(5001).fill(ANA)]) await assert.rejects(unsubscribedLeads(db, { emails }), (e) => e.status === 400);
  for (const body of [{}, undefined, { emails: ANA }]) assert.deepEqual(await unsubscribedLeads(db, body), { emails: [] });
});

test("Admin -> Leads, '+ Create Coupon': the server sends the code on their own row, in its own words; never to someone who asked", async () => {
  const u = await unsub();
  const { couponGift } = await load("api/_lib/leadsCoupon.js");
  const people = () => [lead(1, ANA, { coupon_code: "FK-TEST-AAAA" }), lead(2, BO, { coupon_code: "FK-TEST-BBBB", coupon_size: [{ percent: 15 }, { dollars: 300, of: 950 }] }), lead(3, CY), lead(4, CY, { coupon_code: "FK-TEST-CCCC" })];
  const db = shop({ Leads: people() }), mail = mailbox();
  assert.deepEqual(await couponGift(db, { email: " ANA.test@example.com ", code: "FK-HACK-0000", words: "99% off", to: BO, subject: "x" }, mail), { sent: true });
  const [m] = mail.sent;
  assert.deepEqual([m.to, m.subject], [ANA, "Your Exclusive Coupon — Fonkiart"]);
  assert.match(m.htmlContent, /A Gift From Fonkiart[\s\S]*FK-TEST-AAAA<[\s\S]*15% off your purchase[\s\S]*Enter this code at checkout\. One use only\./);
  assert.doesNotMatch(m.htmlContent, /HACK|99%/, "nothing a browser sends about it counts");
  assert.equal(u.emailOf(tokenIn(m.htmlContent)), ANA);
  await couponGift(db, { email: BO }, mail);
  assert.match(mail.sent[1].htmlContent, /FK-TEST-BBBB<[\s\S]*15% off or up to \$300 off your purchase/);
  await couponGift(db, { email: CY }, mail);
  assert.match(mail.sent[2].htmlContent, /FK-TEST-CCCC</, "two rows: the one with a code");
  await asks(db, BO);
  assert.deepEqual(await couponGift(db, { email: BO }, mail), { sent: false, why: "out" });
  await assert.rejects(couponGift(shop(), { email: ANA }, mail), (e) => e.status === 409 && e.message === "They have no coupon to send.");
  for (const email of [undefined, "", "x", 5, {}]) await assert.rejects(couponGift(db, { email }, mail), (e) => e.status === 400, String(email));
  db.down = "Storage is down";
  await assert.rejects(quiet(() => couponGift(db, { email: ANA }, mail)), /couldn't check whether they asked for no more coupons, so nothing was sent/);
  assert.equal(mail.sent.length, 3);
  assert.deepEqual(db.tables.Leads, people(), "and no row is changed by it");
});

test("an Admin page open since before: the coupon it writes itself gets the link too, or doesn't go; its other emails are as before", async () => {
  const u = await unsub();
  const { isOldGift, oldGift } = await load("api/_lib/leadsCoupon.js");
  const { adminEmail } = await load("api/_lib/adminOps.js");
  // As that page sent it (94ef250's src/lib/adminEmails.js couponEmail, through utils/helpers sendEmail).
  const old = { kind: "email", to: ANA, subject: "Your Exclusive Coupon — Fonkiart", heading: "A Gift From Fonkiart", content: "<p>We have a special offer just for you:</p><div>FK-TEST-AAAA</div>" };
  assert.equal(isOldGift(old), true);
  for (const other of [{ ...old, heading: "Invoice INV-1" }, { ...old, heading: undefined, htmlContent: "<p>x</p>" }, {}, null, undefined]) assert.equal(isOldGift(other), false);
  const db = shop(), mail = mailbox();
  await oldGift(db, old, mail);
  assert.match(mail.sent[0].htmlContent, /FK-TEST-AAAA/);
  assert.equal(u.emailOf(tokenIn(mail.sent[0].htmlContent)), ANA);
  assert.deepEqual([mail.sent.length, mail.sent[0].to], [1, [{ email: ANA }]]);
  await oldGift(db, { ...old, to: [{ email: BO }, { email: ANA }] }, mail);
  assert.deepEqual(mail.sent[1].to, [{ email: BO }], "one person, the link's own");
  assert.equal(u.emailOf(tokenIn(mail.sent[1].htmlContent)), BO);
  await asks(db, ANA);
  await assert.rejects(oldGift(db, old, mail), (e) => e.status === 409 && /asked not to get coupons, so nothing was sent/.test(e.message));
  db.down = "Storage is down";
  await assert.rejects(quiet(() => oldGift(db, { ...old, to: BO }, mail)), (e) => e.status === 409 && /Nothing was sent/.test(e.message));
  for (const to of [undefined, "", "x", [], [{}], 5]) await assert.rejects(oldGift(shop(), { ...old, to }, mail), (e) => e.status === 400, String(to));
  assert.equal(mail.sent.length, 2);
  // An invoice, a status, a reply: they asked for no coupons, not for no emails.
  await adminEmail(mail, { to: ANA, subject: "Your invoice", heading: "Invoice INV-1", content: "<p>x</p>", pieces: ["Flamingo Party"] });
  assert.equal(mail.sent.length, 3);
  assert.doesNotMatch(mail.sent[2].htmlContent, /nsubscribe/);
  const using = [...walk("api")].filter((f) => /from "\.\/(_lib\/)?unsubscribe\.js"/.test(read(f)));
  assert.deepEqual(using, ["api/_lib/couponMail.js", "api/_lib/leadsCoupon.js", "api/_lib/storeOps.js"], "only coupons ask");
});

test("the doors: both Leads actions are behind the admin login, and the old page's coupon is caught there", () => {
  const door = read("api/admin.js");
  const login = door.indexOf("Admin login required");
  for (const kind of ["coupon-gift", "unsubscribed"]) assert.ok(login > 0 && door.indexOf(`body.kind === "${kind}"`) > login, kind);
  assert.match(door, /if \(body\.kind === "email"\) return res\.status\(200\)\.json\(isOldGift\(body\) \? await oldGift\(db, body, \{ send \}\) : await adminEmail\(\{ send \}, body\)\);/);
  const files = [...walk("api"), ...walk("src")];
  assert.deepEqual(files.filter((f) => /"coupon-gift"/.test(read(f))), ["api/admin.js", "src/admin/LeadsTab.jsx"]);
});

// ── 4. the page, the site around it, and what is said ───────────

// A component drawn by itself, its state kept between draws (as tests/cartCoupon.test.js draws Admin's
// list): each import of the file becomes a read from the stand-ins given, and one with none fails.
let drawing = null;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const React = {
  useState(init) {
    const d = drawing, n = d.at++;
    if (!(n in d.hooks)) d.hooks[n] = typeof init === "function" ? init() : init;
    return [d.hooks[n], (v) => { d.hooks[n] = typeof v === "function" ? v(d.hooks[n]) : v; d.draw(); }];
  },
  useEffect(fn, deps) { const d = drawing, n = d.at++; if (d.hooks[n] && same(d.hooks[n], deps)) return; d.hooks[n] = deps; d.effects.push(fn); },
  useRef(init) { const d = drawing, n = d.at++; return (d.hooks[n] ||= { current: init }); },
};
const FRAGMENT = Symbol("Fragment");
const jsx = (type, props) => ({ type, props: props || {} });
globalThis.__unsubTest = {};
let loads = 0;
async function component(file, given, name = "default") {
  assert.ok(existsSync(new URL(file, root)), `${file} is there`);
  const { code } = await transformWithOxc(read(file), file, { lang: "jsx", jsx: { runtime: "automatic" } });
  const key = `${file} ${++loads}`;
  const all = globalThis.__unsubTest[key] = { react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: FRAGMENT }, ...given };
  const body = code.replace(/^import\s+"[^"]+\.css";?[ \t]*$/gm, "").replace(/^import\s+(.+?)\s+from\s+"([^"]+)";?[ \t]*$/gm, (line, names, from) => {
    if (!(from in all)) throw new Error(`${file} imports "${from}", and this test has no stand-in for it`);
    const m = names.match(/^([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?$/);
    const mod = `globalThis.__unsubTest[${JSON.stringify(key)}][${JSON.stringify(from)}]`;
    return [m[1] && `const ${m[1]} = ${mod}.default;`, m[2] && `const {${m[2].replace(/\s+as\s+/g, ": ")}} = ${mod};`].filter(Boolean).join(" ");
  });
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`))[name];
}
function draw(Component, props) {
  const d = { hooks: [], effects: [], at: 0, tree: null };
  const flat = (n) => n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n === "object"
    ? typeof n.type === "function" ? flat(n.type(n.props)) : n.type === FRAGMENT ? flat(n.props.children) : [{ type: n.type, props: n.props, children: flat(n.props.children) }]
    : [String(n)];
  d.draw = () => {
    const outer = drawing; drawing = d; d.at = 0;
    try { d.tree = { type: "#", props: {}, children: flat(Component(props)) }; } finally { drawing = outer; }
    for (const run of d.effects.splice(0)) run();
  };
  d.draw();
  const find = (want, n = d.tree) => typeof n === "string" ? [] : [...(want(n) ? [n] : []), ...n.children.flatMap((x) => find(want, x))];
  const text = (n = d.tree) => typeof n === "string" ? n : n.children.map((x) => text(x)).join(/^(p|div|h1|h2|li|td|tr|#)$/.test(n.type) ? " " : "");
  const words = (n) => text(n).replace(/\s+/g, " ").trim();
  return { find, text: words, buttons: () => find((n) => n.type === "button").map((n) => [words(n), n.props.disabled === true]), press: (label) => find((n) => n.type === "button" && words(n) === label)[0].props.onClick() };
}
const settle = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };

test("the page: opening it changes nothing; only the button does, once, and it says what stops and what still comes", async () => {
  const calls = [], went = [];
  let answer;
  const Page = await component("src/pages/UnsubscribePage.jsx", { "../lib/store": { storeCall: (...a) => { calls.push(a); return new Promise((ok, bad) => { answer = { ok, bad }; }); } } });
  const open = () => draw(Page, { token: "abc", setPage: (p) => went.push(p) });
  const page = open();
  await settle();
  assert.deepEqual(calls, [], "opening it asks the server nothing");
  assert.match(page.text(), /^Fonkiart ?Stop coupon emails\? Tap the button and we won't send you coupons again\. Emails about your orders will still come\. Unsubscribe$/);
  assert.deepEqual(page.buttons(), [["Unsubscribe", false]]);
  page.press("Unsubscribe");
  assert.deepEqual(calls, [["unsubscribe", { token: "abc" }]], "with the link's own token, no sign-in");
  assert.deepEqual(page.buttons(), [["One moment…", true]], "on its way: can't be tapped again");
  answer.ok({ ok: true });
  await settle();
  assert.match(page.text(), /You're unsubscribed We won't send you coupons again\. Emails about your orders will still come\. Back to the shop$/);
  page.press("Back to the shop");
  assert.deepEqual([went, calls.length], [["catalog"], 1]);
});

test("the page: a link that isn't ours, and a tap that doesn't go through, are said plainly, never as done", async () => {
  let fail;
  const went = [];
  const Page = await component("src/pages/UnsubscribePage.jsx", { "../lib/store": { storeCall: async () => { if (fail) throw fail; return { ok: true }; } } });
  const page = draw(Page, { token: "abc", setPage: (p) => went.push(p) });
  fail = Object.assign(new Error("Something went wrong"), { status: 500 });
  await quiet(async () => { page.press("Unsubscribe"); await settle(); });
  assert.match(page.text(), /Stop coupon emails\?.*That didn't go through\. Please try again\. Unsubscribe$/);
  fail = new Error("Failed to fetch"); // no signal
  await quiet(async () => { page.press("Unsubscribe"); await settle(); });
  assert.match(page.text(), /That didn't go through/);
  fail = null;
  page.press("Unsubscribe");
  await settle();
  assert.match(page.text(), /You're unsubscribed/);
  assert.doesNotMatch(page.text(), /didn't go through/);
  const bad = draw(Page, { token: "nope", setPage: (p) => went.push(p) });
  fail = Object.assign(new Error("This link doesn't work"), { status: 404 });
  await quiet(async () => { bad.press("Unsubscribe"); await settle(); });
  assert.match(bad.text(), /This link didn't work Please write to us and we'll stop the coupons for you\. Write to us$/);
  bad.press("Write to us");
  assert.deepEqual(went, ["contact"]);
  // What changes is read out to someone who can't see it.
  assert.equal(page.find((n) => n.props.role === "status").length, 1);
});

test("the site around it: the link opens its own page, with no popup over it, never kept as the page to come back to, and it leaves the address bar with it", () => {
  const app = read("src/App.jsx");
  assert.match(app, /const \[unsubToken\]\s+= useState\(\(\) => readUnsubscribe\(window\.location\.search\)\);/);
  assert.match(app, /cardReturn \? "card-return" : unsubToken \? "unsubscribe" : resetLink/, "its page, first");
  assert.match(app, /const LINK_PAGES = new Set\(\["conversation", "invoice", "unsubscribe", "card-return"\]\);/);
  assert.match(app, /if \(!LINK_PAGES\.has\(page\)\) localStorage\.setItem\("fonkiart-page", page\);/);
  assert.match(app, /if \(!u \|\| LINK_PAGES\.has\(pageRef\.current\)\) return;/, "someone signed in stays on it");
  assert.match(app, /quiet=\{LINK_PAGES\.has\(page\)\}/, "no 5-minute box over it");
  assert.match(app, /!cardReturn && !unsubToken && !sessionStorage\.getItem\("fonkiart-welcome-seen"\)/, "nor the welcome popup");
  assert.match(app, /if \(!unsubToken \|\| page === "unsubscribe"\) return;\n\s*window\.history\.replaceState\(window\.history\.state, "", window\.location\.pathname \+ withoutUnsubscribe\(window\.location\.search\) \+ window\.location\.hash\);/);
  assert.match(app, /unsubscribe:"Coupon Emails — Fonkiart"/);
  assert.match(app, /page === "unsubscribe" \? \{ label: "Coupons", Icon: Mail \}/, "short: the phone's top bar cut a longer one");
  assert.match(app, /\{page === "unsubscribe" && unsubToken && <UnsubscribePage token=\{unsubToken\} setPage=\{goToPage\} \/>\}/);
  // The page's own look: the shop's other small pages, nothing new under 16px, no green and no cream.
  const css = read("src/index.css");
  assert.match(css, /\n\.unsub \.pay-return-text \{ color:#5b4a5c; \}/);
  for (const line of css.split("\n").filter((l) => /^\.(unsub|lead-out|lead-said)\b/.test(l.trim()))) {
    assert.doesNotMatch(line, /green|#2d6a4f|cream|beige|ivory/i, line);
    for (const px of line.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px[1]) >= 16, line);
  }
  assert.doesNotMatch(read("src/pages/UnsubscribePage.jsx"), /alert\(|confirm\(|prompt\(|useEffect/, "no browser pop-up, and nothing that runs by itself");
});

test("the two popups: nothing says the code was emailed when it wasn't", async () => {
  const say = async (answer) => {
    const Welcome = await component("src/components/WelcomeModal.jsx", { "../lib/store": { storeCall: async () => answer }, "../lib/cartMemory": { remember() {}, toldEmail: () => "" }, "./Pic": { default: () => null }, "./SignInLine": { default: () => null }, "../lib/couponSize": await load("src/lib/couponSize.js") });
    const screen = draw(Welcome, { onClose() {}, discount: 15, artworks: [] });
    screen.find((n) => n.type === "input")[0].props.onChange({ target: { value: ANA } });
    await screen.find((n) => n.type === "button" && /Get My Coupon/.test(screen.text(n)))[0].props.onClick();
    await settle();
    return screen.text();
  };
  const made = { returning: false, code: "FK-TEST-AAAA" };
  assert.match(await say(made), /Check your inbox! Your unique coupon is also right here: FK-TEST-AAAA/, "control: as before");
  const without = await say({ ...made, emailed: false });
  assert.match(without, /Your unique coupon is right here: FK-TEST-AAAA/);
  assert.doesNotMatch(without, /inbox|emailed|sent/i);
  const box = async (done) => {
    const BoxSent = await component("src/components/CartEmailBox.jsx", { "lucide-react": { X: () => null }, "../lib/store": {}, "../lib/cartMemory": {}, "../lib/couponSize": {}, "./Pic": { default: () => null }, "./SignInLine": { default: () => null }, "../utils/helpers": {} }, "BoxSent");
    return draw(BoxSent, { done, saving: false, onClose() {} }).text();
  };
  const sent = { code: "FK-TEST-AAAA", email: ANA, returning: false, used: false };
  assert.match(await box({ ...sent, emailed: true }), /We sent it to your email/, "control: as before");
  assert.doesNotMatch(await box({ ...sent, emailed: false }), /sent it|your email|Verify/);
  assert.match(read("src/components/CartEmailBox.jsx"), /done\.emailed === false \? "Here is your code" : "Your code is on its way"/);
  assert.match(read("src/components/CartEmailBox.jsx"), /emailed: r\.emailed !== false/);
});

test("Admin: someone who asked has a plain line instead of the button, on both lists; a tap that finds out then says so", async () => {
  const piece = { id: 12, title: "Flamingo Party", price: 950, image: "https://img.test/flamingo.jpg" };
  const person = (email, over = {}) => ({ email, name: "", pieces: [piece], total: 950, at: new Date(Date.now() - DAY).toISOString(), sentAt: null, said: null, used: false, code: null, sizes: [{ percent: 15 }], ...over });
  const CartsLeft = await component("src/admin/CartsLeft.jsx", {
    "../lib/adminDb": { adminAction: async (kind) => (kind === "carts-left" ? { carts: [person(ANA, { out: true }), person(BO)], choose: true, percent: 15 } : { sent: false, why: "out" }) },
    "../lib/adminLink": { wantsOpenList: () => true, doneOpenList() {} }, "../lib/agoWords": await load("src/lib/agoWords.js"),
    "./ArtThumb": { default: () => null }, "./CouponAsk": { default: (p) => jsx("ask", { ...p }) },
  });
  const screen = draw(CartsLeft, { search: "", show: true, percent: 15 });
  await settle();
  const people = () => screen.find((n) => n.type === "li" && n.props.className === "o-cart");
  assert.match(screen.text(people()[0]), /Asked not to get coupons$/);
  assert.deepEqual(screen.find((n) => n.type === "button", people()[0]), [], "nothing to tap");
  screen.find((n) => n.type === "button" && screen.text(n) === "✉ Send a coupon")[0].props.onClick();
  await screen.find((n) => n.type === "ask")[0].props.onSend({});
  await settle();
  assert.match(screen.text(people()[1]), /Asked not to get coupons ?They asked not to get coupons, so nothing was sent\.$/);
  assert.deepEqual(screen.find((n) => n.type === "button", people()[1]), []);
  const tab = read("src/admin/OrdersTab.jsx");
  assert.match(tab, /if \(c\?\.out\) return <span className="o-coupon-out" style=\{SENT_LINE\}>Asked not to get coupons<\/span>;/);
  assert.match(tab, /r\.why === "out"\) \{\n\s*setCoupons\(c => \(\{ \.\.\.c, \[o\.id\]: \{ \.\.\.\(c\[o\.id\] \|\| \{\}\), out: true \} \}\)\);\n\s*noteCoupon\(o\.id, \{ ok: false, text: "They asked not to get coupons, so nothing was sent\." \}\);/);
  assert.match(tab, /if \(c\?\.out\) return \(\n\s*<div className="mark-paid-ask">\n\s*<span>They asked not to get coupons, so there is nothing to send\.<\/span>/);
});

test("Admin -> Leads: 'Unsubscribed' on their row, and '+ Create Coupon' says what really happened, after the form closes", async () => {
  const rows = [lead(1, "Ana.Test@example.com", { coupon_code: "FK-TEST-AAAA" }), lead(2, BO, { coupon_code: "FK-TEST-BBBB" })];
  const create = async (gift, { mail = true } = {}) => {
    const asked = [], found = { data: [], error: null };
    const query = { select: () => query, eq: () => Promise.resolve(found), order: () => Promise.resolve({ data: rows }), insert: async () => ({ error: null }), limit: () => Promise.resolve(found) };
    const Leads = await component("src/admin/LeadsTab.jsx", {
      "../lib/adminDb": { adminDb: { from: () => query }, adminAction: async (kind, body) => { asked.push([kind, body]); if (kind === "unsubscribed") return { emails: ["Ana.Test@example.com"] }; if (gift instanceof Error) throw gift; return gift; } },
      "../utils/helpers": { generateCouponCode: () => "FK-MADE-0001" }, "../lib/couponSize": await load("src/lib/couponSize.js"),
    });
    const screen = draw(Leads, { discount: 15 });
    await settle();
    assert.deepEqual(asked[0], ["unsubscribed", { emails: ["Ana.Test@example.com", BO] }]);
    assert.deepEqual(screen.find((n) => n.props.className === "lead-out").map((n) => screen.text(n)), ["Unsubscribed"], "on that row only");
    assert.match(screen.text(screen.find((n) => n.props["data-label"] === "Email")[0]), /Ana\.Test@example\.com ?Unsubscribed/);
    screen.press("+ Create Coupon");
    screen.find((n) => n.props.type === "email")[0].props.onChange({ target: { value: "New@example.com" } });
    if (!mail) screen.find((n) => n.props.type === "checkbox")[0].props.onChange({ target: { checked: false } });
    await quiet(() => screen.press("Generate & Save"));
    await settle();
    assert.equal(screen.find((n) => n.props.className === "crm-add-form").length, 0, "the form closes");
    const [msg] = screen.find((n) => /^(ok-msg|lead-said)$/.test(n.props.className));
    return [msg?.props.className, msg && screen.text(msg), asked.filter(([k]) => k === "coupon-gift").map(([, b]) => b)];
  };
  assert.deepEqual(await create({ sent: true }), ["ok-msg", "Coupon FK-MADE-0001 created and emailed to new@example.com.", [{ email: "new@example.com" }]]);
  assert.deepEqual(await create({ sent: false, why: "out" }), ["lead-said", "Coupon FK-MADE-0001 created, but not emailed: they asked not to get coupons.", [{ email: "new@example.com" }]]);
  assert.deepEqual(await create(new Error("Brevo is down")), ["lead-said", "Coupon FK-MADE-0001 created, but the email did not go (Brevo is down).", [{ email: "new@example.com" }]]);
  assert.deepEqual(await create({ sent: true }, { mail: false }), ["ok-msg", "Coupon FK-MADE-0001 created.", []]);
});
