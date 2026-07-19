-- Delete welcome vouchers only when the loyalty member is not linked to a customer account.
-- Linked-member welcome vouchers are retained, including active, expired, and redeemed statuses.
-- A backup table is created first so the deleted rows can be restored if needed.

create table if not exists public.deleted_unlinked_welcome_vouchers_backup_20260719
(like public.vouchers including all);

alter table public.deleted_unlinked_welcome_vouchers_backup_20260719
  add column if not exists backed_up_at timestamptz not null default now(),
  add column if not exists backup_reason text not null default 'Deleted welcome vouchers from unlinked loyalty members';

insert into public.deleted_unlinked_welcome_vouchers_backup_20260719
select v.*, now(), 'Deleted welcome vouchers from unlinked loyalty members'
  from public.vouchers v
  join public.loyalty_members lm on lm.id = v.member_id
 where lm.user_id is null
   and (
     coalesce(v.reward_type, '') = 'welcome'
     or upper(coalesce(v.code, '')) like 'WELCOME%'
     or lower(coalesce(v.reward_text, '')) like '%welcome voucher%'
   )
   and not exists (
     select 1
       from public.deleted_unlinked_welcome_vouchers_backup_20260719 b
      where b.id = v.id
   );

delete from public.vouchers v
using public.loyalty_members lm
where lm.id = v.member_id
  and lm.user_id is null
  and (
    coalesce(v.reward_type, '') = 'welcome'
    or upper(coalesce(v.code, '')) like 'WELCOME%'
    or lower(coalesce(v.reward_text, '')) like '%welcome voucher%'
  );

-- Verification queries:
-- Unlinked welcome vouchers should be 0.
-- Linked welcome vouchers should remain unchanged.
select
  count(*) filter (where lm.user_id is null) as unlinked_welcome_vouchers_remaining,
  count(*) filter (where lm.user_id is not null) as linked_welcome_vouchers_retained,
  count(*) as total_welcome_vouchers_remaining
from public.vouchers v
join public.loyalty_members lm on lm.id = v.member_id
where coalesce(v.reward_type, '') = 'welcome'
   or upper(coalesce(v.code, '')) like 'WELCOME%'
   or lower(coalesce(v.reward_text, '')) like '%welcome voucher%';

-- Rollback, if needed:
-- insert into public.vouchers
-- select id, member_id, reward_index, code, reward_text, issued_at, expires_at, status, redeemed_at, created_at, reward_type, campaign_id, campaign_code
--   from public.deleted_unlinked_welcome_vouchers_backup_20260719
-- on conflict (id) do nothing;
