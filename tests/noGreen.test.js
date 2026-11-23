// No green on the site (Andy, 2026-11-22: "i do not like the green no green on the sile maybe soft
// lilac or violet but no green"). Every colour written in src/ and api/ is read: #hex, rgb()/rgba()
// and the named greens, and the emoji a screen draws green (Apple's ✅ is a green box, 💵 a green note).
// Green = a hue from 72° to 165° with at least 12 between its highest and lowest channel (the rule of
// the green scan, same day). The only exception: a company's logo, not
// ours to recolour: Cash App's green mark (#00d632), in the footer and beside the ways to pay.
// (UnionPay's teal, #007b84, has a hue of 184°: not in the band, so it needs no exception.)
// What took the green's place sits in ONE place, src/index.css :root (--ok, --ok-light, --ok-line,
// --ok-tint), with its two choices for Andy, A "soft lilac" and B "violet"; an email can't read CSS,
// so api/_lib/emails.js keeps the same two and picks the same one.
// Measured: on the code before this change (3d36fc7) the scan test fails, "green on the site: 64 in 18
// files"; with its readers or its rule blinded, the controls test fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { statusLook, ORDER_STATUSES, PROCESSING } from "../src/lib/orderStatus.js";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

// A colour's hue (0-360) and chroma (highest channel minus lowest), from its red, green and blue.
function hueChroma(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c) h = mx === r ? 60 * (((g - b) / c) % 6) : mx === g ? 60 * ((b - r) / c + 2) : 60 * ((r - g) / c + 4);
  return { h: h < 0 ? h + 360 : h, c };
}
const isGreen = (r, g, b) => { const { h, c } = hueChroma(r, g, b); return c >= 12 && h >= 72 && h < 165; };
const rgbOf = (hex) => {
  const x = hex.length <= 4 ? [...hex.slice(0, 3)].map(d => d + d).join("") : hex.slice(0, 6);
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
};
// "&#8212;" (a character written as a code) and "abc#123" are not colours.
const HEX = /(?<![&\w])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const RGB = /rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/gi;
const NAMED = /(?:[:=]\s*["'`]?|["'`])(green|darkgreen|forestgreen|seagreen|mediumseagreen|lightgreen|limegreen|lime|olive|olivedrab|teal|honeydew|mintcream|springgreen|palegreen|darkseagreen|lawngreen|chartreuse|yellowgreen|greenyellow|darkolivegreen|lightseagreen|mediumspringgreen|aquamarine)\b/gi;
// Emoji drawn green (Apple, Google, Microsoft): ✅ 💚 💵 🟢 🟩 ❇️ ✳️ ♻️ and the plants, frogs and so on.
const EMOJI = /[✅💚💵🟢🟩❇✳♻🌿🍀🌱🌲🌳🌴🌵🍃📗💹🥝🐢🐸🥦🍏🥬🥒🫑🐊🦎🎄❎🈯]/gu;

// Every green written in some text: [{ line, colour }].
function greens(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(HEX)) if (isGreen(...rgbOf(m[1]))) found.push({ line: i + 1, colour: "#" + m[1].toLowerCase() });
    for (const m of line.matchAll(RGB)) if (isGreen(+m[1], +m[2], +m[3])) found.push({ line: i + 1, colour: `rgb(${m[1]},${m[2]},${m[3]})` });
    for (const m of line.matchAll(NAMED)) found.push({ line: i + 1, colour: m[1].toLowerCase() });
    for (const m of line.matchAll(EMOJI)) found.push({ line: i + 1, colour: m[0] });
  });
  return found;
}
// Every colour of any kind in some text (to prove the scan reads them at all).
const anyColours = (text) => (text.match(HEX) || []).length + (text.match(RGB) || []).length;

// Every code file under src/ and api/.
function files(dir) {
  const out = [];
  for (const name of readdirSync(new URL(dir, ROOT))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(rel, ROOT)).isDirectory()) out.push(...files(rel));
    else if (/\.(jsx?|mjs|css|html|svg)$/.test(name)) out.push(rel);
  }
  return out;
}

// The logos, kept on purpose: the file and the colour.
const LOGOS = new Set([
  "src/components/Footer.jsx #00d632",     // Cash App's mark in "Accepted Payments"
  "src/components/PayMarks.jsx #00d632",   // ...the same mark beside the ways to pay
]);

test("the scan's own controls: it sees green however it is written, and not lilac, violet or the site's colours", () => {
  const sample = [
    '.ok { background:#f0faf5;border:1px solid #b7e4c7;color:#2d6a4f; }',
    '<p style={{ color:"#4a8c6a" }}>', 'paid: { bg: "#52b788" }', "a { color:#3c6; } b { color:#2d6a4fcc; }",
    'background:"rgba(45,106,79,.1)"', "background:rgb(82 183 136)", 'style={{ color:"green" }}', "c { color: seagreen; }", 'fill="lime"', '["tasks","✅ Pending Tasks"] <h3>💵 Cash App</h3>',
  ].join("\n");
  assert.deepEqual(greens(sample).map(f => f.colour),
    ["#b7e4c7", "#2d6a4f", "#4a8c6a", "#52b788", "#3c6", "#2d6a4fcc", "rgb(45,106,79)", "rgb(82,183,136)", "green", "seagreen", "lime", "✅", "💵"],
    "every green is caught: hex long and short, see-through, rgb() with commas or spaces, by name, and green emoji (#f0faf5 is too pale to count)");
  const lilac = [
    "--ok-a:#765389;--ok-a-light:#b996cc;--ok-a-line:#dccae6;--ok-a-tint:#f8f3fa;",
    "--ok-b:#5b2f9e;--ok-b-light:#a585e0;--ok-b-line:#c7b4ee;--ok-b-tint:#f4effd;",
    ".x { color:#1c1a18;background:#fff;border-color:#e8c97a; } .y { color:#9e7fa0; } .z { color:#5b4a5c;background:#9c3a76; }",
    '.p { background:#DF88B7;color:#b8923f; } .e { color:#c0392b; } .n { color:#1e3a52;background:#2f5f8a; } .o { color:#6b6b6b; }',
    "<span>&#8212;</span> <a href=\"#top\">", 'const greenish = "word"; // the word green in a comment', "rgba(28,26,24,.04) rgba(223,136,183,.5)",
    '["tasks","☑️ Pending Tasks"] 💰 Cash App · 💜 Zelle · 🔵 Venmo · 💳 Stripe · 🎟 Coupon',
  ].join("\n");
  assert.deepEqual(greens(lilac), [], "the lilacs, the violets and the site's own colours are not green");
  assert.ok(anyColours(lilac) >= 20, "and the scan did read them");
});

test("no green in src/ or api/, but for the Cash App logo", () => {
  const all = [...files("src"), ...files("api")];
  assert.ok(all.length > 80, `the scan finds the code (${all.length} files)`);
  let read_ = 0;
  const found = [], logos = new Set();
  for (const f of all) {
    const text = read(f);
    read_ += anyColours(text);
    for (const g of greens(text)) {
      if (LOGOS.has(`${f} ${g.colour}`)) logos.add(`${f} ${g.colour}`);
      else found.push(`${f}:${g.line} ${g.colour}`);
    }
  }
  assert.ok(read_ > 400, `the scan reads the colours (${read_})`);
  assert.deepEqual([...logos].sort(), [...LOGOS].sort(), "it sees the Cash App logo's green, so it is not blind");
  assert.deepEqual(found, [], `green on the site: ${found.length} in ${new Set(found.map(f => f.split(":")[0])).size} files`);
});

// The "it worked" colours: src/index.css :root, comments taken out; var(--x) followed to its colour.
const css = read("src/index.css").replace(/\/\*[\s\S]*?\*\//g, "");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const value = (name) => (root.match(new RegExp(`(?<![\\w-])--${name}:([^;]+);`)) || [])[1]?.trim();
const resolve = (c) => { const v = /^var\(--([\w-]+)\)$/.exec(c || ""); return v ? resolve(value(v[1])) : c?.toLowerCase(); };
const lum = (h) => {
  const [r, g, b] = rgbOf(h.slice(1)).map(c => c / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const cream = (h) => { const [r, g, b] = rgbOf(h.slice(1)); return Math.min(r, g, b) >= 0xd8 && r >= g && g >= b && r - b >= 4; };
// How far apart two colours look (CIE76: about 2 is "just seen", 20 or more is plainly another colour).
const lab = (h) => {
  const [r, g, b] = rgbOf(h.slice(1)).map(c => c / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [X, Y, Z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const apart = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const ROLES = ["", "-light", "-line", "-tint"];
const choice = (k) => Object.fromEntries(ROLES.map(r => [r, resolve(`var(--ok-${k}${r})`)]));

test("the two choices for Andy: lilac or violet, never green or cream, every word easy to read (4.5:1 or more)", () => {
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01, "the contrast sum itself");
  for (const k of ["a", "b"]) {
    const o = choice(k);
    for (const r of ROLES) {
      assert.match(o[r] || "", /^#[0-9a-f]{6}$/, `--ok-${k}${r} is a colour in :root`);
      const [cr, cg, cb] = rgbOf(o[r].slice(1));
      assert.ok(!isGreen(cr, cg, cb) && !cream(o[r]), `--ok-${k}${r} ${o[r]} is neither green nor cream`);
      assert.ok(cb > cg && cr > cg, `--ok-${k}${r} ${o[r]} is a lilac or a violet: more blue and red than green`);
    }
    const sum = (a, b, what) => { const n = contrast(a, b); assert.ok(n >= 4.5, `${k}: ${what} read at ${n.toFixed(2)}:1, under 4.5:1`); };
    sum(o[""], "#ffffff", "the words on white");
    sum(o[""], o["-tint"], "the words on the pale fill (the paid banner, Mark paid, Copied)");
    sum(o["-light"], "#1c1a18", "ink words on Paid's chip");
    sum(o["-light"], "#1a1816", "the light words on the Collectors Room's dark card");
    assert.ok(apart(o[""], "#c0392b") > 40, `${k}: "it worked" never looks like the error red`);
  }
});

test("ONE switch: the site wears one choice whole, and the emails wear the same one", () => {
  const pick = ROLES.map(r => value(`ok${r}`));
  const letters = pick.map(v => (/^var\(--ok-([ab])(?:-light|-line|-tint)?\)$/.exec(v || "") || [])[1]);
  assert.deepEqual(pick.map(v => v.replace(/--ok-[ab]/, "--ok-?")), ["var(--ok-?)", "var(--ok-?-light)", "var(--ok-?-line)", "var(--ok-?-tint)"], "each role names its own colour of a choice");
  assert.equal(new Set(letters).size, 1, `the site wears one choice, not a mix: ${pick.join(" ")}`);
  const emails = read("api/_lib/emails.js");
  const choices = /const OK_CHOICES = \{ A: "(#[0-9a-f]{6})", B: "(#[0-9a-f]{6})" \};/.exec(emails);
  const emailPick = (/const OK_PICK = "([AB])";/.exec(emails) || [])[1];
  assert.ok(choices && emailPick, "api/_lib/emails.js has its two choices and its pick");
  assert.deepEqual([choices[1], choices[2]], [resolve("var(--ok-a)"), resolve("var(--ok-b)")], "the emails' two choices are the site's --ok-a and --ok-b");
  assert.equal(emailPick.toLowerCase(), letters[0], "the emails pick what the site picks");
  assert.match(emails, /ok: OK_CHOICES\[OK_PICK\]/, "and the emails' words take it");
});

test("the order statuses still look different from each other, Paid and Shipped included", () => {
  const all = [...ORDER_STATUSES.map(([s]) => s), PROCESSING];
  const chips = Object.fromEntries(all.map(s => [s, resolve(statusLook(s).bg)]));
  for (const [s, c] of Object.entries(chips)) assert.match(c || "", /^#[0-9a-f]{6}$/, `${s}: its chip colour resolves (${statusLook(s).bg})`);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const d = apart(chips[all[i]], chips[all[j]]);
    assert.ok(d >= 15, `${all[i]} ${chips[all[i]]} and ${all[j]} ${chips[all[j]]} look too alike (${d.toFixed(1)})`);
  }
  assert.ok(apart(chips.paid, chips.shipped) >= 20, "Paid and Shipped: plainly two colours");
});
