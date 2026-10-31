-- Informational dine-in/VIP drink counts; this function never moves stock.
begin;

create or replace function public.list_inventory_reusable_cup_totals(p_store_id text, p_inventory_date date)
returns table(common_name_id uuid, quantity numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.inventory_is_staff() then
    raise exception 'Inventory staff access required.';
  end if;
  if exists (select 1 from profiles p where p.id = auth.uid() and lower(p.role) = 'cashier'
    and p.store_id::text is distinct from p_store_id) then
    raise exception 'Cashiers can only view inventory for their assigned store.';
  end if;

  return query
  with sales as (
    select o.*,
      case when lower(coalesce(shift.mode,'')) like '%open%' then
        case when coalesce(shift.sales_summary->>'businessDate', shift.sales_summary->>'business_date','') ~ '^\d{4}-\d{2}-\d{2}$'
          then coalesce(shift.sales_summary->>'businessDate', shift.sales_summary->>'business_date')::date
          else (shift.created_at at time zone 'Asia/Manila')::date end
        else (o.created_at at time zone 'Asia/Manila')::date end as business_date
    from orders o
    left join lateral (
      select s.mode, s.created_at, s.sales_summary from cashier_pos s
      where s.store_id::text = p_store_id and s.created_at <= o.created_at
      order by s.created_at desc limit 1
    ) shift on true
    where coalesce(o.store_id,o.branch_id)::text = p_store_id
      and o.created_at >= (p_inventory_date::timestamp at time zone 'Asia/Manila')
      and o.created_at < ((p_inventory_date + 2)::timestamp at time zone 'Asia/Manila')
      and o.status in ('paid','completed') and o.voided_at is null and o.refunded_at is null
      and lower(coalesce(o.dining_option,'') || ' ' || coalesce(o.order_type,'')) ~ '\m(vip|table)\M|dine[ -]*in'
  )
  select r.common_name_id, sum((line->>'quantity')::numeric * r.quantity_required * coalesce(r.deduction_multiplier,1))
  from sales o cross join lateral jsonb_array_elements(o.items) line
  left join menu_items m on m.id::text = coalesce(line->>'menu_item_id',line->>'menuItemId',line->>'id')
  join menu_item_ingredients r on r.menu_item_id = 'category:' || coalesce(nullif(line->>'category',''),m.category)
    and r.variant_key = inventory_drink_cup_size(line) and r.is_active is not false
  where o.business_date = p_inventory_date and coalesce((line->>'quantity')::numeric,0) > 0
  group by r.common_name_id;
end;
$$;

revoke all on function public.list_inventory_reusable_cup_totals(text,date) from public, anon;
grant execute on function public.list_inventory_reusable_cup_totals(text,date) to authenticated;
notify pgrst, 'reload schema';
commit;
