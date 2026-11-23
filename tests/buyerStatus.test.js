// My Account and Track my order show an order's status the same way, from ONE table in
// src/lib/orderStatus.js (ORDER_STATUSES + STATUS_LOOK). 2026-11-18: My Account kept its own
// four-step list with no Paid, so a buyer who had just paid saw a plain chip and nothing lit on
// the line: their order looked less far along than an unpaid one. These tests fail on that code.
// Group 4 (same day): every chip's words at 4.5:1 or more, and Admin -> Dashboard reads the table too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as status from "../src/lib/orderStatus.js";

const { ORDER_STATUSES } = status;
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const VIEWS = { "My Account": "src/pages/BuyerDashboard.jsx", "Track my order": "src/components/TrackOrderModal.jsx" };
const look = (s) => {
  assert.equal(typeof status.statusLook, "function", "lib/orderStatus.js gives the buyer screens a statusLook");
  return status.statusLook(s);
};

test("a paid order reads Paid, on the paid colour, at step 3 of 5", () => {
  const paid = look("paid");
  assert.equal(paid.label, "Paid");
  assert.equal(paid.bg, "var(--ok-light)", "the light lilac, never green (Andy, 2026-11-22: \"no green on the sile\")");
  assert.equal(paid.fg, "var(--ink)", "dark ink words: white reads under 4.5:1 on a light chip");
  assert.equal(paid.step, 2);
});

test("each status is one step further than the one before, Paid between Confirmed and Shipped", () => {
  assert.deepEqual(ORDER_STATUSES.map(([s]) => look(s).step), [0, 1, 2, 3, 4]);
  assert.ok(look("confirmed").step < look("paid").step && look("paid").step < look("shipped").step);
});

test("every status on the list has its word and its colours, and the table has no others", () => {
  assert.deepEqual(Object.keys(status.STATUS_LOOK || {}), ORDER_STATUSES.map(([s]) => s));
  for (const [s, word] of ORDER_STATUSES) {
    const l = look(s);
    assert.equal(l.label, word, s);
    assert.ok(l.bg && l.fg && l.dot, `${s} has a chip colour, a word colour and a dot colour`);
  }
  assert.equal(look("pending").dot, "#c9a96e", "Pending's dot stays the darker gold, seen on white");
  assert.equal(look("paid").dot, look("paid").bg, "every other dot is its chip's colour");
});

test("a status the list doesn't know: its own word on a plain chip, nothing lit", () => {
  assert.deepEqual(look("cancelled"), { label: "cancelled", bg: "var(--border)", fg: "var(--ink)", dot: "var(--border)", step: -1 });
  assert.equal(look(undefined).label, "");
  assert.equal(look(null).step, -1);
});

test("My Account and Track my order read the one table: no status colours, names or words of their own", () => {
  const COLOURS = ["var(--ok-light)", "#1e3a52", "var(--ok)", "#f0d5a8", "#c9a96e"];
  for (const [name, file] of Object.entries(VIEWS)) {
    const code = read(file);
    assert.match(code, /import \{[^}]*\bstatusLook\b[^}]*\} from "\.\.\/lib\/orderStatus"/, `${name} reads statusLook from lib/orderStatus`);
    for (const c of COLOURS) assert.ok(!code.toLowerCase().includes(c), `${name} has a status colour of its own: ${c}`);
    for (const [s, word] of ORDER_STATUSES) {
      assert.ok(!new RegExp(`["'\`]${s}["'\`]`).test(code), `${name} names the status "${s}" itself`);
      assert.ok(!new RegExp(`["'\`]${word}["'\`]`).test(code), `${name} spells the word "${word}" itself`);
    }
  }
});

test("My Account's line walks the shared list: a dot and a word for every status, Paid included", () => {
  const code = read(VIEWS["My Account"]);
  assert.ok((code.match(/ORDER_STATUSES\.map\(/g) || []).length >= 2, "the dots and the words both walk ORDER_STATUSES");
  assert.match(code, /statusLook\(s\)\.dot/, "a lit dot takes its colour from the table");
  assert.ok(!/indexOf\(o\.status\)/.test(code), "no step counting of its own");
});

// A colour from the table as #rrggbb: var(--x) is read from src/index.css's :root (comments taken out),
// and so is a var() it names in turn (--ok-light is var(--ok-a-light) or var(--ok-b-light)); #abc is spelled out.
const css = read("src/index.css").replace(/\/\*[\s\S]*?\*\//g, "");
const hex = (c) => {
  const v = /^var\(--([a-z-]+)\)$/.exec(c);
  if (v) return hex((css.match(new RegExp(`(?<![\\w-])--${v[1]}:([^;]+);`)) || [])[1]?.trim());
  return /^#[0-9a-f]{3}$/i.test(c || "") ? "#" + [...c.slice(1)].map(x => x + x).join("") : c;
};
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("every status chip's words read at 4.5:1 or more on the chip (Andy's rule is for people who can't see well)", () => {
  assert.ok(Math.abs(contrast("#ffffff", "#000000") - 21) < 0.01 && Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01, "the contrast sum itself");
  for (const s of [...ORDER_STATUSES.map(([s]) => s), "a-status-the-list-does-not-know"]) {
    const l = look(s), fg = hex(l.fg), bg = hex(l.bg);
    assert.ok(/^#[0-9a-f]{6}$/i.test(fg) && /^#[0-9a-f]{6}$/i.test(bg), `${s}: its colours resolve (${l.fg} on ${l.bg})`);
    const r = contrast(fg, bg);
    assert.ok(r >= 4.5, `${s}: ${l.fg} words on ${l.bg} read at ${r.toFixed(2)}:1, under 4.5:1`);
  }
});

test("Admin -> Dashboard's Orders by Status reads the one table too: no status list or colours of its own", () => {
  const code = read("src/admin/DashboardTab.jsx");
  assert.match(code, /import \{[^}]*\bstatusLook\b[^}]*\} from "\.\.\/lib\/orderStatus"/, "it reads statusLook from lib/orderStatus");
  assert.match(code, /ORDER_STATUSES\.map\(/, "it walks the shared list");
  for (const c of ["#f0d5a8", "var(--ok-light)", "#c9a96e"]) assert.ok(!code.toLowerCase().includes(c), `it has a status colour of its own: ${c}`);
  assert.ok(!/label:"(Pending|Confirmed|Paid|Shipped|Delivered)"/.test(code), "it spells the status words itself");
});
