import { test } from "node:test";
import assert from "node:assert/strict";
import { adminThread, adminReply, adminInboundSetup, opThread, opThreadReply, opInbound, inboundKey, tokenFromRecipients, INBOUND_ON } from "../api/_lib/threads.js";
import { STORE_OPS } from "../api/_lib/storeOps.js";

// Request conversations (2026-11-12). Same in-memory stand-in for supabase-js as
// security.test.js: it runs the real server code and records what it writes.
function fakeDb(tables = {}, { fail = {} } = {}) {
  const writes = [];
  function from(table) {
    let op = "select", payload = null, lim = null, single = null;
    const filters = [];
    const b = {
      select() { return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { filters.push([k, v]); return b; },
      order() { return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = "maybe"; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    const match = (r) => filters.every(([k, v]) => String(r[k]) === String(v));
    function run() {
      if (fail[table]) return { data: null, error: fail[table] };
      const rows = (tables[table] ||= []);
      if (op === "insert") { writes.push({ table, op, payload }); payload.forEach(r => rows.push({ id: rows.length + 100, created_at: new Date().toISOString(), ...r })); return { data: null, error: null }; }
      if (op === "update") { writes.push({ table, op, payload, filters: [...filters] }); rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      let out = rows.filter(match).map(r => ({ ...r }));
      if (lim != null) out = out.slice(0, lim);
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }
    return b;
  }
  return { from, writes, tables };
}

const mailbox = () => {
  const sent = [];
  return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); return { messageId: `<m${sent.length}@smtp-relay.mailin.fr>` }; } };
};
const request = (over = {}) => ({ id: "r1", name: "Ana Lopez", email: "ana@example.com", message: "Do you paint dogs?", status: "new", created_at: "2026-11-10T10:00:00Z", ...over });
const TOKEN = "a".repeat(40);

const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { await fn(); } finally { Object.entries(saved).forEach(([k, v]) => v === undefined ? delete process.env[k] : (process.env[k] = v)); }
};

test("admin reply: emails the customer their private link, keeps the message, New becomes In progress", async () => {
  const db = fakeDb({ Requests: [request()], RequestMessages: [] });
  const mail = mailbox();
  assert.deepEqual(await adminReply(db, { id: "r1", message: "Yes! <b>Send</b> me a photo." }, mail), { ok: true });
  const token = db.tables.Requests[0].thread_token;
  assert.match(token, /^[a-f0-9]{40}$/);
  const email = mail.sent[0];
  assert.equal(email.to, "ana@example.com");
  assert.ok(email.htmlContent.includes(`https://fonkiart.com/?thread=${token}`));
  assert.ok(email.htmlContent.includes("&lt;b&gt;Send&lt;/b&gt;") && !email.htmlContent.includes("<b>Send</b>"), "the answer is escaped");
  assert.equal(INBOUND_ON, false);
  assert.equal(email.replyTo, "shop@fonkiart.com", "until email replies are switched on, replies go to the shop");
  const [m] = db.tables.RequestMessages;
  assert.equal(m.request_id, "r1"); assert.equal(m.direction, "out"); assert.equal(m.via, "site");
  assert.equal(m.email_message_id, "<m1@smtp-relay.mailin.fr>");
  assert.equal(db.tables.Requests[0].status, "in_progress");

  await adminReply(db, { id: "r1", message: "Second answer" }, mail);
  assert.equal(db.tables.Requests[0].thread_token, token, "one link per request, reused");
  assert.equal((await adminThread(db, { id: "r1" })).messages.length, 2);
});

test("admin reply: nothing is sent if the log isn't set up, or the input is junk", async () => {
  const mail = mailbox();
  const noLog = fakeDb({ Requests: [request()] }, { fail: { RequestMessages: { message: "relation does not exist" } } });
  await assert.rejects(adminReply(noLog, { id: "r1", message: "hi" }, mail), e => e.status === 503);
  const db = fakeDb({ Requests: [request(), request({ id: "r2", email: "" })], RequestMessages: [] });
  await assert.rejects(adminReply(db, { id: "r1", message: "   " }, mail), e => e.status === 400);
  await assert.rejects(adminReply(db, { id: "r1", message: "x".repeat(5001) }, mail), e => e.status === 400);
  await assert.rejects(adminReply(db, { id: "r1;drop", message: "hi" }, mail), e => e.status === 400);
  await assert.rejects(adminReply(db, { id: "r9", message: "hi" }, mail), e => e.status === 404);
  await assert.rejects(adminReply(db, { id: "r2", message: "hi" }, mail), e => e.status === 400);
  assert.equal(mail.sent.length, 0);
  assert.equal(db.writes.length, 0);
});

test("customer page: the right link shows the conversation, any other link shows nothing", async () => {
  const db = fakeDb({
    Requests: [request({ thread_token: TOKEN, email: "ana@example.com" })],
    RequestMessages: [{ id: 1, request_id: "r1", direction: "out", via: "site", body: "Yes we do", created_at: "2026-11-11T10:00:00Z", email_message_id: "<x@y>" }],
  });
  const t = await opThread(db, { token: TOKEN.toUpperCase() });
  assert.deepEqual(t, {
    name: "Ana",
    original: { body: "Do you paint dogs?", at: "2026-11-10T10:00:00Z" },
    messages: [{ from: "shop", body: "Yes we do", at: "2026-11-11T10:00:00Z" }],
  });
  assert.ok(!JSON.stringify(t).includes("ana@example.com"), "the page never shows the email address");
  for (const token of ["b".repeat(40), "", "../etc", undefined, TOKEN + "a"]) {
    await assert.rejects(opThread(db, { token }), e => e.status === 404);
  }
});

test("customer page: an answer is kept, the request goes back to New, the shop is told", async () => {
  const db = fakeDb({ Requests: [request({ thread_token: TOKEN, status: "in_progress" })], RequestMessages: [] });
  const mail = mailbox();
  assert.deepEqual(await opThreadReply(db, { token: TOKEN, message: "Great, <script>x</script>" }, mail), { ok: true });
  const [m] = db.tables.RequestMessages;
  assert.equal(m.direction, "in"); assert.equal(m.via, "site"); assert.equal(m.body, "Great, <script>x</script>");
  assert.equal(db.tables.Requests[0].status, "new");
  assert.equal(mail.sent[0].to, "shop@fonkiart.com");
  assert.equal(mail.sent[0].replyTo, "ana@example.com");
  assert.ok(!mail.sent[0].htmlContent.includes("<script>"), "the shop's copy is escaped");
});

test("customer page: 20 answers a day, then it asks them to email instead", async () => {
  const now = new Date().toISOString();
  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, request_id: "r1", direction: "in", via: "site", body: "hi", created_at: now }));
  const db = fakeDb({ Requests: [request({ thread_token: TOKEN })], RequestMessages: twenty });
  await assert.rejects(opThreadReply(db, { token: TOKEN, message: "one more" }, mailbox()), e => e.status === 429);
  const old = twenty.map(m => ({ ...m, created_at: "2026-01-01T00:00:00Z" }));
  const db2 = fakeDb({ Requests: [request({ thread_token: TOKEN })], RequestMessages: old });
  assert.deepEqual(await opThreadReply(db2, { token: TOKEN, message: "fine tomorrow" }, mailbox()), { ok: true });
});

test("email replies: the wrong key is refused before anything is read", () => withEnv({ SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
  const db = fakeDb({ Requests: [request({ thread_token: TOKEN })] });
  for (const key of ["", "nope", inboundKey().slice(0, 39), undefined]) {
    await assert.rejects(opInbound(db, { query: { key }, body: { items: [{ To: [{ Address: `r-${TOKEN}@reply.fonkiart.com` }] }] } }, mailbox()), e => e.status === 404);
  }
  assert.equal(db.writes.length, 0);
  assert.match(inboundKey(), /^[a-f0-9]{40}$/);
}));

test("email replies: matched by the reply address or by In-Reply-To, saved once, strangers passed to the shop", () => withEnv({ SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
  const db = fakeDb({
    Requests: [request({ thread_token: TOKEN, status: "completed" }), request({ id: "r2", name: "Bo", email: "bo@example.com", thread_token: "c".repeat(40) })],
    RequestMessages: [{ id: 1, request_id: "r2", direction: "out", via: "site", body: "Hi Bo", email_message_id: "<m7@smtp-relay.mailin.fr>", created_at: "2026-11-11T00:00:00Z" }],
  });
  const mail = mailbox();
  const req = (items) => ({ query: { key: inboundKey() }, body: { items } });
  const byAddress = { MessageId: "<g1@gmail.com>", From: { Address: "ana@example.com" }, To: [{ Address: `R-${TOKEN.toUpperCase()}@Reply.Fonkiart.com` }], ExtractedMarkdownMessage: "Yes please", Attachments: [{}, {}] };
  const byHeader = { MessageId: "<g2@gmail.com>", From: { Address: "bo@example.com" }, To: [{ Address: "support@fonkiart.com" }], InReplyTo: "m7@smtp-relay.mailin.fr", RawTextBody: "Thanks!" };
  const stranger = { MessageId: "<g3@gmail.com>", From: { Address: "who@example.com" }, To: [{ Address: "hello@reply.fonkiart.com" }], Subject: "Hi", RawTextBody: "<img src=x onerror=alert(1)>" };

  assert.deepEqual(await opInbound(db, req([byAddress, byHeader, stranger]), mail), { ok: true, saved: 2 });
  const saved = db.tables.RequestMessages.filter(m => m.direction === "in");
  assert.deepEqual(saved.map(m => [m.request_id, m.via, m.email_message_id]), [["r1", "email", "<g1@gmail.com>"], ["r2", "email", "<g2@gmail.com>"]]);
  assert.ok(saved[0].body.startsWith("Yes please") && saved[0].body.includes("2 attachments"));
  assert.equal(db.tables.Requests[0].status, "new", "a customer's answer puts the request back on top");
  const forward = mail.sent.find(m => m.subject.includes("reply.fonkiart.com"));
  assert.ok(forward, "an email that matches nothing still reaches the shop");
  assert.equal(forward.replyTo, "who@example.com");
  assert.ok(!forward.htmlContent.includes("<img"), "and it is escaped");

  assert.deepEqual(await opInbound(db, req([byAddress]), mail), { ok: true, saved: 0 }, "Brevo sending the same email twice saves it once");
  assert.equal(tokenFromRecipients({ To: [{ Address: `r-${TOKEN}@reply.fonkiart.com.evil.com` }] }), null);
}));

test("email replies setup: creates Brevo's inbound webhook once, with the key in the address", () => withEnv({ BREVO_API_KEY: "brevo-test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
  const calls = [];
  let hooks = [];
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null, key: opts.headers?.["api-key"] });
    if ((opts.method || "GET") === "GET") return { ok: true, json: async () => ({ webhooks: hooks }) };
    hooks = [{ url: JSON.parse(opts.body).url }];
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  assert.deepEqual(await adminInboundSetup(fakeFetch), { ok: true, already: false });
  const made = calls.find(c => c.method === "POST");
  assert.equal(made.body.type, "inbound");
  assert.deepEqual(made.body.events, ["inboundEmailProcessed"]);
  assert.equal(made.body.domain, "reply.fonkiart.com");
  assert.equal(made.body.url, `https://fonkiart.com/api/store?op=inbound&key=${inboundKey()}`);
  assert.ok(calls.every(c => c.key === "brevo-test"));
  assert.deepEqual(await adminInboundSetup(fakeFetch), { ok: true, already: true });
  assert.equal(calls.filter(c => c.method === "POST").length, 1);

  const refused = async () => ({ ok: false, status: 403, json: async () => ({ message: "Not available on your plan" }) });
  assert.deepEqual(await adminInboundSetup(refused), { ok: false, message: "Not available on your plan" });
}));

test("the public door knows the three new actions and passes them through", async () => {
  for (const op of ["thread", "thread-reply", "inbound"]) assert.equal(typeof STORE_OPS[op], "function");
  const db = fakeDb({ Requests: [request({ thread_token: TOKEN })], RequestMessages: [] });
  assert.equal((await STORE_OPS.thread(db, { body: { token: TOKEN } })).name, "Ana");
  await assert.rejects(STORE_OPS.inbound(db, { query: {}, body: {} }, mailbox()), e => e.status === 404);
});
