-- Compensate the unverified blanket July 30-31 Available-points repair.
-- The original repair rows remain as an audit trail. Rossenie De La Torre's
-- separately verified correction is intentionally not part of this rollback.

begin;

create table if not exists public.loyalty_repair_voucher_backup_20260801
(like public.vouchers including defaults including constraints);

alter table public.loyalty_repair_voucher_backup_20260801
  add column if not exists backed_up_at timestamptz not null default now(),
  add column if not exists backup_reason text;

insert into public.loyalty_repair_voucher_backup_20260801
select v.*, now(), 'Rollback of unverified July 30-31 blanket points repair'
from public.vouchers v
where v.id in (
  'b25ce81e-1cfa-43eb-b29f-706457c2abd5'::uuid,
  '970237a4-8353-4b35-addd-74fce469dfaf'::uuid,
  '32da902f-b4f9-41c3-b114-bfd843f91e0b'::uuid,
  'b0c6f893-96b5-427e-92c8-8c7511b81283'::uuid,
  'e22fd27e-2171-47fd-a841-70dfa4b5e445'::uuid
)
and v.status = 'active'
and v.redeemed_at is null
and not exists (
  select 1
  from public.loyalty_repair_voucher_backup_20260801 b
  where b.id = v.id
);

do $$
begin
  if exists (
    select 1
    from public.vouchers
    where id in (
      'b25ce81e-1cfa-43eb-b29f-706457c2abd5'::uuid,
      '970237a4-8353-4b35-addd-74fce469dfaf'::uuid,
      '32da902f-b4f9-41c3-b114-bfd843f91e0b'::uuid,
      'b0c6f893-96b5-427e-92c8-8c7511b81283'::uuid,
      'e22fd27e-2171-47fd-a841-70dfa4b5e445'::uuid
    )
    and (status <> 'active' or redeemed_at is not null)
  ) then
    raise exception 'A repair-created voucher is no longer unused; rollback stopped';
  end if;
end
$$;

delete from public.vouchers
where id in (
  'b25ce81e-1cfa-43eb-b29f-706457c2abd5'::uuid,
  '970237a4-8353-4b35-addd-74fce469dfaf'::uuid,
  '32da902f-b4f9-41c3-b114-bfd843f91e0b'::uuid,
  'b0c6f893-96b5-427e-92c8-8c7511b81283'::uuid,
  'e22fd27e-2171-47fd-a841-70dfa4b5e445'::uuid
)
and status = 'active'
and redeemed_at is null;

with repair_baseline as (
  select distinct on (member_id)
    member_id,
    available_points_before
  from public.loyalty_point_balance_repairs
  where repair_key like 'july30-31-missing-available:%'
  order by member_id, created_at asc, id asc
), restored as (
  update public.loyalty_members lm
  set "Available points" = rb.available_points_before
  from repair_baseline rb
  where lm.id = rb.member_id
  returning lm.id, lm."Available points"
)
insert into public.loyalty_point_balance_repairs (
  repair_key,
  member_id,
  points_balance_delta,
  available_points_delta,
  available_points_before,
  available_points_after,
  reason
)
select
  'rollback-july30-31-unverified:' || r.id::text,
  r.id,
  0,
  0,
  r."Available points",
  r."Available points",
  'Restored pre-repair Available points after member-level verification found false positives'
from restored r
on conflict (repair_key) do nothing;

commit;
