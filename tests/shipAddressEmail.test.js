// The shop's email when a client adds or changes the shipping address on their invoice page
// (Andy, 2026-11-18: "7ab Yes"): one short email to the shop, never to the client, only when the
// address really changed, and the address is saved even when the email fails. A fake database
// and a fake mailer: nothing is saved or emailed for real. Every name and address is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { opShipAddress, STORE_OPS } from "../api/_lib/storeOps.js";
import { InputError } from "../api/_lib/errors.js";
import { invoiceNumber } from "../api/_lib/invoiceNumber.js";

// A small stand-in for the supabase-js query builder (the same one as tests/shipAddress.test.js).
function fakeDb(tables = {}) {
  const writes = [];
  const from = (table) => {
    let op = "select", payload = null, cols = "*", lim = null, single = false;
    const filters = [];
    const b = {
      select(c = "*") { if (op === "select") cols = c; return b; },
      update(v) { op = "update"; payload = v; return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      eq(k, v) { filters.push([k, v]); return b; },
      order() { return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    const match = (r) => filters.every(([k, v]) => String(r[k]) === String(v));
    const pick = (r) => cols === "*" ? { ...r } : Object.fromEntries(String(cols).split(",").map(c => c.trim()).filter(c => c in r).map(c => [c, r[c]]));
    function run() {
      const rows = (tables[table] ||= []);
      if (op === "update") { writes.push({ table, op, payload }); rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op !== "select") { writes.push({ table, op, payload }); [].concat(payload).forEach(r => rows.push({ ...r })); return { data: null, error: null }; }
      let out = rows.filter(match).map(pick);
      if (lim != null) out = out.slice(0, lim);
      return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    return b;
  };
  return { from, writes, tables };
}

const TOKEN = "8f0c2a5e-1111-2222-3333-444455556666";
const CREATED = "2026-11-17T21:19:56.080514+00:00";
const INV = invoiceNumber({ created_at: CREATED });
const ADDRESS = { ship_name: "Ana Test", ship_address: "12 Ocean Dr, Apt 4", ship_city: "Miami", ship_state: "FL", ship_zip: "33139", ship_country: "USA", ship_phone: "+1 305 555 0100" };
const OLD = { ship_name: "Ana Test", ship_address: "9 Old Rd", ship_city: "Naples", ship_state: "FL", ship_zip: "34102", ship_country: "USA", ship_phone: null };
const invoiceDb = (over = {}) => fakeDb({ Orders: [{ id: 5, invoice_token: TOKEN, status: "paid", client_name: "Ana Test",
  client_email: "ana@example.com", item_title: "Ocean Study", amount: 300, created_at: CREATED, ...over }] });
const mailbox = (send) => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: send || (async (m) => { sent.push(m); }) }; };

test("a client adds the address: one short email to the shop, \"added\", with the invoice number, the client, the piece and the address", async () => {
  assert.equal(INV, "FA-261117161956080");
  const db = invoiceDb({ status: "pending" });
  const mail = mailbox();
  const out = await opShipAddress(db, { token: TOKEN, address: ADDRESS }, mail);
  assert.equal(out.ok, true);
  assert.equal(db.tables.Orders[0].ship_address, "12 Ocean Dr, Apt 4");
  assert.equal(mail.sent.length, 1);
  const [m] = mail.sent;
  assert.equal(m.to, "shop@fonkiart.com", "to the shop");
  assert.deepEqual(Object.keys(m).sort(), ["htmlContent", "subject", "to"], "to no one else: no cc, no bcc, no reply-to");
  assert.equal(m.subject, `Shipping address added — Ocean Study · ${INV}`);
  const html = m.htmlContent;
  assert.match(html, /Shipping address added/);
  assert.match(html, /<strong>Ana Test \(<a href="mailto:ana@example\.com"/);
  assert.match(html, /added the shipping address for <strong>Ocean Study<\/strong> on the invoice page/);
  assert.match(html, new RegExp(`<strong>Invoice:</strong> ${INV}`));
  assert.match(html, /Ana Test<br\/>12 Ocean Dr, Apt 4<br\/>Miami, FL 33139<br\/>USA<br\/>\+1 305 555 0100/, "the address in full, a line each");
  assert.match(html, /See it in <strong>Admin → Orders<\/strong>/);
  assert.doesNotMatch(html, /Before|changed/);

  // The shop's checkout saves a name and phone even when the buyer skips the address: adding the
  // street to that is still "added".
  const partial = mailbox();
  await opShipAddress(invoiceDb({ ship_name: "Ana Test", ship_phone: "+1 305 555 0100" }), { token: TOKEN, address: ADDRESS }, partial);
  assert.equal(partial.sent.length, 1);
  assert.equal(partial.sent[0].subject, `Shipping address added — Ocean Study · ${INV}`);
});

test("a client changes the address: one email, \"changed\", the new address and then the old one", async () => {
  const db = invoiceDb(OLD);
  const mail = mailbox();
  assert.equal((await opShipAddress(db, { token: TOKEN, address: ADDRESS }, mail)).ok, true);
  assert.equal(db.tables.Orders[0].ship_city, "Miami");
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].subject, `Shipping address changed — Ocean Study · ${INV}`);
  const html = mail.sent[0].htmlContent;
  assert.match(html, /Shipping address changed/);
  assert.match(html, /changed the shipping address for <strong>Ocean Study<\/strong>/);
  const at = (s) => html.indexOf(s);
  assert.ok(at("New address") > -1 && at("New address") < at("12 Ocean Dr, Apt 4"), "the new address first");
  assert.ok(at("12 Ocean Dr, Apt 4") < at("Before") && at("Before") < at("9 Old Rd"), "then, under Before, the old one");
  assert.match(html, /Ana Test<br\/>9 Old Rd<br\/>Naples, FL 34102<br\/>USA/);
  // Only the phone changes: still a change.
  const phone = mailbox();
  await opShipAddress(invoiceDb(ADDRESS), { token: TOKEN, address: { ...ADDRESS, ship_phone: "+1 305 555 0199" } }, phone);
  assert.equal(phone.sent.length, 1);
  assert.match(phone.sent[0].subject, /^Shipping address changed/);
});

test("the same address saved again sends nothing (spaces, empty boxes and a zip kept as a number don't count as a change)", async () => {
  const db = invoiceDb({ ...ADDRESS, ship_city: " Miami ", ship_zip: 33139, ship_phone: "" });
  const mail = mailbox();
  const out = await opShipAddress(db, { token: TOKEN, address: { ...ADDRESS, ship_name: "  Ana Test ", ship_phone: "  " } }, mail);
  assert.equal(out.ok, true, "the client still sees it saved");
  assert.equal(mail.sent.length, 0);
  // Twice in a row: the first save is a change (one email), the second is the same (no more).
  const twice = invoiceDb({ status: "confirmed" });
  const box = mailbox();
  await opShipAddress(twice, { token: TOKEN, address: ADDRESS }, box);
  await opShipAddress(twice, { token: TOKEN, address: ADDRESS }, box);
  assert.equal(box.sent.length, 1);
});

test("an order that has gone out (409) or a bad link sends nothing and saves nothing", async () => {
  for (const status of ["shipped", "delivered"]) {
    const db = invoiceDb({ status, ...OLD });
    const mail = mailbox();
    await assert.rejects(opShipAddress(db, { token: TOKEN, address: ADDRESS }, mail), e => e instanceof InputError && e.status === 409, status);
    assert.equal(mail.sent.length, 0, status);
    assert.equal(db.writes.length, 0, status);
  }
  const refusals = [
    [{ token: "nope", address: ADDRESS }, 404],
    [{ token: "aaaaaaaa-0000-0000-0000-000000000000", address: ADDRESS }, 404],
    [{ address: ADDRESS }, 400],
    [{ token: TOKEN, address: { ...ADDRESS, ship_city: " " } }, 400],
  ];
  for (const [body, status] of refusals) {
    const db = invoiceDb();
    const mail = mailbox();
    await assert.rejects(opShipAddress(db, body, mail), e => e instanceof InputError && e.status === status, JSON.stringify(body).slice(0, 60));
    assert.equal(mail.sent.length, 0);
    assert.equal(db.writes.length, 0);
  }
});

test("when the email fails, the address is still saved and the client still sees it saved", async () => {
  const db = invoiceDb({ status: "pending" });
  const mail = mailbox(async () => { throw new Error("Brevo is down"); });
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(args.join(" "));
  let out;
  try { out = await opShipAddress(db, { token: TOKEN, address: ADDRESS }, mail); } finally { console.warn = warn; }
  assert.deepEqual(out, { ok: true, address: ADDRESS });
  assert.equal(db.tables.Orders[0].ship_address, "12 Ocean Dr, Apt 4");
  assert.deepEqual(warned, ["store ship-address email: Brevo is down"]);
});

test("through the shop's router, as the invoice page calls it, the mailer is passed on", async () => {
  const mail = mailbox();
  assert.equal((await STORE_OPS["ship-address"](invoiceDb({ status: "confirmed" }), { body: { token: TOKEN, address: ADDRESS } }, mail)).ok, true);
  assert.equal(mail.sent.length, 1);
});

test("whatever the client typed is shown as text in the email, never as HTML", async () => {
  const db = invoiceDb({ client_name: "Ana <b>Test</b>", item_title: "Ocean <i>Study</i>" });
  const mail = mailbox();
  await opShipAddress(db, { token: TOKEN, address: { ...ADDRESS, ship_address: "12 <script>x()</script> Dr" } }, mail);
  const html = mail.sent[0].htmlContent;
  assert.doesNotMatch(html, /<script>|<b>Test<\/b>|<i>Study<\/i>/);
  assert.match(html, /12 &lt;script&gt;x\(\)&lt;\/script&gt; Dr/);
});

test("the shop's own edits in Admin -> Orders send no email: the admin's save path is never handed the mailer", () => {
  const src = readFileSync(new URL("../api/admin.js", import.meta.url), "utf8");
  const line = src.split("\n").find(l => l.includes('body.kind === "query"'));
  assert.ok(line, "found the admin's save path in api/admin.js");
  assert.doesNotMatch(line, /\bsend\b|\bmail\b/);
  // Control: the same check catches a save path that is handed the mailer.
  assert.match('if (body.kind === "query") return res.status(200).json(await queryMarkingSold(db, body.table, body.chain, { send }));', /\bsend\b|\bmail\b/);
});
