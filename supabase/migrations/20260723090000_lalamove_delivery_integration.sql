-- Lalamove delivery integration fields.
-- Additive only: existing web orders and stores continue to work without courier setup.

alter table public.web_orders
  add column if not exists delivery_provider text,
  add column if not exists delivery_status text,
  add column if not exists delivery_quote_id text,
  add column if not exists delivery_order_id text,
  add column if not exists delivery_share_link text,
  add column if not exists delivery_tracking_link text,
  add column if not exists delivery_fee numeric(12, 2),
  add column if not exists delivery_currency text,
  add column if not exists delivery_distance_meters numeric(12, 2),
  add column if not exists delivery_provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists delivery_last_error text,
  add column if not exists delivery_quoted_at timestamptz,
  add column if not exists delivery_booked_at timestamptz,
  add column if not exists delivery_cancelled_at timestamptz;

alter table public.stores
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists delivery_contact_name text,
  add column if not exists delivery_contact_phone text;

create index if not exists idx_web_orders_delivery_provider
  on public.web_orders (delivery_provider);

create index if not exists idx_web_orders_delivery_order_id
  on public.web_orders (delivery_order_id);

create index if not exists idx_web_orders_delivery_status
  on public.web_orders (delivery_status);
