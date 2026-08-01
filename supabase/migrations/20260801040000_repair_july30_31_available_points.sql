-- Repair POS loyalty awards from July 30-31, 2026 that were recorded on the
-- receipt and lifetime balance but were not added to spendable points.
-- Each order has a unique repair key, so this migration is safe to rerun.
do $$
declare
  v_order record;
  v_member public.loyalty_members%rowtype;
  v_repair_id uuid;
begin
  for v_order in
    select
      o.id,
      o.receipt_number,
      coalesce(
        o.loyalty_member_id,
        case
          when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then o.customer_id::uuid
          else null
        end
      ) as member_id,
      round(greatest(coalesce(o.loyalty_points_awarded, 0), 0)::numeric, 2) as points
    from public.orders o
    join public.loyalty_members m
      on m.id = coalesce(
        o.loyalty_member_id,
        case
          when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then o.customer_id::uuid
          else null
        end
      )
    where o.paid_at >= timestamptz '2026-07-30 00:00:00+08'
      and o.paid_at < timestamptz '2026-08-01 00:00:00+08'
      and lower(coalesce(o.status, '')) in ('paid', 'closed', 'completed', 'complete', 'delivered', 'ready')
      and coalesce(o.loyalty_points_awarded, 0) > 0
      and not (
        o.receipt_number = 'P0335264'
        and exists (
          select 1
          from public.loyalty_point_balance_repairs existing
          where existing.repair_key = 'rossenie-p0335264-missing-available-award'
        )
      )
    order by o.paid_at, o.id
  loop
    select * into v_member
    from public.loyalty_members
    where id = v_order.member_id
    for update;

    if not found then
      continue;
    end if;

    v_repair_id := null;
    insert into public.loyalty_point_balance_repairs (
      repair_key,
      member_id,
      points_balance_delta,
      available_points_delta,
      points_balance_before,
      available_points_before,
      reason
    ) values (
      'july30-31-missing-available:' || v_order.id::text,
      v_order.member_id,
      0,
      v_order.points,
      v_member."Points balance",
      v_member."Available points",
      'Receipt ' || coalesce(v_order.receipt_number, v_order.id::text)
        || ' earned ' || to_char(v_order.points, 'FM999999990.00')
        || ' points, but the award was not added to Available points.'
    )
    on conflict (repair_key) do nothing
    returning id into v_repair_id;

    if v_repair_id is null then
      continue;
    end if;

    update public.loyalty_members
    set "Available points" = round((coalesce("Available points", 0) + v_order.points)::numeric, 2)
    where id = v_order.member_id
    returning * into v_member;

    update public.loyalty_point_balance_repairs
    set points_balance_after = v_member."Points balance",
        available_points_after = v_member."Available points"
    where id = v_repair_id;
  end loop;
end;
$$;
