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

// Group 5: the pages no earlier group reached.
test("the collectors' rooms, Contact and the error page: no inline font size under 16px", () => {
  for (const f of ["pages/CollectorsRoomPage", "pages/ExclusiveCollectorsPage", "pages/ContactPage", "components/ErrorBoundary"]) {
    assert.deepEqual(smallSizes(read(`src/${f}.jsx`)), [], `src/${f}.jsx: font sizes under 16px`);
  }
});

test("About, Children, Partners, Auctions, Special Orders and Contact: their text rules are 16px or more", () => {
  for (const sel of [".placeholder-body p", ".contact-info p", ".contact-detail"]) {
    const r = rule(sel);
    assert.ok(r, `${sel} is in src/index.css`);
    const px = Number((r.match(/font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
    assert.ok(px >= 16, `${sel}: ${px}px`);
  }
  assert.match(css, /\.contact-form-box \.fld label,[^{]*\.placeholder-body \.btn-p \{ font-size:16px; \}/, "Contact's form and the story pages' buttons at 16px");
});

test("the collectors' rooms show money in Cormorant Garamond 600 with lining figures", () => {
  for (const f of ["CollectorsRoomPage", "ExclusiveCollectorsPage"]) {
    const code = read(`src/pages/${f}.jsx`);
    const prices = code.split("\n").filter(l => /toLocaleString\(\)/.test(l) && /\$\$?\{|\$\{Number/.test(l));
    assert.ok(prices.length > 0, `${f}: its prices are found`);
    for (const l of prices) assert.match(l, /fontFamily:"'Cormorant Garamond',serif", fontSize:\d+, fontWeight:600, fontVariantNumeric:"lining-nums"/, `${f}: ${l.trim().slice(0, 90)}`);
  }
});

// Andy, 2026-11-18: "the ticker text at the top is 30% too big". Shown 16 / 14 / 11px side by side, he
// picked "ticker 2ao" = 11px: his own exception to the 16px floor. Pinned so a later floor sweep
// doesn't raise it again.
test("the ticker at the top stays at 11px (Andy's pick, 11-18)", () => {
  const r = rule(".marquee-item");
  assert.ok(r, ".marquee-item is in src/index.css");
  assert.match(r, /font-size:11px;/, ".marquee-item: 11px");
  assert.match(r, /letter-spacing:\.14em;/, ".marquee-item: the spacing he saw in the picture");
});
