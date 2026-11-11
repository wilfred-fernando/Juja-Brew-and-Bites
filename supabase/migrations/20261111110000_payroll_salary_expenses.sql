begin;
alter table public.finance_expenses add column payroll_entry_id text references public.payroll_entries(id) on delete restrict;
alter table public.finance_expenses add column payroll_employee_id text references public.payroll_employees(id) on delete restrict;
create unique index finance_expenses_payroll_entry_unique on public.finance_expenses(payroll_entry_id) where payroll_entry_id is not null;
insert into public.finance_references(id,ref_type,name,is_active) select 'payroll-salary-category','item_category','Salary',true where not exists(select 1 from public.finance_references where ref_type='item_category' and lower(name)='salary');
insert into public.finance_references(id,ref_type,name,item_category,is_active) select 'payroll-salary-item','item','Payroll Salary','Salary',true where not exists(select 1 from public.finance_references where ref_type='item' and lower(name)='payroll salary');
do $$begin if exists(select 1 from public.finance_references where ref_type='item' and lower(name)='payroll salary' and item_category is distinct from 'Salary') then raise exception 'Payroll Salary item reference already exists with a different category; review it first'; end if; end $$;
create function public.payroll_salary_expense_sync() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare period public.payroll_periods; employee public.payroll_employees;
begin
 if TG_OP='DELETE' then return OLD; end if;
 if TG_OP='UPDATE' and exists(select 1 from public.finance_expenses where payroll_entry_id=OLD.id) then
  if NEW.status<>'paid' or NEW.id<>OLD.id or NEW.employee_id<>OLD.employee_id or NEW.period_id<>OLD.period_id or NEW.net_total<>OLD.net_total then
   raise exception 'Paid payroll has a linked Salary expense. Its employee, period, paid status and net amount cannot be changed.';
  end if;
  return NEW;
 end if;
 if NEW.status<>'paid' then return NEW; end if;
 if TG_OP='INSERT' then raise exception 'Approve payroll before marking it paid'; end if;
 if OLD.status='paid' then return NEW; end if;
 if OLD.status<>'approved' then raise exception 'Approve payroll before marking it paid'; end if;
 perform public.finance_cash_require_admin();
 if NEW.net_total<0 then raise exception 'Salary payment cannot be negative'; end if;
 select * into period from public.payroll_periods where id=NEW.period_id;
 select * into employee from public.payroll_employees where id=NEW.employee_id;
 if period.pay_date is null then raise exception 'Set the payroll payday before marking it paid'; end if;
 insert into public.finance_expenses(id,expense_date,description,supplier_name,item_common_name,quantity,unit,unit_price,subtotal,discount,total,category,tax_type,payment_type,or_si_no,or_si_date,remarks,submitted_by,entry_source,source_tag,payroll_entry_id,payroll_employee_id,created_by)
 values('payroll-salary-'||NEW.id,period.pay_date,'Payroll Salary',employee.full_name,'Salary',1,'payment',NEW.net_total,NEW.net_total,0,NEW.net_total,'OP-EX','Non-VAT',null,null,null,
 'Payroll entry '||NEW.id||'; paid payroll: '||period.label||'; employee: '||employee.full_name||'; net pay after deductions.',coalesce((select full_name from public.profiles where id=auth.uid()),'Payroll'),'overall','Payroll',NEW.id,NEW.employee_id,auth.uid());
 return NEW;
end $$;
create trigger payroll_salary_expense_sync after insert or update on public.payroll_entries for each row execute function public.payroll_salary_expense_sync();
create function public.finance_salary_expense_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if pg_trigger_depth()>1 then if TG_OP='DELETE' then return OLD; else return NEW; end if; end if;
 if TG_OP='DELETE' then
  if OLD.payroll_entry_id is not null then raise exception 'Salary expense is managed by its paid payroll record'; end if; return OLD;
 end if;
 if NEW.payroll_entry_id is not null or (TG_OP='UPDATE' and OLD.payroll_entry_id is not null) then raise exception 'Salary expense is managed by its paid payroll record'; end if;
 return NEW;
end $$;
create trigger finance_salary_expense_guard before insert or update or delete on public.finance_expenses for each row execute function public.finance_salary_expense_guard();
revoke all on function public.payroll_salary_expense_sync(),public.finance_salary_expense_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
