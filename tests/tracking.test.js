// Shipping and tracking (Andy, 2026-11-17: "if shipping was used ... check mark and activate a
// box to enter the tracking number and should ask to send an email to the customer ... with a
// live link to track the order"). Nothing is saved or emailed for real here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARRIERS, NO_TRACKING, PICKUP, PICKUP_FIELDS, PICKUP_LABEL, isPickup, hasTrackingSaved, carrierLabel, trackingLink, httpsLink, trackingFields, trackingSave, orderTrackingLink, trackingLabel } from "../src/lib/tracking.js";
import { validateChain, runQuery, adminEmail, TRACKING_CARRIERS, isHttpsLink } from "../api/_lib/adminOps.js";
import { InputError } from "../api/_lib/errors.js";
import { statusEmailFor } from "../src/lib/adminEmails.js";
import { recordQuery } from "../src/lib/adminQuery.js";
import { opInvoice } from "../api/_lib/storeOps.js";

// A small stand-in for the supabase-js query builder. It honours the columns a select asks for,
// so a test can tell "*" from a narrowed list.
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

// The admin's save, exactly as the browser sends it (recordQuery), through JSON like the real request.
async function adminSave(fields) {
  let seen = null;
  await recordQuery("Orders", async (p) => { seen = p; return {}; }).update(fields).eq("id", 1);
  return JSON.parse(JSON.stringify(seen.chain));
}

// ── the one link ────────────────────────────────────────────
test("trackingLink: each carrier's own tracking page, with the number filled in", () => {
  assert.equal(trackingLink({ carrier: "usps", number: "9400111899223197428490" }), "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490");
  assert.equal(trackingLink({ carrier: "ups", number: "1Z999AA10123456784" }), "https://www.ups.com/track?tracknum=1Z999AA10123456784");
  assert.equal(trackingLink({ carrier: "fedex", number: "123456789012" }), "https://www.fedex.com/fedextrack/?trknbr=123456789012");
  assert.equal(trackingLink({ carrier: "dhl", number: "1234567890" }), "https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890");
  assert.deepEqual(CARRIERS.map(([, label]) => label), ["USPS", "UPS", "FedEx", "DHL", "Other"]);
});

test("trackingLink: the number is URL-encoded, so it can never add to or break out of the link", () => {
  assert.equal(trackingLink({ carrier: "ups", number: "1Z&x=1#y?z/ä%" }), "https://www.ups.com/track?tracknum=1Z%26x%3D1%23y%3Fz%2F%C3%A4%25");
  const odd = trackingLink({ carrier: "dhl", number: `"><script>alert(1)</script>` });
  assert.ok(odd.startsWith("https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id="), odd);
  assert.doesNotMatch(odd, /[<>" ]/);
  // The spaces people type to read a number are left out of the link (the order keeps them).
  assert.equal(trackingLink({ carrier: "usps", number: " 9400 1118 9922\t3197 " }), "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197");
  // No number, or not one of the five carriers: no link at all.
  for (const t of [{ carrier: "usps" }, { carrier: "usps", number: "" }, { carrier: "usps", number: "   " }, { carrier: "usps", number: 94001118 },
    { carrier: "USPS", number: "1234" }, { carrier: "royalmail", number: "1234" }, { carrier: "__proto__", number: "1234" }, { carrier: "toString", number: "1234" },
    { carrier: null, number: "1234" }, {}, undefined]) {
    assert.equal(trackingLink(t), null, JSON.stringify(t));
  }
});

test("trackingLink, Other: only an https:// link; javascript: and everything else gives no link", () => {
  assert.equal(trackingLink({ carrier: "other", url: "https://track.example.com/p?id=12&lang=en" }), "https://track.example.com/p?id=12&lang=en");
  assert.equal(trackingLink({ carrier: "other", url: "  https://track.example.com/x  " }), "https://track.example.com/x");
  assert.equal(trackingLink({ carrier: "other", url: "HTTPS://Track.Example.com/x" }), "https://track.example.com/x");
  for (const url of ["javascript:alert(1)", "JavaScript:alert(document.cookie)", " javascript:alert(1)", "java\nscript:alert(1)", "javascript://https://x.com/%0aalert(1)",
    "\u0001https://x.com", "http://track.example.com/x", "data:text/html,<script>alert(1)</script>", "//track.example.com/x", "track.example.com/x", "ftp://x.com",
    "https://", "https:// x.com", "https://x.com/a b", 'https://x.com/"onmouseover="alert(1)', "https://x.com/<script>", "https://x.com/\u0000", "https://x.com/`",
    "https://x.com\\@evil.com", `https://${"a".repeat(2000)}.com`, "", null, 42, ["https://x.com"]]) {
    assert.equal(trackingLink({ carrier: "other", url }), null, JSON.stringify(url));
  }
  // Other only ever uses its link, the four carriers only their number.
  assert.equal(trackingLink({ carrier: "other", number: "1234", url: null }), null);
  assert.equal(trackingLink({ carrier: "usps", number: "", url: "https://track.example.com/x" }), null);
});

test("the saved tracking in words, for the admin's Orders list", () => {
  assert.equal(trackingLabel({ tracking_carrier: "fedex", tracking_number: "1234 5678 9012" }), "FedEx · 1234 5678 9012");
  assert.equal(trackingLabel({ tracking_carrier: "other", tracking_url: "https://track.example.com/x?id=1" }), "Tracking link · track.example.com");
  assert.equal(trackingLabel({ tracking_carrier: "other", tracking_url: "javascript:alert(1)" }), "Tracking link");
  assert.equal(orderTrackingLink({ tracking_carrier: "dhl", tracking_number: "1234567890" }), "https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890");
  assert.equal(orderTrackingLink({}), null);
});

// Andy, 2026-11-17: "when marking an order as shipped it should ask for tracking number or if it
// was a pickup delivery". A pickup is saved with no number and no link, and never makes one.
test("pickup / hand delivery: saved as \"pickup\" with no number and no link; it never gives a tracking link", () => {
  assert.deepEqual(PICKUP_FIELDS, { tracking_carrier: "pickup", tracking_number: null, tracking_url: null });
  assert.equal(PICKUP, "pickup");
  assert.equal(PICKUP_LABEL, "Pickup / hand delivery");
  for (const t of [{ carrier: "pickup" }, { carrier: "pickup", number: "1234" }, { carrier: "pickup", url: "https://track.example.com/x" }]) {
    assert.equal(trackingLink(t), null, JSON.stringify(t));
  }
  const order = { status: "shipped", ...PICKUP_FIELDS };
  assert.equal(orderTrackingLink(order), null);
  assert.equal(orderTrackingLink({ ...order, tracking_url: "https://track.example.com/x" }), null, "a stray link is never used for a pickup");
  assert.equal(trackingLabel(order), "Pickup / hand delivery");
  assert.equal(carrierLabel("pickup"), "Pickup / hand delivery");
  assert.equal(hasTrackingSaved(order), true, "a saved pickup counts as saved (Edit / Clear)");
  assert.equal(isPickup(order), true);
  for (const o of [{}, null, undefined, { tracking_carrier: "usps" }, { tracking_carrier: "Pickup" }]) assert.equal(isPickup(o), false, JSON.stringify(o));
  // Not a carrier: not in the carrier menu, and the tracking form never saves one.
  assert.equal(CARRIERS.some(([v]) => v === "pickup"), false);
  assert.match(trackingFields({ carrier: "pickup" }).problem, /Choose the carrier/);
});

// ── the admin's form ────────────────────────────────────────
test("the tracking form: what is typed is tidied for saving, or told what's wrong", () => {
  assert.deepEqual(trackingFields({ carrier: "usps", number: "  9400 1118 9922  ", url: "https://x.example.com" }),
    { fields: { tracking_carrier: "usps", tracking_number: "9400 1118 9922", tracking_url: null } });
  assert.deepEqual(trackingFields({ carrier: "other", number: "1234", url: " https://track.example.com/x " }),
    { fields: { tracking_carrier: "other", tracking_number: null, tracking_url: "https://track.example.com/x" } });
  assert.match(trackingFields({ carrier: "", number: "1234" }).problem, /Choose the carrier/);
  assert.match(trackingFields({ carrier: "usps", number: "  " }).problem, /Type the tracking number/);
  assert.match(trackingFields({ carrier: "ups", number: "12<34" }).problem, /letters, numbers, spaces and dashes/);
  assert.match(trackingFields({ carrier: "other", url: "" }).problem, /Paste the carrier's tracking link/);
  assert.match(trackingFields({ carrier: "other", url: "javascript:alert(1)" }).problem, /https:\/\//);
  assert.match(trackingFields(undefined).problem, /Choose the carrier/);
});

// Send: one email, and a Paid order becomes Shipped in the SAME save (the Status menu would send
// its own email as well). Not now: only the tracking.
test("Send makes a Paid order Shipped and emails once; Shipped and Delivered keep their status; Not now saves only the tracking", () => {
  const fields = { tracking_carrier: "usps", tracking_number: "9400 1118", tracking_url: null };
  assert.deepEqual(trackingSave({ status: "paid" }, fields, { email: true }), { change: { ...fields, status: "shipped" }, emailStatus: "shipped" });
  assert.deepEqual(trackingSave({ status: "shipped" }, fields, { email: true }), { change: fields, emailStatus: "shipped" });
  assert.deepEqual(trackingSave({ status: "delivered" }, fields, { email: true }), { change: fields, emailStatus: "delivered" });
  for (const status of ["paid", "shipped", "delivered"]) {
    assert.deepEqual(trackingSave({ status }, fields, { email: false }), { change: fields, emailStatus: null }, status);
  }
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "update", a: [trackingSave({ status: "paid" }, fields, { email: true }).change] }, { m: "eq", a: ["id", 1] }]));
});

// Picking Shipped in the Status menu: the order becomes Shipped whichever way the email question
// is answered, from any status, in the same save as the tracking or the pickup. One email at most.
test("from the Status menu (ship): Send and Not now both save it as Shipped; only Send emails, and only the shipped email", () => {
  const carrier = { tracking_carrier: "ups", tracking_number: "1Z999AA10123456784", tracking_url: null };
  for (const fields of [carrier, PICKUP_FIELDS]) {
    for (const status of ["pending", "confirmed", "paid", "delivered", null]) {
      const why = `${fields.tracking_carrier}, from ${status}`;
      assert.deepEqual(trackingSave({ status }, fields, { email: true, ship: true }), { change: { ...fields, status: "shipped" }, emailStatus: "shipped" }, why);
      assert.deepEqual(trackingSave({ status }, fields, { email: false, ship: true }), { change: { ...fields, status: "shipped" }, emailStatus: null }, why);
      assert.doesNotThrow(() => validateChain("Orders", [{ m: "update", a: [trackingSave({ status }, fields, { email: true, ship: true }).change] }, { m: "eq", a: ["id", 1] }]), why);
    }
  }
});

// ── the server's guard ──────────────────────────────────────
test("server: tracking is saved only as a known carrier, a sane number and an https:// link; null clears it; anything else is a 400 and nothing is saved", async () => {
  const good = [
    { tracking_carrier: "usps", tracking_number: "9400 1118 9922 3197 4284 90", tracking_url: null },
    { tracking_carrier: "ups", tracking_number: "1Z999AA10123456784" },
    { tracking_carrier: "fedex", tracking_number: "1234-5678-9012" },
    { tracking_carrier: "dhl", tracking_number: "JJD0099999999" },
    { tracking_carrier: "other", tracking_number: null, tracking_url: "https://track.example.com/p?id=12&lang=en" },
    NO_TRACKING,
    { tracking_carrier: "usps", tracking_number: "LZ123456789US", status: "shipped" },
    { ...PICKUP_FIELDS, status: "shipped" },
  ];
  for (const fields of good) {
    const db = fakeDb({ Orders: [{ id: 1, status: "paid" }] });
    assert.equal((await runQuery(db, "Orders", await adminSave(fields))).error, null, JSON.stringify(fields));
    assert.equal(db.writes.length, 1, JSON.stringify(fields));
  }
  const bad = [
    ...["USPS", "royalmail", "", 1, ["usps"], { usps: true }, "Pickup", "PICKUP", "pickup ", "hand"].map(v => [{ tracking_carrier: v }, "Bad carrier"]),
    ...["", "   ", " 9400 1118", "9400 1118 ", "abc", "a".repeat(61), "12<34", "12;34", "12_34", "12\n34", "1234\t", "ÄBCD", 94001118, { n: 1 }]
      .map(v => [{ tracking_number: v }, "Bad tracking number"]),
    ...["javascript:alert(1)", "JAVASCRIPT:alert(1)", " https://x.com", "http://x.com", "https://", "https://x.com/a b", 'https://x.com/"x', "data:text/html,x", "", 7]
      .map(v => [{ tracking_url: v }, "Bad tracking link"]),
  ];
  for (const [fields, refusal] of bad) {
    const db = fakeDb({ Orders: [{ id: 1, status: "paid" }] });
    await assert.rejects(runQuery(db, "Orders", await adminSave(fields)),
      e => e instanceof InputError && e.status === 400 && e.message === refusal, JSON.stringify(fields));
    assert.equal(db.writes.length, 0, `nothing saved for ${JSON.stringify(fields)}`);
    assert.deepEqual(db.tables.Orders, [{ id: 1, status: "paid" }]);
  }
  // A new order (insert, upsert) is held to the same rules; reading is never affected.
  assert.throws(() => validateChain("Orders", [{ m: "insert", a: [[{ item_title: "A" }, { item_title: "B", tracking_url: "javascript:alert(1)" }]] }]), InputError);
  assert.throws(() => validateChain("Orders", [{ m: "upsert", a: [{ id: 1, tracking_carrier: "pigeon" }] }]), InputError);
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "insert", a: [[{ item_title: "A", tracking_carrier: null }]] }]));
  assert.doesNotThrow(() => validateChain("Orders", [{ m: "select", a: ["*"] }, { m: "eq", a: ["tracking_carrier", "javascript:"] }]));
});

test("the browser and the server use the same tracking rules", () => {
  assert.deepEqual([...CARRIERS.map(([v]) => v), PICKUP].sort(), [...TRACKING_CARRIERS].sort());
  const serverTakes = (fields) => { try { validateChain("Orders", [{ m: "update", a: [fields] }]); return true; } catch { return false; } };
  // The form trims, then saves: whatever it accepts, the server takes; whatever it refuses, the server refuses.
  for (const n of ["9400 1118 9922", "1Z999AA10123456784", "abc", "abcd", " 1234 ", "12-34", "12--34", "-1234", "1234-", "12<34", "12_34", "a".repeat(60), "a".repeat(61), "ÄBCD", "12\n34"]) {
    const form = trackingFields({ carrier: "ups", number: n });
    assert.equal(!form.problem, serverTakes({ tracking_carrier: "ups", tracking_number: n.trim() }), JSON.stringify(n));
    if (form.fields) assert.equal(serverTakes(form.fields), true, JSON.stringify(n));
  }
  for (const u of ["https://track.example.com/x", "HTTPS://x.example.com", "https://x.com/a b", "https://", "http://x.com", "javascript:alert(1)", 'https://x.com/"', "https://x.com/\u0007", `https://${"a".repeat(1990)}.com`, `https://${"a".repeat(2000)}.com`]) {
    assert.equal(!!httpsLink(u), isHttpsLink(u), JSON.stringify(u.slice(0, 40)));
    assert.equal(isHttpsLink(u), serverTakes({ tracking_url: u }), JSON.stringify(u.slice(0, 40)));
  }
});

// ── the client's email ──────────────────────────────────────
test("the shipped email carries the live tracking link, escaped; with no tracking it is the email it always was", async () => {
  const order = { item_title: "Pink <palms> & co", client_email: "ana@x.com", tracking_carrier: "usps", tracking_number: "9400 1118 9922", tracking_url: null };
  const m = statusEmailFor({ status: "shipped", order, name: "<b>Ana</b>", sender: "shop@fonkiart.com" });
  assert.equal(m.subject, "Your order has shipped — Pink <palms> & co", "the subject is plain text");
  assert.match(m.content, /href="https:\/\/tools\.usps\.com\/go\/TrackConfirmAction\?tLabels=940011189922"/);
  assert.match(m.content, /Track your package →/);
  assert.match(m.content, /USPS tracking number: <strong>9400 1118 9922<\/strong>/);
  assert.match(m.content, /Your order for <strong>Pink &lt;palms&gt; &amp; co<\/strong> is on its way!/);
  assert.doesNotMatch(m.content, /<palms>|Fonkiart will follow up/);
  assert.match(m.heading, /&lt;b&gt;Ana/);
  // Other: the pasted link, its & escaped inside the href.
  const other = statusEmailFor({ status: "shipped", order: { ...order, tracking_carrier: "other", tracking_number: null, tracking_url: "https://track.example.com/p?id=1&lang=en" }, name: "Ana", sender: "s@f.com" });
  assert.match(other.content, /href="https:\/\/track\.example\.com\/p\?id=1&amp;lang=en"/);
  assert.doesNotMatch(other.content, /tracking number:/);
  // A link that isn't https:// never reaches the email: no button, and the old sentence.
  for (const url of ["javascript:alert(1)", "http://track.example.com/x", 'https://track.example.com/"><script>alert(1)</script>']) {
    const bad = statusEmailFor({ status: "shipped", order: { ...order, tracking_carrier: "other", tracking_url: url }, name: "Ana", sender: "s@f.com" });
    assert.doesNotMatch(bad.content, /javascript:|<script|Track your package|http:\/\/track/, url);
    assert.match(bad.content, /Fonkiart will follow up with any tracking details\./, url);
  }
  // An odd number (say, from before the server's guard) is encoded in the link and escaped in the words.
  const odd = statusEmailFor({ status: "shipped", order: { ...order, tracking_number: `1"><img src=x onerror=alert(1)>` }, name: "Ana", sender: "s@f.com" });
  assert.doesNotMatch(odd.content, /<img|"><img/);
  assert.match(odd.content, /tLabels=1%22%3E%3Cimg/);
  // No tracking: exactly the old shipped email.
  const plain = statusEmailFor({ status: "shipped", order: { item_title: "Ocean" }, name: "Ana", sender: "s@f.com" });
  assert.match(plain.content, /Your order for <strong>Ocean<\/strong> is on its way! Fonkiart will follow up with any tracking details\./);
  assert.doesNotMatch(plain.content, /Track your package/);
  // Delivered carries the link too (Send on a Delivered order); Confirmed and Paid never do.
  assert.match(statusEmailFor({ status: "delivered", order, name: "Ana", sender: "s@f.com" }).content, /tLabels=940011189922/);
  for (const status of ["confirmed", "paid"]) {
    assert.doesNotMatch(statusEmailFor({ status, order, name: "Ana", sender: "s@f.com" }).content, /Track your package|tLabels/, status);
  }
  assert.equal(statusEmailFor({ status: "pending", order, name: "Ana", sender: "s@f.com" }), null, "Pending sends nothing");
  // As it is really sent: through the server's shared frame.
  const sent = [];
  await adminEmail({ send: async (x) => { sent.push(x); } }, { to: "ana@x.com", subject: m.subject, heading: m.heading, content: m.content });
  assert.match(sent[0].htmlContent, /FONKIART/);
  assert.match(sent[0].htmlContent, /tLabels=940011189922/);
  // Andy's text sizes: nothing in these emails under 16px.
  const sizes = [...(m.content + other.content).matchAll(/font-size:\s*(\d+)px/g)].map(x => Number(x[1]));
  assert.ok(sizes.length > 0 && sizes.every(s => s >= 16), sizes.join(","));
});

test("a pickup's Shipped email says the order is ready, with no tracking words and no link", () => {
  const order = { item_title: "Pink <palms> & co", client_email: "ana@x.com", ...PICKUP_FIELDS };
  const m = statusEmailFor({ status: "shipped", order, name: "Ana", sender: "shop@fonkiart.com" });
  assert.equal(m.subject, "Your order is ready — Pink <palms> & co");
  assert.match(m.content, /Your order for <strong>Pink &lt;palms&gt; &amp; co<\/strong> is ready, and Fonkiart will arrange the pickup or hand delivery with you\./);
  assert.doesNotMatch(m.content, /track|on its way|<palms>|https:\/\//i);
  // A stray number or link (say, from before) changes nothing: still no link.
  const stray = statusEmailFor({ status: "shipped", order: { ...order, tracking_number: "1234", tracking_url: "https://track.example.com/x" }, name: "Ana", sender: "s@f.com" });
  assert.doesNotMatch(stray.content, /track\.example|Track your package|tracking number/i);
  // Delivered: the email it always was, with nothing about tracking.
  const delivered = statusEmailFor({ status: "delivered", order, name: "Ana", sender: "s@f.com" });
  assert.match(delivered.content, /has been marked as delivered/);
  assert.doesNotMatch(delivered.content, /track/i);
  // Control: the same order with a carrier does get the tracking, so the checks above can fail.
  assert.match(statusEmailFor({ status: "shipped", order: { ...order, tracking_carrier: "usps", tracking_number: "9400 1118" }, name: "Ana", sender: "s@f.com" }).content, /Track your package/);
  const sizes = [...m.content.matchAll(/font-size:\s*(\d+)px/g)].map(x => Number(x[1]));
  assert.ok(sizes.length > 0 && sizes.every(s => s >= 16), sizes.join(","));
});

// ── the client's invoice page ───────────────────────────────
test("the invoice page gets the order's tracking from the server", async () => {
  const token = "8f0c2a5e-1111-2222-3333-444455556666";
  const db = fakeDb({ Orders: [{ id: 5, invoice_token: token, status: "shipped", tracking_carrier: "ups", tracking_number: "1Z999AA10123456784", tracking_url: null }], Settings: [{ id: 1 }] });
  const { order } = await opInvoice(db, { token });
  assert.deepEqual([order.tracking_carrier, order.tracking_number, order.tracking_url], ["ups", "1Z999AA10123456784", null]);
  assert.equal(orderTrackingLink(order), "https://www.ups.com/track?tracknum=1Z999AA10123456784");
  // Control: this stand-in really drops columns a select doesn't ask for, so the check above means something.
  const narrowed = await db.from("Orders").select("id,status").eq("invoice_token", token);
  assert.equal(narrowed.data[0].tracking_carrier, undefined);
});

// Andy's standing rule: no browser pop-ups. "🔗 Link" and Delete used alert() and window.confirm().
test("Admin -> Orders asks its questions on the order itself, never in a browser pop-up", () => {
  const POPUP = /\b(alert|confirm|prompt)\s*\(/;
  assert.doesNotMatch(readFileSync(new URL("../src/admin/OrdersTab.jsx", import.meta.url), "utf8"), POPUP);
  assert.match(`if (!window.confirm("Delete this order?")) return;`, POPUP, "control: the check sees a pop-up when there is one");
});
