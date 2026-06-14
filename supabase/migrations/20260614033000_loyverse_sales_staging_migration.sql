-- Loyverse historical sales migration framework.
-- Source-of-truth imported tables are preserved:
--   public.imported_sales_receipts = receipt/order-level rows
--   public.imported_sales = line-item/product-level rows
-- This migration creates staging/review/log tables and idempotent migration
-- functions. It does not automatically migrate into production orders.

create extension if not exists pg_trgm with schema extensions;

-- Source-reference columns allow duplicate-safe historical migration.
alter table public.orders
add column if not exists source_system text,
add column if not exists source_receipt_number text,
add column if not exists source_order_id text,
add column if not exists source_store_name text,
add column if not exists source_imported_at timestamptz,
add column if not exists loyalty_member_id uuid references public.loyalty_members(id),
add column if not exists migration_batch_id uuid,
add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.order_items
add column if not exists source_system text,
add column if not exists source_receipt_number text,
add column if not exists source_order_id text,
add column if not exists source_item_id text,
add column if not exists source_line_id text,
add column if not exists variant_name text,
add column if not exists migration_batch_id uuid,
add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists orders_loyverse_source_uidx
on public.orders (source_system, source_order_id)
where source_system = 'loyverse' and source_order_id is not null;

create unique index if not exists order_items_loyverse_source_line_uidx
on public.order_items (source_system, source_line_id)
where source_system = 'loyverse' and source_line_id is not null;

create index if not exists orders_loyverse_customer_idx
on public.orders (source_system, loyalty_member_id, user_id, receipt_date)
where source_system = 'loyverse';

create index if not exists order_items_loyverse_order_idx
on public.order_items (order_id, source_system);

-- Backups hold inserted Loyverse rows by migration batch so rollback can restore
-- visibility/audit before deleting the migrated records.
create table if not exists public.loyverse_orders_backup
(like public.orders including defaults including identity including generated);

create table if not exists public.loyverse_order_items_backup
(like public.order_items including defaults including identity including generated);

alter table public.loyverse_orders_backup
add column if not exists backed_up_at timestamptz not null default now();

alter table public.loyverse_order_items_backup
add column if not exists backed_up_at timestamptz not null default now();

create table if not exists public.loyverse_orders_staging (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'loyverse',
  source_receipt_number text not null,
  source_order_id text not null,
  source_receipt_id text,
  receipt_key text,
  customer_id text,
  matched_profile_id uuid,
  loyalty_member_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_code text,
  store_id uuid,
  store_name text,
  order_date timestamptz,
  receipt_date date,
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  refund_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  payment_method text,
  dining_option text,
  pos_name text,
  cashier_name text,
  order_status text not null default 'paid',
  match_confidence text not null default 'unmatched',
  match_reason text,
  migration_status text not null default 'pending',
  migration_notes text,
  target_order_id uuid,
  migration_batch_id uuid,
  source_raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_order_id)
);

create table if not exists public.loyverse_order_items_staging (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'loyverse',
  source_receipt_number text not null,
  source_order_id text not null,
  source_item_id text,
  source_line_id text not null,
  menu_item_id uuid,
  item_name text not null,
  variant_name text,
  category_name text,
  sku text,
  modifiers jsonb not null default '[]'::jsonb,
  quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  gross_amount numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  comment text,
  migration_status text not null default 'pending',
  migration_notes text,
  target_order_id uuid,
  target_order_item_id uuid,
  migration_batch_id uuid,
  source_raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_line_id)
);

create table if not exists public.loyverse_customer_match_review (
  id uuid primary key default gen_random_uuid(),
  source_order_id text,
  source_receipt_number text,
  loyverse_customer_name text,
  loyverse_phone text,
  loyverse_email text,
  possible_customer_id uuid,
  possible_loyalty_member_id uuid,
  match_confidence text not null,
  reason text,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyverse_migration_logs (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid,
  source_receipt_number text,
  source_order_id text,
  source_line_id text,
  target_order_id uuid,
  target_order_item_id uuid,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists loyverse_orders_staging_status_idx on public.loyverse_orders_staging (migration_status, match_confidence);
create index if not exists loyverse_orders_staging_customer_idx on public.loyverse_orders_staging (loyalty_member_id, matched_profile_id);
create index if not exists loyverse_items_staging_order_idx on public.loyverse_order_items_staging (source_order_id, migration_status);
create index if not exists loyverse_match_review_status_idx on public.loyverse_customer_match_review (status, match_confidence);
create unique index if not exists loyverse_match_review_source_uidx
on public.loyverse_customer_match_review (
  source_order_id,
  match_confidence,
  coalesce(possible_loyalty_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists loyverse_migration_logs_batch_idx on public.loyverse_migration_logs (migration_batch_id, status);

alter table public.loyverse_orders_staging enable row level security;
alter table public.loyverse_order_items_staging enable row level security;
alter table public.loyverse_customer_match_review enable row level security;
alter table public.loyverse_migration_logs enable row level security;
alter table public.loyverse_orders_backup enable row level security;
alter table public.loyverse_order_items_backup enable row level security;

drop policy if exists "loyverse_orders_staging_staff_select" on public.loyverse_orders_staging;
create policy "loyverse_orders_staging_staff_select" on public.loyverse_orders_staging
for select to authenticated using (public.inventory_is_staff());

drop policy if exists "loyverse_orders_staging_admin_write" on public.loyverse_orders_staging;
create policy "loyverse_orders_staging_admin_write" on public.loyverse_orders_staging
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "loyverse_items_staging_staff_select" on public.loyverse_order_items_staging;
create policy "loyverse_items_staging_staff_select" on public.loyverse_order_items_staging
for select to authenticated using (public.inventory_is_staff());

drop policy if exists "loyverse_items_staging_admin_write" on public.loyverse_order_items_staging;
create policy "loyverse_items_staging_admin_write" on public.loyverse_order_items_staging
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "loyverse_match_review_staff_select" on public.loyverse_customer_match_review;
create policy "loyverse_match_review_staff_select" on public.loyverse_customer_match_review
for select to authenticated using (public.inventory_is_staff());

drop policy if exists "loyverse_match_review_admin_write" on public.loyverse_customer_match_review;
create policy "loyverse_match_review_admin_write" on public.loyverse_customer_match_review
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "loyverse_logs_staff_select" on public.loyverse_migration_logs;
create policy "loyverse_logs_staff_select" on public.loyverse_migration_logs
for select to authenticated using (public.inventory_is_staff());

drop policy if exists "loyverse_logs_admin_write" on public.loyverse_migration_logs;
create policy "loyverse_logs_admin_write" on public.loyverse_migration_logs
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "loyverse_orders_backup_admin_only" on public.loyverse_orders_backup;
create policy "loyverse_orders_backup_admin_only" on public.loyverse_orders_backup
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

drop policy if exists "loyverse_items_backup_admin_only" on public.loyverse_order_items_backup;
create policy "loyverse_items_backup_admin_only" on public.loyverse_order_items_backup
for all to authenticated using (public.inventory_is_admin()) with check (public.inventory_is_admin());

grant select, insert, update, delete on public.loyverse_orders_staging to authenticated;
grant select, insert, update, delete on public.loyverse_order_items_staging to authenticated;
grant select, insert, update, delete on public.loyverse_customer_match_review to authenticated;
grant select, insert, update, delete on public.loyverse_migration_logs to authenticated;
grant select, insert, update, delete on public.loyverse_orders_backup to authenticated;
grant select, insert, update, delete on public.loyverse_order_items_backup to authenticated;

create or replace function public.loyverse_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g')), '');
$$;

create or replace function public.loyverse_digits(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '');
$$;

create or replace function public.loyverse_email_from_contacts(p_value text)
returns text
language sql
immutable
as $$
  select lower((regexp_match(coalesce(p_value, ''), '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', 'i'))[1]);
$$;

create or replace function public.refresh_loyverse_sales_staging()
returns table (
  staged_orders integer,
  staged_items integer,
  unmatched_customers integer,
  low_confidence_matches integer,
  duplicate_orders integer,
  duplicate_items integer
)
language plpgsql
as $$
begin
  delete from public.loyverse_customer_match_review;
  delete from public.loyverse_order_items_staging;
  delete from public.loyverse_orders_staging;

  insert into public.loyverse_orders_staging (
    source_receipt_number,
    source_order_id,
    source_receipt_id,
    receipt_key,
    customer_id,
    matched_profile_id,
    loyalty_member_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_code,
    store_id,
    store_name,
    order_date,
    receipt_date,
    subtotal,
    discount_total,
    tax_total,
    refund_total,
    grand_total,
    payment_method,
    dining_option,
    pos_name,
    cashier_name,
    order_status,
    match_confidence,
    match_reason,
    migration_status,
    migration_notes,
    target_order_id,
    source_raw
  )
  select
    r.receipt_number,
    r.id,
    r.id,
    r.id,
    case when match_row.confidence in ('exact_customer_code', 'exact_email', 'exact_phone', 'name_contact') then match_row.loyalty_member_id::text else null end,
    case when match_row.confidence in ('exact_customer_code', 'exact_email', 'exact_phone', 'name_contact') then match_row.profile_id else null end,
    case when match_row.confidence in ('exact_customer_code', 'exact_email', 'exact_phone', 'name_contact') then match_row.loyalty_member_id else null end,
    nullif(trim(r.customer_name), ''),
    public.loyverse_digits(r.customer_contacts),
    public.loyverse_email_from_contacts(r.customer_contacts),
    nullif(trim(r.customer_name), ''),
    s.id,
    coalesce(s.name, s.store_name, r.store_name),
    r.receipt_date,
    r.receipt_day,
    round(coalesce(r.gross_sales, 0)::numeric, 2),
    round(abs(coalesce(r.discounts, 0))::numeric, 2),
    0,
    round(abs(coalesce(r.refund_amount, 0))::numeric, 2),
    round(coalesce(r.net_sales, r.total_collected, 0)::numeric, 2),
    nullif(trim(r.payment_type), ''),
    nullif(trim(r.dining_option), ''),
    nullif(trim(r.pos), ''),
    nullif(trim(r.cashier_name), ''),
    case
      when lower(coalesce(r.receipt_type, '')) like '%refund%' then 'refunded'
      when lower(coalesce(r.receipt_type, '')) like '%void%' then 'voided'
      else 'paid'
    end,
    coalesce(match_row.confidence, 'unmatched'),
    match_row.reason,
    case
      when existing.id is not null then 'duplicate'
      when coalesce(match_row.confidence, 'unmatched') = 'name_only_low' then 'needs_review'
      when match_row.loyalty_member_id is null and nullif(trim(r.customer_name), '') is not null then 'needs_review'
      else 'ready'
    end,
    case
      when existing.id is not null then 'Existing production order with same Loyverse source reference.'
      when coalesce(match_row.confidence, 'unmatched') = 'name_only_low' then 'Low-confidence customer name-only match requires review.'
      when match_row.loyalty_member_id is null and nullif(trim(r.customer_name), '') is not null then 'No safe matching customer found.'
      else null
    end,
    existing.id,
    jsonb_build_object(
      'source_table', 'imported_sales_receipts',
      'source_id', r.id,
      'receipt_type', r.receipt_type,
      'order_count', r.order_count,
      'status', r.status
    )
  from public.imported_sales_receipts r
  left join public.stores s
    on public.loyverse_normalize_text(s.name) = public.loyverse_normalize_text(r.store_name)
    or public.loyverse_normalize_text(s.store_name) = public.loyverse_normalize_text(r.store_name)
  left join public.orders existing
    on existing.source_system = 'loyverse'
    and existing.source_order_id = r.id
  left join lateral (
    select
      lm.id as loyalty_member_id,
      p.id as profile_id,
      case
        when public.loyverse_normalize_text(lm.customer_code) = public.loyverse_normalize_text(r.customer_name)
          or public.loyverse_normalize_text(lm."Customer ID") = public.loyverse_normalize_text(r.customer_name)
        then 'exact_customer_code'
        when public.loyverse_email_from_contacts(r.customer_contacts) is not null
          and lower(coalesce(lm."Email", '')) = public.loyverse_email_from_contacts(r.customer_contacts)
        then 'exact_email'
        when public.loyverse_digits(r.customer_contacts) is not null
          and public.loyverse_digits(lm."Phone") = public.loyverse_digits(r.customer_contacts)
        then 'exact_phone'
        when public.loyverse_normalize_text(lm.customer_name) = public.loyverse_normalize_text(r.customer_name)
          and (
            public.loyverse_digits(r.customer_contacts) is not null
            or public.loyverse_email_from_contacts(r.customer_contacts) is not null
          )
        then 'name_contact'
        else 'name_only_low'
      end as confidence,
      case
        when public.loyverse_normalize_text(lm.customer_code) = public.loyverse_normalize_text(r.customer_name)
          or public.loyverse_normalize_text(lm."Customer ID") = public.loyverse_normalize_text(r.customer_name)
        then 'Matched imported customer field to loyalty customer code.'
        when public.loyverse_email_from_contacts(r.customer_contacts) is not null
          and lower(coalesce(lm."Email", '')) = public.loyverse_email_from_contacts(r.customer_contacts)
        then 'Matched exact email from customer contacts.'
        when public.loyverse_digits(r.customer_contacts) is not null
          and public.loyverse_digits(lm."Phone") = public.loyverse_digits(r.customer_contacts)
        then 'Matched exact phone from customer contacts.'
        when public.loyverse_normalize_text(lm.customer_name) = public.loyverse_normalize_text(r.customer_name)
          and (
            public.loyverse_digits(r.customer_contacts) is not null
            or public.loyverse_email_from_contacts(r.customer_contacts) is not null
          )
        then 'Matched normalized name with contact present.'
        else 'Matched normalized full name only; review required.'
      end as reason,
      row_number() over (
        order by
          case
            when public.loyverse_normalize_text(lm.customer_code) = public.loyverse_normalize_text(r.customer_name)
              or public.loyverse_normalize_text(lm."Customer ID") = public.loyverse_normalize_text(r.customer_name)
            then 1
            when public.loyverse_email_from_contacts(r.customer_contacts) is not null
              and lower(coalesce(lm."Email", '')) = public.loyverse_email_from_contacts(r.customer_contacts)
            then 2
            when public.loyverse_digits(r.customer_contacts) is not null
              and public.loyverse_digits(lm."Phone") = public.loyverse_digits(r.customer_contacts)
            then 3
            when public.loyverse_normalize_text(lm.customer_name) = public.loyverse_normalize_text(r.customer_name)
              and (
                public.loyverse_digits(r.customer_contacts) is not null
                or public.loyverse_email_from_contacts(r.customer_contacts) is not null
              )
            then 4
            else 5
          end,
          lm.id
      ) as rank
    from public.loyalty_members lm
    left join public.profiles p
      on p.loyalty_account_id = lm.id
      or lm.user_id = p.id
    where nullif(trim(r.customer_name), '') is not null
      and (
        public.loyverse_normalize_text(lm.customer_code) = public.loyverse_normalize_text(r.customer_name)
        or public.loyverse_normalize_text(lm."Customer ID") = public.loyverse_normalize_text(r.customer_name)
        or (
          public.loyverse_email_from_contacts(r.customer_contacts) is not null
          and lower(coalesce(lm."Email", '')) = public.loyverse_email_from_contacts(r.customer_contacts)
        )
        or (
          public.loyverse_digits(r.customer_contacts) is not null
          and public.loyverse_digits(lm."Phone") = public.loyverse_digits(r.customer_contacts)
        )
        or public.loyverse_normalize_text(lm.customer_name) = public.loyverse_normalize_text(r.customer_name)
      )
  ) match_row on match_row.rank = 1
  where r.receipt_number is not null
    and r.receipt_date is not null
    and coalesce(r.net_sales, r.total_collected, 0) is not null;

  insert into public.loyverse_order_items_staging (
    source_receipt_number,
    source_order_id,
    source_item_id,
    source_line_id,
    menu_item_id,
    item_name,
    variant_name,
    category_name,
    sku,
    modifiers,
    quantity,
    unit_price,
    gross_amount,
    discount_amount,
    tax_amount,
    line_total,
    comment,
    migration_status,
    migration_notes,
    target_order_id,
    source_raw
  )
  select
    i.receipt_number,
    coalesce(o.source_order_id, 'imported-sales-receipt:' || i.receipt_key),
    i.id::text,
    coalesce(i.source_line_id, i.id::text, i.row_hash),
    mi.id,
    coalesce(nullif(trim(i.item), ''), 'Imported item'),
    nullif(trim(i.variant), ''),
    coalesce(nullif(trim(i.category), ''), mi.category, 'Uncategorized'),
    nullif(trim(i.sku), ''),
    case
      when nullif(trim(i.modifiers_applied), '') is null then '[]'::jsonb
      else to_jsonb(regexp_split_to_array(i.modifiers_applied, '\s*,\s*'))
    end,
    round(coalesce(i.quantity, 0)::numeric, 3),
    round(case when coalesce(i.quantity, 0) <> 0 then coalesce(i.net_sales, 0) / i.quantity else coalesce(i.net_sales, 0) end::numeric, 2),
    round(coalesce(i.gross_sales, i.net_sales, 0)::numeric, 2),
    round(abs(coalesce(i.discounts, 0))::numeric, 2),
    round(coalesce(i.taxes, 0)::numeric, 2),
    round(coalesce(i.net_sales, 0)::numeric, 2),
    nullif(trim(i.comment), ''),
    case
      when o.source_order_id is null then 'orphan'
      when existing_item.id is not null then 'duplicate'
      else 'ready'
    end,
    case
      when o.source_order_id is null then 'No staged receipt/order found for this line item.'
      when existing_item.id is not null then 'Existing production order item with same Loyverse source line.'
      when mi.id is null then 'Menu item not matched; original item name will still be imported.'
      else null
    end,
    o.target_order_id,
    jsonb_build_object(
      'source_table', 'imported_sales',
      'source_id', i.id,
      'row_hash', i.row_hash,
      'receipt_key', i.receipt_key,
      'source_row_number', i.source_row_number,
      'source_file', i.source_file
    )
  from public.imported_sales i
  left join public.loyverse_orders_staging o
    on o.source_order_id = 'imported-sales-receipt:' || i.receipt_key
  left join public.menu_items mi
    on public.loyverse_normalize_text(mi.name) = public.loyverse_normalize_text(i.item)
  left join public.order_items existing_item
    on existing_item.source_system = 'loyverse'
    and existing_item.source_line_id = coalesce(i.source_line_id, i.id::text, i.row_hash)
  where i.receipt_number is not null
    and coalesce(i.item, '') <> '';

  insert into public.loyverse_customer_match_review (
    source_order_id,
    source_receipt_number,
    loyverse_customer_name,
    loyverse_phone,
    loyverse_email,
    possible_customer_id,
    possible_loyalty_member_id,
    match_confidence,
    reason,
    status
  )
  select
    source_order_id,
    source_receipt_number,
    customer_name,
    customer_phone,
    customer_email,
    matched_profile_id,
    loyalty_member_id,
    match_confidence,
    coalesce(match_reason, migration_notes, 'No safe automatic match.'),
    case when match_confidence = 'name_only_low' then 'pending_review' else 'unmatched' end
  from public.loyverse_orders_staging
  where migration_status = 'needs_review';

  return query
  select
    (select count(*)::int from public.loyverse_orders_staging),
    (select count(*)::int from public.loyverse_order_items_staging),
    (select count(*)::int from public.loyverse_orders_staging where match_confidence = 'unmatched'),
    (select count(*)::int from public.loyverse_orders_staging where match_confidence = 'name_only_low'),
    (select count(*)::int from public.loyverse_orders_staging where migration_status = 'duplicate'),
    (select count(*)::int from public.loyverse_order_items_staging where migration_status = 'duplicate');
end;
$$;

create or replace view public.loyverse_migration_validation_report
with (security_invoker = true)
as
select 'source_receipts' as metric, count(*)::numeric as value from public.imported_sales_receipts
union all
select 'source_line_items', count(*)::numeric from public.imported_sales
union all
select 'staged_orders', count(*)::numeric from public.loyverse_orders_staging
union all
select 'staged_order_items', count(*)::numeric from public.loyverse_order_items_staging
union all
select 'ready_orders', count(*)::numeric from public.loyverse_orders_staging where migration_status = 'ready'
union all
select 'duplicate_orders', count(*)::numeric from public.loyverse_orders_staging where migration_status = 'duplicate'
union all
select 'review_orders', count(*)::numeric from public.loyverse_orders_staging where migration_status = 'needs_review'
union all
select 'unmatched_customers', count(*)::numeric from public.loyverse_orders_staging where match_confidence = 'unmatched'
union all
select 'low_confidence_matches', count(*)::numeric from public.loyverse_orders_staging where match_confidence = 'name_only_low'
union all
select 'unmatched_menu_items', count(*)::numeric from public.loyverse_order_items_staging where menu_item_id is null
union all
select 'source_net_sales', coalesce(sum(net_sales), 0)::numeric from public.imported_sales_receipts
union all
select 'staged_grand_total', coalesce(sum(grand_total), 0)::numeric from public.loyverse_orders_staging
union all
select 'staged_line_total', coalesce(sum(line_total), 0)::numeric from public.loyverse_order_items_staging;

create or replace view public.loyverse_customer_points_preview
with (security_invoker = true)
as
select
  o.customer_name,
  o.customer_phone,
  o.customer_email,
  o.loyalty_member_id,
  lm.customer_code,
  coalesce(sum(o.grand_total), 0)::numeric(14, 2) as imported_total_spending,
  round(coalesce(sum(o.grand_total), 0) * 0.04, 2) as estimated_points_at_current_rule,
  coalesce(lm."Points balance", 0) as current_points_balance,
  round(coalesce(sum(o.grand_total), 0) * 0.04, 2) as suggested_adjustment_preview,
  case
    when o.match_confidence in ('unmatched', 'name_only_low') then 'Review customer match before applying points.'
    else 'Historical preview only. Do not post points until confirmed.'
  end as warning
from public.loyverse_orders_staging o
left join public.loyalty_members lm on lm.id = o.loyalty_member_id
group by o.customer_name, o.customer_phone, o.customer_email, o.loyalty_member_id, lm.customer_code, lm."Points balance", o.match_confidence;

create or replace function public.migrate_loyverse_staged_orders(
  p_batch_id uuid default gen_random_uuid(),
  p_dry_run boolean default true
)
returns table (
  migration_batch_id uuid,
  dry_run boolean,
  ready_orders integer,
  inserted_orders integer,
  ready_items integer,
  inserted_items integer,
  skipped_orders integer,
  skipped_items integer
)
language plpgsql
as $$
declare
  v_inserted_orders integer := 0;
  v_inserted_items integer := 0;
begin
  if p_dry_run then
    return query
    select
      p_batch_id,
      true,
      (select count(*)::int from public.loyverse_orders_staging where migration_status = 'ready'),
      0,
      (select count(*)::int from public.loyverse_order_items_staging where migration_status in ('ready', 'pending')),
      0,
      (select count(*)::int from public.loyverse_orders_staging where migration_status <> 'ready'),
      (select count(*)::int from public.loyverse_order_items_staging where migration_status in ('duplicate', 'orphan'));
    return;
  end if;

  with inserted as (
    insert into public.orders (
      created_at,
      user_id,
      customer_name,
      branch_id,
      items,
      subtotal,
      status,
      dining_option,
      fulfillment_date,
      fulfillment_time,
      customer_id,
      discount,
      payment_method,
      store_id,
      total,
      order_number,
      gross_amount,
      discount_amount,
      net_amount,
      order_type,
      paid_at,
      refund_amount,
      receipt_number,
      receipt_date,
      source_system,
      source_receipt_number,
      source_order_id,
      source_store_name,
      source_imported_at,
      loyalty_member_id,
      migration_batch_id,
      source_metadata
    )
    select
      s.order_date,
      s.matched_profile_id,
      coalesce(s.customer_name, 'Walk-in'),
      coalesce(s.store_id::text, s.store_name, 'loyverse'),
      '[]'::jsonb,
      s.subtotal,
      s.order_status,
      s.dining_option,
      s.receipt_date::text,
      to_char(s.order_date at time zone 'Asia/Manila', 'HH24:MI'),
      coalesce(s.customer_id, s.loyalty_member_id::text),
      s.discount_total::text,
      s.payment_method,
      coalesce(s.store_id::text, s.store_name, 'loyverse'),
      s.grand_total::text,
      s.source_receipt_number,
      s.subtotal,
      s.discount_total,
      s.grand_total,
      coalesce(s.dining_option, 'Imported'),
      s.order_date,
      s.refund_total,
      s.source_receipt_number,
      s.receipt_date,
      'loyverse',
      s.source_receipt_number,
      s.source_order_id,
      s.store_name,
      now(),
      s.loyalty_member_id,
      p_batch_id,
      s.source_raw || jsonb_build_object('migration_batch_id', p_batch_id)
    from public.loyverse_orders_staging s
    where s.migration_status = 'ready'
    on conflict (source_system, source_order_id) where source_system = 'loyverse' and source_order_id is not null
    do nothing
    returning id, source_order_id
  )
  update public.loyverse_orders_staging s
  set target_order_id = inserted.id,
      migration_status = 'migrated',
      migration_notes = 'Migrated to production orders.',
      migration_batch_id = p_batch_id,
      updated_at = now()
  from inserted
  where s.source_order_id = inserted.source_order_id;

  get diagnostics v_inserted_orders = row_count;

  insert into public.loyverse_orders_backup
  select o.*, now()
  from public.orders o
  where o.source_system = 'loyverse'
    and o.migration_batch_id = p_batch_id
  on conflict do nothing;

  update public.loyverse_order_items_staging i
  set target_order_id = o.target_order_id,
      migration_batch_id = p_batch_id,
      updated_at = now()
  from public.loyverse_orders_staging o
  where i.source_order_id = o.source_order_id
    and o.target_order_id is not null;

  with inserted_items as (
    insert into public.order_items (
      order_id,
      menu_item_id,
      name,
      quantity,
      unit_price,
      modifiers,
      instructions,
      line_total,
      item_name,
      category_name,
      gross_amount,
      discount_amount,
      net_amount,
      source_system,
      source_receipt_number,
      source_order_id,
      source_item_id,
      source_line_id,
      variant_name,
      migration_batch_id,
      source_metadata
    )
    select
      i.target_order_id,
      i.menu_item_id,
      case when i.variant_name is null then i.item_name else i.item_name || ' (' || i.variant_name || ')' end,
      i.quantity,
      i.unit_price,
      i.modifiers,
      i.comment,
      i.line_total,
      i.item_name,
      i.category_name,
      i.gross_amount,
      i.discount_amount,
      i.line_total,
      'loyverse',
      i.source_receipt_number,
      i.source_order_id,
      i.source_item_id,
      i.source_line_id,
      i.variant_name,
      p_batch_id,
      i.source_raw || jsonb_build_object('migration_batch_id', p_batch_id)
    from public.loyverse_order_items_staging i
    where i.target_order_id is not null
      and i.migration_status in ('ready', 'pending')
    on conflict (source_system, source_line_id) where source_system = 'loyverse' and source_line_id is not null
    do nothing
    returning id, source_line_id
  )
  update public.loyverse_order_items_staging i
  set target_order_item_id = inserted_items.id,
      migration_status = 'migrated',
      migration_notes = coalesce(i.migration_notes, 'Migrated to production order_items.'),
      migration_batch_id = p_batch_id,
      updated_at = now()
  from inserted_items
  where i.source_line_id = inserted_items.source_line_id;

  get diagnostics v_inserted_items = row_count;

  insert into public.loyverse_order_items_backup
  select oi.*, now()
  from public.order_items oi
  where oi.source_system = 'loyverse'
    and oi.migration_batch_id = p_batch_id
  on conflict do nothing;

  insert into public.loyverse_migration_logs (
    migration_batch_id,
    source_receipt_number,
    source_order_id,
    source_line_id,
    target_order_id,
    target_order_item_id,
    status,
    message
  )
  select p_batch_id, source_receipt_number, source_order_id, null, target_order_id, null, migration_status, migration_notes
  from public.loyverse_orders_staging
  union all
  select p_batch_id, source_receipt_number, source_order_id, source_line_id, target_order_id, target_order_item_id, migration_status, migration_notes
  from public.loyverse_order_items_staging;

  return query
  select
    p_batch_id,
    false,
    (select count(*)::int from public.loyverse_orders_staging where migration_status in ('ready', 'migrated')),
    v_inserted_orders,
    (select count(*)::int from public.loyverse_order_items_staging where migration_status in ('ready', 'pending', 'migrated')),
    v_inserted_items,
    (select count(*)::int from public.loyverse_orders_staging where migration_status not in ('ready', 'migrated')),
    (select count(*)::int from public.loyverse_order_items_staging where migration_status in ('duplicate', 'orphan'));
end;
$$;

create or replace function public.rollback_loyverse_migration(p_batch_id uuid)
returns table (
  migration_batch_id uuid,
  deleted_order_items integer,
  deleted_orders integer
)
language plpgsql
as $$
declare
  v_items integer := 0;
  v_orders integer := 0;
begin
  delete from public.order_items
  where source_system = 'loyverse'
    and migration_batch_id = p_batch_id;
  get diagnostics v_items = row_count;

  delete from public.orders
  where source_system = 'loyverse'
    and migration_batch_id = p_batch_id;
  get diagnostics v_orders = row_count;

  update public.loyverse_orders_staging
  set migration_status = 'rolled_back',
      migration_notes = 'Rolled back migration batch ' || p_batch_id::text,
      updated_at = now()
  where migration_batch_id = p_batch_id
     or target_order_id in (select id from public.loyverse_orders_backup where migration_batch_id = p_batch_id);

  insert into public.loyverse_migration_logs (migration_batch_id, status, message)
  values (p_batch_id, 'rolled_back', 'Deleted migrated Loyverse order_items=' || v_items || ', orders=' || v_orders);

  return query select p_batch_id, v_items, v_orders;
end;
$$;
