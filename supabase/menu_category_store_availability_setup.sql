create table if not exists public.menu_category_store_availability (
  category_id text not null,
  store_id text not null,
  is_available boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (category_id, store_id)
);

alter table public.menu_category_store_availability enable row level security;

drop policy if exists "menu category store availability read" on public.menu_category_store_availability;
create policy "menu category store availability read"
on public.menu_category_store_availability
for select
using (true);

drop policy if exists "menu category store availability admin write" on public.menu_category_store_availability;
create policy "menu category store availability admin write"
on public.menu_category_store_availability
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);
