-- Category cup recipes use the existing ingredient, common-name and stock movement format.
-- No historical orders, balances or purchase entries are changed.
begin;

insert into public.common_inventory_names(common_name, default_unit, category, description)
select name, 'pc', 'Packaging', 'Cup used by menu category and drink size.'
from (values ('Slim Cup - 16oz'), ('Slim Cup - 22oz'), ('Pet Cup - 16oz'), ('Pet Cup - 20oz')) v(name)
on conflict (common_name) do nothing;

-- One stock master per common name, following the existing inventory master convention.
insert into public.inventory_items(item_name, common_name, common_name_id, category, unit)
select coalesce((select f.name from public.finance_references f
  where f.ref_type = 'item' and f.is_active is not false and f.common_name = c.common_name
  order by (f.name like 'JUJA%') desc, f.name limit 1), c.common_name),
  c.common_name, c.id, 'Packaging', 'pc'
from public.common_inventory_names c
where c.common_name in ('Slim Cup - 16oz', 'Slim Cup - 22oz', 'Pet Cup - 16oz', 'Pet Cup - 20oz')
  and not exists (select 1 from public.inventory_items i where i.common_name_id = c.id or i.common_name = c.common_name);

insert into public.menu_item_ingredients(menu_item_id, variant_key, variant_name, common_name_id, quantity_required, unit)
select 'category:' || v.category, s.size, initcap(s.size), c.id, 1, 'pc'
from (values
 ('JUICE','Slim'), ('MILK TEA (CLASSIC)','Slim'), ('MILK TEA (CHEESECAKE)','Slim'),
 ('MILK TEA (SEA SALT)','Slim'), ('SHAKE','Slim'),
 ('LATTE (COFFEE)','Pet'), ('LATTE (NON-COFFEE)','Pet'), ('LATTE (SIGNATURE)','Pet'),
 ('FRAPPE (COFFEE)','Pet'), ('FRAPPE (NON-COFFEE)','Pet'), ('SODA','Pet'), ('PARFAIT','Pet'), ('TIRAMISU (LATTE)','Pet')
) v(category, family)
cross join (values ('regular'),('large')) s(size)
join public.common_inventory_names c on c.common_name = v.family || ' Cup - ' ||
  case when s.size = 'regular' then '16oz' when v.family = 'Slim' then '22oz' else '20oz' end
where not exists (select 1 from public.menu_item_ingredients r
  where r.menu_item_id = 'category:' || v.category and r.variant_key = s.size and r.common_name_id = c.id);

create or replace function public.inventory_drink_cup_size(p_line jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
  option_row jsonb;
  label text := '';
  options jsonb := coalesce(p_line->'selected_options', p_line->'selectedOptions', '[]'::jsonb);
begin
  if jsonb_typeof(options) = 'array' then
    for option_row in select value from jsonb_array_elements(options) loop
      if lower(coalesce(option_row->>'groupName', option_row->>'group_name', 'variant')) in ('variant', 'size') then
        label := label || ' ' || coalesce(option_row->>'name', '');
      end if;
    end loop;
  end if;
  if trim(label) = '' then
    label := coalesce(p_line->>'variant_name', p_line->>'variantName', p_line->>'variant', '');
  end if;
  label := lower(label);
  if label ~ '\mhot\M' then return null; end if;
  if label ~ '\mlarge\M|\(l\)|\m(20|22)\s*oz\M' then return 'large'; end if;
  if label ~ '\mregular\M|\(r\)|\m16\s*oz\M' or trim(label) = '' then return 'regular'; end if;
  return null;
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
  saved_items jsonb;
  line_index bigint;
  menu_row public.menu_items;
  cup_size text;
  cup_common_ids uuid[];
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

  select inventory_deducted, items into order_done, saved_items from public.orders where id::text = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order was not found for inventory deduction.');
  end if;
  if coalesce(order_done, false) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'message', 'Inventory already deducted.');
  end if;

  select array_agg(id) into cup_common_ids from public.common_inventory_names
  where common_name in ('Slim Cup - 16oz', 'Slim Cup - 22oz', 'Pet Cup - 16oz', 'Pet Cup - 20oz');

  for cart_line, line_index in select value, ordinality from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality
  loop
    select * into menu_row from public.menu_items where id::text = cart_line->>'menu_item_id';
    -- Saved selections also support POS clients built before selected_options was sent.
    if not (cart_line ? 'selected_options') and (saved_items->(line_index::int - 1)->>'id') = (cart_line->>'menu_item_id') then
      cart_line := (saved_items->(line_index::int - 1)) || cart_line;
    end if;
    cup_size := public.inventory_drink_cup_size(cart_line);
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

    if not exists (select 1 from public.menu_item_ingredients c
      where c.menu_item_id = 'category:' || menu_row.category and c.variant_key = cup_size and c.is_active is not false)
    and not exists (
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
      where is_active is not false and (
        (menu_item_id = cart_line->>'menu_item_id'
        and (
          (has_variant_recipe and variant_key = line_variant_key)
          or (not has_variant_recipe and coalesce(variant_key, '') = '')
        )
        -- Category cup rows replace any manual cup ingredient for these categories.
        and not (coalesce(common_name_id = any(coalesce(cup_common_ids, '{}'::uuid[])), false)
          and exists (select 1 from public.menu_item_ingredients c where c.menu_item_id = 'category:' || menu_row.category)))
        or (menu_item_id = 'category:' || menu_row.category and variant_key = cup_size)
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

revoke all on function public.inventory_drink_cup_size(jsonb) from public;
grant execute on function public.inventory_drink_cup_size(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
