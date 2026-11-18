// The admin's little art card (src/admin/ArtFlipper.jsx). Andy, 2026-11-17: "at the top
// of the admin it says Fonkiart · Admin Panel — to the left a picture of any art should be
// appearing every 20 seconds flipping". These check how the next picture is chosen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { artPictures, nextPick } from "../src/lib/artFlip.js";

// The same "random" numbers every run, so a failure can be repeated.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws `n` pictures the way the card does: each one avoids the one facing out, and
// with nothing to turn to (null) the card keeps showing what it had.
function draws(pool, n, random) {
  const out = [];
  let bag = [], showing = null;
  for (let i = 0; i < n; i++) {
    const r = nextPick(bag, pool, showing, random);
    bag = r.bag;
    out.push(r.pick);
    if (r.pick) showing = r.pick;
  }
  return out;
}

test("only artworks with a picture, the main picture, each once", () => {
  const items = [
    { id: 1, image: "a.jpg", images: ["a.jpg", "a-back.jpg"] },
    { id: 2, image: "", images: [] },
    { id: 3 },
    { id: 4, image: "", images: ["", "d.jpg"] },
    { id: 5, image: "a.jpg" },
    { id: 6, image: "   " },
    { id: 7, image: null, images: null },
    null,
    { id: 8, image: "e.jpg", isSold: true },
  ];
  assert.deepEqual(artPictures(items), ["a.jpg", "d.jpg", "e.jpg"]);
  assert.deepEqual(artPictures([]), []);
  assert.deepEqual(artPictures(undefined), []);
});

test("no pictures: nothing to pick", () => {
  assert.deepEqual(nextPick([], []), { pick: null, bag: [] });
});

test("one picture: it shows, then there is nothing else to turn to", () => {
  assert.equal(nextPick([], ["a"]).pick, "a");
  assert.equal(nextPick([], ["a"], "a").pick, null);
});

test("never the same picture twice in a row", () => {
  for (let size = 2; size <= 7; size++) {
    const pool = Array.from({ length: size }, (_, i) => `art-${i}.jpg`);
    const seq = draws(pool, 3000, seeded(size));
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `size ${size}, draw ${i}`);
  }
  // Control: without being told what is showing, rounds can start with the last picture
  // again. If this stopped finding repeats, the check above would prove nothing.
  let bag = [], last = null, repeats = 0;
  const random = seeded(2);
  for (let i = 0; i < 3000; i++) {
    const r = nextPick(bag, ["a", "b"], null, random);
    bag = r.bag;
    if (r.pick === last) repeats++;
    last = r.pick;
  }
  assert.ok(repeats > 100, `control found only ${repeats} repeats`);
});

test("every picture once before any comes back, round after round", () => {
  for (let size = 1; size <= 7; size++) {
    const pool = Array.from({ length: size }, (_, i) => `art-${i}.jpg`);
    if (size === 1) { assert.deepEqual(draws(pool, 3, seeded(9)), ["art-0.jpg", null, null]); continue; }
    const seq = draws(pool, size * 40, seeded(100 + size));
    for (let r = 0; r < 40; r++) {
      assert.deepEqual([...seq.slice(r * size, (r + 1) * size)].sort(), [...pool].sort(), `size ${size}, round ${r}`);
    }
  }
});

test("the order really is random: rounds differ", () => {
  const pool = ["a", "b", "c", "d", "e"];
  const seq = draws(pool, 5 * 30, seeded(7));
  const rounds = new Set(Array.from({ length: 30 }, (_, r) => seq.slice(r * 5, (r + 1) * 5).join()));
  assert.ok(rounds.size > 10, `only ${rounds.size} different orders in 30 rounds`);
  assert.ok(new Set(Array.from({ length: 30 }, (_, r) => seq[r * 5])).size > 1, "every round starts the same");
});

test("a deleted artwork is never picked again; a new one joins the next round", () => {
  const random = seeded(3);
  let pool = ["a", "b", "c", "d"];
  let { pick, bag } = nextPick([], pool, null, random);
  let showing = pick;
  pool = pool.filter(p => p !== bag[0]).concat("new");
  const gone = ["a", "b", "c", "d"].find(p => !pool.includes(p));
  const seen = [];
  for (let i = 0; i < 12; i++) {
    ({ pick, bag } = nextPick(bag, pool, showing, random));
    seen.push(pick);
    showing = pick;
  }
  assert.ok(!seen.includes(gone), `deleted ${gone} came back: ${seen}`);
  assert.ok(seen.slice(0, 8).includes("new"), `the new picture did not show in two rounds: ${seen}`);
});

test("the picture facing out is skipped even if it starts a new round", () => {
  // The round is used up and the new shuffle puts the picture showing first: it moves.
  for (let s = 0; s < 200; s++) {
    const r = nextPick([], ["a", "b", "c"], "a", seeded(s));
    assert.notEqual(r.pick, "a");
    assert.equal(r.bag.length, 2);
    assert.deepEqual([r.pick, ...r.bag].sort(), ["a", "b", "c"]);
  }
});

test("works with the browser's own Math.random", () => {
  const seq = draws(["a", "b", "c"], 30);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
});
