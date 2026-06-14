create or replace function public.get_imported_item_sales_report(
  p_start_date date,
  p_end_date date
)
returns table (
  product_id text,
  product_name text,
  category text,
  store_name text,
  quantity numeric,
  gross numeric,
  discount numeric,
  net numeric,
  order_count bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(sku, ''), item || coalesce(' (' || nullif(variant, '') || ')', '')) as product_id,
    item || coalesce(' (' || nullif(variant, '') || ')', '') as product_name,
    coalesce(nullif(category, ''), 'Uncategorized') as category,
    coalesce(nullif(store_name, ''), 'Imported store') as store_name,
    coalesce(sum(quantity), 0) as quantity,
    coalesce(sum(gross_sales), 0) as gross,
    coalesce(sum(abs(discounts)), 0) as discount,
    coalesce(sum(net_sales), 0) as net,
    count(distinct receipt_key) as order_count
  from public.imported_sales
  where receipt_day between p_start_date and p_end_date
  group by 1, 2, 3, 4
  order by net desc;
$$;

create or replace function public.get_imported_category_sales_report(
  p_start_date date,
  p_end_date date
)
returns table (
  category text,
  store_name text,
  quantity numeric,
  gross numeric,
  net numeric,
  order_count bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(category, ''), 'Uncategorized') as category,
    coalesce(nullif(store_name, ''), 'Imported store') as store_name,
    coalesce(sum(quantity), 0) as quantity,
    coalesce(sum(gross_sales), 0) as gross,
    coalesce(sum(net_sales), 0) as net,
    count(distinct receipt_key) as order_count
  from public.imported_sales
  where receipt_day between p_start_date and p_end_date
  group by 1, 2
  order by net desc;
$$;

create or replace function public.get_imported_modifier_sales_report(
  p_start_date date,
  p_end_date date
)
returns table (
  modifier_name text,
  store_name text,
  quantity numeric,
  gross numeric,
  net numeric,
  order_count bigint
)
language sql
stable
as $$
  select
    trim(modifier_name) as modifier_name,
    coalesce(nullif(store_name, ''), 'Imported store') as store_name,
    coalesce(sum(quantity), 0) as quantity,
    coalesce(sum(gross_sales), 0) as gross,
    coalesce(sum(net_sales), 0) as net,
    count(distinct receipt_key) as order_count
  from public.imported_sales
  cross join lateral regexp_split_to_table(coalesce(modifiers_applied, ''), ',') as modifier_name
  where receipt_day between p_start_date and p_end_date
    and trim(modifier_name) <> ''
  group by 1, 2
  order by net desc;
$$;

grant execute on function public.get_imported_item_sales_report(date, date) to authenticated;
grant execute on function public.get_imported_category_sales_report(date, date) to authenticated;
grant execute on function public.get_imported_modifier_sales_report(date, date) to authenticated;

create index if not exists idx_imported_sales_report_items
on public.imported_sales (receipt_day, store_name, category, item, variant, sku);

create index if not exists idx_imported_sales_report_receipt_key
on public.imported_sales (receipt_day, receipt_key);

create index if not exists idx_imported_sales_report_modifiers
on public.imported_sales (receipt_day)
where coalesce(modifiers_applied, '') <> '';
