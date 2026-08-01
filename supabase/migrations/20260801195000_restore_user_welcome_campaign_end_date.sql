-- Restore the campaign end date explicitly selected by the administrator.
-- The campaign is over as of July 31, 2026, so automatic issuance stays disabled.
update public.voucher_campaigns
   set ends_at = timestamptz '2026-07-31 23:59:59+08:00',
       is_active = false,
       updated_at = now()
 where code = 'WELCOME-VOUCHER';
