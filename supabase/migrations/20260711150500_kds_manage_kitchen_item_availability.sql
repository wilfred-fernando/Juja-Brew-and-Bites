-- Allow KDS/kitchen accounts to manage per-store item availability for their assigned store.
-- The KDS UI only exposes items mapped to the Kitchen printer group; this policy keeps writes
-- scoped to the authenticated user's store.

alter table public.menu_item_store_availability enable row level security;

drop policy if exists "KDS accounts manage own store menu item availability"
  on public.menu_item_store_availability;

create policy "KDS accounts manage own store menu item availability"
on public.menu_item_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('kds', 'kitchen')
      and p.store_id::text = menu_item_store_availability.store_id::text
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('kds', 'kitchen')
      and p.store_id::text = menu_item_store_availability.store_id::text
  )
);
