alter table public.payroll_employees
  add column if not exists designation text,
  add column if not exists date_hired date,
  add column if not exists birthday date,
  add column if not exists address text,
  add column if not exists contact_number text,
  add column if not exists sss_no text,
  add column if not exists philhealth_no text,
  add column if not exists hmdf_no text,
  add column if not exists emergency_contact_person text;

alter table public.payroll_entries
  add column if not exists misc_deduction_total numeric not null default 0,
  add column if not exists payroll_allowance numeric not null default 0,
  add column if not exists payroll_adjustment numeric not null default 0,
  add column if not exists sss_deduction numeric not null default 0,
  add column if not exists philhealth_deduction numeric not null default 0,
  add column if not exists hmdf_deduction numeric not null default 0;

create table if not exists public.payroll_misc_deductions (
  id text primary key,
  employee_id text not null references public.payroll_employees(id) on delete cascade,
  period_id text not null references public.payroll_periods(id) on delete cascade,
  deduction_date date not null,
  amount numeric not null default 0,
  description text,
  created_at timestamptz not null default now()
);

alter table public.payroll_misc_deductions enable row level security;

drop policy if exists "payroll misc deductions admin read" on public.payroll_misc_deductions;
create policy "payroll misc deductions admin read"
on public.payroll_misc_deductions
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "payroll misc deductions admin write" on public.payroll_misc_deductions;
create policy "payroll misc deductions admin write"
on public.payroll_misc_deductions
for all
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
