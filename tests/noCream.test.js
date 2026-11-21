// No cream or sand on the shop (Andy, 2026-11-21: "i do not like the sand , creme colors !! do not
// use any of those colors"). A warm off-white is a colour whose every channel is 0xd8 or more, red
// at least green at least blue, and red at least 4 above blue: #fdfcf8, #fffdf8, #faf6ee, #f8f4ed,
// #fbf3e1, #e8e2d9... None may be used in src/index.css or src/threads.css, as a background, a tint
// or a highlight. The one exception is Admin's own status colours, kept on purpose (each says
// something: confirmed, needs an address, a note), named here by their rule. White, neutral greys
// (#f4f4f4, #eeeeee) and the site's pink (#ffcdf4 and its pale tints #fff0fb, #fff7fd) are not warm.
// A see-through colour is judged as it shows on white: a fill (a background) of rgba(201,169,110,.05)
// shows as #fcfbf8, a cream; a line or a ring (a border, a shadow, the gold focus ring) is an accent,
// not a fill. The checkout's, the cart's and the Collectors' pages are scanned too (their colours sit
// in the code), with the invoice page's two status boxes kept until Andy answers.
// The scan fails on the files before (8d85f29), which had seventeen; its controls pass on both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// A colour's red, green and blue (null if it is not one).
function channels(token) {
  const t = token.toLowerCase();
  if (t.startsWith("#")) {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map(c => c + c).join("");
    else if (h.length === 6 || h.length === 8) h = h.slice(0, 6);
    else return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  const m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
}
// How see-through a colour is: 1 is solid.
function alpha(token) {
  const t = token.toLowerCase();
  if (t.startsWith("#")) {
    const h = t.slice(1);
    return h.length === 8 ? parseInt(h.slice(6), 16) / 255 : h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
  }
  const m = t.match(/^rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)(%?)\s*\)/);
  return m ? Number(m[1]) / (m[2] ? 100 : 1) : 1;
}
// A colour as it shows on white.
const onWhite = (token) => {
  const c = channels(token), a = alpha(token);
  return c && `rgb(${c.map(v => Math.round(255 - a * (255 - v))).join(",")})`;
};
const warm = (token) => {
  const c = channels(token);
  return !!c && Math.min(...c) >= 0xd8 && c[0] >= c[1] && c[1] >= c[2] && c[0] - c[2] >= 4;
};
// Every colour used in a stylesheet, with the rule and the property it is in (comments are not CSS).
const TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
function colours(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  for (const [, sel, body] of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const decl of body.split(";")) {
      const prop = decl.slice(0, decl.indexOf(":")).trim().toLowerCase();
      for (const [token] of decl.matchAll(TOKEN)) out.push({ sel: sel.trim().replace(/\s+/g, " "), prop, colour: token.toLowerCase() });
    }
  }
  return out;
}
// Cream or sand: a warm colour anywhere, or a see-through one that shows warm as a fill.
const cream = (f) => warm(f.colour) || (/^background(-color|-image)?$/.test(f.prop) && warm(onWhite(f.colour)));
// Admin's status colours, kept on purpose: the rule and its colour.
const ADMIN = new Set([
  '.orders-tab .o-pill[data-status="confirmed"] #fff8ec', // a confirmed order's pill
  ".orders-tab .order-flag #fff1e6",                       // "needs a shipping address"
  ".orders-tab .o-btn-add:hover #fff1e6",                  // ...and its Add button
  ".ship-dlg-field.is-needed input #fffaf5",               // the address field still to fill
  ".warn-msg #fff8f0",                                     // a warning note
]);

test("the scan's own controls: it sees cream and sand, and not white, grey or the site's pink", () => {
  assert.equal(onWhite("rgba(201,169,110,.05)"), "rgb(252,251,248)", "a faint gold, as it shows on white");
  assert.equal(onWhite("#000000ff"), "rgb(0,0,0)");
  const tints = colours(".t td { background:rgba(201,169,110,.05); }\n.f:focus { border-color:var(--gold);box-shadow:0 0 0 3px rgba(184,146,63,.2); }\n.g { background:rgba(0,0,0,.05); }\n.h { background:linear-gradient(transparent,rgba(10,8,6,.78)); }");
  assert.deepEqual(tints.filter(cream).map(f => `${f.sel} ${f.prop}`), [".t td background"], "a see-through cream fill is seen; a gold ring, a grey and a dark shade are not");
  for (const c of ["#fbf3e1", "#fffdf8", "#fdfcf8", "#faf6ee", "#f8f4ed", "#e8e2d9", "#fffbf5", "#FFFDF8", "rgb(253,252,248)"]) assert.equal(warm(c), true, `${c} is warm`);
  for (const c of ["#fff", "#ffffff", "#f4f4f4", "#eeeeee", "#ffcdf4", "#fff0fb", "#fff7fd", "#e8c97a", "rgba(184,146,63,.4)", "#6b6b6b"]) assert.equal(warm(c), false, `${c} is not`);
  const found = colours("/* a note: #fbf3e1 */\n.a { color:#fff; }\n@media (min-width:900px) {\n  .b .c { background:#fffdf8; }\n}\n");
  assert.deepEqual(found, [{ sel: ".a", prop: "color", colour: "#fff" }, { sel: ".b .c", prop: "background", colour: "#fffdf8" }], "every rule, inside @media too; never a comment");
  assert.deepEqual(found.filter(f => warm(f.colour)).map(f => f.colour), ["#fffdf8"], "the warm one is found");
});

test("no cream or sand in src/index.css or src/threads.css, but for Admin's own status colours", () => {
  for (const file of ["src/index.css", "src/threads.css"]) {
    const all = colours(read(file));
    assert.ok(all.length > (file.endsWith("index.css") ? 250 : 12), `${file}: the scan reads its colours (${all.length})`);
    const found = all.filter(f => cream(f) && !ADMIN.has(`${f.sel} ${f.colour}`)).map(f => `${f.sel} { ${f.prop}: ${f.colour} }`);
    assert.deepEqual(found, [], `${file}: cream or sand`);
  }
});

// The pages whose colours sit in their code: the checkout and its rows, the cart, the Collectors
// Room and the Exclusive Collectors page. The invoice page keeps its two status boxes (#fff8ec)
// until Andy answers; anything more there fails.
const PAGES = {
  "src/components/CheckoutModal.jsx": [], "src/components/CardCheckout.jsx": [], "src/components/PaidThanks.jsx": [],
  "src/components/PayRows.jsx": [], "src/components/PayMarks.jsx": [], "src/components/FloatingCart.jsx": [], "src/pages/CartPage.jsx": [],
  "src/pages/CollectorsRoomPage.jsx": [], "src/pages/ExclusiveCollectorsPage.jsx": [],
  "src/pages/InvoicePage.jsx": ["#fff8ec", "#fff8ec"],
};
test("no cream or sand in the checkout, the cart, the Collectors Room or the Exclusive Collectors page (their colours are in the code)", () => {
  let read_ = 0;
  for (const [file, kept] of Object.entries(PAGES)) {
    const tokens = [...read(file).matchAll(TOKEN)].map(m => m[0].toLowerCase());
    read_ += tokens.length;
    assert.deepEqual(tokens.filter(t => warm(t) || warm(onWhite(t))), kept, `${file}: cream or sand`);
  }
  assert.ok(read_ > 60, `the scan reads the pages' colours (${read_})`);
});
