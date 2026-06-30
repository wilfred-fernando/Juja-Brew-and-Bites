-- Allow admin voucher status changes between Available, Redeemed, and Expired.
-- The UI stores Available as `active`, so the database must allow active, redeemed, and expired.

alter table public.vouchers
  drop constraint if exists vouchers_status_check;

alter table public.vouchers
  add constraint vouchers_status_check
  check (status in ('active', 'redeemed', 'expired'));
