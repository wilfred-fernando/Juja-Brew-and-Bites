begin;

alter table public.imported_receipt_items
  add column if not exists payment_type text,
  add column if not exists total_collected numeric(14, 2),
  add column if not exists customer_contacts text,
  add column if not exists receipt_description text,
  add column if not exists "Payment type" text,
  add column if not exists "Total collected" text,
  add column if not exists "Customer contacts" text,
  add column if not exists "Description" text;

update public.imported_receipt_items item
set
  payment_type = coalesce(item.payment_type, receipt.payment_type),
  total_collected = coalesce(item.total_collected, receipt.total_collected),
  customer_contacts = coalesce(item.customer_contacts, receipt.customer_contacts),
  receipt_description = coalesce(item.receipt_description, receipt.description)
from public.imported_receipts receipt
where item.receipt_number = receipt.receipt_number
  and item.store_name = receipt.store_name
  and item.receipt_day = receipt.receipt_day
  and (
    item.payment_type is null
    or item.total_collected is null
    or item.customer_contacts is null
    or item.receipt_description is null
  );

create index if not exists idx_imported_receipt_items_payment_type
  on public.imported_receipt_items (payment_type);

create index if not exists idx_imported_receipt_items_receipt_lookup
  on public.imported_receipt_items (receipt_day, store_name, receipt_number);

create or replace view public.imported_item_receipt_rows
with (security_invoker = true)
as
with normalized as (
  select
    item.*,
    case
      when lower(coalesce(item.receipt_type, '')) like '%refund%'
        or lower(coalesce(item.receipt_type, '')) like '%void%'
        or coalesce(item.net_sales, 0) < 0
        or coalesce(item.gross_sales, 0) < 0
      then true
      else false
    end as is_refund,
    case
      when lower(coalesce(item.receipt_type, '')) like '%refund%'
        or lower(coalesce(item.receipt_type, '')) like '%void%'
        or coalesce(item.net_sales, 0) < 0
        or coalesce(item.gross_sales, 0) < 0
      then 'Refunded'
      when lower(coalesce(item.status, '')) in ('closed', 'completed', 'complete', 'paid', 'delivered')
      then 'Paid'
      else coalesce(item.status, 'Paid')
    end as normalized_status
  from public.imported_receipt_items item
)
select
  concat(
    'imported-item-receipt:',
    coalesce(receipt_day::text, 'unknown'),
    ':',
    md5(concat_ws('|', coalesce(store_name, ''), coalesce(receipt_number, ''), coalesce(payment_type, '')))
  ) as id,
  min(receipt_date) as receipt_date,
  receipt_day,
  receipt_number,
  coalesce(receipt_type, 'Sale') as receipt_type,
  sum(case when is_refund then 0 else greatest(coalesce(gross_sales, 0), 0) end)::numeric(14, 2) as gross_sales,
  sum(case when is_refund then 0 else abs(coalesce(discounts, 0)) end)::numeric(14, 2) as discounts,
  sum(case when is_refund then 0 else greatest(coalesce(net_sales, 0), 0) end)::numeric(14, 2) as net_sales,
  sum(case when is_refund then abs(coalesce(net_sales, gross_sales, 0)) else 0 end)::numeric(14, 2) as refund_amount,
  max(total_collected)::numeric(14, 2) as total_collected,
  coalesce(payment_type, 'Other') as payment_type,
  coalesce(dining_option, 'Takeout') as dining_option,
  max(pos) as pos,
  store_name,
  cashier_name,
  customer_name,
  normalized_status as status,
  1::integer as order_count
from normalized
group by
  receipt_day,
  receipt_number,
  receipt_type,
  payment_type,
  dining_option,
  store_name,
  cashier_name,
  customer_name,
  normalized_status;

create or replace view public.imported_item_sales_summary_rows
with (security_invoker = true)
as
select
  concat(
    'imported-item-summary:',
    coalesce(receipt_day::text, 'unknown'),
    ':',
    md5(concat_ws('|', coalesce(store_name, ''), coalesce(payment_type, ''), coalesce(cashier_name, ''), coalesce(dining_option, ''), coalesce(status, ''), coalesce(receipt_type, '')))
  ) as id,
  min(receipt_date) as receipt_date,
  receipt_day,
  coalesce(receipt_type, 'Sale') as receipt_type,
  sum(gross_sales)::numeric(14, 2) as gross_sales,
  sum(discounts)::numeric(14, 2) as discounts,
  sum(net_sales)::numeric(14, 2) as net_sales,
  sum(refund_amount)::numeric(14, 2) as refund_amount,
  coalesce(payment_type, 'Other') as payment_type,
  coalesce(dining_option, 'Takeout') as dining_option,
  store_name,
  cashier_name,
  customer_name,
  status,
  count(*)::integer as order_count
from public.imported_item_receipt_rows
group by
  receipt_day,
  receipt_type,
  payment_type,
  dining_option,
  store_name,
  cashier_name,
  customer_name,
  status;

grant select on public.imported_item_receipt_rows to authenticated;
grant select on public.imported_item_sales_summary_rows to authenticated;

commit;
