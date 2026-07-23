-- Store customer-selected Lalamove delivery speed and extra priority fee.
-- Additive only: existing web orders stay regular delivery by default.

alter table public.web_orders
  add column if not exists delivery_service_level text not null default 'regular',
  add column if not exists delivery_priority_fee numeric(12, 2) not null default 0;

create index if not exists idx_web_orders_delivery_service_level
  on public.web_orders (delivery_service_level);
