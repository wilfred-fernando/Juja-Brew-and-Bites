begin;

create or replace function public.enforce_welcome_account_eligibility()
returns trigger language plpgsql security definer set search_path = public as $$
declare account_id uuid;
begin
  if tg_op = 'UPDATE' and public.is_welcome_reward(old.reward_type,old.code,old.reward_text) then
    if new.member_id is distinct from old.member_id
      or new.reward_type is distinct from old.reward_type
      or new.code is distinct from old.code
      or new.reward_text is distinct from old.reward_text then
      raise exception 'Welcome Voucher identity and account cannot be changed.';
    end if;
    if lower(coalesce(old.status,'')) in ('expired','used','redeemed')
      or old.redeemed_at is not null or old.expires_at <= now() then
      if new.status is distinct from old.status
        or new.redeemed_at is distinct from old.redeemed_at
        or new.expires_at is distinct from old.expires_at
        or new.issued_at is distinct from old.issued_at then
        -- Allow marking an elapsed voucher expired without renewing it.
        if not (new.status='expired' and old.redeemed_at is null
          and lower(coalesce(old.status,'')) not in ('used','redeemed')
          and new.redeemed_at is not distinct from old.redeemed_at
          and new.expires_at is not distinct from old.expires_at
          and new.issued_at is not distinct from old.issued_at) then
          raise exception 'Used or expired Welcome Vouchers cannot be renewed or redeemed again.';
        end if;
      end if;
      return new;
    end if;
  end if;
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
update public.voucher_campaigns
set ends_at=timestamptz '2026-10-31 23:59:59+08',is_active=true
where code='WELCOME-VOUCHER';
update public.promotions
set end_date=date '2026-10-31',
 description='Buy 1 Take 1 16oz Cheesecake Milk Tea until October 31, 2026. Linked accounts qualify after at least PHP 200 in previous completed purchases. Accounts with any previously issued Welcome Voucher, including used or expired vouchers, cannot receive another. Voucher valid for 15 days.'
where code='WELCOME-VOUCHER';
commit;