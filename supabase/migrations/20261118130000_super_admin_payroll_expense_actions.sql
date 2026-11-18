create or replace function public.finance_salary_expense_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if pg_trigger_depth() > 1 then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.payroll_entry_id is not null then
      raise exception 'Salary expense is managed by its paid payroll record';
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.payroll_entry_id is distinct from OLD.payroll_entry_id
       or NEW.payroll_employee_id is distinct from OLD.payroll_employee_id then
      raise exception 'Payroll links cannot be changed from Overall Expenses';
    end if;
  end if;

  if OLD.payroll_entry_id is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  ) then
    raise exception 'Super Admin access is required to change a payroll expense' using errcode = '42501';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
