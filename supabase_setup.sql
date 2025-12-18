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

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  planner jsonb not null default '{}'::jsonb,
  status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists trips_join_code_unique on public.trips (join_code);

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

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
with check (auth.uid() is not null);

-- Trips: only members can read.
create policy "trips_select_members"
on public.trips
for select
using (
  exists (
    select 1
    from public.trip_members m
    where m.trip_id = trips.id
      and m.user_id = auth.uid()
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
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.trip_members m
    where m.trip_id = trips.id
      and m.user_id = auth.uid()
  )
);

-- Members: allow join ONLY when the join_code matches the trip row.
create policy "members_insert_with_code"
on public.trip_members
for insert
with check (
  auth.uid() is not null
  and auth.uid() = user_id
  and exists (
    select 1
    from public.trips t
    where t.id = trip_id
      and t.join_code = join_code
  )
);

-- Members: allow reading your own membership rows.
create policy "members_select_self"
on public.trip_members
for select
using (user_id = auth.uid());

-- Realtime (Postgres changes) for trips table
do $$
begin
  alter publication supabase_realtime add table public.trips;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
