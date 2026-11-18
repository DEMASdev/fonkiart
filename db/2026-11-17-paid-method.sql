-- FonkiArt (2026-11-17): how each order was paid (card, zelle, venmo, cashapp, cash or other), so the paid invoice can say "Paid by ...".
alter table public."Orders" add column if not exists paid_method text;
