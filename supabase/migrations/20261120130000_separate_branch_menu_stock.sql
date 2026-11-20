begin;

create table public.menu_item_store_stock (
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  is_available boolean not null default true,
  primary key (store_id, item_id)
);

alter table public.menu_item_store_stock enable row level security;
revoke all on public.menu_item_store_stock from public, anon, authenticated;
grant select on public.menu_item_store_stock to anon, authenticated;
grant insert, update on public.menu_item_store_stock to authenticated;
grant all on public.menu_item_store_stock to service_role;

create policy "Read branch menu stock"
  on public.menu_item_store_stock for select to anon, authenticated using (true);

create policy "Assigned staff manage branch menu stock"
  on public.menu_item_store_stock for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.store_id = menu_item_store_stock.store_id
      and replace(lower(p.role), '-', '_') in ('cashier', 'kitchen', 'kds', 'admin', 'super_admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.store_id = menu_item_store_stock.store_id
      and replace(lower(p.role), '-', '_') in ('cashier', 'kitchen', 'kds', 'admin', 'super_admin')
  ));

create trigger audit_menu_availability
  after insert or update of is_available on public.menu_item_store_stock
  for each row execute function public.audit_menu_availability();

drop policy if exists "POS cashiers manage own store menu item availability" on public.menu_item_store_availability;
drop policy if exists "KDS accounts manage own store menu item availability" on public.menu_item_store_availability;

notify pgrst, 'reload schema';
commit;
