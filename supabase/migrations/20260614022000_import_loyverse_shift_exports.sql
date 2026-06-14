begin;

create extension if not exists pgcrypto;

create table if not exists public.imported_loyverse_shifts (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  store_name text,
  pos text,
  shift_number text,
  shift_opening_time timestamptz,
  shift_opened text,
  shift_closing_time timestamptz,
  shift_closed text,
  starting_cash numeric(14, 2) not null default 0,
  cash_payments numeric(14, 2) not null default 0,
  cash_refunds numeric(14, 2) not null default 0,
  paid_in numeric(14, 2) not null default 0,
  paid_out numeric(14, 2) not null default 0,
  expected_cash_amount numeric(14, 2) not null default 0,
  actual_cash_amount numeric(14, 2) not null default 0,
  difference numeric(14, 2) not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  "Store" text,
  "POS" text,
  "Shift number" text,
  "Shift opening time" text,
  "Shift opened" text,
  "Shift closing time" text,
  "Shift closed" text,
  "Starting cash" text,
  "Cash payments" text,
  "Cash refunds" text,
  "Paid in" text,
  "Paid out" text,
  "Expected cash amount" text,
  "Actual cash amount" text,
  "Difference" text
);

create table if not exists public.imported_loyverse_payins_payouts (
  id uuid primary key default gen_random_uuid(),
  import_batch_id text not null,
  source_file text not null,
  source_row_number integer not null,
  row_hash text not null unique,
  imported_at timestamptz not null default now(),
  entry_date timestamptz,
  store_name text,
  pos text,
  shift_number text,
  entry_type text,
  employee text,
  comment text,
  amount numeric(14, 2) not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  "Date" text,
  "Store" text,
  "POS" text,
  "Shift number" text,
  "Type" text,
  "Employee" text,
  "Comment" text,
  "Amount" text
);

create index if not exists idx_imported_loyverse_shifts_opening on public.imported_loyverse_shifts (shift_opening_time);
create index if not exists idx_imported_loyverse_shifts_closing on public.imported_loyverse_shifts (shift_closing_time);
create index if not exists idx_imported_loyverse_shifts_store on public.imported_loyverse_shifts (store_name);
create index if not exists idx_imported_loyverse_shifts_number on public.imported_loyverse_shifts (shift_number);
create index if not exists idx_imported_loyverse_payins_payouts_date on public.imported_loyverse_payins_payouts (entry_date);
create index if not exists idx_imported_loyverse_payins_payouts_shift on public.imported_loyverse_payins_payouts (shift_number);

alter table public.imported_loyverse_shifts enable row level security;
alter table public.imported_loyverse_payins_payouts enable row level security;

drop policy if exists "imported_loyverse_shifts_staff_select" on public.imported_loyverse_shifts;
create policy "imported_loyverse_shifts_staff_select"
on public.imported_loyverse_shifts
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_loyverse_shifts_admin_write" on public.imported_loyverse_shifts;
create policy "imported_loyverse_shifts_admin_write"
on public.imported_loyverse_shifts
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

drop policy if exists "imported_loyverse_payins_payouts_staff_select" on public.imported_loyverse_payins_payouts;
create policy "imported_loyverse_payins_payouts_staff_select"
on public.imported_loyverse_payins_payouts
for select
to authenticated
using (public.inventory_is_staff());

drop policy if exists "imported_loyverse_payins_payouts_admin_write" on public.imported_loyverse_payins_payouts;
create policy "imported_loyverse_payins_payouts_admin_write"
on public.imported_loyverse_payins_payouts
for all
to authenticated
using (public.inventory_is_admin())
with check (public.inventory_is_admin());

grant select, insert, update, delete on public.imported_loyverse_shifts to authenticated;
grant select, insert, update, delete on public.imported_loyverse_payins_payouts to authenticated;

notify pgrst, 'reload schema';

commit;
