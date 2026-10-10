-- The customer order worker runs every minute through Supabase, including on
-- Vercel Hobby. Store customer_order_cron_secret in Vault and configure the
-- matching CUSTOMER_ORDER_CRON_SECRET production environment variable first.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'customer_order_cron_secret') then
    raise exception 'Configure customer_order_cron_secret in Vault before installing this scheduler';
  end if;
end $$;

select cron.schedule(
  'customer-order-status-push',
  '* * * * *',
  $job$
    select net.http_get(
      url := 'https://customer.jujabrewandbites.com/api/customer/order-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'customer_order_cron_secret'
        )
      ),
      timeout_milliseconds := 240000
    );
  $job$
);
