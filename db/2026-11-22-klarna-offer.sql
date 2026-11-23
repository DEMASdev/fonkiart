-- FonkiArt (2026-11-22): the Klarna offer. An order just over the highest price Klarna takes is offered enough off to fit, paid with Klarna only (api/_lib/klarnaOffer.js).
-- klarnaMax: "Klarna's highest price" (Admin -> Settings -> Stripe), in dollars, copied from the shop's own Stripe settings.
-- klarnaMostOff: "Most we'll take off so Klarna fits", in dollars, e.g. 300.
-- Either one empty (null, as they start) = no offer at all. Until this runs, Admin can't save the two, and there is no offer.
-- The public can read them (the checkout says the offer on its Klarna row), as every Settings column; only the server changes them.
-- Safe to run on the live site, and safe to run twice.
alter table public."Settings" add column if not exists "klarnaMax" numeric;
alter table public."Settings" add column if not exists "klarnaMostOff" numeric;
