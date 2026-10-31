begin;

-- Expose inventory identifiers and quantities, without expense/payment amounts.
create or replace function public.list_inventory_purchased_item_ids()
returns table(inventory_item_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not inventory_is_staff() then raise exception 'Inventory staff access required.'; end if;
  return query
    select e.inventory_item_id from finance_expenses e where e.inventory_item_id is not null
    union select p.inventory_item_id from finance_petty_cash_entries p where p.inventory_item_id is not null;
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
      and not exists(select 1 from finance_expenses e where e.petty_cash_entry_id=p.id);
end;
$$;

revoke all on function public.list_inventory_purchased_item_ids() from public,anon;
revoke all on function public.list_inventory_purchases(text,date) from public,anon;
grant execute on function public.list_inventory_purchased_item_ids() to authenticated;
grant execute on function public.list_inventory_purchases(text,date) to authenticated;

drop policy if exists finance_inventory_transfers_staff_insert on public.finance_inventory_transfers;
create policy finance_inventory_transfers_staff_insert on public.finance_inventory_transfers
for insert to authenticated with check (
  inventory_is_admin() or (
    created_by=auth.uid()
    and exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier'
      and p.store_id=finance_inventory_transfers.from_store_id)
    and exists(select 1 from stores s where s.id=finance_inventory_transfers.to_store_id and s.is_active is not false)
    and exists(select 1 from inventory_items i where i.id=finance_inventory_transfers.inventory_item_id and i.is_active is true
      and inventory_normalize_unit(i.unit)=inventory_normalize_unit(finance_inventory_transfers.unit))
  )
);

drop policy if exists finance_inventory_transfers_staff_select on public.finance_inventory_transfers;
create policy finance_inventory_transfers_staff_select on public.finance_inventory_transfers
for select to authenticated using (
  inventory_is_admin() or exists(select 1 from profiles p where p.id=auth.uid() and lower(p.role)='cashier'
    and p.store_id in (finance_inventory_transfers.from_store_id,finance_inventory_transfers.to_store_id))
);

notify pgrst, 'reload schema';
commit;
