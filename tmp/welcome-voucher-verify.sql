select code,is_active,starts_at,ends_at,validity_days from public.voucher_campaigns where code='WELCOME-VOUCHER';
select count(*) filter (where public.welcome_account_purchase_total(m.id)>=200 and not public.welcome_account_has_redeemed(m.id)) as eligible_accounts,
count(*) filter (where public.welcome_account_has_redeemed(m.id)) as previously_redeemed_accounts
from public.loyalty_members m where user_id is not null;
select count(*) as eligible_expired_vouchers from public.vouchers v
where public.is_welcome_reward(v.reward_type,v.code,v.reward_text)
and v.redeemed_at is null and lower(coalesce(v.status,'')) in ('active','available','expired')
and (v.expires_at<=now() or v.status='expired')
and public.welcome_account_purchase_total(v.member_id)>=200
and not public.welcome_account_has_redeemed(v.member_id);
begin;
do $$ declare m record; result record; begin
 for m in select id from public.loyalty_members where user_id is not null
   and (public.welcome_account_purchase_total(id)<200 or public.welcome_account_has_redeemed(id)) limit 20 loop
   select * into result from public.create_welcome_voucher_if_needed(m.id);
   if result.created<>0 or result.skipped not in ('minimum_purchase_required','already_redeemed') then
     raise exception 'Ineligible account passed issuance check';
   end if;
 end loop;
end $$;
rollback;
select tgname from pg_trigger where tgname in ('require_welcome_account_eligibility','issue_welcome_after_purchase');
