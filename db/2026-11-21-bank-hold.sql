-- FonkiArt (2026-11-21): a bank payment (ACH) takes days to clear, and its piece is held (marked Sold) for the buyer meanwhile.
-- art_held: this order's hold marked the piece Sold, so a failed payment puts back on sale only what its own hold took off.
-- bank_page: the Stripe payment page whose bank payment is clearing, so a page that failed long ago can't undo a newer one.
-- Until this runs, a failed bank payment leaves its piece Sold and the shop gets an email asking to check it by hand.
-- Safe to run on the live site, and safe to run twice.
alter table public."Orders" add column if not exists art_held boolean;
alter table public."Orders" add column if not exists bank_page text;
