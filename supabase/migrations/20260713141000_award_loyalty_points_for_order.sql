create or replace function public.award_loyalty_points_for_order(
  p_order_id uuid,
  p_member_id uuid,
  p_points numeric,
  p_sale_total numeric default 0
)
returns public.loyalty_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_member public.loyalty_members%rowtype;
  v_points numeric := round(greatest(coalesce(p_points, 0), 0)::numeric, 2);
  v_sale_total numeric := round(greatest(coalesce(p_sale_total, 0), 0)::numeric, 2);
  v_visit_stamp timestamptz := now();
begin
  if p_member_id is null then
    raise exception 'Loyalty member is required.';
  end if;

  select *
    into v_member
    from public.loyalty_members
   where id = p_member_id
   for update;

  if not found then
    raise exception 'Loyalty member was not found.';
  end if;

  if p_order_id is null or v_points <= 0 then
    return v_member;
  end if;

  select id, loyalty_points_awarded, loyalty_points_awarded_at
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Order was not found for loyalty award.';
  end if;

  if coalesce(v_order.loyalty_points_awarded, 0) > 0
     or v_order.loyalty_points_awarded_at is not null then
    return v_member;
  end if;

  update public.loyalty_members
     set "Points balance" = round((coalesce("Points balance", 0) + v_points)::numeric, 2),
         "Available points" = round((coalesce("Available points", 0) + v_points)::numeric, 2),
         "Total visits" = coalesce("Total visits", 0) + 1,
         "Total spent" = round((coalesce("Total spent", 0) + v_sale_total)::numeric, 2),
         "First visit" = coalesce("First visit", v_visit_stamp::text),
         "Last visit" = v_visit_stamp::text
   where id = p_member_id
   returning * into v_member;

  update public.orders
     set loyalty_points_awarded = v_points,
         loyalty_points_awarded_at = v_visit_stamp,
         customer_id = p_member_id,
         loyalty_member_id = p_member_id,
         customer_name = v_member.customer_name
   where id = p_order_id;

  return v_member;
end;
$$;

grant execute on function public.award_loyalty_points_for_order(uuid, uuid, numeric, numeric) to authenticated;
