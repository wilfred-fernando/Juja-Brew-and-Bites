begin;

alter table public.orders
  add column if not exists order_number text,
  add column if not exists gross_amount numeric,
  add column if not exists discount_amount numeric default 0,
  add column if not exists net_amount numeric,
  add column if not exists order_type text,
  add column if not exists cashier_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid,
  add column if not exists refund_reason text,
  add column if not exists refund_amount numeric default 0;

alter table public.order_items
  add column if not exists item_name text,
  add column if not exists category_name text,
  add column if not exists gross_amount numeric,
  add column if not exists discount_amount numeric default 0,
  add column if not exists net_amount numeric;

update public.order_items
set item_name = name
where item_name is null and name is not null;

update public.orders
set
  gross_amount = coalesce(gross_amount, nullif(subtotal::text, '')::numeric, nullif(total, '')::numeric + coalesce(nullif(discount, '')::numeric, 0)),
  discount_amount = case
    when coalesce(discount_amount, 0) = 0 then coalesce(nullif(discount, '')::numeric, 0)
    else discount_amount
  end,
  net_amount = coalesce(net_amount, nullif(total, '')::numeric),
  order_type = coalesce(order_type, dining_option),
  paid_at = coalesce(paid_at, created_at)
where true;

update public.order_items
set
  gross_amount = coalesce(gross_amount, line_total),
  net_amount = coalesce(net_amount, line_total)
where true;

create index if not exists idx_orders_paid_at on public.orders (paid_at);
create index if not exists idx_orders_created_at on public.orders (created_at);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_payment_method on public.orders (payment_method);
create index if not exists idx_orders_order_type on public.orders (order_type);
create index if not exists idx_orders_cashier_id on public.orders (cashier_id);
create index if not exists idx_orders_store_id on public.orders (store_id);
create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_order_items_menu_item_id on public.order_items (menu_item_id);
create index if not exists idx_web_orders_created_at on public.web_orders (created_at);
create index if not exists idx_web_orders_payment_method on public.web_orders (payment_method);

commit;
