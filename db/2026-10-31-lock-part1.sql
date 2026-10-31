-- FonkiArt lock, part 1 of 2 (given to Andy 2026-10-31; safe to run on the live site).
-- Settings + Artworks can be SEEN by anyone, CHANGED only by the server (service key).
-- Shoppers notice nothing; the admin can't save art/settings until the server-side
-- admin (api/admin.js) is live.
begin;
alter table public."Settings" enable row level security;
alter table public."Artworks" enable row level security;
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('Settings','Artworks') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy "public can read settings" on public."Settings" for select to anon, authenticated using (true);
create policy "public can read artworks" on public."Artworks" for select to anon, authenticated using (true);
commit;
select t.tablename, t.rowsecurity as locked,
       coalesce(string_agg(p.policyname || ' (' || p.cmd || ')', ', '), 'none') as allowed
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename in ('Settings','Artworks')
group by t.tablename, t.rowsecurity;
