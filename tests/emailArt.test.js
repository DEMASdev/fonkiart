// The picture in the emails (Andy, 2026-11-18). An "Order Received — Flamingo Party" email showed
// a random piece at the top, the one he had just taken out of his cart: "shows the one i removed
// but names the one i did keep in the cart !! BIG BIG BIG mistake !!!". Now an email about pieces
// shows exactly those pieces and never another one; only an email about no piece gets a random
// one. A fake database and fake mailers: nothing is sent. Every person and address is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "../api/_lib/emails.js";
import * as CE from "../api/_lib/cartEmails.js";
import * as AE from "../src/lib/adminEmails.js";
import { withArt } from "../api/_lib/emailArt.js";
import { adminEmail } from "../api/_lib/adminOps.js";
import { opOrder, opRequest } from "../api/_lib/storeOps.js";
import { adminReply, opThreadReply } from "../api/_lib/threads.js";

// A small stand-in for the supabase-js query builder: select / eq / limit / maybeSingle / insert / update.
function fakeDb(tables = {}, { fail = {} } = {}) {
  const writes = [];
  const from = (table) => {
    let op = "select", payload = null, lim = null, single = false;
    const filters = [];
    const b = {
      select() { return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(v) { op = "update"; payload = v; return b; },
      eq(k, v) { filters.push([k, v]); return b; },
      order() { return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { single = true; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    const match = (r) => filters.every(([k, v]) => String(r[k]) === String(v));
    function run() {
      if (fail[table]) return { data: null, error: fail[table] };
      const rows = (tables[table] ||= []);
      if (op === "insert") { writes.push({ table, payload }); [].concat(payload).forEach(r => rows.push({ id: rows.length + 1000, ...r })); return { data: null, error: null }; }
      if (op === "update") { writes.push({ table, payload }); rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      let out = rows.filter(match).map(r => ({ ...r }));
      if (lim != null) out = out.slice(0, lim);
      return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    return b;
  };
  return { from, writes, tables };
}

const ART = [
  { id: 11, title: "Flamingo Party", image: "https://img.test/flamingo.jpg", isChildren: false },
  { id: 12, title: "Miss Monroe manatee", image: "https://img.test/monroe.jpg", isChildren: false },
  { id: 13, title: "Madame Mango", image: "https://img.test/mango.jpg", isChildren: false },
  { id: 14, title: "Sea Turtle Dream", image: "https://img.test/turtle.jpg", isChildren: false },
  { id: 15, title: "Twin", image: "https://img.test/twin-a.jpg", isChildren: false },
  { id: 16, title: "Twin", image: "https://img.test/twin-b.jpg", isChildren: false },
  { id: 17, title: "No picture yet", image: null, isChildren: false },
  { id: 18, title: "Crayon Sun", image: "https://img.test/crayon.jpg", isChildren: true },
];
const artDb = (extra = {}) => fakeDb({ Artworks: ART.map(a => ({ ...a })), ...extra });
const byImage = new Map(ART.map(a => [a.image, a]));

// The artworks whose pictures an email shows (by the picture itself, so a caption can't fool it).
function shown(html) {
  return [...String(html).matchAll(/_vercel\/image\?url=([^&"]+)/g)].map(m => byImage.get(decodeURIComponent(m[1])) || { title: `(unknown picture ${m[1]})` });
}
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// What is wrong with an email's pictures, if anything: a piece it doesn't name, a named piece
// missing, a caption for a piece it doesn't name, or a slot left unfilled. catalog: the shop's
// artworks the email was filled from (a named piece counts as missing only if it is findable there).
function wrong(html, named, catalog = ART) {
  const want = new Set(named);
  const problems = [];
  const titles = shown(html).map(a => a.title);
  for (const t of titles) if (!want.has(t)) problems.push(`shows "${t}"`);
  const findable = named.filter(t => catalog.filter(a => a.title === t).length === 1 && catalog.find(a => a.title === t).image);
  for (const t of findable) if (!titles.includes(t)) problems.push(`misses "${t}"`);
  if (new Set(titles).size !== titles.length) problems.push("shows a piece twice");
  for (const [, cap] of String(html).matchAll(/“([^”]*)”/g)) if (!want.has(unesc(cap))) problems.push(`caption "${cap}"`);
  if (/<!--ART/.test(html)) problems.push("slot left in");
  return problems;
}

const ORDER = { id: 5, client_name: "Ana Test", client_email: "ana@example.com", item_title: "Flamingo Party", amount: 950,
  created_at: "2026-11-18T20:18:00.000Z", payment_methods: "zelle,stripe", status: "pending" };
const INV = "FA-261118151800000";
const ADDRESS = { ship_name: "Ana Test", ship_address: "12 Ocean Dr", ship_city: "Miami", ship_state: "FL", ship_zip: "33139", ship_country: "USA", ship_phone: null };
const inquiryText = (title, message = "", phone = "") => `Price inquiry for "${title}"${message ? ` — ${message}` : ""}. Phone: ${phone || "not provided"}.`;
const cartView = (titles) => ({ ref: "FA-1752", lines: titles.map((title, i) => ({ title, amount: 300 + i })), total: 999, name: "Ana" });

// Every email about pieces, built for the given titles (one or several where the email allows).
async function adminSent(body) {
  const sent = [];
  await adminEmail({ send: async (m) => { sent.push(m); } }, { to: "ana@example.com", subject: "x", ...body });
  return sent[0].htmlContent;
}
const ABOUT_PIECES = {
  "Order received (buyer)": (ts) => T.orderBuyer({ firstName: "Ana", orderRef: "FA-1752", items: ts.map(title => ({ title, amount: 950 })), total: 950, couponApplied: false, discount: 15, addr: "", sender: "shop@fonkiart.com" }),
  "New order (shop)": (ts) => T.orderStore({ orderRef: "FA-1752", items: ts.map(title => ({ title, amount: 950 })), total: 950, couponApplied: false, discount: 15, fullName: "Ana Test", email: "ana@example.com", phone: "", addr: "", saveFailed: false }),
  "Cart paid by card (shop)": (ts) => CE.cartPaidShop({ ...cartView(ts), who: "Ana Test", email: "ana@example.com" }),
  "Cart payment received (buyer)": (ts) => CE.cartReceived(cartView(ts)),
  "Waiting for you (shop reminder)": (ts) => T.reminderStore({ requests: [], orders: ts.map(title => ({ title, amount: 950, email: "ana@example.com", status: "paid", days: 1 })) }),
};
const ABOUT_ONE = {
  "Price inquiry (shop)": ([t]) => T.inquiryStore({ art: { title: t, category: "Paintings" }, name: "Ana Test", email: "ana@example.com", phone: "", message: "hello" }),
  "Price inquiry (buyer)": ([t]) => T.inquiryBuyer({ name: "Ana Test", artTitle: t, sender: "shop@fonkiart.com" }),
  "Invoice confirmed by customer (shop)": ([t]) => T.invoiceApproved({ order: { ...ORDER, item_title: t }, invNum: INV }),
  "Shipping address added (shop)": ([t]) => T.shipAddressShop({ order: { ...ORDER, item_title: t }, invNum: INV, address: ADDRESS }),
  "Paid by card, invoice (shop)": ([t]) => T.cardPaidShop({ order: { ...ORDER, item_title: t }, invNum: INV }),
  "Payment received, invoice (buyer)": ([t]) => T.paymentReceived({ order: { ...ORDER, item_title: t }, invNum: INV }),
  "Invoice (buyer, from Admin -> Orders)": ([t]) => adminSent({ ...AE.invoiceEmail({ invNum: INV, invDate: "November 18, 2026", firstName: "Ana", itemTitle: t, notes: "", dueDate: "", amount: 950, link: "https://fonkiart.com/?invoice=x", sender: "shop@fonkiart.com" }), pieces: [t] }),
  "Order status: shipped, with tracking (buyer)": ([t]) => adminSent({ ...AE.statusEmailFor({ status: "shipped", order: { ...ORDER, item_title: t, tracking_carrier: "usps", tracking_number: "9400100000000000000000" }, name: "Ana", sender: "shop@fonkiart.com" }), pieces: [t] }),
  "Reply to a price inquiry (buyer)": ([t]) => T.requestReply({ name: "Ana Test", message: "It is still available.", link: "https://fonkiart.com/?thread=x", requestText: inquiryText(t, "is it available?") }),
  "Customer replied to a price inquiry (shop)": ([t]) => T.requestReplyStore({ name: "Ana Test", email: "ana@example.com", message: "Great!", via: "site", requestText: inquiryText(t) }),
};
const build = async (fn, titles) => fn(titles);

test("Andy's email: an order for Flamingo Party shows Flamingo Party, never the piece taken out of the cart", async () => {
  // The order, as the shop saves it (opOrder, paid another way than card): only Flamingo Party.
  for (let run = 0; run < 12; run++) {
    const db = artDb({ Orders: [], Clients: [], Settings: [{ id: 1, couponDiscount: 15 }] });
    const sent = [];
    const mail = { sender: "shop@fonkiart.com", send: async (m) => { sent.push({ ...m, htmlContent: await withArt(db, m.htmlContent) }); } };
    await opOrder(db, { customer: { firstName: "Ana", lastName: "Test", email: "ana@example.com" }, items: [{ title: "Flamingo Party", amount: 950 }], total: 950, orderRef: "FA-1752" }, mail);
    const buyer = sent.find(m => m.to === "ana@example.com");
    const shop = sent.find(m => m.to === "shop@fonkiart.com");
    assert.equal(buyer.subject, "Order Received — Flamingo Party · Fonkiart");
    for (const m of [buyer, shop]) {
      assert.deepEqual(shown(m.htmlContent).map(a => a.title), ["Flamingo Party"], m.subject);
      assert.doesNotMatch(m.htmlContent, /monroe|Miss Monroe/i, m.subject);
      assert.deepEqual(wrong(m.htmlContent, ["Flamingo Party"]), [], m.subject);
    }
  }
});

test("every email about one piece shows exactly that piece, beside the message, and never another", async () => {
  const db = artDb();
  for (const [name, fn] of Object.entries({ ...ABOUT_ONE, ...ABOUT_PIECES })) {
    for (const t of ["Flamingo Party", "Madame Mango"]) {
      const html = await build(fn, [t]);
      assert.equal(T.readSlot(html)?.titles?.join("|"), t, `${name}: names its piece in the slot`);
      for (let run = 0; run < 6; run++) {
        const out = await withArt(db, html);
        assert.deepEqual(wrong(out, [t]), [], `${name} (${t})`);
        assert.match(out, /width="156"/, `${name}: the one-piece picture, beside the message`);
        assert.match(out, new RegExp(`\\?artwork=${ART.find(a => a.title === t).id}"`), `${name}: links to that piece in the shop`);
      }
    }
  }
});

test("an email about several pieces shows each of them, small and art first, and no other", async () => {
  const db = artDb();
  const titles = ["Flamingo Party", "Madame Mango", "Sea Turtle Dream"];
  for (const [name, fn] of Object.entries(ABOUT_PIECES)) {
    const out = await withArt(db, await build(fn, titles));
    assert.deepEqual(wrong(out, titles), [], name);
    assert.deepEqual(shown(out).map(a => a.title), titles, `${name}: in the order's own order`);
    assert.equal((out.match(/width="120"/g) || []).length, 3, `${name}: each one small`);
    for (const t of titles) assert.ok(out.indexOf(`/?artwork=${ART.find(a => a.title === t).id}`) < out.indexOf(`“${t}”`), `${name}: ${t}'s picture comes before its title`);
  }
  // The same piece twice in one order shows once.
  const twice = await withArt(db, T.orderBuyer({ firstName: "Ana", orderRef: "FA-1", items: [{ title: "Madame Mango", amount: 1 }, { title: "Madame Mango", amount: 1 }], total: 2, sender: "s@x.co" }));
  assert.deepEqual(shown(twice).map(a => a.title), ["Madame Mango"]);
});

test("a piece that can't be told for sure shows no picture at all, never another one, and the email still goes", async () => {
  const cases = [
    ["taken out of the shop", artDb({}), ["Gone Forever"]],
    ["two pieces share the title", artDb(), ["Twin"]],
    ["the piece has no picture", artDb(), ["No picture yet"]],
    ["a title that differs in capitals", artDb(), ["flamingo party"]],
    ["the database is down", fakeDb({}, { fail: { Artworks: { message: "down" } } }), ["Flamingo Party"]],
  ];
  for (const [why, db, titles] of cases) {
    for (const fn of [ABOUT_ONE["Invoice confirmed by customer (shop)"], ABOUT_PIECES["Order received (buyer)"]]) {
      const out = await withArt(db, await build(fn, titles));
      assert.deepEqual(shown(out), [], why);
      assert.doesNotMatch(out, /<img|<!--ART/, why);
      assert.match(out, /FONKIART/, `${why}: the email itself is whole`);
    }
  }
  // Of several, the ones that can be found still show; the others leave no gap and no stand-in.
  const out = await withArt(artDb(), await build(ABOUT_PIECES["Order received (buyer)"], ["Flamingo Party", "Twin", "Gone Forever", "Madame Mango"]));
  assert.deepEqual(shown(out).map(a => a.title), ["Flamingo Party", "Madame Mango"]);
});

test("the emails about no piece keep a random piece of Aliana's art, as before", async () => {
  const db = artDb();
  const none = {
    "Welcome coupon": T.welcomeCoupon({ code: "FK-AAAA-BBBB", discount: 15 }),
    "Contact form (shop)": T.contactStore({ name: "Ana Test", email: "ana@example.com", message: "hi" }),
    "Contact form (buyer)": T.contactBuyer({ name: "Ana Test", message: "hi", sender: "shop@fonkiart.com" }),
    "Password reset (customer)": T.customerReset({ link: "https://fonkiart.com/?reset=x", minutes: 30 }),
    "Password reset (admin)": T.adminReset({ link: "https://fonkiart.com/?admin-reset=x", minutes: 30 }),
    "Email that matched no request (shop)": T.inboundUnmatched({ from: "a@example.com", subject: "hi", text: "hello" }),
    "Reply to a contact message (buyer)": T.requestReply({ name: "Ana", message: "Thanks!", link: "https://fonkiart.com/?thread=x", requestText: "Do you ship to Canada?" }),
    "Reminder with messages only (shop)": T.reminderStore({ requests: [{ name: "Ana", email: "ana@example.com", message: "Do you ship to Canada?", days: 0 }], orders: [] }),
    "Coupon gift (Admin -> Leads)": await adminSent(AE.couponEmail({ code: "FK-AAAA-BBBB", discount: 10 })),
  };
  const eligible = new Set(ART.filter(a => a.image && !a.isChildren).map(a => a.title));
  for (const [name, html] of Object.entries(none)) {
    assert.deepEqual(T.readSlot(html), { slot: T.ART_SLOT, titles: null }, name);
    const out = await withArt(db, html);
    const pics = shown(out);
    assert.equal(pics.length, 1, name);
    assert.ok(eligible.has(pics[0].title), `${name}: one of Aliana's own pieces with a picture`);
  }
});

test("the reminder shows the pieces it lists: its orders and its price inquiries", async () => {
  const html = T.reminderStore({
    requests: [{ name: "Ana", email: "ana@example.com", message: inquiryText("Sea Turtle Dream", "how big is it?"), days: 2 },
      { name: "Bo", email: "bo@example.com", message: "Do you ship to Canada?", days: 1 }],
    orders: [{ title: "Flamingo Party", amount: 950, email: "ana@example.com", status: "paid", days: 0 }],
  });
  const out = await withArt(artDb(), html);
  assert.deepEqual(wrong(out, ["Flamingo Party", "Sea Turtle Dream"]), []);
  assert.deepEqual(shown(out).map(a => a.title), ["Flamingo Party", "Sea Turtle Dream"]);
});

test("a price inquiry's piece is read back from the words the shop saves, and its emails show it", async () => {
  const titles = ["Flamingo Party", 'The "Blue" Fish — at night', "Señora Piña", '"Hope"'];
  for (const [n, title] of titles.entries()) {
    const known = ART.some(a => a.title === title);
    const db = artDb({ Requests: [], Artworks: [...ART, ...(known ? [] : [{ id: 30 + n, title, image: `https://img.test/extra-${n}.jpg` }])] });
    if (!known) byImage.set(`https://img.test/extra-${n}.jpg`, { title });
    const sent = [];
    const mail = { sender: "shop@fonkiart.com", send: async (m) => { sent.push({ ...m, htmlContent: await withArt(db, m.htmlContent) }); } };
    const artworkId = db.tables.Artworks.find(a => a.title === title).id;
    for (const message of ["", 'is it "still" there? — thanks', "x. Phone: 1."]) {
      await opRequest(db, { kind: "inquiry", artworkId, name: "Ana Test", email: "ana@example.com", phone: "305 555 0100", message }, mail);
      const saved = db.tables.Requests.at(-1).message;
      assert.equal(T.inquiryTitle(saved), title, saved);
    }
    assert.equal(sent.length, 6);
    for (const m of sent) {
      assert.deepEqual(shown(m.htmlContent).map(a => a.title), [title], m.subject);
      assert.deepEqual(wrong(m.htmlContent, [title]), [], m.subject);
    }
  }
  for (const other of ["Do you ship?", "[COLLECTORS COMMISSION] Budget: TBD\n\nA turtle", "", null, 'Price inquiry for "unfinished']) {
    assert.equal(T.inquiryTitle(other), "", String(other));
  }
  // A title that could be cut in two places is no guess: "A" is a real piece here, and it must not show.
  assert.equal(T.inquiryTitle(inquiryText('A" — B')), "");
  assert.equal(T.inquiryTitle(inquiryText("Madame Mango", 'say "hi". Phone: 2')), "", "a message that looks like the end: no guess either");
  assert.equal(T.inquiryTitle(inquiryText("Madame Mango", 'is it "still" there?')), "Madame Mango");
});

test("a conversation about a price inquiry shows that piece both ways; one about anything else, a random piece", async () => {
  const token = "ab".repeat(20);
  for (const [requestText, named] of [[inquiryText("Madame Mango", "is it framed?", "305 555 0100"), "Madame Mango"], ["Do you ship to Canada?", null]]) {
    const db = artDb({ Requests: [{ id: "r1", name: "Ana Test", email: "ana@example.com", message: requestText, status: "new", thread_token: token }], RequestMessages: [] });
    const sent = [];
    const mail = { sender: "shop@fonkiart.com", send: async (m) => { sent.push({ ...m, htmlContent: await withArt(db, m.htmlContent) }); return { messageId: "<m@x>" }; } };
    await adminReply(db, { id: "r1", message: "Yes, it is framed." }, mail);               // the shop answers: to the customer
    await opThreadReply(db, { token, message: "Lovely, thank you!" }, mail);                // the customer answers: to the shop
    assert.deepEqual(sent.map(m => m.to), ["ana@example.com", "shop@fonkiart.com"]);
    for (const m of sent) {
      if (named) assert.deepEqual(wrong(m.htmlContent, [named]), [], m.subject);
      else assert.equal(shown(m.htmlContent).length, 1, `${m.subject}: a random piece`);
    }
  }
});

test("Admin -> Orders names the piece in every email it sends; the server keeps it, or shows nothing when it's garbled", async () => {
  const src = readFileSync(new URL("../src/admin/OrdersTab.jsx", import.meta.url), "utf8");
  const calls = src.split("\n").filter(l => /\bsendEmail\(\{/.test(l));
  assert.equal(calls.length, 3, "invoice, resend, status");
  for (const line of calls) assert.match(line, /pieces: \[(order|inv)\.item_title\]/, line.trim());
  assert.match(readFileSync(new URL("../src/utils/helpers.js", import.meta.url), "utf8"), /adminSendEmail\(\{[^}]*\bpieces\b[^}]*\}\)/, "helpers.js passes pieces on");
  // Control: the same check catches a send without pieces.
  assert.doesNotMatch('      await sendEmail({ to: order.client_email, subject: m.subject, heading: m.heading, content: m.content });', /pieces: \[(order|inv)\.item_title\]/);
  const body = { heading: "Hi", content: "<p>x</p>" };
  assert.deepEqual(T.readSlot(await adminSent({ ...body, pieces: ["Madame Mango"] })).titles, ["Madame Mango"]);
  assert.deepEqual(T.readSlot(await adminSent({ ...body, pieces: "Madame Mango" })).titles, [], "garbled: no picture, not a random one");
  assert.deepEqual(T.readSlot(await adminSent({ ...body, pieces: [42, "Madame Mango"] })).titles, ["Madame Mango"]);
  assert.equal(T.readSlot(await adminSent(body)).titles, null, "no pieces: a coupon, a random piece");
});

test("no title can break out of the picture's slot or turn into another piece", async () => {
  const odd = ["a --> b", "<!--ART-->", "Pay $& now $'", "Fish, \"Blue\"", "Sol y Luna ☀︎"];
  const db = fakeDb({ Artworks: odd.map((title, i) => ({ id: 50 + i, title, image: `https://img.test/odd-${i}.jpg` })) });
  odd.forEach((title, i) => byImage.set(`https://img.test/odd-${i}.jpg`, { title }));
  for (const title of odd) {
    const html = T.orderBuyer({ firstName: "Ana", orderRef: "FA-1", items: [{ title, amount: 1 }], total: 1, sender: "s@x.co" });
    assert.deepEqual(T.readSlot(html).titles, [title]);
    assert.equal((html.match(/<!--ART/g) || []).length, 1, `${title}: one slot`);
    const out = await withArt(db, html);
    assert.deepEqual(shown(out).map(a => a.title), [title], title);
    assert.doesNotMatch(out, /<!--ART/);
  }
  assert.match(await withArt(db, T.orderBuyer({ firstName: "A", items: [{ title: "Pay $& now $'", amount: 1 }], sender: "s@x.co" })), /“Pay \$&amp; now \$&#39;”/);
});

test("control: the check catches today's random picture (it lands on another piece), and the fix passes it", async () => {
  // Today's code (before 2026-11-18, emails.js withRandomArt): every slot got a random piece.
  const today = async (db, html) => {
    const art = await T.pickArt(db);
    return String(html).replace(/<!--ART(?::[0-9a-f,]*)?-->/, () => (art ? T.artRow(art) : ""));
  };
  const db = artDb();
  const html = T.orderBuyer({ firstName: "Ana", orderRef: "FA-1752", items: [{ title: "Flamingo Party", amount: 950 }], total: 950, sender: "shop@fonkiart.com" });
  let caught = 0;
  for (let run = 0; run < 40; run++) if (wrong(await today(db, html), ["Flamingo Party"]).length) caught++;
  assert.ok(caught > 0, "today's picture showed another piece at least once in 40 emails");
  // And always, when the ordered piece isn't in the shop any more: today shows another piece; the fix shows none.
  const without = fakeDb({ Artworks: ART.filter(a => a.title !== "Flamingo Party") });
  for (let run = 0; run < 10; run++) {
    assert.ok(wrong(await today(without, html), ["Flamingo Party"], without.tables.Artworks).length > 0);
    assert.deepEqual(wrong(await withArt(without, html), ["Flamingo Party"], without.tables.Artworks), []);
  }
  for (let run = 0; run < 40; run++) assert.deepEqual(wrong(await withArt(db, html), ["Flamingo Party"]), []);
});

test("the table: every email the server can build is either about its pieces or about none", () => {
  const helpers = new Set(["ART_SLOT", "adminFrame", "artFor", "artRow", "emailImage", "inquiryTitle", "pickArt", "piecesSlot", "readSlot", "supabaseTemplate"]);
  const emails = Object.keys(T).filter(k => !helpers.has(k) && !k.endsWith("Subject")).sort();
  assert.deepEqual(emails, ["adminReset", "cardPaidShop", "contactBuyer", "contactStore", "customerReset", "inboundUnmatched", "inquiryBuyer",
    "inquiryStore", "invoiceApproved", "orderBuyer", "orderStore", "paymentReceived", "reminderStore", "requestReply", "requestReplyStore",
    "shipAddressShop", "welcomeCoupon"], "a new email? add it to this table and to ABOUT_ONE / ABOUT_PIECES or the no-piece list");
  assert.deepEqual(Object.keys(CE).filter(k => !k.endsWith("Subject")).sort(), ["cartPaidShop", "cartReceived"]);
});
