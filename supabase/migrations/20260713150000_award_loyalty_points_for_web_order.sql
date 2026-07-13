alter table public.web_orders
  add column if not exists loyalty_member_id uuid references public.loyalty_members(id),
  add column if not exists loyalty_points_awarded numeric(12, 2),
  add column if not exists loyalty_points_awarded_at timestamptz,
  add column if not exists loyalty_sale_total numeric(12, 2);

create or replace function public.award_loyalty_points_for_web_order(
  p_web_order_id uuid,
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
  v_points numeric(12, 2) := greatest(round(coalesce(p_points, 0)::numeric, 2), 0);
  v_sale_total numeric(12, 2) := greatest(round(coalesce(p_sale_total, 0)::numeric, 2), 0);
  v_member public.loyalty_members%rowtype;
  v_web_order public.web_orders%rowtype;
  v_visit_stamp timestamptz := timezone('Asia/Manila', now());
begin
  if p_web_order_id is null then
    raise exception 'Web order id is required.';
  end if;

  if p_member_id is null then
    raise exception 'Loyalty member id is required.';
  end if;

  select *
    into v_member
    from public.loyalty_members
   where id = p_member_id
   for update;

  if not found then
    raise exception 'Loyalty member % was not found.', p_member_id;
  end if;

  select *
    into v_web_order
    from public.web_orders
   where id = p_web_order_id
   for update;

  if not found then
    raise exception 'Web order % was not found.', p_web_order_id;
  end if;

  if coalesce(v_web_order.loyalty_points_awarded, 0) > 0
     or v_web_order.loyalty_points_awarded_at is not null then
    return v_member;
  end if;

  if v_points <= 0 then
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

  update public.web_orders
     set loyalty_member_id = p_member_id,
         loyalty_points_awarded = v_points,
         loyalty_points_awarded_at = v_visit_stamp,
         loyalty_sale_total = v_sale_total,
         customer_name = coalesce(customer_name, v_member.customer_name)
   where id = p_web_order_id;

  return v_member;
end;
$$;

grant execute on function public.award_loyalty_points_for_web_order(uuid, uuid, numeric, numeric) to authenticated;
