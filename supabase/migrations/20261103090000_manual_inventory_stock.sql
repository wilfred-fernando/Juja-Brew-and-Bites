begin;
alter table public.inventory_items add column if not exists is_manual boolean not null default false;

create table if not exists public.inventory_manual_additions (
 id uuid primary key,
 store_id uuid not null references public.stores(id),
 inventory_item_id uuid not null references public.inventory_items(id),
 inventory_date date not null,
 quantity numeric(14,3) not null check(quantity>=0),
 unit text not null,
 note text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists inventory_manual_additions_store_date on public.inventory_manual_additions(store_id,inventory_date);
alter table public.inventory_manual_additions enable row level security;
drop policy if exists inventory_manual_additions_staff_read on public.inventory_manual_additions;
create policy inventory_manual_additions_staff_read on public.inventory_manual_additions for select to authenticated using (
 inventory_is_admin() or exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier' and p.store_id=inventory_manual_additions.store_id)
);
revoke all on public.inventory_manual_additions from anon,authenticated;
grant select on public.inventory_manual_additions to authenticated;

create or replace function public.add_manual_inventory_stock(
 p_request_id uuid,p_store_id uuid,p_inventory_date date,p_inventory_item_id uuid,
 p_item_name text,p_common_name text,p_category text,p_quantity numeric,p_unit text,p_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 actor uuid:=auth.uid(); item inventory_items; receipt inventory_manual_additions;
 normalized_common text:=lower(regexp_replace(trim(coalesce(nullif(p_common_name,''),p_item_name,'')),'\s+',' ','g'));
 common_id uuid; unit_value text:=inventory_normalize_unit(p_unit); tx_id uuid; qty numeric:=round(p_quantity,3);
begin
 if actor is null or not inventory_is_staff() then raise exception 'Inventory staff access required.'; end if;
 if exists(select 1 from profiles p where p.id=actor and lower(p.role)='cashier' and p.store_id is distinct from p_store_id) then
  raise exception 'Cashiers can only add stock to their assigned store.';
 end if;
 if p_request_id is null or p_inventory_date is null or not exists(select 1 from stores s where s.id=p_store_id and s.is_active is not false) then
  raise exception 'Select an active store and inventory date.';
 end if;
 if p_quantity is null or p_quantity<0 or p_quantity<>qty or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid quantity with up to 3 decimals.'; end if;
 if unit_value not in ('pc','pack','box','gram','kg','ml','liter','bottle','can','bag') or unit_value is null or unit_value='' then raise exception 'Select a valid inventory unit.'; end if;
 perform pg_advisory_xact_lock(hashtext('manual-inventory-'||p_request_id::text));
 select * into receipt from inventory_manual_additions where id=p_request_id;
 if found then
  if receipt.created_by<>actor or receipt.store_id<>p_store_id or receipt.inventory_date<>p_inventory_date
   or receipt.quantity<>qty or receipt.unit<>unit_value
   or (p_inventory_item_id is not null and receipt.inventory_item_id<>p_inventory_item_id)
   or (p_inventory_item_id is null and normalized_common is distinct from (select i.normalized_common_name from inventory_items i where i.id=receipt.inventory_item_id))
   or receipt.note is distinct from nullif(trim(p_note),'') then raise exception 'This request was already used for a different stock entry.'; end if;
  return jsonb_build_object('ok',true,'duplicate',true,'inventory_item_id',receipt.inventory_item_id);
 end if;
 if p_inventory_item_id is not null then
  select * into item from inventory_items where id=p_inventory_item_id and is_active is true for update;
  if not found then raise exception 'Select an active inventory item.'; end if;
  if qty<=0 then raise exception 'Enter a positive quantity for existing stock.'; end if;
 else
  if trim(coalesce(p_item_name,''))='' or normalized_common='' then raise exception 'Item name and common name are required.'; end if;
  perform pg_advisory_xact_lock(hashtext('inventory-common-'||normalized_common));
  select * into item from inventory_items where normalized_common_name=normalized_common and is_active is true for update;
  if not found then
   if exists(select 1 from inventory_items i where lower(trim(i.item_name))=lower(trim(p_item_name)) and i.is_active is true) then raise exception 'Item name already exists. Select the existing item.'; end if;
   select id into common_id from common_inventory_names c where lower(regexp_replace(trim(c.common_name),'\s+',' ','g'))=normalized_common order by created_at limit 1;
   if common_id is null then insert into common_inventory_names(common_name,category,default_unit) values(trim(coalesce(nullif(p_common_name,''),p_item_name)),nullif(trim(p_category),''),unit_value) returning id into common_id; end if;
   insert into inventory_items(item_name,common_name,common_name_id,category,unit,is_manual)
   values(trim(p_item_name),trim(coalesce(nullif(p_common_name,''),p_item_name)),common_id,nullif(trim(p_category),''),unit_value,true) returning * into item;
  end if;
 end if;
 if inventory_normalize_unit(item.unit)<>unit_value then raise exception 'Use the existing item unit: %',item.unit; end if;
 update inventory_items set is_manual=true where id=item.id;
 insert into inventory_manual_additions(id,store_id,inventory_item_id,inventory_date,quantity,unit,note,created_by)
 values(p_request_id,p_store_id,item.id,p_inventory_date,qty,unit_value,nullif(trim(p_note),''),actor);
 if qty>0 then
  insert into inventory_transactions(inventory_item_id,common_name_id,transaction_type,quantity,unit,quantity_effect,reference_type,reference_id,notes,created_by)
  values(item.id,item.common_name_id,'manual_adjustment',qty,unit_value,qty,'inventory_manual_addition',p_request_id::text,nullif(trim(p_note),''),actor) returning id into tx_id;
  update inventory_items set current_stock=current_stock+qty,updated_at=now() where id=item.id;
  insert into stock_movements(inventory_item_id,stock_item_id,movement_type,type,quantity,unit,source_type,source_id,ref_entity,ref_id,notes,created_by)
  values(item.id,null,'adjustment','adjustment',qty,unit_value,'inventory_manual_addition',p_request_id::text,'inventory_manual_addition',p_request_id::text,nullif(trim(p_note),''),actor);
  -- Keep already-saved daily snapshots consistent with a dated stock receipt.
  update finance_daily_inventory_entries set
   reorder_quantity=reorder_quantity+case when inventory_date=p_inventory_date then qty else 0 end,
   beginning_quantity=beginning_quantity+case when inventory_date>p_inventory_date then qty else 0 end,
   ending_quantity=ending_quantity+qty,updated_by=actor
  where store_id=p_store_id and inventory_item_id=item.id and inventory_date>=p_inventory_date;
 end if;
 return jsonb_build_object('ok',true,'inventory_item_id',item.id,'quantity',qty);
end;
$$;
revoke all on function public.add_manual_inventory_stock(uuid,uuid,date,uuid,text,text,text,numeric,text,text) from public,anon;
grant execute on function public.add_manual_inventory_stock(uuid,uuid,date,uuid,text,text,text,numeric,text,text) to authenticated;

create or replace function public.list_inventory_purchased_item_ids()
returns table(inventory_item_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not inventory_is_staff() then raise exception 'Inventory staff access required.'; end if;
  return query
    select e.inventory_item_id from finance_expenses e where e.inventory_item_id is not null
    union select p.inventory_item_id from finance_petty_cash_entries p where p.inventory_item_id is not null
    union select m.inventory_item_id from inventory_manual_additions m;
end;
$$;

create or replace function public.list_inventory_purchases(p_store_id text, p_through_date date)
returns table(id text, expense_date date, inventory_item_id uuid, quantity numeric, unit text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not inventory_is_staff() then raise exception 'Inventory staff access required.'; end if;
  if exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier'
    and p.store_id::text is distinct from p_store_id) then
    raise exception 'Cashiers can only view inventory for their assigned store.';
  end if;
  return query
    select e.id::text, e.expense_date, e.inventory_item_id,
      coalesce(l.purchased_quantity,e.quantity), coalesce(l.purchased_unit,e.unit)
    from finance_expenses e
    left join lateral (select x.purchased_quantity,x.purchased_unit from expense_inventory_links x
      where x.expense_id=e.id and x.inventory_item_id=e.inventory_item_id order by x.id limit 1) l on true
    where e.inventory_item_id is not null and e.expense_date<=p_through_date
      and (e.store_id::text=p_store_id or exists(select 1 from finance_petty_cash_entries p
        where p.id=e.petty_cash_entry_id and p.store_id::text=p_store_id))
    union all
    select 'petty:'||p.id::text, p.expense_date, p.inventory_item_id,p.quantity,p.unit
    from finance_petty_cash_entries p
    where p.store_id::text=p_store_id and p.expense_date<=p_through_date and p.inventory_item_id is not null
      and not exists(select 1 from finance_expenses e where e.petty_cash_entry_id=p.id)
    union all select 'manual:'||m.id::text,m.inventory_date,m.inventory_item_id,m.quantity,m.unit
    from inventory_manual_additions m where m.store_id::text=p_store_id and m.inventory_date<=p_through_date and m.quantity>0;
end;
$$;

notify pgrst, 'reload schema';
commit;
