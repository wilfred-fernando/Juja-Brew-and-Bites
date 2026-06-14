begin;

create or replace view public.imported_sales_summary_rows
with (security_invoker = true)
as
select
  concat(
    'imported-summary:',
    coalesce(receipt_day::text, 'unknown'),
    ':',
    md5(concat_ws('|', coalesce(store_name, ''), coalesce(payment_type, ''), coalesce(cashier_name, ''), coalesce(dining_option, ''), coalesce(status, ''), coalesce(receipt_type, '')))
  ) as id,
  min(receipt_date) as receipt_date,
  receipt_day,
  coalesce(receipt_type, 'Sale') as receipt_type,
  sum(
    case
      when lower(coalesce(receipt_type, '')) like '%refund%'
        or lower(coalesce(receipt_type, '')) like '%void%'
        or coalesce(net_sales, 0) < 0
        or coalesce(gross_sales, 0) < 0
      then 0
      else greatest(coalesce(gross_sales, 0), 0)
    end
  )::numeric(14, 2) as gross_sales,
  sum(
    case
      when lower(coalesce(receipt_type, '')) like '%refund%'
        or lower(coalesce(receipt_type, '')) like '%void%'
        or coalesce(net_sales, 0) < 0
        or coalesce(gross_sales, 0) < 0
      then 0
      else abs(coalesce(discounts, 0))
    end
  )::numeric(14, 2) as discounts,
  sum(
    case
      when lower(coalesce(receipt_type, '')) like '%refund%'
        or lower(coalesce(receipt_type, '')) like '%void%'
        or coalesce(net_sales, 0) < 0
        or coalesce(gross_sales, 0) < 0
      then 0
      else greatest(coalesce(net_sales, 0), 0)
    end
  )::numeric(14, 2) as net_sales,
  sum(
    case
      when lower(coalesce(receipt_type, '')) like '%refund%'
        or lower(coalesce(receipt_type, '')) like '%void%'
        or coalesce(net_sales, 0) < 0
        or coalesce(gross_sales, 0) < 0
      then abs(coalesce(net_sales, gross_sales, 0))
      else 0
    end
  )::numeric(14, 2) as refund_amount,
  coalesce(payment_type, 'Other') as payment_type,
  coalesce(dining_option, 'Takeout') as dining_option,
  store_name,
  cashier_name,
  customer_name,
  case
    when lower(coalesce(receipt_type, '')) like '%refund%'
      or lower(coalesce(receipt_type, '')) like '%void%'
      or coalesce(net_sales, 0) < 0
      or coalesce(gross_sales, 0) < 0
    then 'Refunded'
    when lower(coalesce(status, '')) in ('closed', 'completed', 'complete', 'paid', 'delivered')
    then 'Paid'
    else coalesce(status, 'Paid')
  end as status,
  count(*)::integer as order_count
from public.imported_receipts
group by
  receipt_day,
  receipt_type,
  payment_type,
  dining_option,
  store_name,
  cashier_name,
  customer_name,
  status,
  case
    when lower(coalesce(receipt_type, '')) like '%refund%'
      or lower(coalesce(receipt_type, '')) like '%void%'
      or coalesce(net_sales, 0) < 0
      or coalesce(gross_sales, 0) < 0
    then 'Refunded'
    when lower(coalesce(status, '')) in ('closed', 'completed', 'complete', 'paid', 'delivered')
    then 'Paid'
    else coalesce(status, 'Paid')
  end;

grant select on public.imported_sales_summary_rows to authenticated;

commit;
