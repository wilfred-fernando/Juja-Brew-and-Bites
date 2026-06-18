alter table if exists public.payroll_employees
  add column if not exists starting_daily_rate numeric(12,2),
  add column if not exists current_daily_rate numeric(12,2),
  add column if not exists employment_status text not null default 'active',
  add column if not exists date_resigned_terminated date,
  add column if not exists date_reemployment date;

update public.payroll_employees
set
  starting_daily_rate = coalesce(starting_daily_rate, default_daily_rate, 0),
  current_daily_rate = coalesce(current_daily_rate, default_daily_rate, 0),
  employment_status = case
    when employment_status in ('active', 'resigned', 'terminated') then employment_status
    when active = false then 'resigned'
    else 'active'
  end
where starting_daily_rate is null
   or current_daily_rate is null
   or employment_status not in ('active', 'resigned', 'terminated');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_employees_employment_status_check'
      and conrelid = 'public.payroll_employees'::regclass
  ) then
    alter table public.payroll_employees
      add constraint payroll_employees_employment_status_check
      check (employment_status in ('active', 'resigned', 'terminated'));
  end if;
end $$;
