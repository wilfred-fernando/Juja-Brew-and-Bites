alter table public.payroll_entries
  add column if not exists thirteenth_month_pay numeric(12, 2) not null default 0;
