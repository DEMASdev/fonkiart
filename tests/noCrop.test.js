// The buyer's art is never cut. Andy, 2026-11-21, of a picture in the Cart: "you see this picture is
// cut ! , not a good thing". Everywhere a piece shows, it shows whole, at its own shape, on a plain
// ground: object-fit: contain in a fixed box (the box shows around a tall or a wide piece), or the
// picture at its natural size (width and height auto). Never object-fit: cover, which fills the box
// by cutting off whatever sticks out. The places: the Cart page and the cart drawer, the checkout's
// wall and its small pictures, the invoice page and the paid thank-you, the piece's own window and
// its small pictures under it, the Collectors Room (its grids and its window, on the room's dark),
// the Exclusive Collectors grid, and Admin's own lists and Orders.
// Checked in a browser with a fake TALL, WIDE and SQUARE piece in each place (the p6 pictures). Each
// test but the first and the controls fails on the shop before (8d85f29), where these were all cover
// and the shop's cards and the room's tiles zoomed on hover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/index.css").replace(/\/\*[\s\S]*?\*\//g, "");
// Every rule (inside @media too) whose selector list names `sel` exactly: its body.
function rules(sheet, sel) {
  const out = [];
  for (const [, sels, body] of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sels.split(",").map(s => s.trim().replace(/\s+/g, " ")).includes(sel)) out.push(body);
  }
  return out;
}

test("the rule finder itself: every rule naming the selector, inside @media too, and only that selector", () => {
  const sheet = ".a img { object-fit:cover; }\n@media (min-width:900px) {\n  .a img, .b { object-fit:contain; }\n}\n.a img.big { width:1px; }\n";
  assert.deepEqual(rules(sheet, ".a img").map(b => b.trim()), ["object-fit:cover;", "object-fit:contain;"]);
  assert.deepEqual(rules(sheet, ".b").length, 1);
  assert.deepEqual(rules(sheet, ".c"), []);
});

// In a fixed box: the box is set, and the picture is fitted whole inside it, on a plain ground.
const BOXED = {
  ".cart-page-item img": "the Cart page",
  ".cart-drawer-item img": "the cart drawer",
  ".checkout-item-thumb": "the checkout's small pictures",
  ".pay-art-pic": "the card form and the paid thank-you (PayArt, PaidThanks)",
  ".inv-strip-pic": "the invoice page on a phone",
  ".modal-img": "the piece's own window",
  ".modal-thumb img": "the small pictures under it",
  ".cr-modal-img": "the Collectors Room's window",
  ".order-art img": "Admin -> Orders",
  ".art-flip-side img": "the front and back of a piece (the flip)",
  ".admin-item img": "Admin's list of pieces",
  ".img-prev": "Admin's picture preview",
  ".card img": "the shop's grid",
};
test("every fixed picture box shows the whole piece: object-fit: contain, never cover", () => {
  for (const [sel, where] of Object.entries(BOXED)) {
    const found = rules(css, sel);
    assert.ok(found.length > 0, `${where} (${sel}): its rule is in src/index.css`);
    assert.ok(found.every(b => !/object-fit:\s*cover/.test(b)), `${where} (${sel}): never cover`);
    assert.ok(found.some(b => /object-fit:\s*contain/.test(b)), `${where} (${sel}): contain`);
  }
});

test("the plain ground around a tall or a wide piece: white, or the Collectors Room's own dark; Admin's on a neutral grey", () => {
  const ground = (sel) => rules(css, sel).map(b => (b.match(/background:([^;]+);/) || [])[1]).filter(Boolean);
  for (const sel of [".cart-page-item img", ".cart-drawer-item img", ".checkout-item-thumb", ".inv-strip-pic", ".modal-img", ".modal-thumb img"]) assert.deepEqual(ground(sel), ["#fff"], sel);
  assert.deepEqual(ground(".cr-modal-img"), ["#0a0908", "#0a0908"], "the Collectors Room's window, on its dark");
  assert.deepEqual(ground(".admin-item img"), ["#eeeeee"]);
  assert.deepEqual(ground(".img-prev"), ["#f4f4f4"]);
});

test("the pictures shown at their own size (the checkout's wall, the invoice page's art): width and height auto, held inside a most size", () => {
  for (const [sel, where] of [[".checkout-piece-pic", "the checkout's wall"], [".inv-side-pic img", "the invoice page's art"]]) {
    const [first] = rules(css, sel);
    assert.match(first || "", /width:auto;height:auto;max-width:100%;max-height:/, `${where}: its own shape, never cut`);
    assert.ok(rules(css, sel).every(b => !/object-fit:\s*cover/.test(b)), `${where}: never cover`);
  }
});

// The three collages, small pieces laid over each other: the home page's hero, the conversation
// page's header and the welcome window's gallery (its sign-in window too). Each tile is a slot the
// piece sits in, whole, at its own shape, centred; the frame and the shadow are the picture's own,
// so they hug the piece. Fitted into a fixed box with a ground of its own, a tall or a wide piece
// would show bars beside it instead, which is not wanted either. The test fails on the shop before
// (8cef3e0), where every one was cover in a box that cut it.
const COLLAGES = [
  ["src/index.css", ".hero-panel", "the home page's hero"],
  ["src/threads.css", ".rq-hero-tile", "the conversation page's header"],
  ["src/index.css", ".wg-item", "the welcome and sign-in windows' gallery"],
];
const sheetOf = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, "");
test("the collages (the home hero, the conversation header, the welcome gallery): every piece whole, at its own shape, its frame hugging it: no bars, nothing cut", () => {
  for (const [file, slot, where] of COLLAGES) {
    const pics = rules(sheetOf(file), `${slot} img`);
    assert.ok(pics.length > 0, `${where} (${slot} img): its rule is in ${file}`);
    assert.ok(pics.every(b => !/object-fit:\s*cover/.test(b)), `${where}: never cover`);
    assert.match(pics[0], /position:absolute;top:0;right:0;bottom:0;left:0;margin:auto;width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;/, `${where}: whole, its own shape, centred in its slot`);
    assert.match(pics[0], /box-shadow:/, `${where}: the shadow is the picture's own`);
    const slots = rules(sheetOf(file), slot);
    assert.ok(slots.length > 0, `${where} (${slot}): its rule`);
    for (const body of slots) assert.doesNotMatch(body, /overflow:\s*hidden|background|border|box-shadow/, `${where}: the slot has no clip, ground or frame of its own, which would show as bars`);
  }
});
test("control: the collage check sees the shop before, where each was cut", () => {
  const before = ".hero-panel { position:absolute;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.35); }\n.hero-panel img { width:100%;height:100%;object-fit:cover;display:block; }\n";
  assert.ok(rules(before, ".hero-panel img").some(b => /object-fit:\s*cover/.test(b)), "the cover is seen");
  assert.match(rules(before, ".hero-panel")[0], /overflow:\s*hidden|box-shadow/, "the slot's own clip and frame are seen");
  assert.doesNotMatch(rules(before, ".hero-panel img")[0], /max-width:100%;max-height:100%;object-fit:contain;/);
});

// The pages whose picture boxes sit in their code.
const PAGES = {
  "src/pages/CollectorsRoomPage.jsx": 2,   // its two grids (the collection, early access)
  "src/pages/ExclusiveCollectorsPage.jsx": 1, // its grid
  "src/admin/ItemForm.jsx": 2,             // a piece's photos in Admin, and the big preview
  "src/pages/CartPage.jsx": 0, "src/components/FloatingCart.jsx": 0, "src/components/CheckoutModal.jsx": 0,
  "src/components/CardCheckout.jsx": 0, "src/components/PaidThanks.jsx": 0, "src/pages/InvoicePage.jsx": 0,
};
test("in the code: the Collectors Room's grids, the Exclusive Collectors grid and Admin's photos fit the whole piece (contain); nothing anywhere on these pages is cover", () => {
  for (const [file, boxes] of Object.entries(PAGES)) {
    const code = read(file);
    assert.doesNotMatch(code, /objectFit:\s*["']cover["']|object-fit:\s*cover/, `${file}: never cover`);
    assert.equal((code.match(/objectFit:\s*["']contain["']/g) || []).length, boxes, `${file}: ${boxes} picture box(es), each contain`);
  }
  const room = read("src/pages/CollectorsRoomPage.jsx");
  assert.equal((room.match(/aspectRatio:"4\/3", overflow:"hidden", background:"#0a0908" \}\}>/g) || []).length, 2, "the room's tiles: on its own dark");
  assert.match(read("src/pages/ExclusiveCollectorsPage.jsx"), /aspectRatio:"1", overflow:"hidden", background:"#f4f4f4" \}\}>/, "the Exclusive tiles: on a neutral grey");
  assert.match(read("src/admin/ItemForm.jsx"), /objectFit:"contain",background:"#f4f4f4",border:"2px solid var\(--border\)"/, "Admin's photo tiles: on a neutral grey");
});

// A zoom on hover grows the picture inside a box that hides what spills over: the piece's edges are
// cut for as long as the pointer is on it. The shop's cards and the Collectors Room's tiles lift
// instead (a small rise and a soft shadow), and the whole piece always shows.
const zooms = (sheet) => [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, sels, body]) => /:hover/.test(sels) && /\bimg\b|-pic\b/.test(sels) && /\bscale\(/.test(body)).map(([, sels]) => sels.trim());
test("no zoom on the art on hover: the shop's cards and the Collectors Room's tiles lift instead, so the piece is never cut", () => {
  assert.deepEqual(zooms(css), [], "no picture grows on hover");
  assert.match(rules(css, ".card:hover")[0] || "", /transform:translateY\(-3px\);/, "the shop's card lifts");
  assert.ok(rules(css, ".card img").every(b => !/transition:transform/.test(b)), "its picture does not move");
  for (const file of Object.keys(PAGES).concat(["src/pages/CatalogPage.jsx", "src/pages/NewCollectionsPage.jsx", "src/pages/SpecialsPage.jsx", "src/pages/SoldPage.jsx"])) {
    assert.doesNotMatch(read(file), /\bscale\(/, `${file}: no zoom`);
  }
  assert.match(read("src/pages/CollectorsRoomPage.jsx"), /mouseHover\(\{ borderColor:CR\.gold, transform:"translateY\(-3px\)", boxShadow:"0 10px 26px rgba\(0,0,0,\.5\)" \}/, "the room's tile lifts");
});

test("controls: the checks see a cover", () => {
  assert.deepEqual(zooms(".card:hover img { transform:scale(1.04); }\n.x:hover { transform:scale(1.1); }\n.y img { filter:grayscale(30%); }"), [".card:hover img"], "a picture that grows on hover is seen; a button or a grey filter is not");
  assert.match('style={{ objectFit:"cover" }}', /objectFit:\s*["']cover["']/);
  assert.ok(rules(".x img { width:1px;object-fit:cover; }", ".x img").some(b => /object-fit:\s*cover/.test(b)));
});
