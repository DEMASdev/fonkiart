// The size of a coupon code in an email (the welcome coupon, the ones sent from Admin -> Orders and
// Leads: api/_lib/emails.js codeBox).
// The code is on ONE line (Andy, 2026-11-01: "make it fit in 1 line plz"), in Georgia bold at 31px
// with 1px between letters. A code of wide letters (W, M, H...) is wider than that at 31px on a
// 375px phone, and pushed the whole email past the screen's edge, so it scrolled sideways
// (measured 2026-11-22 in Chrome: about 1 code in 6, by 3 to 57px). So each code gets the biggest
// size up to 31px at which it still fits there, worked out from Georgia bold's own letter widths:
// about 7 codes in 10 keep 31px, most of the rest are 1 to 3px smaller, all on one line.
export const CODE_PX = 31;
const SMALLEST_PX = 20;
// The code's room on a 375px phone, in px: it starts to push the email sideways a little past 274
// (measured), and 2px are kept to spare for the phone's own drawing of the letters.
const ROOM_PX = 272;
// Georgia bold's width of each letter, in em, read from the font file (its hmtx table); anything
// else counts as wide as W, its widest letter.
const EM = {
  A: 0.7583, B: 0.7573, C: 0.7153, D: 0.834, E: 0.7212, F: 0.6714, G: 0.8071, H: 0.9131, I: 0.4458,
  J: 0.5952, K: 0.8169, L: 0.6855, M: 1.0234, N: 0.8394, O: 0.8198, P: 0.7012, Q: 0.8198, R: 0.7974,
  S: 0.6489, T: 0.6841, U: 0.8335, V: 0.7622, W: 1.1265, X: 0.8086, Y: 0.7319, Z: 0.6895,
  0: 0.7012, 1: 0.4897, 2: 0.6265, 3: 0.6245, 4: 0.6494, 5: 0.5991, 6: 0.6479, 7: 0.5542, 8: 0.6763,
  9: 0.6479, "-": 0.3789,
};
const WIDEST = EM.W;

// The code's size in px. Anything but letters, digits and dashes (a template's placeholder, like
// Supabase's "{{ .Token }}", filled later with a short code) keeps 31px.
export function codePx(code) {
  const s = String(code ?? "");
  if (!/^[A-Za-z0-9-]+$/.test(s)) return CODE_PX;
  const em = [...s.toUpperCase()].reduce((sum, ch) => sum + (EM[ch] ?? WIDEST), 0);
  return Math.max(SMALLEST_PX, Math.min(CODE_PX, Math.floor((ROOM_PX - s.length) / em)));
}
