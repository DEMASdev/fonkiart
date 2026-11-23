-- FonkiArt (2026-11-23): choose how much off when sending a coupon to someone who didn't finish paying.
-- coupon_size: what this person's code gives, when it is not the shop's %: a list of sizes, the best one for the cart
--   counts: [{"percent":20}], or [{"percent":15},{"dollars":300,"of":950}] ($300 off, made for pieces worth $950).
--   null (everyone today) = the shop's % (Admin -> Settings), as before.
-- Written by api/_lib/unfinishedCoupon.js (Admin -> Orders, "Send a coupon"); read by api/_lib/storeOps.js when the
--   code is used. What the sizes mean: src/lib/couponSize.js.
-- Nothing is lost: it only adds one empty column. Until this runs, coupons go at the shop's % and nothing else changes.
-- Safe to run on the live site, and safe to run twice.
alter table public."Leads" add column if not exists coupon_size jsonb;
