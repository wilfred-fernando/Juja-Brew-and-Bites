begin;

create extension if not exists pgcrypto;

create table if not exists public.imported_loyverse_item_sales_summary (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  report_start_date date,
  report_end_date date,
  item_name text,
  sku text,
  category text,
  items_sold numeric(14, 3) not null default 0,
  gross_sales numeric(14, 2) not null default 0,
  items_refunded numeric(14, 3) not null default 0,
  refunds numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  margin_percent numeric(9, 4) not null default 0,
  taxes numeric(14, 2) not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  "Item name" text,
  "SKU" text,
  "Category" text,
  "Items sold" text,
  "Gross sales" text,
  "Items refunded" text,
  "Refunds" text,
  "Discounts" text,
  "Net sales" text,
  "Cost of goods" text,
  "Gross profit" text,
  "Margin" text,
  "Taxes" text
);

create table if not exists public.imported_loyverse_category_sales_summary (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  report_start_date date,
  report_end_date date,
  category text,
  items_sold numeric(14, 3) not null default 0,
  gross_sales numeric(14, 2) not null default 0,
  items_refunded numeric(14, 3) not null default 0,
  refunds numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  margin_percent numeric(9, 4) not null default 0,
  taxes numeric(14, 2) not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  "Category" text,
  "Items sold" text,
  "Gross sales" text,
  "Items refunded" text,
  "Refunds" text,
  "Discounts" text,
  "Net sales" text,
  "Cost of goods" text,
  "Gross profit" text,
  "Margin" text,
  "Taxes" text
);

create index if not exists idx_imported_loyverse_item_summary_period on public.imported_loyverse_item_sales_summary (report_start_date, report_end_date);
create index if not exists idx_imported_loyverse_item_summary_item on public.imported_loyverse_item_sales_summary (item_name);
create index if not exists idx_imported_loyverse_item_summary_category on public.imported_loyverse_item_sales_summary (category);
create index if not exists idx_imported_loyverse_category_summary_period on public.imported_loyverse_category_sales_summary (report_start_date, report_end_date);
create index if not exists idx_imported_loyverse_category_summary_category on public.imported_loyverse_category_sales_summary (category);

alter table public.imported_loyverse_item_sales_summary enable row level security;
alter table public.imported_loyverse_category_sales_summary enable row level security;

drop policy if exists "imported_loyverse_item_summary_staff_select" on public.imported_loyverse_item_sales_summary;
create policy "imported_loyverse_item_summary_staff_select"
on public.imported_loyverse_item_sales_summary
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_loyverse_item_summary_admin_write" on public.imported_loyverse_item_sales_summary;
create policy "imported_loyverse_item_summary_admin_write"
on public.imported_loyverse_item_sales_summary
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

drop policy if exists "imported_loyverse_category_summary_staff_select" on public.imported_loyverse_category_sales_summary;
create policy "imported_loyverse_category_summary_staff_select"
on public.imported_loyverse_category_sales_summary
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_loyverse_category_summary_admin_write" on public.imported_loyverse_category_sales_summary;
create policy "imported_loyverse_category_summary_admin_write"
on public.imported_loyverse_category_sales_summary
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

grant select, insert, update, delete on public.imported_loyverse_item_sales_summary to authenticated;
grant select, insert, update, delete on public.imported_loyverse_category_sales_summary to authenticated;

notify pgrst, 'reload schema';

commit;
