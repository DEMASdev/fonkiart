import { useEffect, useMemo, useRef, useState } from "react";
import { sizedImage } from "../lib/img";
import { artPictures, nextPick } from "../lib/artFlip";

// The small picture to the left of "Fonkiart · Admin Panel". Andy, 2026-11-17: "at the
// top of the admin it says Fonkiart · Admin Panel — to the left a picture of any art
// should be appearing every 20 seconds flipping".
// - The pictures are the shop's own artworks (`items`, the list App has already loaded,
//   the main picture of each). No extra server call.
// - Every `interval` ms the card turns over to another artwork: random, never the same
//   one twice in a row, and every picture before any comes back (src/lib/artFlip.js).
// - The next picture is downloaded and decoded on the hidden back of the card BEFORE the
//   turn, so a turn never shows a blank or half-drawn picture. If it is late, the turn waits.
// - The clock stops while the tab is hidden and goes on where it was when it comes back.
// - With "reduce motion" turned on, the pictures fade instead (src/index.css).
// - Its box has a fixed size, so the title beside it never moves.
const FLIP_MS = 700;   // one turn; the CSS reads it from --flip-ms
const THUMB_W = 160;   // the resizer's smallest copy (320 px wide): sharp at 48 px on a 3x screen

export default function ArtFlipper({ items, interval = 20000 }) {
  const pictures = useMemo(() => artPictures(items), [items]);
  if (pictures.length === 0) return null; // no artwork has a picture: nothing, the title stays put
  return <FlipCard pictures={pictures} interval={interval} />;
}

// Resolves with the address that worked, once the picture is downloaded and decoded:
// the small copy first, the original if the small copy can't be had (the same as Pic).
function preload(src) {
  const small = sizedImage(src, THUMB_W);
  return loadImage(small).catch(err => (small !== src ? loadImage(src) : Promise.reject(err)));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // A picture can load and still fail decode() in some browsers; loaded is enough then.
      Promise.resolve(img.decode?.()).catch(() => {}).then(() => resolve(url));
    };
    img.onerror = () => reject(new Error(`picture did not load: ${url}`));
    img.src = url;
  });
}

function FlipCard({ pictures, interval }) {
  // What is drawn: the loaded picture on each side of the card, and how many half turns
  // the card has made (even: side 0 faces out). Only the clock below changes it.
  const [view, setView] = useState({ sides: [null, null], turns: 0, empty: false });
  const live = useRef({ pictures, interval });
  useEffect(() => { live.current = { pictures, interval }; }, [pictures, interval]);

  useEffect(() => {
    let alive = true;
    const sides = [null, null];   // the address each side shows (small copy or original)
    const held = [null, null];    // the artwork picture each side holds (its stored address)
    const broken = new Set();     // pictures that would not load: skipped from now on
    let turns = 0, bag = [];
    let ready = false;            // the back holds the next picture, fully loaded
    let busy = false;             // a picture is loading
    let due = false;              // time to turn, but the next picture is not ready yet
    let clock = 0, settle = 0, started = 0, left = 0;

    const front = () => turns % 2;
    const back = () => 1 - front();
    const hidden = () => document.visibilityState === "hidden";
    const draw = () => setView({ sides: [...sides], turns, empty: false });

    // Loads the next picture onto `side`. A picture that will not load is skipped.
    async function load(side) {
      busy = true;
      try {
        for (;;) {
          const pool = live.current.pictures.filter(p => !broken.has(p));
          const next = nextPick(bag, pool, side === front() ? null : held[front()]);
          bag = next.bag;
          if (!next.pick) return false;
          try {
            const url = await preload(next.pick);
            if (!alive) return false;
            sides[side] = url;
            held[side] = next.pick;
            return true;
          } catch {
            if (!alive) return false;
            broken.add(next.pick);
          }
        }
      } finally {
        busy = false;
      }
    }

    // The first picture goes straight onto the front, then the next one behind it.
    async function start() {
      if (busy) return;
      if (await load(front())) { draw(); prepare(); }
      else if (alive) setView(v => (v.empty ? v : { ...v, empty: true })); // none would load
    }

    // Puts the next picture on the back (out of sight), then turns if it is already time.
    async function prepare() {
      if (busy || !(await load(back()))) return; // a single picture: nothing to turn to
      ready = true;
      draw();
      if (due && !hidden()) turn();
    }

    function turn() {
      due = false;
      ready = false;
      turns += 1;
      draw();
      clearTimeout(settle);
      settle = setTimeout(prepare, FLIP_MS + 100); // once the turn is over
      run(live.current.interval);
    }

    function tick() {
      clock = 0;
      if (!held[front()]) start(); // nothing showing yet: try again
      else if (ready && live.current.pictures.includes(held[back()])) { turn(); return; }
      else { ready = false; due = true; prepare(); } // turns the moment the next one is loaded
      run(live.current.interval);
    }

    // The clock only runs while the tab is visible; hidden, it keeps the time it had left.
    function run(ms) {
      clearTimeout(clock);
      clock = 0;
      left = ms;
      if (hidden()) return;
      started = Date.now();
      clock = setTimeout(tick, ms);
    }

    function onVisibility() {
      if (hidden()) {
        if (!clock) return;
        clearTimeout(clock);
        clock = 0;
        left = Math.max(0, left - (Date.now() - started));
      } else if (due && ready) {
        turn();
      } else if (!clock) {
        started = Date.now();
        clock = setTimeout(tick, left);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    start();
    run(live.current.interval);
    return () => {
      alive = false;
      clearTimeout(clock);
      clearTimeout(settle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (view.empty) return null;
  const front = view.turns % 2;
  // Until the first picture is loaded the box keeps its place but stays invisible.
  return (
    <span className="art-flip" aria-hidden="true" data-empty={view.sides[front] ? undefined : ""}>
      <span className="art-flip-card" style={{ "--turn": view.turns, "--flip-ms": `${FLIP_MS}ms` }}>
        {view.sides.map((src, i) => (
          <span key={i} className="art-flip-side" data-side={i} data-front={i === front ? "" : undefined}>
            {src && <img src={src} alt="" draggable={false} />}
          </span>
        ))}
      </span>
    </span>
  );
}
