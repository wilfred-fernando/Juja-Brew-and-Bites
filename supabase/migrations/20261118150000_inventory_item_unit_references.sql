begin;
alter table inventory_items add column if not exists bulk_unit text;
alter table inventory_items add column if not exists small_unit text;
alter table inventory_items add column if not exists units_per_bulk numeric(14,3);

create or replace function save_inventory_item_reference(p_item_id uuid,p_bulk_unit text,p_small_unit text,p_units_per_bulk numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item inventory_items; bulk text:=nullif(inventory_normalize_unit(p_bulk_unit),''); small text:=inventory_normalize_unit(p_small_unit); factor numeric:=case when nullif(trim(p_bulk_unit),'') is null then 1 else p_units_per_bulk end; converted numeric; check_qty numeric;
begin
 if not inventory_is_staff() or auth.uid() is null then raise exception 'Inventory staff access required.'; end if;
 if exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier' and p.store_id is null) then raise exception 'Cashier store assignment required.'; end if;
 select * into item from inventory_items where id=p_item_id and is_active is true for update;
 if not found then raise exception 'Active inventory item required.'; end if;
 if small not in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') or small is null or small='' then raise exception 'Select a valid small unit.'; end if;
 if bulk is not null and (bulk not in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') or bulk=small) then raise exception 'Bulk and small units must be different.'; end if;
 if factor is null or factor<=0 or factor::text in ('NaN','Infinity','-Infinity') or factor<>round(factor,3) then raise exception 'Enter a positive reference quantity with up to 3 decimals.'; end if;
 if bulk is not null then
  begin converted:=inventory_convert_quantity(1,bulk,small); exception when others then converted:=null; end;
  if converted is not null and converted<>factor then raise exception 'These units require 1 % = % %.',bulk,converted,small; end if;
 end if;
 begin check_qty:=inventory_convert_quantity(1,item.unit,small);
 exception when others then
  if bulk is null then raise exception 'Small unit must be convertible from the existing stock unit %.',item.unit; end if;
  begin check_qty:=inventory_convert_quantity(1,item.unit,bulk);
  exception when others then raise exception 'Bulk or small unit must match the existing stock unit %.',item.unit; end;
 end;
 update inventory_items set bulk_unit=bulk,small_unit=small,units_per_bulk=factor,updated_at=now() where id=item.id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function save_inventory_item_reference(uuid,text,text,numeric) from public,anon;
grant execute on function save_inventory_item_reference(uuid,text,text,numeric) to authenticated;
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
  small_quantity numeric;
begin
  if from_unit = to_unit then
    return p_quantity;
  end if;

  select * into item_row from public.inventory_items where id=p_inventory_item_id;
  if not found then raise exception 'Inventory item was not found for unit conversion.'; end if;
  if item_row.small_unit is not null then
    if from_unit=item_row.bulk_unit then small_quantity:=p_quantity*item_row.units_per_bulk;
    else
      begin small_quantity:=inventory_convert_quantity(p_quantity,from_unit,item_row.small_unit);
      exception when others then
        if item_row.bulk_unit is null then raise; end if;
        small_quantity:=inventory_convert_quantity(p_quantity,from_unit,item_row.bulk_unit)*item_row.units_per_bulk;
      end;
    end if;
    if to_unit=item_row.bulk_unit then return small_quantity/item_row.units_per_bulk; end if;
    begin return inventory_convert_quantity(small_quantity,item_row.small_unit,to_unit);
    exception when others then
      if item_row.bulk_unit is null then raise; end if;
      return inventory_convert_quantity(small_quantity/item_row.units_per_bulk,item_row.bulk_unit,to_unit);
    end;
  end if;
  begin return inventory_convert_quantity(p_quantity,p_from_unit,p_to_unit);
  exception when others then null; end;

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

notify pgrst, 'reload schema';
commit;
