alter table if exists public.payroll_employees
  add column if not exists designation text;
