-- Per-store menu item availability.
-- Run this in Supabase SQL editor before using item store availability controls.

create table if not exists public.menu_item_store_availability (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  store_id text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, store_id)
);

create index if not exists idx_menu_item_store_availability_lookup
  on public.menu_item_store_availability(store_id, item_id);

alter table public.menu_item_store_availability enable row level security;

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
