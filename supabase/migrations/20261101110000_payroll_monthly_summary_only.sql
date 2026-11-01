begin;
drop trigger if exists payroll_monthly_overlap on public.payroll_entries;
drop function if exists public.payroll_guard_monthly_overlap();
drop function if exists public.payroll_generate_monthly(text,jsonb);
notify pgrst,'reload schema';
commit;
