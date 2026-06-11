-- Fix inventory expense reconciliation for legacy stock_movements compatibility.
-- stock_movements.stock_item_id references stock_items, not inventory_items, so keep it null
-- when the movement is generated from the newer inventory_items system.

begin;

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

      converted_quantity := public.inventory_convert_quantity(
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

select public.reconcile_expense_inventory_purchases();

commit;
