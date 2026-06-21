-- Tracks the Manila-year available-points reset without touching lifetime point balance or voucher records.
-- Available points reset after December 31, 11:59 PM Asia/Manila; vouchers remain valid by their own expiry/status.

alter table if exists public.loyalty_members
  add column if not exists points_reset_at timestamptz;

comment on column public.loyalty_members.points_reset_at is
  'Last annual available-points reset boundary applied. Available points reset every Dec 31 11:59 PM Asia/Manila; lifetime points balance and vouchers are not reset.';
