// The shipping address (Andy, 2026-11-17: "also make sure in the admin and for the user can add
// the shipping address !"): seven columns on Orders, filled by the checkout, the client's invoice
// page and Admin -> Orders. Nothing is saved or emailed for real here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHIP_FIELDS, SHIP_COLUMNS, SHIP_AUTOFILL, hasShipAddress, shipLines, shipForm, shipFields, shipFromClient, clientHasAddress } from "../src/lib/shipAddress.js";
import { SHIP_LIMITS, SHIP_REQUIRED, SHIP_WORDS } from "../api/_lib/shipAddress.js";
import { validateChain, runQuery } from "../api/_lib/adminOps.js";
import { InputError } from "../api/_lib/errors.js";
import { recordQuery } from "../src/lib/adminQuery.js";
import { opShipAddress, opOrder, opInvoice, STORE_OPS, GET_OPS } from "../api/_lib/storeOps.js";

// A small stand-in for the supabase-js query builder (the same one as tests/tracking.test.js).
function fakeDb(tables = {}) {
  const writes = [];
  const from = (table) => {
    let op = "select", payload = null, cols = "*", lim = null, single = false;
    const filters = [];
    const b = {
      select(c = "*") { if (op === "select") cols = c; return b; },
      update(v) { op = "update"; payload = v; return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      upsert(v) { op = "upsert"; payload = v; return b; },
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
const mailbox = () => { const sent = []; return { sender: "shop@fonkiart.com", sent, send: async (m) => { sent.push(m); } }; };

// The admin's save, exactly as the browser sends it (recordQuery), through JSON like the real request.
async function adminSave(fields) {
  let seen = null;
  await recordQuery("Orders", async (p) => { seen = p; return {}; }).update(fields).eq("id", 1);
  return JSON.parse(JSON.stringify(seen.chain));
}

const TOKEN = "8f0c2a5e-1111-2222-3333-444455556666";
const ADDRESS = { ship_name: "Ana Pérez", ship_address: "12 Ocean Dr, Apt 4", ship_city: "Miami", ship_state: "FL", ship_zip: "33139", ship_country: "USA", ship_phone: "+1 305 555 0100" };
const invoiceDb = (over = {}) => fakeDb({ Orders: [{ id: 5, invoice_token: TOKEN, status: "paid", client_email: "ana@x.com", amount: 300, ...over }] });

// ── the browser's form ──────────────────────────────────────
test("the address form: tidied for saving, or told what's missing or too long", () => {
  const typed = { ...ADDRESS, ship_name: "  Ana Pérez ", ship_state: "  ", ship_zip: "", ship_phone: " " };
  assert.deepEqual(shipFields(typed), { fields: { ...ADDRESS, ship_name: "Ana Pérez", ship_state: null, ship_zip: null, ship_phone: null } });
  for (const [column, label] of [["ship_name", "Full name"], ["ship_address", "Street address"], ["ship_city", "City"], ["ship_country", "Country"]]) {
    assert.equal(shipFields({ ...ADDRESS, [column]: "   " }).problem, `Please fill in: ${label}.`, column);
  }
  assert.equal(shipFields({ ...ADDRESS, ship_zip: "1".repeat(31) }).problem, "ZIP / postal code is too long: 30 characters at most.");
  assert.equal(shipFields({ ...ADDRESS, ship_phone: "1".repeat(51) }).problem, "Phone is too long: 50 characters at most.");
  assert.ok(shipFields({ ...ADDRESS, ship_zip: ` ${"1".repeat(30)} ` }).fields, "the limit counts what is saved, after the spaces are trimmed");
  assert.equal(shipFields(undefined).problem, "Please fill in: Full name.");
  // Only the seven columns ever come out, whatever else is in the form (an admin form's err, say).
  assert.deepEqual(Object.keys(shipFields({ ...ADDRESS, err: "x", status: "shipped", id: 9 }).fields), SHIP_COLUMNS);
});

test("the address in lines, and when an order counts as having one", () => {
  assert.deepEqual(shipLines(ADDRESS), ["Ana Pérez", "12 Ocean Dr, Apt 4", "Miami, FL 33139", "USA", "+1 305 555 0100"]);
  assert.deepEqual(shipLines({ ship_name: "Bo", ship_address: "1 Rue X", ship_city: "Paris", ship_country: "France" }), ["Bo", "1 Rue X", "Paris", "France"]);
  assert.deepEqual(shipLines({ ship_address: "1 Main", ship_zip: "33101" }), ["1 Main", "33101"]);
  assert.deepEqual(shipLines({}), []);
  assert.equal(hasShipAddress(ADDRESS), true);
  // The checkout's address is optional: a buyer who skipped it has only a name, and is still asked.
  for (const o of [{ ship_name: "Jane Smith", ship_phone: "305" }, { ship_address: "   " }, {}, null, undefined, { ship_address: 7 }]) {
    assert.equal(hasShipAddress(o), false, JSON.stringify(o));
  }
});

test("the form opens with what is saved; with no name saved, the client's name", () => {
  assert.deepEqual(shipForm(ADDRESS), ADDRESS);
  assert.deepEqual(shipForm({ client_name: "Ana Pérez" }), { ship_name: "Ana Pérez", ship_address: "", ship_city: "", ship_state: "", ship_zip: "", ship_country: "", ship_phone: "" });
  assert.equal(shipForm({ ship_name: "Jane Smith", client_name: "J. Smith" }).ship_name, "Jane Smith", "a saved name is kept");
  assert.equal(shipForm({ ship_city: "Miami" }).ship_city, "Miami", "a part-saved address is kept");
  assert.deepEqual(Object.keys(shipForm(null)), SHIP_COLUMNS);
});

test("the client's saved address (Admin -> Clients), as an order's", () => {
  const client = { name: "Ana Pérez", email: "ana@x.com", phone: "", address: "12 Ocean Dr", city: "Miami", state: "FL", zip: "33139", country: "USA", password: "secret" };
  assert.deepEqual(shipFromClient(client), { ship_name: "Ana Pérez", ship_address: "12 Ocean Dr", ship_city: "Miami", ship_state: "FL", ship_zip: "33139", ship_country: "USA", ship_phone: null });
  assert.equal(clientHasAddress(client), true);
  for (const c of [{ ...client, address: " " }, { name: "Ana" }, undefined]) assert.equal(clientHasAddress(c), false, JSON.stringify(c));
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "update", a: [shipFromClient(client)] }, { m: "eq", a: ["id", 1] }]));
});

test("the browser and the server use the same address rules", () => {
  assert.deepEqual(SHIP_FIELDS.map(([column, , max]) => [column, max]), Object.entries(SHIP_LIMITS));
  assert.deepEqual(SHIP_FIELDS.filter(([, , , required]) => required).map(([column]) => column), [...SHIP_REQUIRED]);
  assert.deepEqual(Object.keys(SHIP_WORDS), SHIP_COLUMNS);
  assert.deepEqual(Object.keys(SHIP_AUTOFILL), SHIP_COLUMNS);
  // The checkout's own limits (opOrder): first and last name 100 each, with a space between.
  assert.equal(SHIP_LIMITS.ship_name, 201);
});

// ── the admin's save: the server's guard ────────────────────
test("server: an admin save of the address is text within the limits, or null; anything else is a 400 and nothing is saved", async () => {
  const atLimit = Object.fromEntries(Object.entries(SHIP_LIMITS).map(([column, max]) => [column, "a".repeat(max)]));
  for (const fields of [ADDRESS, atLimit, Object.fromEntries(SHIP_COLUMNS.map(c => [c, null])), { ship_phone: null }, { ship_city: "" }]) {
    const db = fakeDb({ Orders: [{ id: 1, status: "paid" }] });
    assert.equal((await runQuery(db, "Orders", await adminSave(fields))).error, null, JSON.stringify(fields).slice(0, 80));
    assert.equal(db.writes.length, 1);
  }
  const bad = [];
  for (const [column, max] of Object.entries(SHIP_LIMITS)) {
    for (const v of ["a".repeat(max + 1), 42, true, ["x"], { x: 1 }]) bad.push({ ...ADDRESS, [column]: v });
  }
  for (const fields of bad) {
    const db = fakeDb({ Orders: [{ id: 1, status: "paid" }] });
    await assert.rejects(runQuery(db, "Orders", await adminSave(fields)),
      e => e instanceof InputError && e.status === 400 && e.message === "Bad shipping address", JSON.stringify(fields).slice(0, 80));
    assert.equal(db.writes.length, 0);
    assert.deepEqual(db.tables.Orders, [{ id: 1, status: "paid" }]);
  }
  // A new order (insert, upsert) is held to the same rules; reading is never affected.
  assert.throws(() => validateChain("Orders", [{ m: "insert", a: [[{ item_title: "A" }, { item_title: "B", ship_zip: "1".repeat(31) }]] }]), InputError);
  assert.throws(() => validateChain("Orders", [{ m: "upsert", a: [{ id: 1, ship_name: 5 }] }]), InputError);
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "select", a: ["*"] }, { m: "eq", a: ["ship_zip", "1".repeat(99)] }]));
  // The rule is for Orders only: a client's own address (Admin -> Clients) is not held to it.
  assert.doesNotThrow(() => validateChain("Clients", [{ m: "update", a: [{ address: "a".repeat(400) }] }]));
});

// ── the client's save, from the invoice page ────────────────
test("the invoice page saves the address: only the seven columns, trimmed, empty ones as null", async () => {
  const db = invoiceDb();
  const out = await opShipAddress(db, { token: TOKEN, address: { ...ADDRESS, ship_name: "  Ana Pérez  ", ship_phone: "", ship_state: "   ", status: "delivered", amount: 1, invoice_token: "x", id: 99 } });
  const saved = { ...ADDRESS, ship_phone: null, ship_state: null };
  assert.deepEqual(out, { ok: true, address: saved });
  assert.deepEqual(db.writes, [{ table: "Orders", op: "update", payload: saved }]);
  assert.deepEqual(db.tables.Orders[0], { id: 5, invoice_token: TOKEN, status: "paid", client_email: "ana@x.com", amount: 300, ...saved }, "status, amount and the link are untouched");
  // Through the shop's router, as the browser calls it; POST only.
  assert.equal(typeof STORE_OPS["ship-address"], "function");
  assert.equal(GET_OPS.has("ship-address"), false);
  const viaRouter = invoiceDb({ status: "pending" });
  assert.equal((await STORE_OPS["ship-address"](viaRouter, { body: { token: TOKEN, address: ADDRESS } })).ok, true);
  assert.equal(viaRouter.tables.Orders[0].ship_city, "Miami");
  // Before paying, and after: Pending, Confirmed and Paid can all change it.
  for (const status of ["pending", "confirmed", "paid"]) {
    assert.equal((await opShipAddress(invoiceDb({ status }), { token: TOKEN, address: ADDRESS })).ok, true, status);
  }
});

test("the invoice page's save refuses a missing or too-long field, a bad link, and an order that has gone out; nothing is saved", async () => {
  const refusals = [
    [{ token: TOKEN, address: { ...ADDRESS, ship_city: "  " } }, 400, "Missing city"],
    [{ token: TOKEN, address: { ...ADDRESS, ship_name: undefined } }, 400, "Missing name"],
    [{ token: TOKEN, address: { ...ADDRESS, ship_address: "a".repeat(301) } }, 400, "street is too long"],
    [{ token: TOKEN, address: { ...ADDRESS, ship_zip: 33139 } }, 400, "Bad ZIP"],
    [{ token: TOKEN, address: { ...ADDRESS, ship_country: ["USA"] } }, 400, "Bad country"],
    [{ token: TOKEN, address: "12 Ocean Dr" }, 400, "Missing name"],
    [{ token: TOKEN }, 400, "Missing name"],
    [{ token: "nope", address: ADDRESS }, 404, "Bad invoice link"],
    [{ token: "aaaaaaaa-0000-0000-0000-000000000000", address: ADDRESS }, 404, "Invoice not found"],
    [{ address: ADDRESS }, 400, "Missing invoice"],
  ];
  for (const [body, status, message] of refusals) {
    const db = invoiceDb();
    await assert.rejects(opShipAddress(db, body), e => e instanceof InputError && e.status === status && e.message === message, JSON.stringify(body).slice(0, 90));
    assert.equal(db.writes.length, 0);
  }
  for (const status of ["shipped", "delivered"]) {
    const db = invoiceDb({ status, ship_city: "Old City" });
    await assert.rejects(opShipAddress(db, { token: TOKEN, address: ADDRESS }), e => e instanceof InputError && e.status === 409 && /already gone out/.test(e.message), status);
    assert.equal(db.writes.length, 0, status);
    assert.equal(db.tables.Orders[0].ship_city, "Old City", status);
  }
  // The browser checks first with the same limits, so what it lets through, the server saves.
  for (const v of ["a".repeat(300), ` ${"a".repeat(300)} `, "a".repeat(301)]) {
    const form = shipFields({ ...ADDRESS, ship_address: v });
    const server = await opShipAddress(invoiceDb(), { token: TOKEN, address: { ...ADDRESS, ship_address: v } }).then(() => true, () => false);
    assert.equal(!form.problem, server, `${v.length} characters`);
  }
});

// ── the checkout ────────────────────────────────────────────
const order = (over = {}) => ({
  customer: { firstName: "Jane", lastName: "Smith", email: "jane@x.co", phone: "", address: "1 Main", city: "Miami", state: "FL", zip: "33101", country: "USA" },
  items: [{ title: "Ocean", amount: 510 }, { title: "Palms", amount: 200 }], total: 710, orderRef: "FA-1720", ...over,
});

test("the checkout puts the address on every order it saves; the notes stay exactly as before", async () => {
  const db = fakeDb({ Settings: [{ id: 1, couponDiscount: 15 }], Orders: [], Clients: [] });
  assert.deepEqual(await opOrder(db, order(), mailbox()), { ok: true, saved: true });
  assert.equal(db.tables.Orders.length, 2);
  for (const row of db.tables.Orders) {
    assert.deepEqual(Object.fromEntries(SHIP_COLUMNS.map(c => [c, row[c]])),
      { ship_name: "Jane Smith", ship_address: "1 Main", ship_city: "Miami", ship_state: "FL", ship_zip: "33101", ship_country: "USA", ship_phone: null });
    assert.equal(row.notes, "Order Ref: FA-1720 · Jane Smith · 1 Main, Miami, FL, 33101, USA");
    assert.equal(hasShipAddress(row), true);
  }
  // No address typed (it's optional at the checkout): only the name, and the invoice page will ask.
  const bare = fakeDb({ Orders: [], Clients: [] });
  await opOrder(bare, order({ customer: { firstName: "Jane", lastName: "Smith", email: "jane@x.co", phone: "305 555 0100" } }), mailbox());
  const row = bare.tables.Orders[0];
  assert.deepEqual(Object.fromEntries(SHIP_COLUMNS.map(c => [c, row[c]])),
    { ship_name: "Jane Smith", ship_address: null, ship_city: null, ship_state: null, ship_zip: null, ship_country: null, ship_phone: "305 555 0100" });
  assert.equal(row.notes, "Order Ref: FA-1720 · Jane Smith · 305 555 0100");
  assert.equal(hasShipAddress(row), false);
  // What the checkout saves is what the admin's guard accepts.
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "insert", a: [db.tables.Orders.map(r => ({ ...r }))] }]));
});

test("the invoice page gets the order's address from the server", async () => {
  const db = fakeDb({ Orders: [{ id: 5, invoice_token: TOKEN, status: "paid", ...ADDRESS }], Settings: [{ id: 1 }] });
  const { order: back } = await opInvoice(db, { token: TOKEN });
  assert.deepEqual(Object.fromEntries(SHIP_COLUMNS.map(c => [c, back[c]])), ADDRESS);
  // Control: this stand-in really drops columns a select doesn't ask for, so the check above means something.
  const narrowed = await db.from("Orders").select("id,status").eq("invoice_token", TOKEN);
  assert.equal(narrowed.data[0].ship_city, undefined);
});

// Andy's text rule (2026-11-17): nothing in the checkout under 16px.
test("the checkout's own text sizes are all 16px or more", () => {
  const sizes = (src) => [...src.matchAll(/fontSize\s*:\s*["']?(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  const found = sizes(readFileSync(new URL("../src/components/CheckoutModal.jsx", import.meta.url), "utf8"));
  // Since 2026-11-21 most of the checkout's sizes are in src/index.css (the gallery wall), and
  // tests/checkout-layout.test.js holds those to 16px too; these are the ones still written inline.
  assert.ok(found.length >= 12, `found ${found.length} sizes`);
  assert.deepEqual(found.filter(s => s < 16), []);
  assert.deepEqual(sizes(`<p style={{ fontSize:11 }}>x</p><p style={{fontSize: "13"}}>`), [11, 13], "control: the check sees small sizes when there are some");
});
