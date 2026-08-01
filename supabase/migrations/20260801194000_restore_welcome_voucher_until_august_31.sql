-- Keep the Welcome Voucher auto-issuance campaign active through August 31, 2026.
-- Existing vouchers are intentionally untouched.
update public.voucher_campaigns
   set ends_at = timestamptz '2026-08-31 23:59:59+08:00',
       is_active = true,
       updated_at = now()
 where code = 'WELCOME-VOUCHER';
