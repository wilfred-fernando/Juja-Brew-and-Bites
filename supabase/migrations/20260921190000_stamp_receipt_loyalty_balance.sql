-- A receipt owns its historical balance; member updates and refunds cannot rewrite it.
alter table public.orders add column if not exists receipt_points_balance numeric(12,2);
alter table public.web_orders add column if not exists receipt_points_balance numeric(12,2);

create or replace function public.preserve_receipt_points_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and old.receipt_points_balance is not null then
    new.receipt_points_balance := old.receipt_points_balance;
    return new;
  end if;
  -- Only recorded award snapshots may populate this field, never client input.
  if TG_TABLE_NAME = 'orders' then
    select e.available_points_after into new.receipt_points_balance
    from public.loyalty_point_award_events e
    where e.available_points_after is not null
      and ((e.source_type = 'order' and e.source_id = new.id)
        or (e.source_type = 'web_order' and e.source_id = new.source_web_order_id))
    order by (e.source_type = 'order') desc, e.id asc limit 1;
  else
    select e.available_points_after into new.receipt_points_balance
    from public.loyalty_point_award_events e
    where e.available_points_after is not null
      and ((e.source_type = 'web_order' and e.source_id = new.id)
        or (e.source_type = 'order' and exists (
          select 1 from public.orders o where o.id = e.source_id and o.source_web_order_id = new.id)))
    order by (e.source_type = 'web_order') desc, e.id asc limit 1;
  end if;
  return new;
end;
$$;

create trigger preserve_receipt_points_balance
before insert or update on public.orders
for each row execute function public.preserve_receipt_points_balance();
create trigger preserve_receipt_points_balance
before insert or update on public.web_orders
for each row execute function public.preserve_receipt_points_balance();

create or replace function public.stamp_awarded_receipt_points_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.available_points_after is null then return new; end if;
  if new.source_type = 'order' then
    update public.orders set receipt_points_balance = new.available_points_after
    where id = new.source_id and receipt_points_balance is null;
    update public.web_orders set receipt_points_balance = new.available_points_after
    where id in (select source_web_order_id from public.orders where id = new.source_id)
      and receipt_points_balance is null;
  else
    update public.web_orders set receipt_points_balance = new.available_points_after
    where id = new.source_id and receipt_points_balance is null;
    update public.orders set receipt_points_balance = new.available_points_after
    where source_web_order_id = new.source_id and receipt_points_balance is null;
  end if;
  return new;
end;
$$;

create trigger stamp_awarded_receipt_points_balance
after insert on public.loyalty_point_award_events
for each row execute function public.stamp_awarded_receipt_points_balance();

-- Retain before-state for the historical receipt backfill, inaccessible to clients.
create table public.receipt_points_stamp_backup_20260921 as
select 'order'::text source_type, o.id source_id, to_jsonb(o) before_state
from public.orders o where o.receipt_points_balance is null and exists (
  select 1 from public.loyalty_point_award_events e where e.available_points_after is not null
    and ((e.source_type = 'order' and e.source_id = o.id)
      or (e.source_type = 'web_order' and e.source_id = o.source_web_order_id)))
union all
select 'web_order', w.id, to_jsonb(w) from public.web_orders w
where w.receipt_points_balance is null and exists (
  select 1 from public.loyalty_point_award_events e where e.available_points_after is not null
    and ((e.source_type = 'web_order' and e.source_id = w.id)
      or (e.source_type = 'order' and exists (
        select 1 from public.orders o where o.id = e.source_id and o.source_web_order_id = w.id))));
alter table public.receipt_points_stamp_backup_20260921 enable row level security;
revoke all on public.receipt_points_stamp_backup_20260921 from anon, authenticated;

-- The before triggers copy the ledger snapshot; no points are awarded or recalculated.
update public.orders set receipt_points_balance = null where id in (
  select source_id from public.receipt_points_stamp_backup_20260921 where source_type = 'order');
update public.web_orders set receipt_points_balance = null where id in (
  select source_id from public.receipt_points_stamp_backup_20260921 where source_type = 'web_order');

revoke all on function public.preserve_receipt_points_balance() from public;
revoke all on function public.stamp_awarded_receipt_points_balance() from public;
notify pgrst, 'reload schema';
