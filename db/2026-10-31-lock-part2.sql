-- FonkiArt lock, part 2 of 2. Run ONLY after the server-side version of the site
-- (api/store.js + api/admin.js) is live in production — before that, checkout,
-- the forms and the admin all still use the public key and would stop working.
-- Every table in the public schema gets row security; nothing can be read or changed
-- with the public key except the two read rules below. The server is unaffected.
begin;
-- Where the admin password lives once it is reset from the site ("Forgot password?").
-- One row; the loop below locks it like every other table, so only the server reads it.
create table if not exists public.admin_auth (
  id int primary key default 1 check (id = 1),
  password_hash text,
  token_secret text,
  reset_token_hash text,
  reset_expires_at timestamptz,
  reset_requested_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.admin_auth (id) values (1) on conflict (id) do nothing;
revoke all on public.admin_auth from anon, authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy "public can read settings" on public."Settings" for select to anon, authenticated using (true);
create policy "public can read artworks" on public."Artworks" for select to anon, authenticated using (true);
-- Andy, 2026-09-29: "9 delete it" (the orphaned cart table; nothing in the code uses it)
drop table if exists public.cart_activity;
-- The 10-31 test signup Andy said yes to: the public key can't delete from Leads.
delete from public."Leads" where id = 12 and email = 'fonkiart+test@gmail.com';
commit;
select t.tablename, t.rowsecurity as locked,
       coalesce(string_agg(p.policyname || ' (' || p.cmd || ')', ', '), 'nothing (server only)') as allowed
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.tablename;
