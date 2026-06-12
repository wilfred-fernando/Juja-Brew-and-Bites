-- Finance daily inventory worksheet and store-to-store inventory transfers.

begin;

create table if not exists public.finance_daily_inventory_entries (
  id uuid primary key default gen_random_uuid(),
  inventory_date date not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  beginning_quantity numeric(14, 3) not null default 0,
  reorder_quantity numeric(14, 3) not null default 0,
  transfer_quantity numeric(14, 3) not null default 0,
  pos_deduction_quantity numeric(14, 3) not null default 0,
  manual_adjustment_quantity numeric(14, 3) not null default 0,
  manual_adjustment_note text,
  ending_quantity numeric(14, 3) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_date, store_id, inventory_item_id)
);

create table if not exists public.finance_inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  from_store_id uuid not null references public.stores(id) on delete cascade,
  to_store_id uuid not null references public.stores(id) on delete cascade,
  quantity numeric(14, 3) not null,
  unit text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (quantity > 0),
  check (from_store_id <> to_store_id)
);

create index if not exists idx_finance_daily_inventory_date_store
  on public.finance_daily_inventory_entries (inventory_date, store_id);

create index if not exists idx_finance_daily_inventory_item
  on public.finance_daily_inventory_entries (inventory_item_id);

create index if not exists idx_finance_inventory_transfers_date_store
  on public.finance_inventory_transfers (transfer_date, from_store_id, to_store_id);

create index if not exists idx_finance_inventory_transfers_item
  on public.finance_inventory_transfers (inventory_item_id);

create or replace function public.set_finance_daily_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_finance_daily_inventory_updated_at on public.finance_daily_inventory_entries;
create trigger trg_finance_daily_inventory_updated_at
before update on public.finance_daily_inventory_entries
for each row
execute function public.set_finance_daily_inventory_updated_at();

alter table public.finance_daily_inventory_entries enable row level security;
alter table public.finance_inventory_transfers enable row level security;

drop policy if exists "finance_daily_inventory_staff_select" on public.finance_daily_inventory_entries;
create policy "finance_daily_inventory_staff_select"
  on public.finance_daily_inventory_entries
  for select
  to authenticated
  using (public.inventory_is_staff());

drop policy if exists "finance_daily_inventory_staff_insert" on public.finance_daily_inventory_entries;
create policy "finance_daily_inventory_staff_insert"
  on public.finance_daily_inventory_entries
  for insert
  to authenticated
  with check (
    public.inventory_is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id = finance_daily_inventory_entries.store_id
    )
  );

drop policy if exists "finance_daily_inventory_staff_update" on public.finance_daily_inventory_entries;
create policy "finance_daily_inventory_staff_update"
  on public.finance_daily_inventory_entries
  for update
  to authenticated
  using (
    public.inventory_is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id = finance_daily_inventory_entries.store_id
    )
  )
  with check (
    public.inventory_is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id = finance_daily_inventory_entries.store_id
    )
  );

drop policy if exists "finance_daily_inventory_admin_delete" on public.finance_daily_inventory_entries;
create policy "finance_daily_inventory_admin_delete"
  on public.finance_daily_inventory_entries
  for delete
  to authenticated
  using (public.inventory_is_admin());

drop policy if exists "finance_inventory_transfers_staff_select" on public.finance_inventory_transfers;
create policy "finance_inventory_transfers_staff_select"
  on public.finance_inventory_transfers
  for select
  to authenticated
  using (public.inventory_is_staff());

drop policy if exists "finance_inventory_transfers_staff_insert" on public.finance_inventory_transfers;
create policy "finance_inventory_transfers_staff_insert"
  on public.finance_inventory_transfers
  for insert
  to authenticated
  with check (
    public.inventory_is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and (p.store_id = finance_inventory_transfers.from_store_id or p.store_id = finance_inventory_transfers.to_store_id)
    )
  );

drop policy if exists "finance_inventory_transfers_admin_update" on public.finance_inventory_transfers;
create policy "finance_inventory_transfers_admin_update"
  on public.finance_inventory_transfers
  for update
  to authenticated
  using (public.inventory_is_admin())
  with check (public.inventory_is_admin());

drop policy if exists "finance_inventory_transfers_admin_delete" on public.finance_inventory_transfers;
create policy "finance_inventory_transfers_admin_delete"
  on public.finance_inventory_transfers
  for delete
  to authenticated
  using (public.inventory_is_admin());

grant select, insert, update, delete on public.finance_daily_inventory_entries to authenticated;
grant select, insert, update, delete on public.finance_inventory_transfers to authenticated;

commit;
