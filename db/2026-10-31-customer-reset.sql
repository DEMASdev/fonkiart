-- FonkiArt: customers' "Forgot password?" (2026-10-31). One pending link per email,
-- stored hashed. Locked like every other table, so only the server can use it.
begin;
create table if not exists public.customer_resets (
  email text primary key,
  token_hash text,
  expires_at timestamptz,
  requested_at timestamptz
);
alter table public.customer_resets enable row level security;
revoke all on public.customer_resets from anon, authenticated;
commit;
select t.tablename, t.rowsecurity as locked,
       coalesce(string_agg(p.policyname || ' (' || p.cmd || ')', ', '), 'nothing (server only)') as allowed
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.tablename;
