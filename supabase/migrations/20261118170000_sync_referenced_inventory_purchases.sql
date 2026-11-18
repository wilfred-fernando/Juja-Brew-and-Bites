begin;
create or replace function public.sync_referenced_inventory_purchase(p_expense_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  expense finance_expenses;
  ref finance_references;
  item inventory_items;
  actor uuid := auth.uid();
  common_label text;
  common_key text;
  common_id uuid;
  purchase_unit text;
  stock_unit text;
  stock_quantity numeric;
  result jsonb;
begin
  if actor is null or not inventory_is_staff() then
    raise exception 'Inventory staff access required.';
  end if;

  select e.* into expense from finance_expenses e
  where e.id=p_expense_id and (inventory_is_admin() or (
    e.entry_source='petty_cash' and exists(select 1 from profiles p
      where p.id=actor and lower(p.role)='cashier' and p.store_id::text=e.store_id::text)
  )) for update;
  if not found then raise exception 'Expense is unavailable.'; end if;
  if expense.store_id is null or coalesce(expense.quantity,0)<=0 then return null; end if;

  select f.* into ref from finance_references f
  where f.ref_type='item' and f.is_active is true
    and (inventory_is_admin() or f.show_to_cashier is true)
    and lower(regexp_replace(trim(f.name),'\s+',' ','g'))=
        lower(regexp_replace(trim(expense.description),'\s+',' ','g'))
  order by f.updated_at desc nulls last,f.id
  limit 1;
  if not found then return null; end if;

  purchase_unit:=inventory_normalize_unit(expense.unit);
  if purchase_unit=ref.bulk_unit and ref.units_per_bulk>0 and ref.small_unit is not null then
    stock_quantity:=expense.quantity*ref.units_per_bulk;
    stock_unit:=ref.small_unit;
  elsif purchase_unit=ref.small_unit then
    stock_quantity:=expense.quantity;
    stock_unit:=ref.small_unit;
  elsif ref.bulk_unit is null and ref.reference_quantity>0 and ref.reference_unit is not null then
    stock_quantity:=expense.quantity*ref.reference_quantity;
    stock_unit:=inventory_normalize_unit(ref.reference_unit);
  else
    return null;
  end if;

  common_label:=coalesce(nullif(trim(ref.common_name),''),trim(ref.name));
  common_key:=lower(regexp_replace(common_label,'\s+',' ','g'));
  perform pg_advisory_xact_lock(hashtext('inventory-common-'||common_key));
  select i.* into item from inventory_items i where i.is_active is true
    and i.normalized_common_name=common_key for update;
  if not found then
    insert into common_inventory_names(common_name,default_unit,category)
    values(common_label,stock_unit,ref.item_category)
    on conflict(common_name) do nothing;
    select c.id into common_id from common_inventory_names c where c.common_name=common_label;
    insert into inventory_items(item_name,common_name,common_name_id,unit,category)
    values(ref.name,common_label,common_id,stock_unit,ref.item_category)
    returning * into item;
  end if;

  result:=sync_expense_to_inventory(expense.id,item.id,item.common_name_id,stock_quantity,
    stock_unit,expense.total/stock_quantity,expense.total,actor);
  if not coalesce((result->>'ok')::boolean,false) then
    raise exception '%',coalesce(result->>'message','Inventory sync failed.');
  end if;

  update finance_expenses set inventory_item_id=item.id where id=expense.id;
  if expense.petty_cash_entry_id is not null then
    update finance_petty_cash_entries set inventory_item_id=item.id,
      inventory_sync_status='synced',inventory_synced_at=now()
    where id=expense.petty_cash_entry_id and store_id::text=expense.store_id::text;
  end if;
  return result;
end;
$$;
revoke all on function public.sync_referenced_inventory_purchase(text) from public,anon;
grant execute on function public.sync_referenced_inventory_purchase(text) to authenticated;
notify pgrst,'reload schema';
commit;
