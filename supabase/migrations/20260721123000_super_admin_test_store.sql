-- Hidden test store support.
-- Test stores stay active for internal QA but are visible only to super_admin
-- accounts. Public/customer/cashier/admin store lists should not see them.

alter table public.stores
  add column if not exists is_test boolean not null default false;

comment on column public.stores.is_test is
  'When true, store is hidden from anon, customer, cashier, admin, POS, and public menus; visible only to super_admin.';

do $$
begin
  if exists (select 1 from public.stores where store_code = 'TST') then
    update public.stores
    set
      name = 'Juja Brew & Bites - Test Store',
      store_name = 'Juja Brew & Bites - Test Store',
      timezone = 'Asia/Manila',
      is_active = true,
      is_test = true,
      sort_order = 99,
      updated_at = now()
    where store_code = 'TST';
  else
    insert into public.stores (name, store_name, store_code, timezone, is_active, is_test, sort_order)
    values (
      'Juja Brew & Bites - Test Store',
      'Juja Brew & Bites - Test Store',
      'TST',
      'Asia/Manila',
      true,
      true,
      99
    );
  end if;
end $$;

drop policy if exists "Allow select" on public.stores;
drop policy if exists "Allow select stores" on public.stores;
drop policy if exists "stores_visible_unless_test_super_admin" on public.stores;

create policy "stores_visible_unless_test_super_admin"
on public.stores
for select
to public
using (
  coalesce(is_test, false) = false
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'super_admin'
  )
);

create index if not exists stores_visibility_idx
  on public.stores (is_active, is_test, sort_order, name);
