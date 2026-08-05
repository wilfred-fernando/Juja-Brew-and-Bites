-- REVIEW ONLY. DO NOT RUN UNTIL D1 PARALLEL VALIDATION PASSES AND THE OWNER APPROVES.
-- This function is deliberately inert unless the database setting below is explicitly approved.
create or replace function public.purge_verified_sales_archives_older_than_24h()
returns table (source_table text, deleted_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  enabled text := current_setting('app.enable_sales_archive_purge', true);
  deleted_count bigint;
begin
  if enabled is distinct from 'approved' then
    raise exception 'Sales archive purge is disabled. Set app.enable_sales_archive_purge=approved only after owner approval.';
  end if;

  delete from public.order_items oi
  using public.sales_archive_batch_records r, public.sales_archive_batches b
  where r.batch_id = b.id and r.source_table = 'archive_order_items'
    and r.source_id = oi.id::text and b.status = 'verified'
    and b.purge_after is not null and b.purge_after <= now();
  get diagnostics deleted_count = row_count;
  source_table := 'order_items'; deleted_rows := deleted_count; return next;

  delete from public.orders o
  using public.sales_archive_batch_records r, public.sales_archive_batches b
  where r.batch_id = b.id and r.source_table = 'archive_orders'
    and r.source_id = o.id::text and b.status = 'verified'
    and b.purge_after is not null and b.purge_after <= now();
  get diagnostics deleted_count = row_count;
  source_table := 'orders'; deleted_rows := deleted_count; return next;

  delete from public.web_orders w
  using public.sales_archive_batch_records r, public.sales_archive_batches b
  where r.batch_id = b.id and r.source_table = 'archive_web_orders'
    and r.source_id = w.id::text and b.status = 'verified'
    and b.purge_after is not null and b.purge_after <= now();
  get diagnostics deleted_count = row_count;
  source_table := 'web_orders'; deleted_rows := deleted_count; return next;

  delete from public.cashier_pos cp
  using public.sales_archive_batch_records r, public.sales_archive_batches b
  where r.batch_id = b.id and r.source_table = 'archive_shifts'
    and r.source_id = cp.id::text and b.status = 'verified'
    and b.purge_after is not null and b.purge_after <= now();
  get diagnostics deleted_count = row_count;
  source_table := 'cashier_pos'; deleted_rows := deleted_count; return next;

  update public.sales_archive_batches
  set status = 'purged', purged_at = now(), updated_at = now()
  where status = 'verified' and purge_after is not null and purge_after <= now();
end;
$$;

-- Future approved invocation only:
-- set app.enable_sales_archive_purge = 'approved';
-- select * from public.purge_verified_sales_archives_older_than_24h();
