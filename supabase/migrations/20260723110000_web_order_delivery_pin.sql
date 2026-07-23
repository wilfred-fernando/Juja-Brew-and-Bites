-- Store customer-selected delivery pin coordinates for Lalamove drop-off accuracy.
-- Nullable to keep existing and address-only delivery orders working.

alter table public.web_orders
  add column if not exists delivery_latitude numeric(10, 7),
  add column if not exists delivery_longitude numeric(10, 7);

create index if not exists idx_web_orders_delivery_pin
  on public.web_orders (delivery_latitude, delivery_longitude)
  where delivery_latitude is not null and delivery_longitude is not null;
