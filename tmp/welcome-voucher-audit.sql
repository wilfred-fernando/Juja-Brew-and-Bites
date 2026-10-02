select code,is_active,starts_at,ends_at,validity_days from public.voucher_campaigns where reward_type='welcome';
select column_name,data_type from information_schema.columns where table_name in ('orders','web_orders') and column_name in ('source_web_order_id','net_amount','total','loyalty_sale_total');
select pg_get_functiondef('public.create_voucher_from_campaign(uuid,text)'::regprocedure);
