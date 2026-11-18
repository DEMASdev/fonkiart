// Which picture the admin's little art card turns to next (src/admin/ArtFlipper.jsx).
// Andy, 2026-11-17: "at the top of the admin it says Fonkiart · Admin Panel — to the
// left a picture of any art should be appearing every 20 seconds flipping".
// Kept apart from the component so the choosing can be tested without a browser.

// The main picture of every artwork that has one, once each. Artworks without a
// picture are left out.
export function artPictures(items) {
  const out = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const pics = [item?.image, ...(Array.isArray(item?.images) ? item.images : [])];
    const src = pics.find(p => typeof p === "string" && p.trim() !== "");
    if (src) out.add(src);
  }
  return [...out];
}

// The next picture, and the rest of this round (`bag`, start it as []).
// - Random order, and every picture once before any picture comes back (a round).
// - Never `showing`, the picture facing out now, so never the same one twice in a row.
// - A picture no longer in `pool` (artwork deleted) is skipped; a new one joins the next round.
// `pick` is null when there is nothing else to turn to: no pictures, or only the one showing.
export function nextPick(bag, pool, showing = null, random = Math.random) {
  const live = new Set(pool);
  let rest = (Array.isArray(bag) ? bag : []).filter(p => live.has(p));
  if (rest.every(p => p === showing)) rest = shuffle([...live], random);
  if (rest[0] === showing) {
    if (rest.length < 2) return { pick: null, bag: rest };
    const j = 1 + Math.floor(random() * (rest.length - 1));
    [rest[0], rest[j]] = [rest[j], rest[0]];
  }
  return rest.length ? { pick: rest[0], bag: rest.slice(1) } : { pick: null, bag: [] };
}

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
