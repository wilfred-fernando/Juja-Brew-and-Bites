-- Point reward vouchers are only usable after the loyalty member is linked to a customer account.
-- Keep history, but expire old active point vouchers that were created before linking.

update public.vouchers v
set status = 'expired'
from public.loyalty_members lm
where lm.id = v.member_id
  and lm.user_id is null
  and coalesce(v.reward_type, 'points') = 'points'
  and v.status = 'active';
