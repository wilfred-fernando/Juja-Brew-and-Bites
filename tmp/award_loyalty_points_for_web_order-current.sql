CREATE OR REPLACE FUNCTION public.award_loyalty_points_for_web_order(p_web_order_id uuid, p_member_id uuid, p_points numeric, p_sale_total numeric DEFAULT 0)
 RETURNS loyalty_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_points numeric(12, 2) := round(greatest(coalesce(p_points, 0), 0)::numeric, 2);
  v_sale_total numeric(12, 2) := round(greatest(coalesce(p_sale_total, 0), 0)::numeric, 2);
  v_member public.loyalty_members%rowtype;
  v_web_order public.web_orders%rowtype;
  v_visit_stamp timestamptz := now();
begin
  if p_web_order_id is null then raise exception 'Web order id is required.'; end if;
  if p_member_id is null then raise exception 'Loyalty member id is required.'; end if;

  select * into v_member
  from public.loyalty_members
  where id = p_member_id
  for update;
  if not found then raise exception 'Loyalty member % was not found.', p_member_id; end if;

  select * into v_web_order
  from public.web_orders
  where id = p_web_order_id
  for update;
  if not found then raise exception 'Web order % was not found.', p_web_order_id; end if;
  if public.booking_order_excludes_loyalty(jsonb_populate_record(null::public.orders,to_jsonb(v_web_order))) then return v_member; end if;

  if coalesce(v_web_order.loyalty_points_awarded, 0) > 0
     or v_web_order.loyalty_points_awarded_at is not null then
    insert into public.loyalty_point_award_events (
      member_id, source_type, source_id, receipt_number, points_awarded,
      sale_total, points_balance_after, available_points_after, awarded_at
    ) values (
      p_member_id, 'web_order', p_web_order_id,
      coalesce(v_web_order.receipt_number, 'WEB-' || upper(left(replace(p_web_order_id::text, '-', ''), 8))),
      coalesce(v_web_order.loyalty_points_awarded, v_points),
      coalesce(v_web_order.loyalty_sale_total, v_sale_total),
      v_member."Points balance", v_member."Available points",
      coalesce(v_web_order.loyalty_points_awarded_at, v_visit_stamp)
    ) on conflict (source_type, source_id) do nothing;
    return v_member;
  end if;

  if v_points <= 0 then return v_member; end if;

  update public.loyalty_members
  set "Points balance" = round((coalesce("Points balance", 0) + v_points)::numeric, 2),
      "Available points" = round((coalesce("Available points", 0) + v_points)::numeric, 2),
      "Total visits" = coalesce("Total visits", 0) + 1,
      "Total spent" = round((coalesce("Total spent", 0) + v_sale_total)::numeric, 2),
      "First visit" = coalesce("First visit", v_visit_stamp::text),
      "Last visit" = v_visit_stamp::text
  where id = p_member_id
  returning * into v_member;

  update public.web_orders
  set loyalty_member_id = p_member_id,
      loyalty_points_awarded = v_points,
      loyalty_points_awarded_at = v_visit_stamp,
      loyalty_sale_total = v_sale_total,
      customer_name = coalesce(customer_name, v_member.customer_name)
  where id = p_web_order_id
  returning * into v_web_order;

  insert into public.loyalty_point_award_events (
    member_id, source_type, source_id, receipt_number, points_awarded,
    sale_total, points_balance_after, available_points_after, awarded_at
  ) values (
    p_member_id, 'web_order', p_web_order_id,
    coalesce(v_web_order.receipt_number, 'WEB-' || upper(left(replace(p_web_order_id::text, '-', ''), 8))),
    v_points, v_sale_total, v_member."Points balance", v_member."Available points", v_visit_stamp
  ) on conflict (source_type, source_id) do nothing;

  return v_member;
end;
$function$
