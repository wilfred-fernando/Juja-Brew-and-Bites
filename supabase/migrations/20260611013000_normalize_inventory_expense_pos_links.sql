-- Normalize inventory, expenses, POS recipe links, and stock movement reporting.
-- Safe/additive migration. Does not drop, truncate, rename, or delete production records.
-- Rollback notes:
--   1. Backup tables created below can be kept for audit.
--   2. To disable new links, app code can ignore inventory_item_id/common_name columns.
--   3. Do not drop added columns until after verifying no app code depends on them.

begin;

-- Backup snapshots for rollback/audit before additive normalization.
create table if not exists public.backup_inventory_items_20260611 as
select * from public.inventory_items;

create table if not exists public.backup_finance_expenses_inventory_links_20260611 as
select id, description, item_common_name, inventory_sync_status, inventory_synced_at
from public.finance_expenses;

create table if not exists public.backup_finance_petty_inventory_links_20260611 as
select id, description, item_common_name, inventory_sync_status, inventory_synced_at
from public.finance_petty_cash_entries;

-- Make inventory_items the master reference table while preserving the existing common_inventory_names table.
alter table public.inventory_items
  add column if not exists common_name text,
  add column if not exists normalized_common_name text generated always as (lower(regexp_replace(trim(common_name), '\s+', ' ', 'g'))) stored;

update public.inventory_items ii
set common_name = coalesce(nullif(trim(ii.common_name), ''), nullif(trim(cn.common_name), ''), nullif(trim(ii.item_name), ''))
from public.common_inventory_names cn
where ii.common_name_id = cn.id
  and nullif(trim(coalesce(ii.common_name, '')), '') is null;

update public.inventory_items
set common_name = nullif(trim(item_name), '')
where nullif(trim(coalesce(common_name, '')), '') is null;

-- Seed missing master inventory items from existing overall and petty cash expense rows.
-- The normalized common name is the dedupe key; item_name uses the latest display description found.
with expense_source as (
  select
    coalesce(nullif(trim(item_common_name), ''), nullif(trim(description), '')) as common_name,
    nullif(trim(description), '') as item_name,
    nullif(trim(unit), '') as unit,
    nullif(trim(category), '') as category,
    nullif(trim(supplier_name), '') as supplier,
    unit_price,
    created_at
  from public.finance_expenses
  where coalesce(nullif(trim(item_common_name), ''), nullif(trim(description), '')) is not null
  union all
  select
    coalesce(nullif(trim(item_common_name), ''), nullif(trim(description), '')) as common_name,
    nullif(trim(description), '') as item_name,
    nullif(trim(unit), '') as unit,
    nullif(trim(category), '') as category,
    nullif(trim(supplier_name), '') as supplier,
    unit_price,
    created_at
  from public.finance_petty_cash_entries
  where coalesce(nullif(trim(item_common_name), ''), nullif(trim(description), '')) is not null
), ranked as (
  select *, row_number() over (partition by lower(regexp_replace(trim(common_name), '\s+', ' ', 'g')) order by created_at desc nulls last) as rn
  from expense_source
)
insert into public.inventory_items (item_name, common_name, category, unit, cost_per_unit, supplier, current_stock, minimum_stock, reorder_level, is_active)
select
  coalesce(item_name, common_name),
  common_name,
  category,
  coalesce(unit, 'pc'),
  coalesce(unit_price, 0),
  supplier,
  0,
  0,
  0,
  true
from ranked r
where rn = 1
  and not exists (
    select 1 from public.inventory_items ii
    where lower(regexp_replace(trim(ii.common_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(r.common_name), '\s+', ' ', 'g'))
  );

-- Add preferred inventory item relationships to expenses while keeping text columns for compatibility.
alter table public.finance_expenses
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null;

alter table public.finance_petty_cash_entries
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null;

create index if not exists idx_finance_expenses_inventory_item on public.finance_expenses(inventory_item_id);
create index if not exists idx_finance_petty_inventory_item on public.finance_petty_cash_entries(inventory_item_id);
create index if not exists idx_inventory_items_normalized_common_name on public.inventory_items(normalized_common_name);
create unique index if not exists idx_inventory_items_active_normalized_common_name_unique
  on public.inventory_items(normalized_common_name)
  where is_active is true;

update public.finance_expenses e
set inventory_item_id = ii.id
from public.inventory_items ii
where e.inventory_item_id is null
  and lower(regexp_replace(trim(ii.common_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(nullif(e.item_common_name, ''), e.description)), '\s+', ' ', 'g'));

update public.finance_petty_cash_entries e
set inventory_item_id = ii.id
from public.inventory_items ii
where e.inventory_item_id is null
  and lower(regexp_replace(trim(ii.common_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(nullif(e.item_common_name, ''), e.description)), '\s+', ' ', 'g'));

-- Keep common_inventory_names synchronized for existing app joins, but make inventory_items the preferred master.
insert into public.common_inventory_names (common_name, category, default_unit, description, is_active)
select ii.common_name, ii.category, ii.unit, 'Synced from inventory_items master reference.', ii.is_active
from public.inventory_items ii
where nullif(trim(ii.common_name), '') is not null
  and not exists (
    select 1 from public.common_inventory_names cn
    where lower(regexp_replace(trim(cn.common_name), '\s+', ' ', 'g')) = ii.normalized_common_name
  );

update public.inventory_items ii
set common_name_id = cn.id
from public.common_inventory_names cn
where ii.common_name_id is null
  and lower(regexp_replace(trim(cn.common_name), '\s+', ' ', 'g')) = ii.normalized_common_name;

-- menu_item_ingredients.menu_item_id is currently text while menu_items.id is uuid.
-- Do not force a foreign key in this migration; changing that type needs a separate,
-- reviewed migration with a backup and compatibility plan.
create index if not exists idx_menu_item_ingredients_inventory_item on public.menu_item_ingredients(inventory_item_id);

-- Existing stock_movements table is preserved and extended for compatibility.
alter table public.stock_movements
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists movement_type text,
  add column if not exists unit text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists notes text;

update public.stock_movements
set inventory_item_id = coalesce(inventory_item_id, stock_item_id),
    movement_type = coalesce(movement_type, type),
    source_type = coalesce(source_type, ref_entity),
    source_id = coalesce(source_id, ref_id)
where inventory_item_id is null
   or movement_type is null
   or source_type is null
   or source_id is null;

create index if not exists idx_stock_movements_inventory_item on public.stock_movements(inventory_item_id);
create index if not exists idx_stock_movements_source on public.stock_movements(source_type, source_id);

comment on table public.stock_movements is 'Stock movement audit table kept in sync by inventory RPCs. Legacy columns are preserved for compatibility.';

create or replace function public.add_inventory_transaction(
  p_inventory_item_id uuid,
  p_common_name_id uuid,
  p_transaction_type text,
  p_quantity numeric,
  p_unit text,
  p_quantity_effect numeric,
  p_reference_type text default null,
  p_reference_id text default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.inventory_transactions;
  mapped_movement_type text;
begin
  if p_reference_type in ('expense', 'pos_order', 'pos_order_return') then
    if not public.inventory_is_staff() then
      raise exception 'Inventory access denied.';
    end if;
  elsif not public.inventory_is_admin() then
    raise exception 'Inventory adjustment requires an admin account.';
  end if;

  insert into public.inventory_transactions (
    inventory_item_id,
    common_name_id,
    transaction_type,
    quantity,
    unit,
    quantity_effect,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  values (
    p_inventory_item_id,
    p_common_name_id,
    p_transaction_type,
    p_quantity,
    public.inventory_normalize_unit(p_unit),
    p_quantity_effect,
    p_reference_type,
    p_reference_id,
    p_notes,
    p_created_by
  )
  returning * into inserted;

  update public.inventory_items
  set current_stock = current_stock + p_quantity_effect,
      updated_at = now()
  where id = p_inventory_item_id;

  mapped_movement_type := case p_transaction_type
    when 'pos_deduction' then 'sale_deduction'
    when 'manual_adjustment' then 'adjustment'
    else p_transaction_type
  end;

  insert into public.stock_movements (
    inventory_item_id,
    stock_item_id,
    movement_type,
    type,
    quantity,
    unit,
    source_type,
    source_id,
    ref_entity,
    ref_id,
    notes,
    created_by,
    created_at
  )
  values (
    p_inventory_item_id,
    p_inventory_item_id,
    mapped_movement_type,
    mapped_movement_type,
    p_quantity_effect,
    public.inventory_normalize_unit(p_unit),
    p_reference_type,
    p_reference_id,
    p_reference_type,
    p_reference_id,
    p_notes,
    p_created_by,
    inserted.created_at
  );

  return inserted;
end;
$$;

-- RLS and policy tightening for the affected inventory movement tables.
alter table public.inventory_items enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.expense_inventory_links enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "inventory_items_customer_read" on public.inventory_items;
drop policy if exists "inventory_items_staff_select" on public.inventory_items;
drop policy if exists "inventory_items_admin_write" on public.inventory_items;
create policy "inventory_items_staff_select" on public.inventory_items for select to authenticated using (public.inventory_is_staff());
create policy "inventory_items_admin_write" on public.inventory_items for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "menu_item_ingredients_staff_select" on public.menu_item_ingredients;
drop policy if exists "menu_item_ingredients_admin_write" on public.menu_item_ingredients;
create policy "menu_item_ingredients_staff_select" on public.menu_item_ingredients for select to authenticated using (public.inventory_is_staff());
create policy "menu_item_ingredients_admin_write" on public.menu_item_ingredients for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "inventory_transactions_staff_select" on public.inventory_transactions;
drop policy if exists "inventory_transactions_admin_write" on public.inventory_transactions;
create policy "inventory_transactions_staff_select" on public.inventory_transactions for select to authenticated using (public.inventory_is_staff());
create policy "inventory_transactions_admin_write" on public.inventory_transactions for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "stock_movements_staff_select" on public.stock_movements;
drop policy if exists "stock_movements_admin_write" on public.stock_movements;
create policy "stock_movements_staff_select" on public.stock_movements for select to authenticated using (public.inventory_is_staff());
create policy "stock_movements_admin_write" on public.stock_movements for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

commit;
