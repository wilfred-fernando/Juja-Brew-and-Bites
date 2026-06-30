-- Allow POS cashier accounts to manage item availability only for their assigned store.
-- Add POS-only channel pricing/visibility flags so GRAB/PANDA can use the same item records
-- without duplicating menu items.

alter table public.menu_items
  add column if not exists grab_price numeric,
  add column if not exists panda_price numeric,
  add column if not exists grab_available boolean not null default true,
  add column if not exists panda_available boolean not null default true;

drop policy if exists "POS cashiers manage own store menu item availability"
  on public.menu_item_store_availability;

create policy "POS cashiers manage own store menu item availability"
on public.menu_item_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(lower(coalesce(p.role, '')), '-', '_') = 'cashier'
      and p.store_id::text = menu_item_store_availability.store_id::text
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(lower(coalesce(p.role, '')), '-', '_') = 'cashier'
      and p.store_id::text = menu_item_store_availability.store_id::text
  )
);
