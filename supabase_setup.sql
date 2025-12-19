-- Trip Map: Supabase setup (GitHub Pages sync)
-- Run this in Supabase Dashboard → SQL Editor.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Prevent accidental/malicious changes to immutable sharing fields.
create or replace function public.trips_block_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is distinct from old.join_code then
    raise exception 'join_code is immutable';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable';
  end if;
  return new;
end;
$$;

-- Extract user id from the request JWT in a PostgREST/Supabase-safe way.
-- (Some environments set `request.jwt.claim.sub`, others only `request.jwt.claims` JSON.)
create or replace function public.request_uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
  );
$$;

-- Safe join-code check that bypasses RLS on `trips` (breaks the join chicken-and-egg).
create or replace function public.trip_join_code_ok(trip_id uuid, join_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = trip_id
      and t.join_code = join_code
  );
$$;

revoke all on function public.trip_join_code_ok(uuid, text) from public;
grant execute on function public.trip_join_code_ok(uuid, text) to authenticated;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  title text not null default ''::text,
  created_by uuid,
  planner jsonb not null default '{}'::jsonb,
  status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Schema upgrades (idempotent)
alter table public.trips add column if not exists title text not null default ''::text;
alter table public.trips add column if not exists created_by uuid;

create unique index if not exists trips_join_code_unique on public.trips (join_code);
create index if not exists trips_created_by_idx on public.trips (created_by);

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

drop trigger if exists trips_block_immutable_fields on public.trips;
create trigger trips_block_immutable_fields
before update on public.trips
for each row execute function public.trips_block_immutable_fields();

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null,
  join_code text not null,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;

-- Clean up existing policies (idempotent re-run)
drop policy if exists "trips_insert_authenticated" on public.trips;
drop policy if exists "trips_select_members" on public.trips;
drop policy if exists "trips_update_members" on public.trips;

drop policy if exists "members_insert_with_code" on public.trip_members;
drop policy if exists "members_select_self" on public.trip_members;

-- Trips: creators must be authenticated (anonymous auth is fine).
create policy "trips_insert_authenticated"
on public.trips
for insert
with check (
  public.request_uid() is not null
  and created_by = public.request_uid()
);

-- Trips: only members can read.
create policy "trips_select_members"
on public.trips
for select
using (
  exists (
    select 1
    from public.trip_members m
    where m.trip_id = trips.id
      and m.user_id = public.request_uid()
  )
);

-- Trips: only members can update.
create policy "trips_update_members"
on public.trips
for update
using (
  exists (
    select 1
    from public.trip_members m
    where m.trip_id = trips.id
      and m.user_id = public.request_uid()
  )
)
with check (
  exists (
    select 1
    from public.trip_members m
    where m.trip_id = trips.id
      and m.user_id = public.request_uid()
  )
);

-- Members: allow join ONLY when the join_code matches the trip row.
create policy "members_insert_with_code"
on public.trip_members
for insert
with check (
  public.request_uid() is not null
  and public.request_uid() = user_id
  and public.trip_join_code_ok(trip_members.trip_id, trip_members.join_code)
);

-- Members: allow reading your own membership rows.
create policy "members_select_self"
on public.trip_members
for select
using (user_id = public.request_uid());

-- Realtime (Postgres changes) for trips table
do $$
begin
  alter publication supabase_realtime add table public.trips;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
