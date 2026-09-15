-- End-of-day closure permanently locks earlier receipts in the same store.
create or replace function public.block_closed_day_refunds()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  receipt_store text;
  receipt_created timestamptz;
begin
  if not (
    (lower(coalesce(new.status, '')) like '%refund%' and new.status is distinct from old.status)
    or new.refunded_at is distinct from old.refunded_at
    or coalesce((to_jsonb(new)->>'refund_amount')::numeric, 0) > coalesce((to_jsonb(old)->>'refund_amount')::numeric, 0)
  ) then return new; end if;
  if tg_table_name = 'order_items' then
    select store_id::text, created_at into receipt_store, receipt_created
      from public.orders where id = old.order_id;
  else
    receipt_store := old.store_id::text;
    receipt_created := old.created_at;
  end if;
  if exists (
    select 1 from public.cashier_pos
    where store_id::text = receipt_store and mode = 'end_day'
      and created_at >= receipt_created
  ) then
    raise exception 'This receipt cannot be refunded because its end-of-day shift is closed.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_closed_day_refunds on public.orders;
create trigger block_closed_day_refunds before update on public.orders
for each row execute function public.block_closed_day_refunds();
drop trigger if exists block_closed_day_refunds on public.order_items;
create trigger block_closed_day_refunds before update on public.order_items
for each row execute function public.block_closed_day_refunds();
