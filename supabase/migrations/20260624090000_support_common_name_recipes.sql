-- Support recipe ingredients that are configured by Common Name instead of a single Item Name.
-- Existing item-specific recipe rows continue to work. Common-name rows resolve to an
-- active inventory item with that common name at deduction time.

begin;

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
      item_row := null;

      if recipe.inventory_item_id is not null then
        select * into item_row
        from public.inventory_items
        where id = recipe.inventory_item_id
          and is_active is not false;
      end if;

      if item_row.id is null and recipe.common_name_id is not null then
        select * into item_row
        from public.inventory_items
        where common_name_id = recipe.common_name_id
          and is_active is not false
        order by current_stock desc nulls last, updated_at desc nulls last
        limit 1;
      end if;

      if item_row.id is null then
        missing_count := missing_count + 1;
        insert into public.inventory_warnings(warning_type, reference_type, reference_id, menu_item_id, message)
        values (
          'missing_inventory_item',
          'pos_order',
          p_order_id,
          cart_line->>'menu_item_id',
          'Recipe common name has no active inventory item for ' || coalesce(cart_line->>'name', cart_line->>'menu_item_id') || '. No stock was deducted.'
        );
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

revoke all on function public.deduct_inventory_for_pos_order(text, jsonb, uuid) from anon;
grant execute on function public.deduct_inventory_for_pos_order(text, jsonb, uuid) to authenticated;

commit;
