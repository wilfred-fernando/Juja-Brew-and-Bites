begin;
create or replace function public.payroll_salary_expense_sync() returns trigger
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
 values('payroll-salary-'||NEW.id,period.pay_date,'Payroll Salary',employee.full_name,'Salary',1,'payment',NEW.net_total,NEW.net_total,0,NEW.net_total,'OP-EX','AR','CASH',null,null,
 'Payroll entry '||NEW.id||'; paid payroll: '||period.label||'; employee: '||employee.full_name||'; net pay after deductions.',coalesce((select full_name from public.profiles where id=auth.uid()),'Payroll'),'overall','Payroll',NEW.id,NEW.employee_id,auth.uid());
 return NEW;
end $$;

-- Only the Salary guard is suspended, under the transaction's table lock.
-- Audit, VAT calculation, and all unrelated triggers remain enabled.
alter table public.finance_expenses disable trigger finance_salary_expense_guard;
update public.finance_expenses set tax_type='AR',payment_type='CASH'
 where payroll_entry_id is not null and (tax_type is distinct from 'AR' or payment_type is distinct from 'CASH');
alter table public.finance_expenses enable trigger finance_salary_expense_guard;
notify pgrst,'reload schema';
commit;
