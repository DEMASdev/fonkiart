// Admin -> Orders: "Didn't finish paying" (Andy, 2026-11-20, "2am"). A Cart card checkout is saved
// the moment the buyer opens the card form, which also offers Klarna, before any money moves
// (api/_lib/cartCheckout.js, 1.).
// One the buyer never paid leaves the main Orders list for its own small list under it, so Andy can
// follow up with the buyer. A week after the buyer started it, it shows in neither list. Hidden
// only: nothing is deleted. Each test but the control fails on the Orders tab before it (c3227df,
// and the commit before this one), which had no such list. All names and emails here are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as row from "../src/lib/orderRow.js";
import { CARD_NOTE as SERVER_CARD_NOTE } from "../api/_lib/cartCheckout.js";

const { unfinishedCard, unfinishedThisWeek, CARD_NOTE, UNFINISHED_DAYS } = row;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-21T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const started = (o = {}) => ({ status: "pending", notes: `Order Ref: FA-TEST1 · Test Print · Ship to Testville${CARD_NOTE}`, created_at: ago(1), ...o });

test("the browser's words for a card checkout that is not paid yet are the server's own", () => {
  assert.equal(typeof unfinishedCard, "function", "src/lib/orderRow.js says which orders did not finish paying");
  assert.equal(CARD_NOTE, SERVER_CARD_NOTE, "the same ending the server writes on the rows");
  assert.equal(UNFINISHED_DAYS, 7, "a week");
});

test("didn't finish paying: a card checkout still Pending; paid, moved on, or paid another way, it is a normal order", () => {
  assert.equal(unfinishedCard(started()), true);
  assert.equal(unfinishedCard(started({ status: null })), true, "an order saved with no status is Pending");
  assert.equal(unfinishedCard(started({ status: "paid", paid_method: "card" })), false, "paid by card (settleCart): Paid");
  for (const status of ["confirmed", "shipped", "delivered"]) assert.equal(unfinishedCard(started({ status })), false, `${status}: Andy moved it on`);
  assert.equal(unfinishedCard(started({ notes: "Order Ref: FA-TEST1 · Test Print · Paying by Zelle" })), false, "paid another way (cart-other)");
  assert.equal(unfinishedCard({ status: "pending", notes: "Framed, test only" }), false, "an ordinary Pending order");
  assert.equal(unfinishedCard({ status: "pending", notes: `${CARD_NOTE} · a note after it` }), false, "only at the end");
  assert.equal(unfinishedCard({ status: "pending", notes: null }), false);
  assert.equal(unfinishedCard(null), false);
});

test("a week: in the small list for 7 days from when the buyer started, then nowhere (an order with no date stays)", () => {
  assert.equal(unfinishedThisWeek(started({ created_at: ago(0) }), NOW), true, "today");
  assert.equal(unfinishedThisWeek(started({ created_at: ago(6.9) }), NOW), true, "6 days and some hours");
  assert.equal(unfinishedThisWeek(started({ created_at: ago(7) }), NOW), false, "a week to the hour");
  assert.equal(unfinishedThisWeek(started({ created_at: ago(30) }), NOW), false);
  assert.equal(unfinishedThisWeek(started({ created_at: null }), NOW), true, "no date: nothing is hidden without knowing its age");
  assert.equal(unfinishedThisWeek(started({ status: "paid", created_at: ago(1) }), NOW), false, "a paid one is in the main list, not here");
  assert.equal(unfinishedThisWeek({ status: "pending", notes: "", created_at: ago(1) }, NOW), false);
});

test("the Orders tab: the main list, its counts and its chips leave them out; the small list shows this week's, in the same rows", () => {
  const tab = read("src/admin/OrdersTab.jsx");
  assert.match(tab, /import \{[^}]*\bunfinishedCard\b[^}]*\bunfinishedThisWeek\b[^}]*\} from "\.\.\/lib\/orderRow"/);
  assert.match(tab, /const shop = orders\.filter\(o => !unfinishedCard\(o\)\);/, "the main list: every order but these");
  assert.match(tab, /const filtered = shop\.filter\(o =>/, "the chips and search work on the main list");
  assert.match(tab, /const statusCounts = \{ all:shop\.length,/, "the chips count the main list");
  assert.match(tab, /shop\.forEach\(o =>/);
  assert.match(tab, /Orders <span className="o-count">\(\{shop\.length\}\)<\/span>/, "the heading counts the main list");
  assert.match(tab, /const unpaid = orders\.filter\(o => unfinishedThisWeek\(o\) && matches\(o\)\);/, "the small list: this week's, found by the same search");
  assert.match(tab, /: ordersTable\(filtered\)\}/, "the main list's table");
  assert.match(tab, /\{showUnpaid && ordersTable\(unpaid\)\}/, "the small list: the same table, the same rows");
  assert.match(tab, /aria-expanded=\{showUnpaid\}/, "it opens and closes, and says so");
  assert.match(tab, />Didn't finish paying</);
  assert.match(tab, />Started paying by card, Klarna or bank transfer and never finished\. Each one shows here for a week, then is hidden\. Nothing is deleted\.</, "what the list is, in plain words");
  assert.doesNotMatch(tab, /unfinished[^\n]*\.delete\(|unpaid[^\n]*\.delete\(/, "hidden, never deleted");
});

test("the small list's words read at 16px or more", () => {
  const css = read("src/index.css");
  const at = css.indexOf("/* Admin -> Orders: \"Didn't finish paying\"");
  assert.ok(at > 0, "its styles are in src/index.css");
  const block = css.slice(at, css.indexOf("\n/*", at + 10));
  const sizes = [...block.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length >= 2, `found ${sizes.length} sizes`);
  assert.deepEqual(sizes.filter(n => n < 16), []);
});

test("control: the readers see what they look for", () => {
  assert.match("const shop = orders.filter(o => !unfinishedCard(o));", /const shop = orders\.filter\(o => !unfinishedCard\(o\)\);/);
  assert.doesNotMatch("const filtered = orders.filter(o =>", /const filtered = shop\.filter\(o =>/, "the list before: every order");
  assert.deepEqual([..."font-size:12px;".matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 16), [12]);
});
