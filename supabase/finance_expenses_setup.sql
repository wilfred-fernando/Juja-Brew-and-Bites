-- Finance expense and petty cash tables adapted from Data Entry v1.4.xlsm
-- Source workbook: F:/OneDrive/JJFS/Juja Brew & Bites/Visayas Ave., Pasong Tamo/Finance/Data Entry v1.4.xlsm

create table if not exists public.finance_expenses (
  id text primary key,
  expense_date date not null default current_date,
  description text not null,
  supplier_name text,
  item_common_name text,
  quantity numeric(12, 2) not null default 1,
  unit text,
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  category text not null default 'OP-EX' check (category in ('OP-EX', 'PERSONAL')),
  payment_type text,
  cheque_no text,
  cheque_date date,
  cheque_amount numeric(12, 2),
  or_si_no text,
  or_si_date date,
  remarks text,
  submitted_by text,
  entry_source text not null default 'overall',
  source_tag text not null default 'Overall',
  store_id text,
  store_name text,
  petty_cash_entry_id text,
  date_submitted timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_petty_cash_entries (
  id text primary key,
  store_id text not null,
  expense_date date not null default current_date,
  description text not null,
  supplier_name text,
  item_common_name text,
  quantity numeric(12, 2) not null default 1,
  unit text,
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  category text not null default 'OP-EX' check (category in ('OP-EX', 'PERSONAL')),
  payment_type text,
  cheque_no text,
  cheque_date date,
  cheque_amount numeric(12, 2),
  or_si_no text,
  or_si_date date,
  remarks text,
  submitted_by text,
  date_submitted timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_petty_cash_funds (
  id text primary key,
  store_id text not null,
  fund_date date not null default current_date,
  source_of_fund text not null,
  particular text,
  amount numeric(12, 2) not null default 0,
  submitted_by text,
  date_submitted timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_references (
  id text primary key,
  ref_type text not null check (ref_type in ('item', 'item_category', 'supplier', 'payment_type', 'unit', 'category', 'fund_source')),
  name text not null,
  common_name text,
  item_category text,
  reference_quantity numeric(14, 3),
  reference_unit text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_delete_requests (
  id text primary key,
  table_name text not null check (table_name in ('finance_petty_cash_entries', 'finance_petty_cash_funds')),
  record_id text not null,
  record_snapshot jsonb,
  store_id text not null,
  store_name text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_expenses
  add column if not exists expense_date date default current_date,
  add column if not exists description text,
  add column if not exists supplier_name text,
  add column if not exists item_common_name text,
  add column if not exists quantity numeric(12, 2) default 1,
  add column if not exists unit text,
  add column if not exists unit_price numeric(12, 2) default 0,
  add column if not exists subtotal numeric(12, 2) default 0,
  add column if not exists discount numeric(12, 2) default 0,
  add column if not exists total numeric(12, 2) default 0,
  add column if not exists category text default 'OP-EX',
  add column if not exists payment_type text,
  add column if not exists cheque_no text,
  add column if not exists cheque_date date,
  add column if not exists cheque_amount numeric(12, 2),
  add column if not exists or_si_no text,
  add column if not exists or_si_date date,
  add column if not exists remarks text,
  add column if not exists submitted_by text,
  add column if not exists entry_source text default 'overall',
  add column if not exists source_tag text default 'Overall',
  add column if not exists store_id text,
  add column if not exists store_name text,
  add column if not exists petty_cash_entry_id text,
  add column if not exists date_submitted timestamptz default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.finance_petty_cash_entries
  add column if not exists store_id text,
  add column if not exists expense_date date default current_date,
  add column if not exists description text,
  add column if not exists supplier_name text,
  add column if not exists item_common_name text,
  add column if not exists quantity numeric(12, 2) default 1,
  add column if not exists unit text,
  add column if not exists unit_price numeric(12, 2) default 0,
  add column if not exists subtotal numeric(12, 2) default 0,
  add column if not exists discount numeric(12, 2) default 0,
  add column if not exists total numeric(12, 2) default 0,
  add column if not exists category text default 'OP-EX',
  add column if not exists payment_type text,
  add column if not exists cheque_no text,
  add column if not exists cheque_date date,
  add column if not exists cheque_amount numeric(12, 2),
  add column if not exists or_si_no text,
  add column if not exists or_si_date date,
  add column if not exists remarks text,
  add column if not exists submitted_by text,
  add column if not exists date_submitted timestamptz default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.finance_references
  add column if not exists ref_type text,
  add column if not exists name text,
  add column if not exists common_name text,
  add column if not exists item_category text,
  add column if not exists reference_quantity numeric(14, 3),
  add column if not exists reference_unit text,
  add column if not exists notes text,
  add column if not exists is_active boolean default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.finance_delete_requests
  add column if not exists table_name text,
  add column if not exists record_id text,
  add column if not exists record_snapshot jsonb,
  add column if not exists store_id text,
  add column if not exists store_name text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists requested_by_name text,
  add column if not exists status text default 'pending',
  add column if not exists requested_at timestamptz default now(),
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.finance_petty_cash_funds
  add column if not exists store_id text,
  add column if not exists fund_date date default current_date,
  add column if not exists source_of_fund text,
  add column if not exists particular text,
  add column if not exists amount numeric(12, 2) default 0,
  add column if not exists submitted_by text,
  add column if not exists date_submitted timestamptz default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists finance_expenses_expense_date_idx
  on public.finance_expenses(expense_date desc);

create index if not exists finance_expenses_petty_cash_entry_id_idx
  on public.finance_expenses(petty_cash_entry_id);

create index if not exists finance_petty_cash_entries_store_date_idx
  on public.finance_petty_cash_entries(store_id, expense_date desc);

create index if not exists finance_petty_cash_funds_store_date_idx
  on public.finance_petty_cash_funds(store_id, fund_date desc);

create index if not exists finance_delete_requests_store_status_idx
  on public.finance_delete_requests(store_id, status, requested_at desc);

drop index if exists finance_references_ref_type_name_key;
create index if not exists finance_references_ref_type_name_idx
  on public.finance_references(lower(ref_type), lower(name));

create or replace function public.set_finance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_finance_expenses_updated_at on public.finance_expenses;
create trigger set_finance_expenses_updated_at
before update on public.finance_expenses
for each row
execute function public.set_finance_updated_at();

drop trigger if exists set_finance_petty_cash_entries_updated_at on public.finance_petty_cash_entries;
create trigger set_finance_petty_cash_entries_updated_at
before update on public.finance_petty_cash_entries
for each row
execute function public.set_finance_updated_at();

drop trigger if exists set_finance_petty_cash_funds_updated_at on public.finance_petty_cash_funds;
create trigger set_finance_petty_cash_funds_updated_at
before update on public.finance_petty_cash_funds
for each row
execute function public.set_finance_updated_at();

drop trigger if exists set_finance_references_updated_at on public.finance_references;
create trigger set_finance_references_updated_at
before update on public.finance_references
for each row
execute function public.set_finance_updated_at();

drop trigger if exists set_finance_delete_requests_updated_at on public.finance_delete_requests;
create trigger set_finance_delete_requests_updated_at
before update on public.finance_delete_requests
for each row
execute function public.set_finance_updated_at();

alter table public.finance_expenses enable row level security;
alter table public.finance_petty_cash_entries enable row level security;
alter table public.finance_petty_cash_funds enable row level security;
alter table public.finance_references enable row level security;
alter table public.finance_delete_requests enable row level security;

drop policy if exists "finance_expenses_admin_all" on public.finance_expenses;
create policy "finance_expenses_admin_all"
  on public.finance_expenses
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "finance_petty_cash_entries_admin_all" on public.finance_petty_cash_entries;
create policy "finance_petty_cash_entries_admin_all"
  on public.finance_petty_cash_entries
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "finance_petty_cash_funds_admin_all" on public.finance_petty_cash_funds;
create policy "finance_petty_cash_funds_admin_all"
  on public.finance_petty_cash_funds
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "finance_references_admin_all" on public.finance_references;
create policy "finance_references_admin_all"
  on public.finance_references
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "finance_delete_requests_admin_all" on public.finance_delete_requests;
create policy "finance_delete_requests_admin_all"
  on public.finance_delete_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "finance_expenses_cashier_branch_select" on public.finance_expenses;
create policy "finance_expenses_cashier_branch_select"
  on public.finance_expenses
  for select
  to authenticated
  using (
    entry_source = 'petty_cash'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_expenses.store_id::text
    )
  );

drop policy if exists "finance_expenses_cashier_branch_insert" on public.finance_expenses;
create policy "finance_expenses_cashier_branch_insert"
  on public.finance_expenses
  for insert
  to authenticated
  with check (
    entry_source = 'petty_cash'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_expenses.store_id::text
    )
  );

drop policy if exists "finance_expenses_cashier_branch_update" on public.finance_expenses;
create policy "finance_expenses_cashier_branch_update"
  on public.finance_expenses
  for update
  to authenticated
  using (
    entry_source = 'petty_cash'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_expenses.store_id::text
    )
  )
  with check (
    entry_source = 'petty_cash'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_expenses.store_id::text
    )
  );

drop policy if exists "finance_expenses_cashier_branch_delete_24h" on public.finance_expenses;
create policy "finance_expenses_cashier_branch_delete_24h"
  on public.finance_expenses
  for delete
  to authenticated
  using (
    entry_source = 'petty_cash'
    and created_at >= now() - interval '24 hours'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_expenses.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_entries_cashier_branch_select" on public.finance_petty_cash_entries;
create policy "finance_petty_cash_entries_cashier_branch_select"
  on public.finance_petty_cash_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_entries.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_entries_cashier_branch_insert" on public.finance_petty_cash_entries;
create policy "finance_petty_cash_entries_cashier_branch_insert"
  on public.finance_petty_cash_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_entries.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_entries_cashier_branch_update" on public.finance_petty_cash_entries;
create policy "finance_petty_cash_entries_cashier_branch_update"
  on public.finance_petty_cash_entries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_entries.store_id::text
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_entries.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_entries_cashier_branch_delete_24h" on public.finance_petty_cash_entries;
create policy "finance_petty_cash_entries_cashier_branch_delete_24h"
  on public.finance_petty_cash_entries
  for delete
  to authenticated
  using (
    created_at >= now() - interval '24 hours'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_entries.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_funds_cashier_branch_select" on public.finance_petty_cash_funds;
create policy "finance_petty_cash_funds_cashier_branch_select"
  on public.finance_petty_cash_funds
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_funds.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_funds_cashier_branch_insert" on public.finance_petty_cash_funds;
create policy "finance_petty_cash_funds_cashier_branch_insert"
  on public.finance_petty_cash_funds
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_funds.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_funds_cashier_branch_update" on public.finance_petty_cash_funds;
create policy "finance_petty_cash_funds_cashier_branch_update"
  on public.finance_petty_cash_funds
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_funds.store_id::text
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_funds.store_id::text
    )
  );

drop policy if exists "finance_petty_cash_funds_cashier_branch_delete_24h" on public.finance_petty_cash_funds;
create policy "finance_petty_cash_funds_cashier_branch_delete_24h"
  on public.finance_petty_cash_funds
  for delete
  to authenticated
  using (
    created_at >= now() - interval '24 hours'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_petty_cash_funds.store_id::text
    )
  );

drop policy if exists "finance_references_cashier_select" on public.finance_references;
create policy "finance_references_cashier_select"
  on public.finance_references
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
    )
  );

drop policy if exists "finance_delete_requests_cashier_branch_select" on public.finance_delete_requests;
create policy "finance_delete_requests_cashier_branch_select"
  on public.finance_delete_requests
  for select
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_delete_requests.store_id::text
    )
  );

drop policy if exists "finance_delete_requests_cashier_branch_insert" on public.finance_delete_requests;
create policy "finance_delete_requests_cashier_branch_insert"
  on public.finance_delete_requests
  for insert
  to authenticated
  with check (
    status = 'pending'
    and requested_by = auth.uid()
    and table_name in ('finance_petty_cash_entries', 'finance_petty_cash_funds')
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
        and p.store_id::text = finance_delete_requests.store_id::text
    )
  );

insert into public.finance_references (id, ref_type, name, common_name, notes)
values
  ('fin_ref_item_dv_caramel_sauce', 'item', 'DV Caramel Sauce', 'Caramel Sauce', 'Seed example'),
  ('fin_ref_item_torani_caramel_sauce', 'item', 'Torani Caramel Sauce', 'Caramel Sauce', 'Seed example'),
  ('fin_ref_supplier_meralco', 'supplier', 'MERALCO', null, 'Seed example'),
  ('fin_ref_supplier_lalamove', 'supplier', 'LALAMOVE', null, 'Seed example'),
  ('fin_ref_supplier_puregold', 'supplier', 'PUREGOLD Price Club Inc.', null, 'Seed example'),
  ('fin_ref_category_opex', 'category', 'OP-EX', null, 'Default category'),
  ('fin_ref_category_personal', 'category', 'PERSONAL', null, 'Default category'),
  ('fin_ref_payment_cash', 'payment_type', 'CASH', null, 'Default payment type'),
  ('fin_ref_payment_cheque', 'payment_type', 'CHEQUE', null, 'Default payment type'),
  ('fin_ref_payment_gcash_9393', 'payment_type', 'GCASH -9393', null, 'Default payment type'),
  ('fin_ref_payment_gcash_0668', 'payment_type', 'GCASH -0668', null, 'Default payment type'),
  ('fin_ref_payment_gcash_8199', 'payment_type', 'GCASH -8199', null, 'Default payment type'),
  ('fin_ref_payment_card', 'payment_type', 'CARD', null, 'Default payment type'),
  ('fin_ref_payment_bank_transfer', 'payment_type', 'BANK TRANSFER', null, 'Default payment type'),
  ('fin_ref_unit_pc', 'unit', 'pc', null, 'Default unit'),
  ('fin_ref_unit_pack', 'unit', 'pack', null, 'Default unit'),
  ('fin_ref_unit_box', 'unit', 'box', null, 'Default unit'),
  ('fin_ref_unit_kilo', 'unit', 'kilo', null, 'Default unit'),
  ('fin_ref_unit_sack', 'unit', 'sack', null, 'Default unit'),
  ('fin_ref_unit_cup', 'unit', 'cup', null, 'Default unit'),
  ('fin_ref_unit_tin', 'unit', 'tin', null, 'Default unit'),
  ('fin_ref_unit_lot', 'unit', 'lot', null, 'Default unit'),
  ('fin_ref_unit_month', 'unit', 'month', null, 'Default unit'),
  ('fin_ref_unit_whole', 'unit', 'whole', null, 'Default unit'),
  ('fin_ref_fund_cash_sales', 'fund_source', 'CASH SALES', null, 'Default source of fund'),
  ('fin_ref_fund_gcash_9393', 'fund_source', 'GCASH -9393', null, 'Default source of fund'),
  ('fin_ref_fund_gcash_0668', 'fund_source', 'GCASH -0668', null, 'Default source of fund'),
  ('fin_ref_fund_gcash_8199', 'fund_source', 'GCASH -8199', null, 'Default source of fund'),
  ('fin_ref_fund_cbs_mrfs', 'fund_source', 'CBS MRFS', null, 'Default source of fund')
on conflict (id) do update
set
  ref_type = excluded.ref_type,
  name = excluded.name,
  common_name = excluded.common_name,
  notes = excluded.notes,
  updated_at = now();

insert into public.finance_expenses (
  id,
  expense_date,
  description,
  supplier_name,
  item_common_name,
  quantity,
  unit,
  unit_price,
  subtotal,
  discount,
  total,
  category,
  payment_type,
  cheque_no,
  cheque_date,
  cheque_amount,
  or_si_no,
  or_si_date,
  remarks,
  submitted_by,
  entry_source,
  source_tag,
  store_id,
  store_name,
  petty_cash_entry_id,
  date_submitted,
  created_by,
  created_at,
  updated_at
)
select
  'exp_from_' || p.id,
  p.expense_date,
  p.description,
  p.supplier_name,
  p.item_common_name,
  p.quantity,
  p.unit,
  p.unit_price,
  p.subtotal,
  p.discount,
  p.total,
  p.category,
  p.payment_type,
  p.cheque_no,
  p.cheque_date,
  p.cheque_amount,
  p.or_si_no,
  p.or_si_date,
  p.remarks,
  p.submitted_by,
  'petty_cash',
  'Petty Cash',
  p.store_id,
  coalesce(s.name, p.store_id),
  p.id,
  p.date_submitted,
  p.created_by,
  p.created_at,
  p.updated_at
from public.finance_petty_cash_entries p
left join public.stores s on s.id::text = p.store_id
where not exists (
  select 1
  from public.finance_expenses e
  where e.petty_cash_entry_id = p.id
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.finance_expenses to authenticated;
grant select, insert, update, delete on public.finance_petty_cash_entries to authenticated;
grant select, insert, update, delete on public.finance_petty_cash_funds to authenticated;
grant select, insert, update, delete on public.finance_references to authenticated;
grant select, insert, update, delete on public.finance_delete_requests to authenticated;
