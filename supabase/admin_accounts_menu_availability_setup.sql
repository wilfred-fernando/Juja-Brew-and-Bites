-- Admin account page access + per-store menu item availability.
-- Run this in Supabase SQL editor before using the new Accounts and store availability controls.

create table if not exists public.profile_page_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, page_key)
);

create table if not exists public.menu_item_store_availability (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  store_id text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, store_id)
);

create index if not exists idx_profile_page_access_profile_id
  on public.profile_page_access(profile_id);

create index if not exists idx_menu_item_store_availability_lookup
  on public.menu_item_store_availability(store_id, item_id);

alter table public.profile_page_access enable row level security;
alter table public.menu_item_store_availability enable row level security;

drop policy if exists "Admins manage page access" on public.profile_page_access;
create policy "Admins manage page access"
on public.profile_page_access
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "Users read own page access" on public.profile_page_access;
create policy "Users read own page access"
on public.profile_page_access
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "Admins manage menu store availability" on public.menu_item_store_availability;
create policy "Admins manage menu store availability"
on public.menu_item_store_availability
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "Authenticated users read menu store availability" on public.menu_item_store_availability;
create policy "Authenticated users read menu store availability"
on public.menu_item_store_availability
for select
to authenticated
using (true);

drop policy if exists "Public users read menu store availability" on public.menu_item_store_availability;
create policy "Public users read menu store availability"
on public.menu_item_store_availability
for select
to anon
using (true);
