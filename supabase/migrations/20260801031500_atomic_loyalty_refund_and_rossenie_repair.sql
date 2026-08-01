-- Keep loyalty refunds atomic so a simultaneous replacement sale cannot be
-- overwritten by a stale client-side balance update.
create table if not exists public.loyalty_point_balance_repairs (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null unique,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  points_balance_delta numeric(12, 2) not null default 0,
  available_points_delta numeric(12, 2) not null default 0,
  points_balance_before numeric(12, 2),
  available_points_before numeric(12, 2),
  points_balance_after numeric(12, 2),
  available_points_after numeric(12, 2),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.loyalty_point_balance_repairs enable row level security;
revoke all on public.loyalty_point_balance_repairs from anon, authenticated;

create or replace function public.reverse_loyalty_points_for_order(
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
  v_order public.orders%rowtype;
  v_member public.loyalty_members%rowtype;
  v_requested_points numeric(12, 2) := round(greatest(coalesce(p_points, 0), 0)::numeric, 2);
  v_points numeric(12, 2);
  v_sale_total numeric(12, 2) := round(greatest(coalesce(p_sale_total, 0), 0)::numeric, 2);
begin
  if p_order_id is null then raise exception 'Order is required for loyalty reversal.'; end if;
  if p_member_id is null then raise exception 'Loyalty member is required for reversal.'; end if;

  select * into v_member
  from public.loyalty_members
  where id = p_member_id
  for update;
  if not found then raise exception 'Loyalty member was not found.'; end if;

  -- Award RPCs lock the member before the order. Keep the same order here so
  -- simultaneous sales and refunds cannot deadlock each other.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Order was not found for loyalty reversal.'; end if;

  v_points := least(greatest(coalesce(v_order.loyalty_points_awarded, 0), 0), v_requested_points);
  if v_points <= 0 then return v_member; end if;

  update public.loyalty_members
  set "Points balance" = round(greatest(coalesce("Points balance", 0) - v_points, 0)::numeric, 2),
      "Available points" = round(greatest(coalesce("Available points", 0) - v_points, 0)::numeric, 2),
      "Total spent" = round(greatest(coalesce("Total spent", 0) - v_sale_total, 0)::numeric, 2)
  where id = p_member_id
  returning * into v_member;

  update public.orders
  set loyalty_points_awarded = round(greatest(coalesce(loyalty_points_awarded, 0) - v_points, 0)::numeric, 2)
  where id = p_order_id;

  return v_member;
end;
$$;

grant execute on function public.reverse_loyalty_points_for_order(uuid, uuid, numeric, numeric) to authenticated;

-- Receipt P0335264 recorded +14.72 on 2026-07-31, but Rossenie's available
-- balance remained at the 2026-07-24 value. Lifetime points already include
-- the award, so only Available points is repaired.
do $$
declare
  v_member_id uuid := '89230b96-4893-4721-986d-a8de007ae182';
  v_before_points numeric(12, 2);
  v_before_available numeric(12, 2);
  v_inserted_id uuid;
begin
  select "Points balance", "Available points"
  into v_before_points, v_before_available
  from public.loyalty_members
  where id = v_member_id
  for update;

  if not found then raise exception 'Rossenie De La Torre loyalty member was not found.'; end if;

  insert into public.loyalty_point_balance_repairs (
    repair_key, member_id, points_balance_delta, available_points_delta,
    points_balance_before, available_points_before, reason
  ) values (
    'rossenie-p0335264-missing-available-award', v_member_id, 0, 14.72,
    v_before_points, v_before_available,
    'Receipt P0335264 earned 14.72 points, but Available points remained at the P7049879 balance.'
  )
  on conflict (repair_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    update public.loyalty_members
    set "Available points" = round((coalesce("Available points", 0) + 14.72)::numeric, 2)
    where id = v_member_id;

    update public.loyalty_point_balance_repairs r
    set points_balance_after = m."Points balance",
        available_points_after = m."Available points"
    from public.loyalty_members m
    where r.id = v_inserted_id and m.id = v_member_id;
  end if;
end;
$$;
