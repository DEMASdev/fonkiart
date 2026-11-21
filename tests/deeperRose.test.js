// The 4 faint pink buttons get a deeper rose, so their words can be read. Same pink look, nothing
// else changes (the proposal approved 2026-11-21): "Shop Now" in the top bar and the "Collectors Club"
// heading take #9c3a76 words on the pink; every Admin pink button ("✉ Send Invoice", "+ Add Order"
// and the rest share one style) takes #b0528a under white words, #9c3a76 on hover. The "Join the
// Collectors Club" button is NOT part of it and keeps its pink.
// On the code before this change the first three tests fail (contrast 1.79, 1.83 and 2.52).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/index.css");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The body of a top-level rule in src/index.css, e.g. ".topbar-tag { ... }" (null if missing).
const rule = (sel) => (css.match(new RegExp(`(?:^|\\n)${esc(sel)} \\{([^}]*)\\}`)) || [])[1] ?? null;
// One property of such a rule: prop(".topbar-tag", "color") -> "#9c3a76". "color" never matches "border-color".
const prop = (sel, name) => {
  const body = rule(sel);
  assert.ok(body, `${sel} is in src/index.css`);
  return (body.match(new RegExp(`(?:^|[;{\\s])${esc(name)}:([^;]+)`)) || [])[1]?.trim() ?? null;
};
// A colour as the page paints it: var(--pink) -> the :root value; lower case, so #DF88B7 = #df88b7.
const resolve = (v) => {
  const name = /^var\((--[\w-]+)\)$/.exec(v)?.[1];
  const value = name ? (css.match(new RegExp(`${esc(name)}:(#[0-9a-fA-F]{6})\\b`)) || [])[1] : v;
  return value?.toLowerCase() ?? null;
};
// The readability score (WCAG contrast ratio) of two #rrggbb colours, to two decimals. 4.5 or more is easy to read.
const contrast = (a, b) => {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
// Every rule for a selector, the ones inside @media too: none of them may paint the words another colour.
const everyColour = (sel) => [...css.matchAll(new RegExp(`(?:^|[\\n,}])\\s*${esc(sel)}\\s*\\{([^}]*)\\}`, "g"))]
  .map(m => (m[1].match(/(?:^|[;{\s])color:([^;]+)/) || [])[1]?.trim()).filter(Boolean);
// The class of the <button> whose words include `label`, in a .jsx file.
const buttonClass = (code, label) => {
  const at = code.indexOf(label);
  assert.ok(at > 0, `${label} is there`);
  return /className="([^"]+)"/.exec(code.slice(code.lastIndexOf("<button", at), at))?.[1] ?? null;
};

test("the measuring stick: black on white is 21, a colour on itself is 1, and the old faint pinks read faint", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#9c3a76", "#9c3a76"), 1);
  assert.equal(contrast("#df88cc", "#ffcdf4"), 1.79, "the old \"Shop Now\"");
  assert.equal(contrast("#df88b7", "#ffcdf4"), 1.83, "the old \"Collectors Club\"");
  assert.equal(contrast("#ffffff", "#df88b7"), 2.52, "the old Admin buttons");
  assert.equal(resolve("var(--pink)"), "#ffcdf4");
  assert.equal(prop(".btn-s", "color"), "var(--muted)", "prop() reads a colour");
  assert.equal(prop(".collectors-input:focus", "color"), null, "prop() never takes border-color for color");
});

test("\"Shop Now\" in the top bar: #9c3a76 words on the same pink, contrast 4.66 (it was 1.79)", () => {
  assert.equal(prop(".topbar-tag", "color"), "#9c3a76");
  assert.equal(resolve(prop(".topbar-tag", "background")), "#ffcdf4", "the pink stays");
  assert.equal(contrast(resolve(prop(".topbar-tag", "color")), resolve(prop(".topbar-tag", "background"))), 4.66);
  assert.deepEqual(everyColour(".topbar-tag"), ["#9c3a76"], "no other rule paints it another colour");
});

test("the \"Collectors Club\" heading, computer and phone: #9c3a76 on the section's pink, contrast 4.66 (it was 1.83)", () => {
  assert.equal(prop(".collectors-badge", "color"), "#9c3a76");
  assert.equal(resolve(prop(".collectors-section", "background")), "#ffcdf4", "the pink stays");
  assert.equal(contrast(resolve(prop(".collectors-badge", "color")), resolve(prop(".collectors-section", "background"))), 4.66);
  assert.deepEqual(everyColour(".collectors-badge"), ["#9c3a76"], "the phone rule changes only the size");
});

test("every Admin pink button: #b0528a under white words, contrast 4.75 (it was 2.52); #9c3a76 on hover", () => {
  assert.match(css, /\n\.admin-wrap \.btn-p,\n\.admin-wrap \.btn-s \{/, "\"+ Add Order\" (btn-p) and \"✉ Send Invoice\" (btn-s) share the style");
  assert.match(css, /\n\.admin-wrap \.btn-p:hover,\n\.admin-wrap \.btn-s:hover \{/, "and the hover");
  assert.equal(prop(".admin-wrap .btn-s", "background"), "#b0528a");
  assert.equal(prop(".admin-wrap .btn-s", "color"), "#fff");
  assert.equal(prop(".admin-wrap .btn-s:hover", "background"), "#9c3a76");
  assert.equal(prop(".admin-wrap .btn-s:hover", "color"), "#fff");
  assert.equal(contrast("#ffffff", prop(".admin-wrap .btn-s", "background")), 4.75);
  assert.equal(contrast("#ffffff", prop(".admin-wrap .btn-s:hover", "background")), 6.4);
  const orders = read("src/admin/OrdersTab.jsx");
  assert.equal(buttonClass(orders, 'sendingInvoice?"Cancel":"✉ Send Invoice"'), "btn-s", "\"✉ Send Invoice\" is a btn-s");
  assert.equal(buttonClass(orders, 'adding?"Cancel":"+ Add Order"'), "btn-p", "\"+ Add Order\" is a btn-p");
  assert.match(read("src/admin/AdminPanel.jsx"), /className="admin-wrap"/, "and Admin sits inside .admin-wrap");
});

test("not part of it: the \"Join the Collectors Club\" button keeps its pink, and the pink tokens are unchanged", () => {
  assert.equal(prop(".collectors-submit", "background"), "var(--sidebar-bg)");
  assert.equal(prop(".collectors-submit:hover", "background"), "var(--label)");
  assert.deepEqual(["--label", "--pink", "--sidebar-bg"].map(t => resolve(`var(${t})`)), ["#df88cc", "#ffcdf4", "#df88b7"]);
});
