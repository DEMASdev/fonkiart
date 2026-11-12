import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sizedImage, IMAGE_SIZES } from "../src/lib/img.js";

// Pictures are sent to phones through Vercel's resizer, so a 7 MB original is not
// downloaded to fill a 137px card. Andy, 2026-11-12: "they take ages to load".
const BASE = "https://aynesillxtejdvxucxdr.supabase.co";
const ART = `${BASE}/storage/v1/object/public/artworks/a b.jpg`;
const LIVE = { PROD: true, VITE_SUPABASE_URL: BASE };

test("live site: a Supabase picture goes through the resizer, at an allowed width", () => {
  assert.equal(sizedImage(ART, 640, 75, LIVE), `/_vercel/image?url=${encodeURIComponent(ART)}&w=640&q=75`);
  assert.equal(sizedImage(ART, 137, 75, LIVE), `/_vercel/image?url=${encodeURIComponent(ART)}&w=320&q=75`);
  assert.equal(sizedImage(ART, 700, 80, LIVE), `/_vercel/image?url=${encodeURIComponent(ART)}&w=1080&q=80`);
  assert.equal(sizedImage(ART, 9999, 75, LIVE), `/_vercel/image?url=${encodeURIComponent(ART)}&w=1600&q=75`);
});

test("a trailing slash on the Supabase address still matches", () => {
  assert.match(sizedImage(ART, 640, 75, { PROD: true, VITE_SUPABASE_URL: `${BASE}/` }), /^\/_vercel\/image\?/);
});

test("left alone: local dev, other hosts, uploads in progress, empty", () => {
  assert.equal(sizedImage(ART, 640, 75, { PROD: false, VITE_SUPABASE_URL: BASE }), ART);
  assert.equal(sizedImage(ART, 640, 75, { PROD: true }), ART);
  assert.equal(sizedImage("https://example.com/x.jpg", 640, 75, LIVE), "https://example.com/x.jpg");
  assert.equal(sizedImage(`${BASE}/storage/v1/object/sign/artworks/x.jpg`, 640, 75, LIVE), `${BASE}/storage/v1/object/sign/artworks/x.jpg`);
  assert.equal(sizedImage("blob:https://fonkiart.com/123", 640, 75, LIVE), "blob:https://fonkiart.com/123");
  assert.equal(sizedImage("data:image/png;base64,AAAA", 640, 75, LIVE), "data:image/png;base64,AAAA");
  assert.equal(sizedImage("", 640, 75, LIVE), "");
  assert.equal(sizedImage(null, 640, 75, LIVE), null);
});

test("the widths match vercel.json — any other width is refused by Vercel", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(IMAGE_SIZES, cfg.images.sizes);
  assert.ok(cfg.images.remotePatterns.some(p => p.hostname === new URL(BASE).hostname));
});
