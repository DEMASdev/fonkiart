-- FonkiArt: request conversations (2026-11-12). Every answer the shop sends from the
-- admin, and every answer the customer sends back (on the site or by email), is kept
-- here under its request. Locked like every other table: only the server can use it.
-- Safe to run on the live site, and safe to run twice.
begin;
alter table public."Requests" add column if not exists thread_token text unique;
do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public."Requests"'::regclass and a.attname = 'id';
  execute format($f$
    create table if not exists public."RequestMessages" (
      id bigint generated always as identity primary key,
      request_id %s not null references public."Requests"(id) on delete cascade,
      direction text not null check (direction in ('out', 'in')),
      via text not null check (via in ('site', 'email')),
      body text not null,
      email_message_id text,
      created_at timestamptz not null default now()
    )$f$, id_type);
end $$;
create index if not exists request_messages_request_idx on public."RequestMessages" (request_id, created_at);
create index if not exists request_messages_email_idx on public."RequestMessages" (email_message_id);
alter table public."RequestMessages" enable row level security;
revoke all on public."RequestMessages" from anon, authenticated;
commit;
select t.tablename, t.rowsecurity as locked,
       coalesce(string_agg(p.policyname || ' (' || p.cmd || ')', ', '), 'nothing (server only)') as allowed
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename in ('Requests', 'RequestMessages')
group by t.tablename, t.rowsecurity
order by t.tablename;
