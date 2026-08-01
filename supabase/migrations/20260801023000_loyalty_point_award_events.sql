create table if not exists public.loyalty_point_award_events (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.loyalty_members(id) on delete restrict,
  source_type text not null check (source_type in ('order', 'web_order')),
  source_id uuid not null,
  receipt_number text,
  points_awarded numeric(12, 2) not null check (points_awarded >= 0),
  sale_total numeric(12, 2) not null default 0,
  points_balance_after numeric(12, 2),
  available_points_after numeric(12, 2),
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_type, source_id)
);

create index if not exists loyalty_point_award_events_member_date_idx
  on public.loyalty_point_award_events (member_id, awarded_at desc);

alter table public.loyalty_point_award_events enable row level security;
revoke all on public.loyalty_point_award_events from anon, authenticated;

insert into public.loyalty_point_award_events (
  member_id,
  source_type,
  source_id,
  receipt_number,
  points_awarded,
  sale_total,
  awarded_at,
  metadata
)
select
  coalesce(
    o.loyalty_member_id,
    case
      when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then o.customer_id::uuid
      else null
    end
  ),
  'order',
  o.id,
  o.receipt_number,
  round(o.loyalty_points_awarded::numeric, 2),
  round(coalesce(nullif(o.total::text, ''), '0')::numeric, 2),
  coalesce(o.loyalty_points_awarded_at, o.created_at, now()),
  jsonb_build_object('backfilled', true)
from public.orders o
where coalesce(
        o.loyalty_member_id,
        case
          when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then o.customer_id::uuid
          else null
        end
      ) is not null
  and coalesce(o.loyalty_points_awarded, 0) > 0
on conflict (source_type, source_id) do nothing;

insert into public.loyalty_point_award_events (
  member_id,
  source_type,
  source_id,
  receipt_number,
  points_awarded,
  sale_total,
  awarded_at,
  metadata
)
select
  w.loyalty_member_id,
  'web_order',
  w.id,
  coalesce(w.receipt_number, 'WEB-' || upper(left(replace(w.id::text, '-', ''), 8))),
  round(w.loyalty_points_awarded::numeric, 2),
  round(
    coalesce(nullif(w.loyalty_sale_total::text, ''), nullif(w.total::text, ''), '0')::numeric,
    2
  ),
  coalesce(w.loyalty_points_awarded_at, w.created_at, now()),
  jsonb_build_object('backfilled', true)
from public.web_orders w
where w.loyalty_member_id is not null
  and coalesce(w.loyalty_points_awarded, 0) > 0
  and not exists (
    select 1
    from public.orders o
    where o.source_web_order_id = w.id
      and coalesce(o.loyalty_points_awarded, 0) > 0
  )
on conflict (source_type, source_id) do nothing;

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
$$;

grant execute on function public.award_loyalty_points_for_order(uuid, uuid, numeric, numeric) to authenticated;

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
$$;

grant execute on function public.award_loyalty_points_for_web_order(uuid, uuid, numeric, numeric) to authenticated;
