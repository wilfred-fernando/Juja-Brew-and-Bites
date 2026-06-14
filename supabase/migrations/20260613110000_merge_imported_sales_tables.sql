begin;

create extension if not exists pgcrypto;

create table if not exists public.imported_sales (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'loyverse',
  source_order_id text,
  source_line_id text,
  source_item_id uuid,
  import_batch_id text,
  source_file text,
  source_row_number integer,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  receipt_key text not null,
  receipt_date timestamptz,
  receipt_day date,
  receipt_number text,
  receipt_type text,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  refund_amount numeric(14, 2) not null default 0,
  taxes numeric(14, 2) not null default 0,
  total_collected numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  payment_type text,
  receipt_description text,
  dining_option text,
  pos text,
  store_name text,
  cashier_name text,
  customer_name text,
  customer_contacts text,
  status text,
  category text,
  sku text,
  item text,
  variant text,
  modifiers_applied text,
  quantity numeric(14, 3) not null default 0,
  comment text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists public.imported_sales_receipts (
  id text primary key,
  source_type text not null default 'loyverse',
  source_order_id text,
  receipt_date timestamptz,
  receipt_day date,
  receipt_number text,
  receipt_type text,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  refund_amount numeric(14, 2) not null default 0,
  total_collected numeric(14, 2) not null default 0,
  payment_type text,
  dining_option text,
  pos text,
  store_name text,
  cashier_name text,
  customer_name text,
  status text,
  order_count integer not null default 1
);

create table if not exists public.imported_sales_summary (
  id text primary key,
  source_type text not null default 'loyverse',
  receipt_date timestamptz,
  receipt_day date,
  receipt_type text,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  refund_amount numeric(14, 2) not null default 0,
  payment_type text,
  dining_option text,
  store_name text,
  cashier_name text,
  customer_name text,
  status text,
  order_count integer not null default 0
);

create or replace function public.refresh_imported_sales_tables()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.imported_sales;
  truncate table public.imported_sales_receipts;
  truncate table public.imported_sales_summary;

  insert into public.imported_sales (
    source_type,
    source_order_id,
    source_line_id,
    source_item_id,
    import_batch_id,
    source_file,
    source_row_number,
    row_hash,
    imported_at,
    receipt_key,
    receipt_date,
    receipt_day,
    receipt_number,
    receipt_type,
    gross_sales,
    discounts,
    net_sales,
    refund_amount,
    taxes,
    total_collected,
    cost_of_goods,
    gross_profit,
    payment_type,
    receipt_description,
    dining_option,
    pos,
    store_name,
    cashier_name,
    customer_name,
    customer_contacts,
    status,
    category,
    sku,
    item,
    variant,
    modifiers_applied,
    quantity,
    comment,
    raw_data
  )
  select
    'loyverse',
    source.receipt_number,
    source.row_hash,
    source.id,
    source.import_batch_id,
    source.source_file,
    source.source_row_number,
    source.row_hash,
    source.imported_at,
    md5(concat_ws('|', coalesce(source.receipt_day::text, ''), coalesce(source.store_name, ''), coalesce(source.receipt_number, ''), coalesce(source.payment_type, ''))) as receipt_key,
    source.receipt_date,
    source.receipt_day,
    source.receipt_number,
    coalesce(source.receipt_type, 'Sale') as receipt_type,
    case when is_refund then 0 else greatest(coalesce(source.gross_sales, 0), 0) end as gross_sales,
    case when is_refund then 0 else abs(coalesce(source.discounts, 0)) end as discounts,
    case when is_refund then 0 else greatest(coalesce(source.net_sales, 0), 0) end as net_sales,
    case when is_refund then abs(coalesce(source.net_sales, source.gross_sales, 0)) else 0 end as refund_amount,
    coalesce(source.taxes, 0),
    coalesce(source.total_collected, 0),
    coalesce(source.cost_of_goods, 0),
    coalesce(source.gross_profit, 0),
    coalesce(source.payment_type, 'Other'),
    source.receipt_description,
    coalesce(source.dining_option, 'Takeout'),
    source.pos,
    source.store_name,
    source.cashier_name,
    source.customer_name,
    source.customer_contacts,
    case
      when is_refund then 'Refunded'
      when lower(coalesce(source.status, '')) in ('closed', 'completed', 'complete', 'paid', 'delivered') then 'Paid'
      else coalesce(source.status, 'Paid')
    end,
    source.category,
    source.sku,
    source.item,
    source.variant,
    source.modifiers_applied,
    coalesce(source.quantity, 0),
    source.comment,
    source.raw_data
  from (
    select
      item.*,
      case
        when lower(coalesce(item.receipt_type, '')) like '%refund%'
          or lower(coalesce(item.receipt_type, '')) like '%void%'
          or coalesce(item.net_sales, 0) < 0
          or coalesce(item.gross_sales, 0) < 0
        then true
        else false
      end as is_refund
    from public.imported_receipt_items item
  ) source;

  insert into public.imported_sales_receipts (
    id,
    source_type,
    source_order_id,
    receipt_date,
    receipt_day,
    receipt_number,
    receipt_type,
    gross_sales,
    discounts,
    net_sales,
    refund_amount,
    total_collected,
    payment_type,
    dining_option,
    pos,
    store_name,
    cashier_name,
    customer_name,
    status,
    order_count
  )
  select
    concat('imported-sales-receipt:', receipt_key),
    'loyverse',
    receipt_number,
    min(receipt_date),
    receipt_day,
    receipt_number,
    coalesce(receipt_type, 'Sale'),
    sum(gross_sales)::numeric(14, 2),
    sum(discounts)::numeric(14, 2),
    sum(net_sales)::numeric(14, 2),
    sum(refund_amount)::numeric(14, 2),
    max(total_collected)::numeric(14, 2),
    payment_type,
    dining_option,
    max(pos),
    store_name,
    cashier_name,
    customer_name,
    status,
    1
  from public.imported_sales
  group by
    receipt_key,
    receipt_day,
    receipt_number,
    coalesce(receipt_type, 'Sale'),
    payment_type,
    dining_option,
    store_name,
    cashier_name,
    customer_name,
    status;

  insert into public.imported_sales_summary (
    id,
    source_type,
    receipt_date,
    receipt_day,
    receipt_type,
    gross_sales,
    discounts,
    net_sales,
    refund_amount,
    payment_type,
    dining_option,
    store_name,
    cashier_name,
    customer_name,
    status,
    order_count
  )
  select
    concat(
      'imported-sales-summary:',
      coalesce(receipt_day::text, 'unknown'),
      ':',
      md5(concat_ws('|', coalesce(store_name, ''), coalesce(payment_type, ''), coalesce(cashier_name, ''), coalesce(customer_name, ''), coalesce(dining_option, ''), coalesce(status, ''), coalesce(receipt_type, 'Sale')))
    ),
    'loyverse',
    min(receipt_date),
    receipt_day,
    coalesce(receipt_type, 'Sale'),
    sum(gross_sales)::numeric(14, 2),
    sum(discounts)::numeric(14, 2),
    sum(net_sales)::numeric(14, 2),
    sum(refund_amount)::numeric(14, 2),
    payment_type,
    dining_option,
    store_name,
    cashier_name,
    customer_name,
    status,
    count(*)::integer
  from public.imported_sales_receipts
  group by
    receipt_day,
    coalesce(receipt_type, 'Sale'),
    payment_type,
    dining_option,
    store_name,
    cashier_name,
    customer_name,
    status;
end;
$$;

select public.refresh_imported_sales_tables();

create index if not exists idx_imported_sales_receipt_date on public.imported_sales (receipt_date);
create index if not exists idx_imported_sales_source on public.imported_sales (source_type, source_order_id);
create index if not exists idx_imported_sales_receipt_lookup on public.imported_sales (receipt_day, store_name, receipt_number);
create index if not exists idx_imported_sales_item on public.imported_sales (item);
create index if not exists idx_imported_sales_category on public.imported_sales (category);
create index if not exists idx_imported_sales_receipts_date on public.imported_sales_receipts (receipt_date);
create index if not exists idx_imported_sales_receipts_source on public.imported_sales_receipts (source_type, source_order_id);
create index if not exists idx_imported_sales_receipts_day on public.imported_sales_receipts (receipt_day);
create index if not exists idx_imported_sales_summary_date on public.imported_sales_summary (receipt_date);
create index if not exists idx_imported_sales_summary_day on public.imported_sales_summary (receipt_day);

alter table public.imported_sales enable row level security;
alter table public.imported_sales_receipts enable row level security;
alter table public.imported_sales_summary enable row level security;

drop policy if exists "imported_sales_staff_select" on public.imported_sales;
create policy "imported_sales_staff_select"
on public.imported_sales
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_sales_admin_write" on public.imported_sales;
create policy "imported_sales_admin_write"
on public.imported_sales
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

drop policy if exists "imported_sales_receipts_staff_select" on public.imported_sales_receipts;
create policy "imported_sales_receipts_staff_select"
on public.imported_sales_receipts
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_sales_summary_staff_select" on public.imported_sales_summary;
create policy "imported_sales_summary_staff_select"
on public.imported_sales_summary
for select
to authenticated
using (public.inventory_is_staff());

grant select, insert, update, delete on public.imported_sales to authenticated;
grant select on public.imported_sales_receipts to authenticated;
grant select on public.imported_sales_summary to authenticated;
grant execute on function public.refresh_imported_sales_tables() to authenticated;

notify pgrst, 'reload schema';

commit;
