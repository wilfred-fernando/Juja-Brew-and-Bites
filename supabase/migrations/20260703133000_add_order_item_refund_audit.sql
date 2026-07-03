begin;

alter table public.order_items
  add column if not exists status text default 'paid',
  add column if not exists refund_amount numeric default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid,
  add column if not exists refund_reason text;

update public.order_items
set status = 'paid'
where status is null;

create index if not exists idx_order_items_status on public.order_items (status);
create index if not exists idx_order_items_refunded_at on public.order_items (refunded_at);

commit;
