// Andy, 2026-11-17: nothing under 16px (some readers can't see small text), and money in Cormorant
// Garamond 600 with lining figures. Group 4 (the admin, except Orders, which has its own redesign).
// Each test fails on the code before it: AdminPage's 12px links, the pop-up's price at weight 400.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/index.css");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The body of a top-level rule in src/index.css, e.g. ".modal-price { ... }" (null if missing).
const rule = (sel) => (css.match(new RegExp(`(?:^|\\n)${esc(sel)} \\{([^}]*)\\}`)) || [])[1] ?? null;
// Every inline fontSize in a .jsx file that is under 16px.
const smallSizes = (code) => [...code.matchAll(/fontSize:\s*"?(\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(n => n < 16);

test("the artwork pop-up's price and the cart drawer's price: Cormorant Garamond 600, lining figures", () => {
  for (const sel of [".modal-price", ".cart-drawer-price"]) {
    const r = rule(sel);
    assert.ok(r, `${sel} is in src/index.css`);
    assert.match(r, /font-family:'Cormorant Garamond'/, `${sel}: Cormorant Garamond`);
    assert.match(r, /font-weight:600/, `${sel}: weight 600`);
    assert.match(r, /font-variant-numeric:lining-nums/, `${sel}: lining figures`);
  }
  const modal = read("src/components/ArtworkModal.jsx");
  assert.match(modal, /line-through/, "the crossed-out price is still there");
  assert.match(modal, /fontFamily:"'Cormorant Garamond',serif",fontSize:23,fontWeight:600,fontVariantNumeric:"lining-nums",color:"var\(--muted\)",textDecoration:"line-through"/, "the crossed-out price: Cormorant 600, lining figures too");
});

test("the admin (not Orders): no inline font size under 16px", () => {
  assert.deepEqual(smallSizes('style={{ fontSize:12, x:1 }} style={{fontSize: "13px"}} style={{ fontSize:16 }}'), [12, 13], "the scan itself sees 12px and 13px");
  for (const f of ["AdminPage", "AdminPanel", "AdminTasksWidget", "ClientsTab", "DashboardTab", "ItemForm", "ItemList", "LeadsTab", "RequestsTab", "SettingsForm"]) {
    assert.deepEqual(smallSizes(read(`src/admin/${f}.jsx`)), [], `src/admin/${f}.jsx: font sizes under 16px`);
  }
});
