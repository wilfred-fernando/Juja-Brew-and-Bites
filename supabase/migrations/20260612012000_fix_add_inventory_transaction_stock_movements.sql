-- Keep new inventory movements compatible with the legacy stock_movements table.
-- stock_movements.stock_item_id references stock_items, not inventory_items.

begin;

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
    null,
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

commit;
