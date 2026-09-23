-- Preserve refunded claims for audit while releasing their daily entitlement.
alter table public.pos_discount_redemptions
  add column refunded_at timestamptz,
  add column refunded_by uuid,
  add column refund_reason text;
alter table public.pos_discount_redemptions drop constraint pos_discount_redemptions_status_check;
alter table public.pos_discount_redemptions add constraint pos_discount_redemptions_status_check
  check (status in ('reserved', 'completed', 'refunded'));
alter table public.pos_discount_redemptions drop constraint pos_discount_redemptions_daily_unique;
create unique index pos_discount_redemptions_daily_unique
  on public.pos_discount_redemptions (beneficiary_id, business_date, entitlement_group)
  where status in ('reserved', 'completed');

create or replace function public.restore_refunded_beneficiary_entitlements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(trim(coalesce(new.status, ''))) = 'refunded' then
    update public.pos_discount_redemptions
    set status = 'refunded', refunded_at = coalesce(new.refunded_at, now()),
        refunded_by = new.refunded_by, refund_reason = coalesce(new.refund_reason, 'Order fully refunded'),
        expires_at = null, updated_at = now()
    where order_id = new.id and status = 'completed';
  end if;
  return new;
end;
$$;
create trigger restore_refunded_beneficiary_entitlements
after update of status on public.orders
for each row execute function public.restore_refunded_beneficiary_entitlements();

-- Checkout completion may arrive after the refund. Lock the order so either
-- ordering of completion/refund leaves the claim released.
create or replace function public.guard_refunded_beneficiary_claim()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if TG_OP = 'UPDATE' and old.status = 'refunded' then
    new.status := old.status;
    new.refunded_at := old.refunded_at;
    new.refunded_by := old.refunded_by;
    new.refund_reason := old.refund_reason;
    return new;
  end if;
  if new.order_id is not null and new.status in ('completed', 'refunded') then
    select * into v_order from public.orders where id = new.order_id for update;
    if lower(trim(coalesce(v_order.status, ''))) = 'refunded' then
      new.status := 'refunded';
      new.refunded_at := coalesce(v_order.refunded_at, now());
      new.refunded_by := v_order.refunded_by;
      new.refund_reason := coalesce(v_order.refund_reason, 'Order fully refunded');
      new.expires_at := null;
    elsif new.status = 'refunded' then
      raise exception 'Only a fully refunded order can restore beneficiary entitlement.';
    end if;
  elsif new.status = 'refunded' then
    raise exception 'A refunded claim must reference its refunded order.';
  end if;
  return new;
end;
$$;
create trigger guard_refunded_beneficiary_claim
before insert or update on public.pos_discount_redemptions
for each row execute function public.guard_refunded_beneficiary_claim();

create table public.refunded_beneficiary_claims_backup_20260923 as
select r.* from public.pos_discount_redemptions r join public.orders o on o.id = r.order_id
where r.status = 'completed' and lower(trim(coalesce(o.status, ''))) = 'refunded';
alter table public.refunded_beneficiary_claims_backup_20260923 enable row level security;
revoke all on public.refunded_beneficiary_claims_backup_20260923 from anon, authenticated;
update public.pos_discount_redemptions r set status = 'refunded', updated_at = now()
where r.id in (select id from public.refunded_beneficiary_claims_backup_20260923);

revoke all on function public.restore_refunded_beneficiary_entitlements() from public;
revoke all on function public.guard_refunded_beneficiary_claim() from public;
notify pgrst, 'reload schema';
