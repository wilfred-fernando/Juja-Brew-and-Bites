begin;

create or replace function public.imported_sales_year_table_exists(
  p_base_table text,
  p_year integer
)
returns boolean
language sql
stable
as $$
  select to_regclass(format('public.%I_%s', p_base_table, p_year)) is not null;
$$;

create or replace function public.ensure_imported_sales_year_tables(p_year integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := p_year::text;
begin
  if p_year < 2000 or p_year > 2100 then
    raise exception 'Invalid report year: %', p_year;
  end if;

  execute format('create table if not exists public.%I (like public.imported_sales including defaults including constraints)', 'imported_sales_' || v_year);
  execute format('create table if not exists public.%I (like public.imported_sales_receipts including defaults including constraints)', 'imported_sales_receipts_' || v_year);
  execute format('create table if not exists public.%I (like public.imported_sales_summary including defaults including constraints)', 'imported_sales_summary_' || v_year);

  execute format('create index if not exists %I on public.%I (receipt_date)', 'idx_imported_sales_' || v_year || '_receipt_date', 'imported_sales_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_day, store_name, category, item, variant, sku)', 'idx_imported_sales_' || v_year || '_report_items', 'imported_sales_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_day, receipt_key)', 'idx_imported_sales_' || v_year || '_receipt_key', 'imported_sales_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_day)', 'idx_imported_sales_' || v_year || '_modifiers', 'imported_sales_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_date)', 'idx_imported_sales_receipts_' || v_year || '_date', 'imported_sales_receipts_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_day)', 'idx_imported_sales_receipts_' || v_year || '_day', 'imported_sales_receipts_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_date)', 'idx_imported_sales_summary_' || v_year || '_date', 'imported_sales_summary_' || v_year);
  execute format('create index if not exists %I on public.%I (receipt_day)', 'idx_imported_sales_summary_' || v_year || '_day', 'imported_sales_summary_' || v_year);

  execute format('alter table public.%I enable row level security', 'imported_sales_' || v_year);
  execute format('alter table public.%I enable row level security', 'imported_sales_receipts_' || v_year);
  execute format('alter table public.%I enable row level security', 'imported_sales_summary_' || v_year);

  execute format('drop policy if exists %I on public.%I', 'imported_sales_' || v_year || '_staff_select', 'imported_sales_' || v_year);
  execute format('create policy %I on public.%I for select to authenticated using (public.inventory_is_staff())', 'imported_sales_' || v_year || '_staff_select', 'imported_sales_' || v_year);

  execute format('drop policy if exists %I on public.%I', 'imported_sales_receipts_' || v_year || '_staff_select', 'imported_sales_receipts_' || v_year);
  execute format('create policy %I on public.%I for select to authenticated using (public.inventory_is_staff())', 'imported_sales_receipts_' || v_year || '_staff_select', 'imported_sales_receipts_' || v_year);

  execute format('drop policy if exists %I on public.%I', 'imported_sales_summary_' || v_year || '_staff_select', 'imported_sales_summary_' || v_year);
  execute format('create policy %I on public.%I for select to authenticated using (public.inventory_is_staff())', 'imported_sales_summary_' || v_year || '_staff_select', 'imported_sales_summary_' || v_year);

  execute format('grant select on public.%I to authenticated', 'imported_sales_' || v_year);
  execute format('grant select on public.%I to authenticated', 'imported_sales_receipts_' || v_year);
  execute format('grant select on public.%I to authenticated', 'imported_sales_summary_' || v_year);
end;
$$;

create or replace function public.refresh_imported_sales_year_tables()
returns table(report_year integer, item_rows bigint, receipt_rows bigint, summary_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
begin
  for v_year in
    select distinct extract(year from receipt_day)::integer
    from public.imported_sales
    where receipt_day is not null
    order by 1
  loop
    perform public.ensure_imported_sales_year_tables(v_year);

    execute format('truncate table public.%I', 'imported_sales_' || v_year);
    execute format('insert into public.%I select * from public.imported_sales where extract(year from receipt_day)::integer = $1', 'imported_sales_' || v_year)
      using v_year;

    execute format('truncate table public.%I', 'imported_sales_receipts_' || v_year);
    execute format('insert into public.%I select * from public.imported_sales_receipts where extract(year from receipt_day)::integer = $1', 'imported_sales_receipts_' || v_year)
      using v_year;

    execute format('truncate table public.%I', 'imported_sales_summary_' || v_year);
    execute format('insert into public.%I select * from public.imported_sales_summary where extract(year from receipt_day)::integer = $1', 'imported_sales_summary_' || v_year)
      using v_year;

    report_year := v_year;
    execute format('select count(*) from public.%I', 'imported_sales_' || v_year) into item_rows;
    execute format('select count(*) from public.%I', 'imported_sales_receipts_' || v_year) into receipt_rows;
    execute format('select count(*) from public.%I', 'imported_sales_summary_' || v_year) into summary_rows;
    return next;
  end loop;
end;
$$;

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
language plpgsql
as $$
declare
  v_year integer;
  v_table text;
  v_sql text;
begin
  create temporary table if not exists pg_temp.imported_item_sales_rollup (
    product_id text,
    product_name text,
    category text,
    store_name text,
    quantity numeric,
    gross numeric,
    discount numeric,
    net numeric,
    order_count bigint
  ) on commit drop;
  truncate table pg_temp.imported_item_sales_rollup;

  for v_year in select generate_series(extract(year from p_start_date)::integer, extract(year from p_end_date)::integer)
  loop
    v_table := case
      when public.imported_sales_year_table_exists('imported_sales', v_year) then format('public.%I', 'imported_sales_' || v_year)
      else 'public.imported_sales'
    end;

    v_sql := format($query$
      insert into pg_temp.imported_item_sales_rollup
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
      from %s
      where receipt_day between $1 and $2
        and extract(year from receipt_day)::integer = $3
      group by 1, 2, 3, 4
    $query$, v_table);
    execute v_sql using p_start_date, p_end_date, v_year;
  end loop;

  return query
  select
    r.product_id,
    r.product_name,
    r.category,
    r.store_name,
    sum(r.quantity),
    sum(r.gross),
    sum(r.discount),
    sum(r.net),
    sum(r.order_count)::bigint
  from pg_temp.imported_item_sales_rollup r
  group by 1, 2, 3, 4
  order by sum(r.net) desc;
end;
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
language plpgsql
as $$
declare
  v_year integer;
  v_table text;
  v_sql text;
begin
  create temporary table if not exists pg_temp.imported_category_sales_rollup (
    category text,
    store_name text,
    quantity numeric,
    gross numeric,
    net numeric,
    order_count bigint
  ) on commit drop;
  truncate table pg_temp.imported_category_sales_rollup;

  for v_year in select generate_series(extract(year from p_start_date)::integer, extract(year from p_end_date)::integer)
  loop
    v_table := case
      when public.imported_sales_year_table_exists('imported_sales', v_year) then format('public.%I', 'imported_sales_' || v_year)
      else 'public.imported_sales'
    end;

    v_sql := format($query$
      insert into pg_temp.imported_category_sales_rollup
      select
        coalesce(nullif(category, ''), 'Uncategorized') as category,
        coalesce(nullif(store_name, ''), 'Imported store') as store_name,
        coalesce(sum(quantity), 0) as quantity,
        coalesce(sum(gross_sales), 0) as gross,
        coalesce(sum(net_sales), 0) as net,
        count(distinct receipt_key) as order_count
      from %s
      where receipt_day between $1 and $2
        and extract(year from receipt_day)::integer = $3
      group by 1, 2
    $query$, v_table);
    execute v_sql using p_start_date, p_end_date, v_year;
  end loop;

  return query
  select
    r.category,
    r.store_name,
    sum(r.quantity),
    sum(r.gross),
    sum(r.net),
    sum(r.order_count)::bigint
  from pg_temp.imported_category_sales_rollup r
  group by 1, 2
  order by sum(r.net) desc;
end;
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
language plpgsql
as $$
declare
  v_year integer;
  v_table text;
  v_sql text;
begin
  create temporary table if not exists pg_temp.imported_modifier_sales_rollup (
    modifier_name text,
    store_name text,
    quantity numeric,
    gross numeric,
    net numeric,
    order_count bigint
  ) on commit drop;
  truncate table pg_temp.imported_modifier_sales_rollup;

  for v_year in select generate_series(extract(year from p_start_date)::integer, extract(year from p_end_date)::integer)
  loop
    v_table := case
      when public.imported_sales_year_table_exists('imported_sales', v_year) then format('public.%I', 'imported_sales_' || v_year)
      else 'public.imported_sales'
    end;

    v_sql := format($query$
      insert into pg_temp.imported_modifier_sales_rollup
      select
        trim(modifier_name) as modifier_name,
        coalesce(nullif(store_name, ''), 'Imported store') as store_name,
        coalesce(sum(quantity), 0) as quantity,
        coalesce(sum(gross_sales), 0) as gross,
        coalesce(sum(net_sales), 0) as net,
        count(distinct receipt_key) as order_count
      from %s
      cross join lateral regexp_split_to_table(coalesce(modifiers_applied, ''), ',') as modifier_name
      where receipt_day between $1 and $2
        and extract(year from receipt_day)::integer = $3
        and trim(modifier_name) <> ''
      group by 1, 2
    $query$, v_table);
    execute v_sql using p_start_date, p_end_date, v_year;
  end loop;

  return query
  select
    r.modifier_name,
    r.store_name,
    sum(r.quantity),
    sum(r.gross),
    sum(r.net),
    sum(r.order_count)::bigint
  from pg_temp.imported_modifier_sales_rollup r
  group by 1, 2
  order by sum(r.net) desc;
end;
$$;

grant execute on function public.imported_sales_year_table_exists(text, integer) to authenticated;
grant execute on function public.get_imported_item_sales_report(date, date) to authenticated;
grant execute on function public.get_imported_category_sales_report(date, date) to authenticated;
grant execute on function public.get_imported_modifier_sales_report(date, date) to authenticated;

select * from public.refresh_imported_sales_year_tables();

notify pgrst, 'reload schema';

commit;
