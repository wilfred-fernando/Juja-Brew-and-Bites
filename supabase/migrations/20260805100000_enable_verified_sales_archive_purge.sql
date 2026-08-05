-- Owner approved on 2026-08-05 after Supabase/D1 count, total, and checksum validation passed.
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
    raise exception 'Sales archive purge is disabled outside the approved service-role runner.';
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

create or replace function public.run_approved_sales_archive_purge()
returns table (source_table text, deleted_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.enable_sales_archive_purge', 'approved', true);
  return query select * from public.purge_verified_sales_archives_older_than_24h();
end;
$$;

revoke all on function public.purge_verified_sales_archives_older_than_24h() from public, anon, authenticated;
revoke all on function public.run_approved_sales_archive_purge() from public, anon, authenticated;
grant execute on function public.run_approved_sales_archive_purge() to service_role;
