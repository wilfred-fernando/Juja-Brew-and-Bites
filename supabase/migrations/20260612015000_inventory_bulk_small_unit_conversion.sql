-- Add item-specific bulk/small unit conversion for inventory stock.
-- Finance Reference "Item Name" can define one inventory bulk unit as a smaller unit,
-- for example 1 pack = 1000 gram. Inventory sync and POS deductions use this map.

begin;

create or replace function public.inventory_convert_quantity_for_item(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_from_unit text,
  p_to_unit text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_unit text := public.inventory_normalize_unit(p_from_unit);
  to_unit text := public.inventory_normalize_unit(p_to_unit);
  item_row public.inventory_items;
  ref_row public.finance_references;
  ref_unit text;
begin
  if from_unit = to_unit then
    return p_quantity;
  end if;

  begin
    return public.inventory_convert_quantity(p_quantity, p_from_unit, p_to_unit);
  exception
    when others then
      null;
  end;

  select *
  into item_row
  from public.inventory_items
  where id = p_inventory_item_id;

  if not found then
    raise exception 'Inventory item was not found for unit conversion.';
  end if;

  select *
  into ref_row
  from public.finance_references fr
  where fr.ref_type = 'item'
    and fr.is_active is not false
    and regexp_replace(lower(trim(coalesce(fr.name, ''))), '\s+', ' ', 'g')
      = regexp_replace(lower(trim(coalesce(item_row.item_name, ''))), '\s+', ' ', 'g')
    and coalesce(fr.reference_quantity, 0) > 0
    and nullif(fr.reference_unit, '') is not null
  order by fr.updated_at desc nulls last, fr.created_at desc nulls last
  limit 1;

  if found then
    ref_unit := public.inventory_normalize_unit(ref_row.reference_unit);

    if from_unit = public.inventory_normalize_unit(item_row.unit) and to_unit = ref_unit then
      return p_quantity * ref_row.reference_quantity;
    end if;

    if from_unit = ref_unit and to_unit = public.inventory_normalize_unit(item_row.unit) then
      return p_quantity / ref_row.reference_quantity;
    end if;
  end if;

  raise exception 'Unit conversion needed. Please check inventory unit. % to %', p_from_unit, p_to_unit;
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

  converted_quantity := public.inventory_convert_quantity_for_item(p_inventory_item_id, p_quantity, p_unit, item_row.unit);

  select * into existing_link
  from public.expense_inventory_links
  where expense_id = p_expense_id
  limit 1;

  if found then
    had_existing_link := true;
    if existing_link.inventory_item_id = p_inventory_item_id then
      delta_quantity := converted_quantity - public.inventory_convert_quantity_for_item(item_row.id, existing_link.purchased_quantity, existing_link.purchased_unit, item_row.unit);
    else
      select * into previous_item from public.inventory_items where id = existing_link.inventory_item_id;
      if found then
        previous_quantity := public.inventory_convert_quantity_for_item(previous_item.id, existing_link.purchased_quantity, existing_link.purchased_unit, previous_item.unit);
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
      deduction_qty := public.inventory_convert_quantity_for_item(item_row.id, needed_qty, recipe.unit, item_row.unit);

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

create or replace function public.reconcile_expense_inventory_purchases()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row record;
  item_row public.inventory_items;
  converted_quantity numeric;
  synced_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
begin
  if auth.uid() is not null and not public.inventory_is_admin() then
    raise exception 'Only admin accounts can reconcile inventory purchases.';
  end if;

  for expense_row in
    select e.*
    from public.finance_expenses e
    where e.inventory_item_id is not null
      and coalesce(e.quantity, 0) > 0
      and not exists (
        select 1
        from public.expense_inventory_links l
        where l.expense_id = e.id
      )
    order by e.expense_date, e.created_at
  loop
    begin
      select * into item_row
      from public.inventory_items
      where id = expense_row.inventory_item_id
        and is_active is not false;

      if not found then
        skipped_count := skipped_count + 1;
        update public.finance_expenses
        set inventory_sync_status = 'needs_mapping'
        where id = expense_row.id;
        continue;
      end if;

      converted_quantity := public.inventory_convert_quantity_for_item(
        item_row.id,
        expense_row.quantity,
        coalesce(nullif(expense_row.unit, ''), item_row.unit),
        item_row.unit
      );

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
        expense_row.id,
        item_row.id,
        item_row.common_name_id,
        expense_row.quantity,
        public.inventory_normalize_unit(coalesce(nullif(expense_row.unit, ''), item_row.unit)),
        expense_row.unit_price,
        expense_row.total
      );

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
        created_by,
        created_at
      )
      values (
        item_row.id,
        item_row.common_name_id,
        'purchase',
        converted_quantity,
        item_row.unit,
        converted_quantity,
        'expense',
        expense_row.id,
        'Expense purchase reconciliation',
        expense_row.created_by,
        coalesce(expense_row.created_at, now())
      );

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
        item_row.id,
        null,
        'purchase',
        'purchase',
        converted_quantity,
        item_row.unit,
        'expense',
        expense_row.id,
        'expense',
        expense_row.id,
        'Expense purchase reconciliation',
        expense_row.created_by,
        coalesce(expense_row.created_at, now())
      );

      update public.inventory_items
      set current_stock = current_stock + converted_quantity,
          cost_per_unit = coalesce(expense_row.unit_price, cost_per_unit),
          supplier = coalesce(nullif(expense_row.supplier_name, ''), supplier),
          updated_at = now()
      where id = item_row.id;

      update public.finance_expenses
      set inventory_sync_status = 'synced',
          inventory_synced_at = now()
      where id = expense_row.id;

      update public.finance_petty_cash_entries
      set inventory_sync_status = 'synced',
          inventory_synced_at = now()
      where id = expense_row.petty_cash_entry_id;

      synced_count := synced_count + 1;
    exception
      when others then
        failed_count := failed_count + 1;
        update public.finance_expenses
        set inventory_sync_status = 'needs_mapping'
        where id = expense_row.id;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'synced', synced_count,
    'skipped', skipped_count,
    'failed', failed_count
  );
end;
$$;

revoke all on function public.inventory_convert_quantity_for_item(uuid, numeric, text, text) from anon;
grant execute on function public.inventory_convert_quantity_for_item(uuid, numeric, text, text) to authenticated;

commit;
