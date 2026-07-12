-- Fix admin menu saves for per-store item/category availability.
-- Some profile role values are normalized in app code (for example super-admin -> super_admin),
-- so RLS policies must use the same normalized role comparison.

alter table public.menu_item_store_availability enable row level security;
alter table public.menu_category_store_availability enable row level security;

drop policy if exists "Admins manage menu store availability" on public.menu_item_store_availability;
create policy "Admins manage menu store availability"
on public.menu_item_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
);

drop policy if exists "menu category store availability admin write" on public.menu_category_store_availability;
create policy "menu category store availability admin write"
on public.menu_category_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
);
