-- JUJA Inventory System setup
-- Run this in Supabase SQL editor after the existing finance/POS setup scripts.
-- Naming rule:
-- - inventory_items.item_name stores the same value as the Expenses Item Name.
-- - common_inventory_names.common_name stores the same value as the Expenses Common Name.

create extension if not exists pgcrypto;

create table if not exists public.common_inventory_names (
  id uuid primary key default gen_random_uuid(),
  common_name text not null unique,
  category text,
  default_unit text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  common_name_id uuid references public.common_inventory_names(id) on delete set null,
  item_name text not null,
  sku text,
  category text,
  current_stock numeric(14, 3) not null default 0,
  unit text not null,
  minimum_stock numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3) not null default 0,
  cost_per_unit numeric(14, 4) not null default 0,
  supplier text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.common_inventory_names is 'Standardized common names matching the Expenses Common Name field.';
comment on table public.inventory_items is 'Actual stock items matching the Expenses Item Name field. Stock should move through inventory_transactions.';

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  common_name_id uuid references public.common_inventory_names(id) on delete set null,
  transaction_type text not null check (transaction_type in ('purchase', 'pos_deduction', 'manual_adjustment', 'waste', 'return', 'correction')),
  quantity numeric(14, 3) not null,
  unit text not null,
  quantity_effect numeric(14, 3) not null,
  reference_type text,
  reference_id text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null,
  variant_key text,
  variant_name text,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  common_name_id uuid references public.common_inventory_names(id) on delete set null,
  quantity_required numeric(14, 3) not null,
  unit text not null,
  deduction_multiplier numeric(14, 3) not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_inventory_links (
  id uuid primary key default gen_random_uuid(),
  expense_id text references public.finance_expenses(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  common_name_id uuid references public.common_inventory_names(id) on delete set null,
  purchased_quantity numeric(14, 3) not null,
  purchased_unit text not null,
  cost_per_unit numeric(14, 4),
  total_cost numeric(14, 2),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_settings (
  id text primary key default 'default',
  inventory_enabled boolean not null default true,
  allow_negative_stock boolean not null default true,
  warn_missing_recipe boolean not null default true,
  auto_sync_expenses boolean not null default true,
  low_stock_alert_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_warnings (
  id uuid primary key default gen_random_uuid(),
  warning_type text not null,
  reference_type text,
  reference_id text,
  menu_item_id text,
  message text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.inventory_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.finance_expenses
  add column if not exists inventory_sync_status text not null default 'not_inventory',
  add column if not exists inventory_synced_at timestamptz;

alter table public.finance_petty_cash_entries
  add column if not exists inventory_sync_status text not null default 'not_inventory',
  add column if not exists inventory_synced_at timestamptz;

alter table public.orders
  add column if not exists inventory_deducted boolean not null default false,
  add column if not exists inventory_deducted_at timestamptz;

create index if not exists idx_inventory_items_common_name on public.inventory_items(common_name_id);
create index if not exists idx_inventory_transactions_reference on public.inventory_transactions(reference_type, reference_id);
create index if not exists idx_menu_item_ingredients_menu_item on public.menu_item_ingredients(menu_item_id);
create unique index if not exists idx_expense_inventory_links_expense_item
  on public.expense_inventory_links(expense_id, inventory_item_id);
drop index if exists public.idx_inventory_pos_deduction_unique;

create or replace function public.inventory_current_role()
returns text
language sql
stable
as $$
  select lower(coalesce((select p.role from public.profiles p where p.id = auth.uid()), ''));
$$;

create or replace function public.inventory_is_staff()
returns boolean
language sql
stable
as $$
  select public.inventory_current_role() in ('admin', 'super_admin', 'cashier');
$$;

create or replace function public.inventory_is_admin()
returns boolean
language sql
stable
as $$
  select public.inventory_current_role() in ('admin', 'super_admin');
$$;

create or replace function public.inventory_normalize_unit(p_unit text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_unit, '')))
    when 'grams' then 'gram'
    when 'g' then 'gram'
    when 'kilo' then 'kg'
    when 'kilos' then 'kg'
    when 'kilogram' then 'kg'
    when 'kilograms' then 'kg'
    when 'l' then 'liter'
    when 'liters' then 'liter'
    when 'litre' then 'liter'
    when 'litres' then 'liter'
    when 'pcs' then 'pc'
    when 'piece' then 'pc'
    when 'pieces' then 'pc'
    else lower(trim(coalesce(p_unit, '')))
  end
$$;

create or replace function public.inventory_convert_quantity(p_quantity numeric, p_from_unit text, p_to_unit text)
returns numeric
language plpgsql
immutable
as $$
declare
  from_unit text := public.inventory_normalize_unit(p_from_unit);
  to_unit text := public.inventory_normalize_unit(p_to_unit);
begin
  if from_unit = to_unit then
    return p_quantity;
  elsif from_unit = 'kg' and to_unit = 'gram' then
    return p_quantity * 1000;
  elsif from_unit = 'gram' and to_unit = 'kg' then
    return p_quantity / 1000;
  elsif from_unit = 'liter' and to_unit = 'ml' then
    return p_quantity * 1000;
  elsif from_unit = 'ml' and to_unit = 'liter' then
    return p_quantity / 1000;
  end if;
  raise exception 'Unit conversion needed. Please check inventory unit. % to %', p_from_unit, p_to_unit;
end;
$$;

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

  return inserted;
end;
$$;

create or replace function public.sync_expense_to_inventory(
  p_expense_id text,
  p_inventory_item_id uuid,
  p_common_name_id uuid,
  p_quantity numeric,
  p_unit text,
  p_unit_cost numeric default null,
  p_total_cost numeric default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.inventory_items;
  previous_item public.inventory_items;
  existing_link public.expense_inventory_links;
  converted_quantity numeric;
  previous_quantity numeric;
  delta_quantity numeric;
  had_existing_link boolean := false;
begin
  if not public.inventory_is_staff() then
    raise exception 'Inventory expense sync requires staff access.';
  end if;

  if p_expense_id is null or p_inventory_item_id is null or coalesce(p_quantity, 0) <= 0 then
    update public.finance_expenses set inventory_sync_status = 'needs_mapping' where id = p_expense_id;
    return jsonb_build_object('ok', false, 'message', 'Inventory item and quantity are required.');
  end if;

  select * into item_row from public.inventory_items where id = p_inventory_item_id and is_active is not false;
  if not found then
    update public.finance_expenses set inventory_sync_status = 'needs_mapping' where id = p_expense_id;
    return jsonb_build_object('ok', false, 'message', 'Inventory item was not found.');
  end if;

  converted_quantity := public.inventory_convert_quantity(p_quantity, p_unit, item_row.unit);

  select * into existing_link
  from public.expense_inventory_links
  where expense_id = p_expense_id
  limit 1;

  if found then
    had_existing_link := true;
    if existing_link.inventory_item_id = p_inventory_item_id then
      delta_quantity := converted_quantity - public.inventory_convert_quantity(existing_link.purchased_quantity, existing_link.purchased_unit, item_row.unit);
    else
      select * into previous_item from public.inventory_items where id = existing_link.inventory_item_id;
      if found then
        previous_quantity := public.inventory_convert_quantity(existing_link.purchased_quantity, existing_link.purchased_unit, previous_item.unit);
        perform public.add_inventory_transaction(
          previous_item.id,
          existing_link.common_name_id,
          'correction',
          previous_quantity,
          previous_item.unit,
          previous_quantity * -1,
          'expense',
          p_expense_id,
          'Expense inventory remapped from previous item',
          p_created_by
        );
      end if;
      delta_quantity := converted_quantity;
    end if;
    update public.expense_inventory_links
    set inventory_item_id = p_inventory_item_id,
        purchased_quantity = p_quantity,
        purchased_unit = public.inventory_normalize_unit(p_unit),
        common_name_id = coalesce(p_common_name_id, item_row.common_name_id),
        cost_per_unit = p_unit_cost,
        total_cost = p_total_cost
    where id = existing_link.id;
  else
    delta_quantity := converted_quantity;
    insert into public.expense_inventory_links (
      expense_id,
      inventory_item_id,
      common_name_id,
      purchased_quantity,
      purchased_unit,
      cost_per_unit,
      total_cost
    )
    values (
      p_expense_id,
      p_inventory_item_id,
      coalesce(p_common_name_id, item_row.common_name_id),
      p_quantity,
      public.inventory_normalize_unit(p_unit),
      p_unit_cost,
      p_total_cost
    );
  end if;

  if delta_quantity <> 0 then
    perform public.add_inventory_transaction(
      p_inventory_item_id,
      coalesce(p_common_name_id, item_row.common_name_id),
      case when delta_quantity > 0 then 'purchase' else 'correction' end,
      abs(delta_quantity),
      item_row.unit,
      delta_quantity,
      'expense',
      p_expense_id,
      case when had_existing_link then 'Expense inventory correction' else 'Expense purchase sync' end,
      p_created_by
    );
  end if;

  update public.finance_expenses
  set inventory_sync_status = 'synced',
      inventory_synced_at = now()
  where id = p_expense_id;

  update public.finance_petty_cash_entries
  set inventory_sync_status = 'synced',
      inventory_synced_at = now()
  where id = p_expense_id;

  return jsonb_build_object('ok', true, 'delta', delta_quantity, 'unit', item_row.unit);
end;
$$;

create or replace function public.deduct_inventory_for_pos_order(
  p_order_id text,
  p_items jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_done boolean;
  cart_line jsonb;
  recipe public.menu_item_ingredients;
  item_row public.inventory_items;
  line_variant_key text;
  has_variant_recipe boolean;
  line_qty numeric;
  needed_qty numeric;
  deduction_qty numeric;
  missing_count integer := 0;
  deduction_count integer := 0;
begin
  if not public.inventory_is_staff() then
    raise exception 'Inventory POS deduction requires staff access.';
  end if;

  perform pg_advisory_xact_lock(hashtext('inventory-pos-order-' || coalesce(p_order_id, '')));

  select inventory_deducted into order_done from public.orders where id::text = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order was not found for inventory deduction.');
  end if;
  if coalesce(order_done, false) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'message', 'Inventory already deducted.');
  end if;

  for cart_line in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    line_variant_key := nullif(cart_line->>'variant_key', '');
    has_variant_recipe := false;

    if line_variant_key is not null then
      select exists (
        select 1
        from public.menu_item_ingredients
        where menu_item_id = cart_line->>'menu_item_id'
          and variant_key = line_variant_key
          and is_active is not false
      ) into has_variant_recipe;
    end if;

    line_qty := nullif(cart_line->>'quantity', '')::numeric;
    if line_qty is null or line_qty <= 0 then
      line_qty := 1;
    end if;

    if not exists (
      select 1 from public.menu_item_ingredients
      where menu_item_id = cart_line->>'menu_item_id'
        and is_active is not false
        and (
          (has_variant_recipe and variant_key = line_variant_key)
          or (not has_variant_recipe and coalesce(variant_key, '') = '')
        )
    ) then
      missing_count := missing_count + 1;
      insert into public.inventory_warnings(warning_type, reference_type, reference_id, menu_item_id, message)
      values (
        'missing_recipe',
        'pos_order',
        p_order_id,
        cart_line->>'menu_item_id',
        'No inventory recipe set for ' || coalesce(cart_line->>'name', cart_line->>'menu_item_id') || '. No stock was deducted.'
      );
    end if;

    for recipe in
      select * from public.menu_item_ingredients
      where menu_item_id = cart_line->>'menu_item_id'
        and is_active is not false
        and (
          (has_variant_recipe and variant_key = line_variant_key)
          or (not has_variant_recipe and coalesce(variant_key, '') = '')
        )
    loop
      select * into item_row from public.inventory_items where id = recipe.inventory_item_id;
      if not found then
        continue;
      end if;

      needed_qty := recipe.quantity_required * line_qty * coalesce(recipe.deduction_multiplier, 1);
      deduction_qty := public.inventory_convert_quantity(needed_qty, recipe.unit, item_row.unit);

      perform public.add_inventory_transaction(
        item_row.id,
        coalesce(recipe.common_name_id, item_row.common_name_id),
        'pos_deduction',
        deduction_qty,
        item_row.unit,
        deduction_qty * -1,
        'pos_order',
        p_order_id,
        'POS automatic deduction',
        p_created_by
      );
      deduction_count := deduction_count + 1;
    end loop;
  end loop;

  update public.orders
  set inventory_deducted = true,
      inventory_deducted_at = now()
  where id::text = p_order_id;

  return jsonb_build_object('ok', true, 'deductions', deduction_count, 'missingRecipes', missing_count);
end;
$$;

create or replace function public.restore_inventory_for_void_order(
  p_order_id text,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.inventory_transactions;
  restore_count integer := 0;
begin
  if not public.inventory_is_staff() then
    raise exception 'Inventory restore requires staff access.';
  end if;

  perform pg_advisory_xact_lock(hashtext('inventory-pos-order-' || coalesce(p_order_id, '')));

  if exists (
    select 1
    from public.inventory_transactions
    where reference_type = 'pos_order_return'
      and reference_id = p_order_id
      and transaction_type = 'return'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'restored', 0, 'message', 'Inventory was already restored.');
  end if;

  for tx in
    select * from public.inventory_transactions
    where reference_type = 'pos_order'
      and reference_id = p_order_id
      and transaction_type = 'pos_deduction'
  loop
    perform public.add_inventory_transaction(
      tx.inventory_item_id,
      tx.common_name_id,
      'return',
      abs(tx.quantity_effect),
      tx.unit,
      abs(tx.quantity_effect),
      'pos_order_return',
      p_order_id,
      'Inventory restored from void/refund',
      p_created_by
    );
    restore_count := restore_count + 1;
  end loop;

  update public.orders
  set inventory_deducted = false,
      inventory_deducted_at = null
  where id::text = p_order_id;

  return jsonb_build_object('ok', true, 'restored', restore_count);
end;
$$;

alter table public.common_inventory_names enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.expense_inventory_links enable row level security;
alter table public.inventory_settings enable row level security;
alter table public.inventory_warnings enable row level security;

drop policy if exists "inventory_common_authenticated_all" on public.common_inventory_names;
drop policy if exists "inventory_common_staff_select" on public.common_inventory_names;
drop policy if exists "inventory_common_admin_write" on public.common_inventory_names;
create policy "inventory_common_staff_select" on public.common_inventory_names for select to authenticated using (public.inventory_is_staff());
create policy "inventory_common_admin_write" on public.common_inventory_names for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "inventory_items_authenticated_all" on public.inventory_items;
drop policy if exists "inventory_items_staff_select" on public.inventory_items;
drop policy if exists "inventory_items_admin_write" on public.inventory_items;
create policy "inventory_items_staff_select" on public.inventory_items for select to authenticated using (public.inventory_is_staff());
create policy "inventory_items_admin_write" on public.inventory_items for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "inventory_transactions_authenticated_all" on public.inventory_transactions;
drop policy if exists "inventory_transactions_staff_select" on public.inventory_transactions;
drop policy if exists "inventory_transactions_admin_write" on public.inventory_transactions;
create policy "inventory_transactions_staff_select" on public.inventory_transactions for select to authenticated using (public.inventory_is_staff());
create policy "inventory_transactions_admin_write" on public.inventory_transactions for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "menu_item_ingredients_authenticated_all" on public.menu_item_ingredients;
drop policy if exists "menu_item_ingredients_staff_select" on public.menu_item_ingredients;
drop policy if exists "menu_item_ingredients_admin_write" on public.menu_item_ingredients;
create policy "menu_item_ingredients_staff_select" on public.menu_item_ingredients for select to authenticated using (public.inventory_is_staff());
create policy "menu_item_ingredients_admin_write" on public.menu_item_ingredients for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "expense_inventory_links_authenticated_all" on public.expense_inventory_links;
drop policy if exists "expense_inventory_links_staff_select" on public.expense_inventory_links;
drop policy if exists "expense_inventory_links_admin_write" on public.expense_inventory_links;
create policy "expense_inventory_links_staff_select" on public.expense_inventory_links for select to authenticated using (public.inventory_is_staff());
create policy "expense_inventory_links_admin_write" on public.expense_inventory_links for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "inventory_settings_authenticated_all" on public.inventory_settings;
drop policy if exists "inventory_settings_staff_select" on public.inventory_settings;
drop policy if exists "inventory_settings_admin_write" on public.inventory_settings;
create policy "inventory_settings_staff_select" on public.inventory_settings for select to authenticated using (public.inventory_is_staff());
create policy "inventory_settings_admin_write" on public.inventory_settings for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "inventory_warnings_authenticated_all" on public.inventory_warnings;
drop policy if exists "inventory_warnings_staff_select" on public.inventory_warnings;
drop policy if exists "inventory_warnings_admin_write" on public.inventory_warnings;
create policy "inventory_warnings_staff_select" on public.inventory_warnings for select to authenticated using (public.inventory_is_staff());
create policy "inventory_warnings_admin_write" on public.inventory_warnings for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.common_inventory_names,
  public.inventory_items,
  public.inventory_transactions,
  public.menu_item_ingredients,
  public.expense_inventory_links,
  public.inventory_settings,
  public.inventory_warnings
to authenticated;

revoke all on function public.add_inventory_transaction(uuid, uuid, text, numeric, text, numeric, text, text, text, uuid) from anon;
revoke all on function public.sync_expense_to_inventory(text, uuid, uuid, numeric, text, numeric, numeric, uuid) from anon;
revoke all on function public.deduct_inventory_for_pos_order(text, jsonb, uuid) from anon;
revoke all on function public.restore_inventory_for_void_order(text, uuid) from anon;

grant execute on function public.add_inventory_transaction(uuid, uuid, text, numeric, text, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.sync_expense_to_inventory(text, uuid, uuid, numeric, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.deduct_inventory_for_pos_order(text, jsonb, uuid) to authenticated;
grant execute on function public.restore_inventory_for_void_order(text, uuid) to authenticated;

insert into public.common_inventory_names (common_name, category, default_unit, description)
values
  ('Black Pearl', 'Milk Tea', 'gram', 'Standard tapioca pearl'),
  ('White Pearl', 'Milk Tea', 'gram', 'White pearl topping'),
  ('Nata', 'Toppings', 'gram', null),
  ('Grass Jelly', 'Toppings', 'gram', null),
  ('Coffee Jelly', 'Toppings', 'gram', null),
  ('Milk Tea Powder', 'Beverage', 'gram', null),
  ('Coffee Beans', 'Coffee', 'gram', null),
  ('Fresh Milk', 'Dairy', 'ml', null),
  ('Creamer', 'Beverage', 'gram', null),
  ('Sugar Syrup', 'Beverage', 'ml', null),
  ('Cup 16oz', 'Packaging', 'pc', null),
  ('Cup 22oz', 'Packaging', 'pc', null),
  ('Dome Lid', 'Packaging', 'pc', null),
  ('Flat Lid', 'Packaging', 'pc', null),
  ('Straw', 'Packaging', 'pc', null),
  ('Burger Bun', 'Food', 'pc', null),
  ('Chicken Patty', 'Food', 'pc', null),
  ('Fries', 'Food', 'gram', null),
  ('Pasta Noodles', 'Food', 'gram', null)
on conflict (common_name) do nothing;
