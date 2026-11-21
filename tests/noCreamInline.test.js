// No sand or cream colour written straight into these 7 files (Andy, 2026-11-21: "i do not like the
// sand , creme colors !! do not use any of those colors"). They held the picture placeholders' warm
// gradient, the home page's quick-link hover, the steps a buyer's order hasn't reached yet, the
// Admin task rows and the open row in Clients; each now takes a plain grey or white. The CSS files
// and the status tints waiting on Andy are not part of this.
// Sand or cream here means light and warm: once a see-through colour is laid over white, every
// channel is 0xc0 or more, red >= green >= blue, and red is at least 4 above blue.
// On the code before this change the second test fails and names all 13 colours, on 9 lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const FILES = [
  "src/components/WelcomeModal.jsx",
  "src/components/AuthModal.jsx",
  "src/pages/HomePage.jsx",
  "src/pages/CollectionsPage.jsx",
  "src/pages/BuyerDashboard.jsx",
  "src/admin/AdminTasksWidget.jsx",
  "src/admin/ClientsTab.jsx",
];

// A see-through colour as it shows on white: alpha 0 is white, alpha 1 the colour itself.
const overWhite = (rgb, alpha) => rgb.map((c) => alpha * c + (1 - alpha) * 255);

// Every #hex and rgb()/rgba() colour in some text, as { line, text, rgb } with rgb laid over white.
// "&#8212;" (a character written as a code) is not a colour; one built in code, rgba(${r},...), can't be read.
function colours(source) {
  const found = [];
  source.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/(?<![&\w])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)) {
      const hex = m[1].length <= 4 ? [...m[1]].map((d) => d + d).join("") : m[1];
      const [r, g, b, a = 255] = hex.match(/../g).map((x) => parseInt(x, 16));
      found.push({ line: i + 1, text: m[0], rgb: overWhite([r, g, b], a / 255) });
    }
    for (const m of text.matchAll(/rgba?\(([^()]*)\)/gi)) {
      const parts = m[1].trim().split(/\s*[,/]\s*|\s+/);
      const nums = parts.map((p, k) => (p.endsWith("%") ? parseFloat(p) * (k < 3 ? 2.55 : 0.01) : Number(p)));
      if (nums.length < 3 || nums.length > 4 || !nums.every(Number.isFinite)) continue;
      const [r, g, b, a = 1] = nums;
      found.push({ line: i + 1, text: m[0], rgb: overWhite([r, g, b], Math.min(1, Math.max(0, a))) });
    }
  });
  return found;
}

const sand = ([r, g, b]) => r >= 0xc0 && g >= 0xc0 && b >= 0xc0 && r >= g && g >= b && r - b >= 4;

test("the check: it catches sand and cream however the colour is written, see-through ones over white, and nothing else", () => {
  const warm = [
    'background:"#fdfcf8"',
    'background:"linear-gradient(135deg,#e8e2d9,#ffffff)"',
    'background:"rgba(201,169,110,.05)"',
    'color:"#fed"',
    'background:"#e8e2d980"',
    'background:"rgb(253 252 248)"',
    'background:"rgb(100%, 98%, 95%)"',
  ].join("\n");
  assert.deepEqual(colours(warm).filter((c) => sand(c.rgb)).map((c) => c.text),
    ["#fdfcf8", "#e8e2d9", "rgba(201,169,110,.05)", "#fed", "#e8e2d980", "rgb(253 252 248)", "rgb(100%, 98%, 95%)"]);

  const notWarm = [
    'background:"#ffffff"', 'background:"#fff"', 'background:"#fafafa"', 'background:"#f7f7f7"',
    'background:"linear-gradient(135deg,#eeeeee,#dddddd)"', // the new placeholder
    'background:"#f5f9f5"', // Admin's done row: a green, and it stays
    'color:"#c9a96e"', // the gold itself: too dark to be cream
    'boxShadow:"0 2px 8px rgba(0,0,0,.4)"',
    "<span>&#8212;</span>", // a dash written as a code
    "background:`rgba(${r},${g},${b},.1)`", // a colour built in code
  ].join("\n");
  assert.equal(colours(notWarm).length, 9, "every real colour in the sample is read");
  assert.deepEqual(colours(notWarm).filter((c) => sand(c.rgb)), []);
});

test("no sand or cream colour is written straight into these 7 files", () => {
  const read7 = FILES.map((f) => [f, colours(read(f))]);
  assert.ok(read7.some(([, found]) => found.length > 0), "colours are read in these files, else this check is blind");
  const spots = read7.flatMap(([f, found]) => found.filter((c) => sand(c.rgb)).map((c) => `${f}:${c.line} ${c.text}`));
  assert.deepEqual(spots, []);
});
