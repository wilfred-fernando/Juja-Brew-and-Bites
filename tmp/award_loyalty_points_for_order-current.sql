CREATE OR REPLACE FUNCTION public.award_loyalty_points_for_order(p_order_id uuid, p_member_id uuid, p_points numeric, p_sale_total numeric DEFAULT 0)
 RETURNS loyalty_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_member public.loyalty_members%rowtype;
  v_points numeric(12, 2) := round(greatest(coalesce(p_points, 0), 0)::numeric, 2);
  v_sale_total numeric(12, 2) := round(greatest(coalesce(p_sale_total, 0), 0)::numeric, 2);
  v_visit_stamp timestamptz := now();
begin
  if p_member_id is null then raise exception 'Loyalty member is required.'; end if;

  select * into v_member
  from public.loyalty_members
  where id = p_member_id
  for update;
  if not found then raise exception 'Loyalty member was not found.'; end if;
  if p_order_id is null or v_points <= 0 then return v_member; end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Order was not found for loyalty award.'; end if;
  if public.booking_order_excludes_loyalty(v_order) then return v_member; end if;

  if coalesce(v_order.loyalty_points_awarded, 0) > 0
     or v_order.loyalty_points_awarded_at is not null then
    insert into public.loyalty_point_award_events (
      member_id, source_type, source_id, receipt_number, points_awarded,
      sale_total, points_balance_after, available_points_after, awarded_at
    ) values (
      p_member_id, 'order', p_order_id, v_order.receipt_number,
      coalesce(v_order.loyalty_points_awarded, v_points), v_sale_total,
      v_member."Points balance", v_member."Available points",
      coalesce(v_order.loyalty_points_awarded_at, v_visit_stamp)
    ) on conflict (source_type, source_id) do nothing;
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
  where id = p_order_id
  returning * into v_order;

  insert into public.loyalty_point_award_events (
    member_id, source_type, source_id, receipt_number, points_awarded,
    sale_total, points_balance_after, available_points_after, awarded_at
  ) values (
    p_member_id, 'order', p_order_id, v_order.receipt_number, v_points,
    v_sale_total, v_member."Points balance", v_member."Available points", v_visit_stamp
  ) on conflict (source_type, source_id) do nothing;

  return v_member;
end;
$function$
