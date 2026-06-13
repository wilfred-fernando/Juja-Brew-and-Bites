begin;

create extension if not exists pgcrypto;

create table if not exists public.imported_receipts (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  receipt_date timestamptz,
  receipt_day date,
  receipt_number text,
  receipt_type text,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  taxes numeric(14, 2) not null default 0,
  total_collected numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  payment_type text,
  description text,
  dining_option text,
  pos text,
  store_name text,
  cashier_name text,
  customer_name text,
  customer_contacts text,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  "Date" text,
  "Receipt number" text,
  "Receipt type" text,
  "Gross sales" text,
  "Discounts" text,
  "Net sales" text,
  "Taxes" text,
  "Total collected" text,
  "Cost of goods" text,
  "Gross profit" text,
  "Payment type" text,
  "Description" text,
  "Dining option" text,
  "POS" text,
  "Store" text,
  "Cashier name" text,
  "Customer name" text,
  "Customer contacts" text,
  "Status" text
);

create table if not exists public.imported_receipt_items (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  receipt_date timestamptz,
  receipt_day date,
  receipt_number text,
  receipt_type text,
  category text,
  sku text,
  item text,
  variant text,
  modifiers_applied text,
  quantity numeric(14, 3) not null default 0,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  taxes numeric(14, 2) not null default 0,
  dining_option text,
  pos text,
  store_name text,
  cashier_name text,
  customer_name text,
  comment text,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  "Date" text,
  "Receipt number" text,
  "Receipt type" text,
  "Category" text,
  "SKU" text,
  "Item" text,
  "Variant" text,
  "Modifiers applied" text,
  "Quantity" text,
  "Gross sales" text,
  "Discounts" text,
  "Net sales" text,
  "Cost of goods" text,
  "Gross profit" text,
  "Taxes" text,
  "Dining option" text,
  "POS" text,
  "Store" text,
  "Cashier name" text,
  "Customer name" text,
  "Comment" text,
  "Status" text
);

create index if not exists idx_imported_receipts_receipt_date on public.imported_receipts (receipt_date);
create index if not exists idx_imported_receipts_receipt_day on public.imported_receipts (receipt_day);
create index if not exists idx_imported_receipts_receipt_number on public.imported_receipts (receipt_number);
create index if not exists idx_imported_receipts_store_name on public.imported_receipts (store_name);
create index if not exists idx_imported_receipts_payment_type on public.imported_receipts (payment_type);
create index if not exists idx_imported_receipt_items_receipt_date on public.imported_receipt_items (receipt_date);
create index if not exists idx_imported_receipt_items_receipt_day on public.imported_receipt_items (receipt_day);
create index if not exists idx_imported_receipt_items_receipt_number on public.imported_receipt_items (receipt_number);
create index if not exists idx_imported_receipt_items_item on public.imported_receipt_items (item);
create index if not exists idx_imported_receipt_items_category on public.imported_receipt_items (category);
create index if not exists idx_imported_receipt_items_store_name on public.imported_receipt_items (store_name);

alter table public.imported_receipts enable row level security;
alter table public.imported_receipt_items enable row level security;

drop policy if exists "imported_receipts_staff_select" on public.imported_receipts;
create policy "imported_receipts_staff_select"
on public.imported_receipts
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_receipts_admin_write" on public.imported_receipts;
create policy "imported_receipts_admin_write"
on public.imported_receipts
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

drop policy if exists "imported_receipt_items_staff_select" on public.imported_receipt_items;
create policy "imported_receipt_items_staff_select"
on public.imported_receipt_items
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_receipt_items_admin_write" on public.imported_receipt_items;
create policy "imported_receipt_items_admin_write"
on public.imported_receipt_items
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

grant select on public.imported_receipts to authenticated;
grant select on public.imported_receipt_items to authenticated;
grant insert, update, delete on public.imported_receipts to authenticated;
grant insert, update, delete on public.imported_receipt_items to authenticated;

commit;
