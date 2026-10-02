with accounts as (
select distinct m.user_id,
  public.welcome_account_purchase_total(m.id) as spend,
  exists(select 1 from public.vouchers v join public.loyalty_members x on x.id=v.member_id
    where x.user_id=m.user_id and public.is_welcome_reward(v.reward_type,v.code,v.reward_text)) as has_any_welcome,
  exists(select 1 from public.vouchers v join public.loyalty_members x on x.id=v.member_id
    where x.user_id=m.user_id and public.is_welcome_reward(v.reward_type,v.code,v.reward_text)
      and lower(coalesce(v.status,'')) in ('active','available') and v.redeemed_at is null
      and (v.expires_at is null or v.expires_at>now())) as has_active_welcome
from public.loyalty_members m where m.user_id is not null
)
select count(*) as linked_customer_accounts,
 count(*) filter(where spend>=200 and not has_any_welcome) as eligible_without_voucher,
 count(*) filter(where spend<200 and not has_any_welcome) as below_minimum_without_voucher,
 count(*) filter(where has_active_welcome and spend>=200) as qualifying_accounts_with_active_voucher
from accounts;
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgname in ('issue_welcome_after_purchase','trg_loyalty_members_auto_welcome_voucher');
