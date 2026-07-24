# Fonkiart — Feature Task Backlog
*Last updated: 2026-06-11*

---

## ✅ COMPLETED

| Task | Done | Notes |
|------|------|-------|
| Project refactor | 2026-06-07 | Single ~3900-line App.jsx split into src/components, src/pages, src/admin, src/lib, src/utils, src/constants.js (44 files) |
| FNK-01: Sold items stay visible | 2026-06-03 | Badge + disabled "Sold Out" button in Catalog, New, Specials, ArtworkModal |
| FNK-02: Mark sold after payment | 2026-06-03 (revised 2026-06-11) | **By design, this is manual**: Admin → Artworks → "Mark as Sold" checkbox, done by Andy after confirming payment actually arrived (Zelle/Venmo/Cash App have no instant payment confirmation, so auto-marking on checkout would be premature) |
| FNK-03: Urgency nudges | 2026-06-03 | "Only 1 available / 🔥 in demand / 👀 X in cart" shown on cards + modal via `getUrgency()` in `src/utils/helpers.js` — intentionally randomized per item to create a sense of urgency (not tied to real cart data) |
| Admin upload: bigger + preview | 2026-06-03 | 220px thumbnails, click-to-preview lightbox |
| Admin login: back button + timeout | 2026-06-03 | "← Back to Site" + 60s auto-redirect |
| Hero: 3 collage photos | 2026-06-03 | Random overlapping photos, white bg, refreshes every visit |
| V1-6: Phone compatibility | 2026-06-03 | Existing mobile CSS was solid, targeted fixes applied |
| Cleanup pass | 2026-06-11 | Removed dead `cartActivity`/`cart_activity` Supabase polling (unused since refactor), removed unused `UnifiedLoginModal.jsx` (replaced by `BuyerAuthModal.jsx`), removed unused deps `@emailjs/browser` + `playwright`, compressed `public/favicon.png` (476KB → 50KB), removed stray `dev.log` |

---

## 🔲 OPEN

### FNK-04 · Shipping & Tax at Checkout
**Status:** Blocked — waiting on Andy

Decisions needed:
1. Flat shipping rate for orders under $75?
2. Tax — Florida only (7% Broward), all US, or skip?
3. International shipping — yes or no?
4. Manual methods only (Zelle/Venmo/Cash App) or Stripe too?

These same 4 questions are tracked live in Admin → Dashboard → "Pending Tasks" widget (`src/constants.js` → `ADMIN_TASKS`, ids `ship-rate`/`ship-tax`/`ship-intl`/`ship-scope`).

### Brevo SMTP · @fonkiart.com Sending
**Status:** Ready to build — no blockers

Goal: Send emails from support@fonkiart.com (or hello@fonkiart.com) properly authenticated via Brevo SMTP so emails land in inbox, not spam.

### Supabase `cart_activity` table — now orphaned
**Status:** Needs a decision

The `cart_activity` table still exists in Supabase but nothing in the app reads or writes to it anymore (removed 2026-06-11 cleanup — see above). Either drop the table, or revisit using it for a *real* "people have this in their cart" indicator instead of the randomized one in FNK-03.

---

## Source of Truth
→ DEMAS Task Master: claudeai project → Fonkiart section — https://andy-dev.vercel.app/demas/tasks/
