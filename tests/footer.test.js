// Andy, 2026-11-18, showing the card form's own options (Bank, Klarna) and its card logos (Visa,
// Mastercard, Amex, UnionPay): "we also should add to the icons at the bottom". The footer's
// Accepted Payments row shows every way to pay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const footer = readFileSync(new URL("../src/components/Footer.jsx", import.meta.url), "utf8");

test("the footer's Accepted Payments row: cards, UnionPay, Klarna, Bank, Zelle, Venmo, Cash App", () => {
  const shown = [...footer.matchAll(/<svg [^\n]*?aria-label="([^"]+)"/g)].map(m => m[1]);
  for (const name of ["Visa", "Mastercard", "American Express", "Discover", "UnionPay", "Klarna", "Bank", "Zelle", "Venmo", "Cash App"]) {
    assert.ok(shown.includes(name), `${name} is in the row`);
  }
});

// Andy, 2026-11-20: on the Discover badge the orange dot sat on top of "VER" of "DISCOVER". The
// letters are laid out with Arial Bold's own widths (per 1000 of the font size) and every letter's
// box (its width, the capital height) is checked against the dot and against the badge's edges.
const ARIAL_BOLD = { D: 722, I: 278, S: 667, C: 722, O: 778, V: 667, E: 667, R: 722 };
const CAP = 0.716; // Arial's capital height, per 1 of the font size
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
function badgeGeometry(svg) {
  const [, , vw, vh] = attr(svg, "viewBox").split(/\s+/).map(Number);
  const letters = [];
  for (const [, tag, word] of svg.matchAll(/(<text [^>]*>)([^<]*)<\/text>/g)) {
    const x = Number(attr(tag, "x")), y = Number(attr(tag, "y")), fs = Number(attr(tag, "fontSize"));
    const ls = Number(attr(tag, "letterSpacing") || 0), anchor = attr(tag, "textAnchor") || "start";
    const adv = [...word].map(ch => { assert.ok(ARIAL_BOLD[ch], `width known for "${ch}"`); return ARIAL_BOLD[ch] / 1000 * fs; });
    const total = adv.reduce((s, a) => s + a + ls, 0);
    let at = anchor === "end" ? x - total : anchor === "middle" ? x - total / 2 : x;
    [...word].forEach((ch, i) => { letters.push({ ch, x1: at, x2: at + adv[i], y1: y - CAP * fs, y2: y }); at += adv[i] + ls; });
  }
  const dots = [...svg.matchAll(/<circle [^>]*>/g)].map(([tag]) => ({ cx: Number(attr(tag, "cx")), cy: Number(attr(tag, "cy")), r: Number(attr(tag, "r")) }));
  const hits = (l, d) => { const nx = Math.max(l.x1, Math.min(d.cx, l.x2)), ny = Math.max(l.y1, Math.min(d.cy, l.y2)); return (nx - d.cx) ** 2 + (ny - d.cy) ** 2 < d.r * d.r; };
  letters.sort((a, b) => a.x1 - b.x1);
  return {
    vw, vh, dots,
    word: letters.map(l => l.ch).join(""),
    covered: letters.filter(l => dots.some(d => hits(l, d))).map(l => l.ch).join(""),
    outside: letters.filter(l => l.x1 < 1 || l.x2 > vw - 1 || l.y1 < 1 || l.y2 > vh - 1).map(l => l.ch).join(""),
    dotsInside: dots.every(d => d.cx - d.r >= 1 && d.cx + d.r <= vw - 1 && d.cy - d.r >= 1 && d.cy + d.r <= vh - 1),
  };
}
const discoverOf = (code) => code.match(/<svg [^\n]*?aria-label="Discover"[^\n]*?<\/svg>/)?.[0];

test("the Discover badge: DISCOVER reads whole, the orange dot covers no letter, all inside the badge", () => {
  const svg = discoverOf(footer);
  assert.ok(svg, "the Discover badge is in the footer");
  const g = badgeGeometry(svg);
  assert.equal(g.dots.length, 1, "one orange dot");
  assert.equal(attr(svg.match(/<circle [^>]*>/)[0], "fill"), "#F76F20", "the dot is Discover's orange");
  assert.ok(g.word === "DISCOVER" || g.word === "DISCVER", `the letters spell DISCOVER (the dot may be its O): ${g.word}`);
  assert.equal(g.covered, "", "no letter under the dot");
  assert.equal(g.outside, "", "no letter past the badge's edge");
  assert.ok(g.dotsInside, "the dot inside the badge");
  // Where the dot is the O, it sits between C and V.
  if (g.word === "DISCVER") {
    const d = g.dots[0], ls = badgeGeometry(svg.replace(/<circle [^>]*>/, ""));
    assert.equal(ls.word, "DISCVER");
    const texts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join("|");
    assert.equal(texts, "DISC|VER", "DISC before the dot, VER after it");
    assert.ok(d.cx > 18 && d.cx < 30, `the dot is in the middle, where the O goes: cx ${d.cx}`);
  }
  // Control: the badge as it was (c3227df) fails this check, the dot on "OVER" and the R past the edge.
  const before = '<svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Discover"><rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/><text x="9" y="19" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#231F20" letterSpacing=".3">DISCOVER</text><circle cx="38" cy="15" r="8" fill="#F76F20"/></svg>';
  const old = badgeGeometry(before);
  assert.equal(old.covered, "OVER");
  assert.equal(old.outside, "R");
});

test("every payment badge is the same size: a 48 x 30 box", () => {
  const boxes = [...footer.matchAll(/<svg [^\n]*?aria-label="([^"]+)"/g)].map(m => [m[1], attr(m[0], "viewBox")]);
  assert.equal(boxes.length, 10, "ten badges");
  for (const [name, box] of boxes) assert.equal(box, "0 0 48 30", `${name}: ${box}`);
});
