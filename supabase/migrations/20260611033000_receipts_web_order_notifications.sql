-- Receipt numbers, web-order routing, and notification support.
-- Additive schema changes first; policy replacements only remove older broad access
-- policies that made store-scoped POS routing impossible to enforce.

alter table public.stores
  add column if not exists store_code text,
  add column if not exists store_name text,
  add column if not exists address text,
  add column if not exists updated_at timestamp with time zone default now();

update public.stores
set
  store_name = coalesce(nullif(store_name, ''), name),
  store_code = coalesce(
    nullif(store_code, ''),
    case
      when lower(name) like '%diliman%' or lower(name) like '%dil%' then 'DIL'
      when lower(name) like '%pasong%' or lower(name) like '%tamo%' then 'PTM'
      else upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3))
    end
  )
where store_name is null
   or store_name = ''
   or store_code is null
   or store_code = '';

create unique index if not exists stores_store_code_unique_idx
  on public.stores (store_code)
  where store_code is not null;

alter table public.orders
  add column if not exists receipt_number text,
  add column if not exists receipt_sequence integer,
  add column if not exists receipt_date date,
  add column if not exists source_web_order_id uuid;

create unique index if not exists orders_receipt_number_unique_idx
  on public.orders (receipt_number)
  where receipt_number is not null;

create index if not exists orders_store_receipt_date_idx
  on public.orders (store_id, receipt_date);

alter table public.web_orders
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists order_source text default 'web',
  add column if not exists order_status text,
  add column if not exists fulfillment_type text,
  add column if not exists customer_contact text,
  add column if not exists notes text,
  add column if not exists accepted_at timestamp with time zone,
  add column if not exists preparing_at timestamp with time zone,
  add column if not exists ready_at timestamp with time zone,
  add column if not exists completed_at timestamp with time zone,
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists rejected_at timestamp with time zone,
  add column if not exists reject_reason text,
  add column if not exists receipt_number text,
  add column if not exists receipt_sequence integer,
  add column if not exists receipt_date date;

update public.web_orders
set
  store_id = case
    when store_id is null
     and branch_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then branch_id::uuid
    else store_id
  end,
  order_status = coalesce(nullif(order_status, ''), status::text),
  fulfillment_type = coalesce(nullif(fulfillment_type, ''), dining_option::text),
  order_source = coalesce(nullif(order_source, ''), 'web');

create unique index if not exists web_orders_receipt_number_unique_idx
  on public.web_orders (receipt_number)
  where receipt_number is not null;

create index if not exists web_orders_store_status_idx
  on public.web_orders (store_id, status, created_at desc);

create index if not exists web_orders_user_status_idx
  on public.web_orders (user_id, status, created_at desc);

create table if not exists public.receipt_counters (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  receipt_date date not null,
  last_sequence integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (store_id, receipt_date)
);

alter table public.receipt_counters enable row level security;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  order_id uuid references public.orders(id) on delete set null,
  web_order_id uuid references public.web_orders(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  target_user_id uuid,
  target_role text,
  read_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.notifications enable row level security;

create index if not exists notifications_store_unread_idx
  on public.notifications (store_id, read_at, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (target_user_id, read_at, created_at desc);

create or replace function public.generate_receipt_number(p_store_id uuid)
returns table(receipt_number text, receipt_sequence integer, receipt_date date)
language plpgsql
as $$
declare
  v_code text;
  v_sequence integer;
  v_receipt_date date := (now() at time zone 'Asia/Manila')::date;
begin
  select coalesce(nullif(store_code, ''), upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3)))
    into v_code
  from public.stores
  where id = p_store_id;

  if v_code is null or v_code = '' then
    raise exception 'Store not found for receipt number generation';
  end if;

  insert into public.receipt_counters (store_id, receipt_date, last_sequence)
  values (p_store_id, v_receipt_date, 1)
  on conflict (store_id, receipt_date)
  do update
    set last_sequence = public.receipt_counters.last_sequence + 1,
        updated_at = now()
  returning last_sequence into v_sequence;

  receipt_number := v_code || '-' || lpad(v_sequence::text, 4, '0');
  receipt_sequence := v_sequence;
  receipt_date := v_receipt_date;
  return next;
end;
$$;

grant select on public.stores to anon, authenticated;
grant select, insert, update on public.receipt_counters to authenticated;
grant execute on function public.generate_receipt_number(uuid) to authenticated;
grant select, insert, update on public.notifications to authenticated;

drop policy if exists "receipt_counters_staff_store_access" on public.receipt_counters;
create policy "receipt_counters_staff_store_access"
on public.receipt_counters
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = receipt_counters.store_id
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = receipt_counters.store_id
      )
  )
);

drop policy if exists "notifications_staff_store_read" on public.notifications;
create policy "notifications_staff_store_read"
on public.notifications
for select
to authenticated
using (
  target_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = notifications.store_id
      )
  )
);

drop policy if exists "notifications_staff_store_write" on public.notifications;
create policy "notifications_staff_store_write"
on public.notifications
for insert
to authenticated
with check (
  target_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = notifications.store_id
      )
  )
);

drop policy if exists "notifications_staff_store_update" on public.notifications;
create policy "notifications_staff_store_update"
on public.notifications
for update
to authenticated
using (
  target_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = notifications.store_id
      )
  )
)
with check (
  target_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = notifications.store_id
      )
  )
);

-- Replace broad web-order policies so POS sees only its own store while customers
-- keep tracking their own orders.
drop policy if exists "Allow POS terminal profiles full operational access" on public.web_orders;
drop policy if exists "Allow public web order inserts" on public.web_orders;
drop policy if exists "Allow web orders insert without auth restriction" on public.web_orders;
drop policy if exists "web_orders_customer_insert" on public.web_orders;
drop policy if exists "web_orders_store_staff_select" on public.web_orders;
drop policy if exists "web_orders_store_staff_update" on public.web_orders;

create policy "web_orders_customer_insert"
on public.web_orders
for insert
to authenticated
with check (
  auth.uid() = user_id
  and store_id is not null
  and branch_id = store_id::text
);

create policy "web_orders_store_staff_select"
on public.web_orders
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = web_orders.store_id
      )
  )
);

create policy "web_orders_store_staff_update"
on public.web_orders
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = web_orders.store_id
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id = web_orders.store_id
      )
  )
);

-- Replace the single broad orders policy. Existing customer-own SELECT and insert
-- policies are retained; this adds scoped staff access.
drop policy if exists "orders_authenticated_all" on public.orders;
drop policy if exists "orders_store_staff_select" on public.orders;
drop policy if exists "orders_store_staff_update" on public.orders;

create policy "orders_store_staff_select"
on public.orders
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id::text = orders.store_id
        or p.store_id::text = orders.branch_id
      )
  )
);

create policy "orders_store_staff_update"
on public.orders
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id::text = orders.store_id
        or p.store_id::text = orders.branch_id
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or p.store_id::text = orders.store_id
        or p.store_id::text = orders.branch_id
      )
  )
);
