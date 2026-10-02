begin;

create or replace function public.is_welcome_reward(p_type text, p_code text, p_text text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_type, '') = 'welcome' or upper(coalesce(p_code, '')) like 'WELCOME%'
    or lower(coalesce(p_text, '')) like '%welcome voucher%';
$$;

-- Use recorded historical spend or completed orders, whichever is greater.
-- POS copies of web orders are excluded to avoid counting one purchase twice.
create or replace function public.welcome_account_purchase_total(p_member_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with account_members as (
    select m.* from public.loyalty_members m
    join public.loyalty_members owner on owner.id = p_member_id
    where owner.user_id is not null and m.user_id = owner.user_id
  ), purchases as (
    select greatest(coalesce(o.net_amount, nullif(o.total, '')::numeric, 0), 0) as amount
    from public.orders o where (o.loyalty_member_id in (select id from account_members)
      or o.customer_id in (select id::text from account_members))
      and lower(trim(coalesce(o.status, ''))) in ('paid','closed','completed','complete','delivered')
      and (o.source_web_order_id is null or not exists (
        select 1 from public.web_orders w where w.id = o.source_web_order_id
          and lower(trim(coalesce(w.status, ''))) in ('paid','closed','completed','complete','delivered')
          and (w.loyalty_member_id in (select id from account_members)
            or w.user_id in (select user_id from account_members))))
    union all
    select greatest(coalesce(w.loyalty_sale_total, w.total, 0), 0)
    from public.web_orders w where (w.loyalty_member_id in (select id from account_members)
      or w.user_id in (select user_id from account_members))
      and lower(trim(coalesce(w.status, ''))) in ('paid','closed','completed','complete','delivered')
  ) select greatest(coalesce((select max("Total spent") from account_members), 0),
    coalesce((select sum(amount) from purchases), 0));
$$;

create or replace function public.welcome_account_has_redeemed(p_member_id uuid, p_exclude_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vouchers v
    join public.loyalty_members m on m.id = v.member_id
    join public.loyalty_members owner on owner.id = p_member_id
    where (m.id = owner.id or (owner.user_id is not null and m.user_id = owner.user_id))
      and (p_exclude_id is null or v.id <> p_exclude_id)
      and public.is_welcome_reward(v.reward_type, v.code, v.reward_text)
      and (lower(coalesce(v.status, '')) = 'redeemed' or v.redeemed_at is not null));
$$;

create or replace function public.create_welcome_voucher_if_needed(p_member_id uuid)
returns table(created integer, voucher_id uuid, code text, skipped text)
language plpgsql security definer set search_path = public as $$
declare account_id uuid;
begin
  select user_id into account_id from public.loyalty_members where id = p_member_id;
  if account_id is null then
    return query select 0, null::uuid, null::text, 'not_linked'; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text, 200));
  if public.welcome_account_has_redeemed(p_member_id) then
    return query select 0, null::uuid, null::text, 'already_redeemed'; return;
  end if;
  if public.welcome_account_purchase_total(p_member_id) < 200 then
    return query select 0, null::uuid, null::text, 'minimum_purchase_required'; return;
  end if;
  if exists (select 1 from public.vouchers v join public.loyalty_members m on m.id=v.member_id
    where m.user_id=account_id and public.is_welcome_reward(v.reward_type,v.code,v.reward_text)) then
    return query select 0, null::uuid, null::text, 'exists'; return;
  end if;
  return query select * from public.create_voucher_from_campaign(p_member_id, 'WELCOME-VOUCHER');
end;
$$;

-- Guard direct campaign creation, direct inserts, and every redemption path.
create or replace function public.enforce_welcome_account_eligibility()
returns trigger language plpgsql security definer set search_path = public as $$
declare account_id uuid;
begin
  if not public.is_welcome_reward(new.reward_type,new.code,new.reward_text) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.redeemed_at is not null or lower(coalesce(old.status,''))='redeemed' then
      if new.member_id is distinct from old.member_id or new.redeemed_at is distinct from old.redeemed_at
        or new.status is distinct from old.status then
        raise exception 'Redeemed Welcome Voucher history cannot be reset or transferred.';
      end if;
      return new;
    end if;
  end if;
  select user_id into account_id from public.loyalty_members where id=new.member_id;
  if account_id is null then raise exception 'Welcome Voucher requires a linked customer account.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,200));
  if public.welcome_account_has_redeemed(new.member_id,new.id) then
    raise exception 'This account has already redeemed a Welcome Voucher.';
  end if;
  if public.welcome_account_purchase_total(new.member_id) < 200 then
    raise exception 'Welcome Voucher requires at least PHP 200 in previous completed purchases.';
  end if;
  if tg_op='INSERT' and exists (select 1 from public.vouchers v
    join public.loyalty_members m on m.id=v.member_id where m.user_id=account_id
    and public.is_welcome_reward(v.reward_type,v.code,v.reward_text)) then
    raise exception 'This account already has a Welcome Voucher.';
  end if;
  return new;
end;
$$;
create trigger require_welcome_account_eligibility before insert or update on public.vouchers
for each row execute function public.enforce_welcome_account_eligibility();

revoke all on function public.welcome_account_purchase_total(uuid) from public,anon,authenticated;
revoke all on function public.welcome_account_has_redeemed(uuid,uuid) from public,anon,authenticated;
revoke all on function public.enforce_welcome_account_eligibility() from public,anon,authenticated;
grant execute on function public.welcome_account_purchase_total(uuid) to service_role;
grant execute on function public.welcome_account_has_redeemed(uuid,uuid) to service_role;

update public.voucher_campaigns set is_active=true,starts_at=timestamptz '2026-10-02 00:00:00+08',
  ends_at=null,auto_create_on_signup=true,auto_create_on_link=true
where code='WELCOME-VOUCHER';
update public.promotions set is_active=true,start_date=date '2026-10-02',end_date=null,
  description='Buy 1 Take 1 16oz Cheesecake Milk Tea. Linked accounts qualify after at least PHP 200 in previous completed purchases. Accounts that already redeemed a Welcome Voucher are not eligible. Voucher valid for 15 days.'
where code='WELCOME-VOUCHER';

create or replace function public.issue_welcome_after_purchase()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.user_id is not null and coalesce(new."Total spent",0)>=200 then
    perform public.create_welcome_voucher_if_needed(new.id);
  end if;
  return new;
end;
$$;
create trigger issue_welcome_after_purchase after update of "Total spent" on public.loyalty_members
for each row execute function public.issue_welcome_after_purchase();
commit;
