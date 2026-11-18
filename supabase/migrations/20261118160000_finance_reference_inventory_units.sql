begin;
alter table finance_references add column if not exists bulk_unit text;
alter table finance_references add column if not exists small_unit text;
alter table finance_references add column if not exists units_per_bulk numeric(14,3);

create or replace function validate_inventory_reference_units(p_storage text,p_bulk text,p_small text,p_factor numeric)
returns void language plpgsql set search_path=public as $$
declare converted numeric; check_qty numeric;
begin
 if p_small is null or p_small not in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') then raise exception 'Select a valid small unit.'; end if;
 if p_bulk is not null and (p_bulk not in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') or p_bulk=p_small) then raise exception 'Bulk and small units must be different.'; end if;
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

create or replace function normalize_finance_inventory_reference()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ref_type<>'item' then
  new.bulk_unit:=null;new.small_unit:=null;new.units_per_bulk:=null;
 elsif new.bulk_unit is not null or new.small_unit is not null or new.units_per_bulk is not null then
  new.bulk_unit:=nullif(inventory_normalize_unit(new.bulk_unit),'');new.small_unit:=inventory_normalize_unit(new.small_unit);
  if new.bulk_unit is null then new.units_per_bulk:=1; end if;
  perform validate_inventory_reference_units(null,new.bulk_unit,new.small_unit,new.units_per_bulk);
 end if;
 return new;
end;
$$;
create or replace function apply_finance_inventory_reference()
returns trigger language plpgsql security definer set search_path=public as $$
declare item inventory_items;
begin
 if new.ref_type<>'item' or new.small_unit is null or new.is_active is false then return new; end if;
 select i.* into item from inventory_items i where i.is_active is true and
  (lower(regexp_replace(trim(i.item_name),'\s+',' ','g'))=lower(regexp_replace(trim(new.name),'\s+',' ','g'))
   or (trim(coalesce(new.common_name,''))<>'' and i.normalized_common_name=lower(regexp_replace(trim(new.common_name),'\s+',' ','g'))))
 order by (lower(trim(i.item_name))=lower(trim(new.name))) desc,i.id limit 1;
 if found and (item.bulk_unit,item.small_unit,item.units_per_bulk) is distinct from (new.bulk_unit,new.small_unit,new.units_per_bulk) then
  perform save_inventory_item_reference(item.id,new.bulk_unit,new.small_unit,new.units_per_bulk);
 end if;
 return new;
end;
$$;

create or replace function inherit_finance_inventory_reference()
returns trigger language plpgsql security definer set search_path=public as $$
declare ref finance_references;
begin
 if new.small_unit is null then
  select f.* into ref from finance_references f where f.ref_type='item' and f.is_active is not false and f.small_unit is not null
   and (lower(regexp_replace(trim(f.name),'\s+',' ','g'))=lower(regexp_replace(trim(new.item_name),'\s+',' ','g'))
    or (trim(coalesce(new.common_name,''))<>'' and lower(regexp_replace(trim(coalesce(f.common_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(new.common_name),'\s+',' ','g'))))
  order by (lower(trim(f.name))=lower(trim(new.item_name))) desc,f.updated_at desc nulls last,f.id limit 1;
  if found then new.bulk_unit:=ref.bulk_unit;new.small_unit:=ref.small_unit;new.units_per_bulk:=ref.units_per_bulk; end if;
 end if;
 if new.small_unit is not null then perform validate_inventory_reference_units(inventory_normalize_unit(new.unit),new.bulk_unit,new.small_unit,new.units_per_bulk); end if;
 return new;
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
 update finance_references f set bulk_unit=bulk,small_unit=small,units_per_bulk=factor
 where f.ref_type='item' and f.is_active is not false
  and (lower(regexp_replace(trim(f.name),'\s+',' ','g'))=lower(regexp_replace(trim(item.item_name),'\s+',' ','g'))
   or (coalesce(item.normalized_common_name,'')<>'' and lower(regexp_replace(trim(coalesce(f.common_name,'')),'\s+',' ','g'))=item.normalized_common_name))
  and (f.bulk_unit,f.small_unit,f.units_per_bulk) is distinct from (bulk,small,factor);
 return jsonb_build_object('ok',true);
end;
$$;

drop trigger if exists normalize_finance_inventory_reference on finance_references;
create trigger normalize_finance_inventory_reference before insert or update on finance_references for each row execute function normalize_finance_inventory_reference();
drop trigger if exists apply_finance_inventory_reference on finance_references;
create trigger apply_finance_inventory_reference after insert or update on finance_references for each row execute function apply_finance_inventory_reference();
drop trigger if exists inherit_finance_inventory_reference on inventory_items;
create trigger inherit_finance_inventory_reference before insert on inventory_items for each row execute function inherit_finance_inventory_reference();
revoke all on function validate_inventory_reference_units(text,text,text,numeric) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
