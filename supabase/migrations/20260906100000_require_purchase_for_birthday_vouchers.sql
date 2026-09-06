begin;

create or replace function public.loyalty_member_has_purchase(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.loyalty_members lm
    where lm.id = p_member_id
      and (
        coalesce(lm."Total visits", 0) > 0
        or coalesce(lm."Total spent", 0) > 0
        or exists (
          select 1
          from public.orders o
          where (
              o.loyalty_member_id = lm.id
              or o.customer_id = lm.id::text
            )
            and lower(trim(coalesce(o.status, ''))) in ('paid', 'closed', 'completed', 'complete', 'delivered')
            and greatest(
              coalesce(nullif(o.net_amount::text, '')::numeric, 0),
              coalesce(nullif(o.total::text, '')::numeric, 0)
            ) > 0
        )
        or exists (
          select 1
          from public.web_orders w
          where (
              w.loyalty_member_id = lm.id
              or (lm.user_id is not null and w.user_id = lm.user_id)
            )
            and lower(trim(coalesce(w.status, ''))) in ('paid', 'closed', 'completed', 'complete', 'delivered')
            and greatest(
              coalesce(nullif(w.loyalty_sale_total::text, '')::numeric, 0),
              coalesce(nullif(w.total::text, '')::numeric, 0)
            ) > 0
        )
      )
  );
$$;

revoke all on function public.loyalty_member_has_purchase(uuid) from public, anon, authenticated;
grant execute on function public.loyalty_member_has_purchase(uuid) to service_role;

create or replace function public.enforce_birthday_voucher_purchase_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
      coalesce(new.reward_type, '') = 'birthday'
      or upper(coalesce(new.code, '')) like 'BDAY%'
      or lower(coalesce(new.reward_text, '')) like '%birthday%'
    )
    and not public.loyalty_member_has_purchase(new.member_id)
  then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_birthday_voucher_purchase_eligibility() from public, anon, authenticated;

drop trigger if exists require_purchase_for_birthday_voucher on public.vouchers;
create trigger require_purchase_for_birthday_voucher
before insert or update of member_id, reward_type, code, reward_text
on public.vouchers
for each row
execute function public.enforce_birthday_voucher_purchase_eligibility();

create table if not exists public.deleted_ineligible_birthday_vouchers_backup_20260906
(like public.vouchers including all);

alter table public.deleted_ineligible_birthday_vouchers_backup_20260906
  add column if not exists backed_up_at timestamptz not null default now(),
  add column if not exists backup_reason text not null default 'Birthday voucher removed because member had no prior purchase';

insert into public.deleted_ineligible_birthday_vouchers_backup_20260906
select v.*, now(), 'Birthday voucher removed because member had no prior purchase'
from public.vouchers v
where (
    coalesce(v.reward_type, '') = 'birthday'
    or upper(coalesce(v.code, '')) like 'BDAY%'
    or lower(coalesce(v.reward_text, '')) like '%birthday%'
  )
  and not public.loyalty_member_has_purchase(v.member_id)
  and not exists (
    select 1
    from public.deleted_ineligible_birthday_vouchers_backup_20260906 backup
    where backup.id = v.id
  );

delete from public.vouchers v
where (
    coalesce(v.reward_type, '') = 'birthday'
    or upper(coalesce(v.code, '')) like 'BDAY%'
    or lower(coalesce(v.reward_text, '')) like '%birthday%'
  )
  and not public.loyalty_member_has_purchase(v.member_id);

commit;

-- Verification:
-- select count(*) from public.vouchers v
-- where (coalesce(v.reward_type, '') = 'birthday' or upper(coalesce(v.code, '')) like 'BDAY%' or lower(coalesce(v.reward_text, '')) like '%birthday%')
--   and not public.loyalty_member_has_purchase(v.member_id);
--
-- Rollback data cleanup only:
-- insert into public.vouchers
-- select id, member_id, reward_index, code, reward_text, issued_at, expires_at, status,
--        redeemed_at, created_at, reward_type, campaign_id, campaign_code
-- from public.deleted_ineligible_birthday_vouchers_backup_20260906
-- on conflict (id) do nothing;
