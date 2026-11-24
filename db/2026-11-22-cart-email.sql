-- FonkiArt (2026-11-22): know who left pieces in their cart, so the shop can follow up with them.
-- cart: the pieces in the cart of someone who gave their email (the welcome gift, the 5-minute box) or is signed in
--   (buyers and collectors), as the shop's own records name them: [{"id":12,"title":"Flamingo Party","price":950,"image":"https://..."}].
--   null when their cart is empty again (bought, or taken out). Saved signed in, each piece also says "signed":true,
--   and an emptied cart is [{"signed":true}]: from then on only a sign-in changes it.
-- cart_at: when that cart last changed.
-- Written by api/_lib/cartMemory.js (the store action "remember-cart"); read by cartsLeft() there.
-- Only for people who gave their email: nothing is ever kept for an anonymous visitor.
-- Until this runs, the site keeps no cart and nothing else changes. Safe to run on the live site, and safe to run twice.
alter table public."Leads" add column if not exists cart jsonb;
alter table public."Leads" add column if not exists cart_at timestamptz;
