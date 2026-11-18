begin;
create or replace function public.inventory_reference_unit_allowed(p_unit text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(nullif(public.inventory_normalize_unit(p_unit),'') is not null and
 (public.inventory_normalize_unit(p_unit) in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') or exists(select 1 from public.finance_references where ref_type='unit' and is_active is not false and public.inventory_normalize_unit(name)=public.inventory_normalize_unit(p_unit))),false);
$$;
revoke all on function public.inventory_reference_unit_allowed(text) from public,anon,authenticated;
create or replace function validate_inventory_reference_units(p_storage text,p_bulk text,p_small text,p_factor numeric)
returns void language plpgsql set search_path=public as $$
declare converted numeric; check_qty numeric;
begin
 if not public.inventory_reference_unit_allowed(p_small) then raise exception 'Select a valid small unit.'; end if;
 if p_bulk is not null and (not public.inventory_reference_unit_allowed(p_bulk) or p_bulk=p_small) then raise exception 'Bulk and small units must be different.'; end if;
 if p_factor is null or p_factor<=0 or p_factor::text in ('NaN','Infinity','-Infinity') or p_factor<>round(p_factor,3) then raise exception 'Enter a positive reference quantity with up to 3 decimals.'; end if;
 if p_bulk is not null then
  begin converted:=inventory_convert_quantity(1,p_bulk,p_small); exception when others then converted:=null; end;
  if converted is not null and converted<>p_factor then raise exception 'These units require 1 % = % %.',p_bulk,converted,p_small; end if;
 end if;
 if p_storage is not null then
  begin check_qty:=inventory_convert_quantity(1,p_storage,p_small);
  exception when others then
   if p_bulk is null then raise exception 'Small unit must be convertible from the existing stock unit %.',p_storage; end if;
   begin check_qty:=inventory_convert_quantity(1,p_storage,p_bulk);
   exception when others then raise exception 'Bulk or small unit must match the existing stock unit %.',p_storage; end;
  end;
 end if;
end;
$$;


create or replace function save_inventory_item_reference(p_item_id uuid,p_bulk_unit text,p_small_unit text,p_units_per_bulk numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item inventory_items; bulk text:=nullif(inventory_normalize_unit(p_bulk_unit),''); small text:=inventory_normalize_unit(p_small_unit); factor numeric:=case when nullif(trim(p_bulk_unit),'') is null then 1 else p_units_per_bulk end; converted numeric; check_qty numeric;
begin
 if not inventory_is_staff() or auth.uid() is null then raise exception 'Inventory staff access required.'; end if;
 if exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier' and p.store_id is null) then raise exception 'Cashier store assignment required.'; end if;
 select * into item from inventory_items where id=p_item_id and is_active is true for update;
 if not found then raise exception 'Active inventory item required.'; end if;
 if not public.inventory_reference_unit_allowed(small) then raise exception 'Select a valid small unit.'; end if;
 if bulk is not null and (not public.inventory_reference_unit_allowed(bulk) or bulk=small) then raise exception 'Bulk and small units must be different.'; end if;
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
 update finance_references f set bulk_unit=bulk,small_unit=small,units_per_bulk=factor
 where f.ref_type='item' and f.is_active is not false
  and (lower(regexp_replace(trim(f.name),'\s+',' ','g'))=lower(regexp_replace(trim(item.item_name),'\s+',' ','g'))
   or (coalesce(item.normalized_common_name,'')<>'' and lower(regexp_replace(trim(coalesce(f.common_name,'')),'\s+',' ','g'))=item.normalized_common_name))
  and (f.bulk_unit,f.small_unit,f.units_per_bulk) is distinct from (bulk,small,factor);
 return jsonb_build_object('ok',true);
end;
$$;


notify pgrst,'reload schema';
commit;
