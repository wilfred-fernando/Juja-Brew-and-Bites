create table if not exists public.payroll_loans (
  id text primary key,
  employee_id text not null references public.payroll_employees(id) on delete restrict,
  loan_date date not null default current_date,
  amount numeric(12, 2) not null default 0,
  reason text,
  status text not null default 'active' check (status in ('active', 'paid', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_loan_repayments (
  id text primary key,
  loan_id text not null references public.payroll_loans(id) on delete cascade,
  employee_id text not null references public.payroll_employees(id) on delete restrict,
  repayment_date date not null default current_date,
  amount numeric(12, 2) not null default 0,
  period_id text references public.payroll_periods(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payment_date text,
  method varchar default 'payroll deduction'
);

alter table public.payroll_entries
  add column if not exists loan_repayment_total numeric(12, 2) not null default 0;

create index if not exists payroll_loans_employee_idx on public.payroll_loans(employee_id);
create index if not exists payroll_loan_repayments_loan_idx on public.payroll_loan_repayments(loan_id);
create index if not exists payroll_loan_repayments_period_idx on public.payroll_loan_repayments(period_id);

alter table public.payroll_loans enable row level security;
drop policy if exists "payroll_loans_admin_all" on public.payroll_loans;
create policy "payroll_loans_admin_all"
  on public.payroll_loans
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'super_admin')));

alter table public.payroll_loan_repayments enable row level security;
drop policy if exists "payroll_loan_repayments_admin_all" on public.payroll_loan_repayments;
create policy "payroll_loan_repayments_admin_all"
  on public.payroll_loan_repayments
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'super_admin')));

grant select, insert, update, delete on public.payroll_loans to authenticated;
grant select, insert, update, delete on public.payroll_loan_repayments to authenticated;
