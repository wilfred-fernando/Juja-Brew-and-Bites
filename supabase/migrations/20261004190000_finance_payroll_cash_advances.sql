begin;
alter table public.payroll_cash_advances add column finance_source_table text,add column finance_source_id text;
create unique index payroll_advance_finance_source on public.payroll_cash_advances(finance_source_table,finance_source_id) where finance_source_table is not null;
alter table public.finance_expenses add column is_cash_advance boolean not null default false,add column employee_id text references public.payroll_employees(id),add column cash_advance_id text references public.payroll_cash_advances(id);
alter table public.finance_petty_cash_entries add column is_cash_advance boolean not null default false,add column employee_id text references public.payroll_employees(id),add column cash_advance_id text references public.payroll_cash_advances(id);

create function public.finance_payroll_advance_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if pg_trigger_depth()>1 then
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if TG_OP='DELETE' and OLD.finance_source_table is not null then raise exception 'Correct or cancel this cash advance through its Finance expense; repayment history is retained'; end if;
 if TG_OP='INSERT' and NEW.finance_source_table is not null then raise exception 'Finance advance links are managed through the expense record'; end if;
 if TG_OP='UPDATE' and (OLD.finance_source_table is not null or NEW.finance_source_table is not null) and
  (NEW.employee_id is distinct from OLD.employee_id or NEW.amount is distinct from OLD.amount or NEW.advance_date is distinct from OLD.advance_date
   or NEW.reason is distinct from OLD.reason or NEW.finance_source_table is distinct from OLD.finance_source_table or NEW.finance_source_id is distinct from OLD.finance_source_id
   or NEW.status='void') then raise exception 'Edit this linked cash advance through its Finance expense'; end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
create trigger finance_payroll_advance_guard before insert or update or delete on public.payroll_cash_advances for each row execute function public.finance_payroll_advance_guard();

create function public.finance_expense_advance_sync() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare canonical public.finance_petty_cash_entries; adv public.payroll_cash_advances; paid numeric; existing_id text;
begin
 -- The Overall copy uses the petty entry as the canonical source.
 if TG_TABLE_NAME='finance_expenses' and (case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end)->>'petty_cash_entry_id' is not null then
  if TG_OP='DELETE' then
   if OLD.cash_advance_id is not null and exists(select 1 from public.payroll_cash_advance_repayments where cash_advance_id=OLD.cash_advance_id) then raise exception 'Cannot delete a cash advance expense with repayment history'; end if;
   return OLD;
  end if;
  select * into canonical from public.finance_petty_cash_entries where id=NEW.petty_cash_entry_id;
  if not found then raise exception 'Petty cash source entry is missing'; end if;
  if NEW.is_cash_advance is distinct from canonical.is_cash_advance or (NEW.is_cash_advance and
   (NEW.employee_id is distinct from canonical.employee_id or NEW.total is distinct from canonical.total or NEW.expense_date is distinct from canonical.expense_date)) then
   raise exception 'Save linked petty cash changes through the Finance expense form';
  end if;
  NEW.cash_advance_id:=canonical.cash_advance_id; NEW.employee_id:=canonical.employee_id;
  return NEW;
 end if;
 if TG_OP='UPDATE' and NEW.is_cash_advance=OLD.is_cash_advance and NEW.employee_id is not distinct from OLD.employee_id
  and NEW.cash_advance_id is not distinct from OLD.cash_advance_id and NEW.total is not distinct from OLD.total
  and NEW.expense_date is not distinct from OLD.expense_date and NEW.description is not distinct from OLD.description
  and NEW.remarks is not distinct from OLD.remarks then return NEW; end if;
 if TG_OP='DELETE' then
  if OLD.cash_advance_id is null then return OLD; end if;
  perform public.finance_cash_require_admin();
  select * into adv from public.payroll_cash_advances where id=OLD.cash_advance_id for update;
  if exists(select 1 from public.payroll_cash_advance_repayments where cash_advance_id=adv.id) then raise exception 'Cannot delete a cash advance expense with repayment history'; end if;
  update public.payroll_cash_advances set status='void' where id=adv.id;
  return OLD;
 end if;
 if not NEW.is_cash_advance then
  if TG_OP='UPDATE' and OLD.cash_advance_id is not null then
   perform public.finance_cash_require_admin();
   select * into adv from public.payroll_cash_advances where id=OLD.cash_advance_id for update;
   if exists(select 1 from public.payroll_cash_advance_repayments where cash_advance_id=adv.id) then raise exception 'Cannot remove an advance link with repayment history'; end if;
   update public.payroll_cash_advances set status='void' where id=adv.id;
  end if;
  NEW.employee_id:=null; NEW.cash_advance_id:=null;
  return NEW;
 end if;
 perform public.finance_cash_require_admin();
 if NEW.employee_id is null or NEW.total<=0 then raise exception 'Choose an employee and a positive cash advance amount'; end if;
 if NEW.inventory_item_id is not null then raise exception 'Cash advances cannot be inventory purchases'; end if;
 select id into existing_id from public.payroll_cash_advances where finance_source_table=TG_TABLE_NAME and finance_source_id=NEW.id;
 if existing_id is not null then
  if NEW.cash_advance_id is not null and NEW.cash_advance_id<>existing_id then raise exception 'This expense already has a payroll advance'; end if;
  NEW.cash_advance_id:=existing_id;
 end if;
 if NEW.cash_advance_id is not null then
  select * into adv from public.payroll_cash_advances where id=NEW.cash_advance_id for update;
  if not found then raise exception 'Payroll advance not found'; end if;
  if adv.finance_source_table is not null and (adv.finance_source_table<>TG_TABLE_NAME or adv.finance_source_id<>NEW.id) then raise exception 'This payroll advance is already linked to another expense'; end if;
  select coalesce(sum(amount),0) into paid from public.payroll_cash_advance_repayments where cash_advance_id=adv.id;
  if adv.finance_source_table is null then
   if adv.status='void' or adv.employee_id<>NEW.employee_id or adv.amount<>NEW.total or adv.advance_date<>NEW.expense_date then raise exception 'Existing advance employee, date and amount must match this expense'; end if;
  elsif exists(select 1 from public.payroll_cash_advance_repayments where cash_advance_id=adv.id) and
   (adv.employee_id<>NEW.employee_id or adv.amount<>NEW.total or adv.advance_date<>NEW.expense_date) then raise exception 'Employee, date and amount are locked after repayment; retain the repayment history'; end if;
  update public.payroll_cash_advances set finance_source_table=TG_TABLE_NAME,finance_source_id=NEW.id,
   employee_id=NEW.employee_id,advance_date=NEW.expense_date,amount=NEW.total,
   reason=NEW.description||case when nullif(NEW.remarks,'') is not null then ' — '||NEW.remarks else '' end,
   status=case when paid>=NEW.total then 'paid' else 'active' end where id=adv.id;
 else
  NEW.cash_advance_id:='ca-finance-'||TG_TABLE_NAME||'-'||NEW.id;
  insert into public.payroll_cash_advances(id,employee_id,advance_date,amount,reason,status,finance_source_table,finance_source_id)
  values(NEW.cash_advance_id,NEW.employee_id,NEW.expense_date,NEW.total,
   NEW.description||case when nullif(NEW.remarks,'') is not null then ' — '||NEW.remarks else '' end,'active',TG_TABLE_NAME,NEW.id);
 end if;
 return NEW;
end $$;
create trigger finance_expense_advance_sync before insert or update or delete on public.finance_expenses for each row execute function public.finance_expense_advance_sync();
create trigger finance_expense_advance_sync before insert or update or delete on public.finance_petty_cash_entries for each row execute function public.finance_expense_advance_sync();

create function public.finance_linked_advance_repayment_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare adv public.payroll_cash_advances; paid numeric;
begin
 select * into adv from public.payroll_cash_advances where id=NEW.cash_advance_id for update;
 if adv.finance_source_table is null then return NEW; end if;
 if adv.status='void' or NEW.employee_id<>adv.employee_id or NEW.amount<=0 or NEW.payment_date::date<adv.advance_date then raise exception 'Repayment requires the linked employee, a positive amount and a date on or after release'; end if;
 select coalesce(sum(amount),0) into paid from public.payroll_cash_advance_repayments where cash_advance_id=adv.id and id<>NEW.id;
 if paid+NEW.amount>adv.amount then raise exception 'Repayment exceeds the outstanding cash advance'; end if;
 return NEW;
end $$;
create function public.finance_linked_advance_repayment_status() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.payroll_cash_advances a set status=case when (select coalesce(sum(amount),0) from public.payroll_cash_advance_repayments where cash_advance_id=a.id)>=a.amount then 'paid' else 'active' end
 where a.finance_source_table is not null and a.status<>'void' and a.id in (case when TG_OP<>'INSERT' then OLD.cash_advance_id end,case when TG_OP<>'DELETE' then NEW.cash_advance_id end);
 return null;
end $$;
create trigger finance_linked_advance_repayment_guard before insert or update on public.payroll_cash_advance_repayments for each row execute function public.finance_linked_advance_repayment_guard();
create trigger finance_linked_advance_repayment_status after insert or update or delete on public.payroll_cash_advance_repayments for each row execute function public.finance_linked_advance_repayment_status();

-- Invoker helpers retain the caller's existing Finance row-level permissions.
create function public.finance_write_expense(p_table text,p_row jsonb,p_update boolean default false) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare columns text; compare_columns text; result jsonb; matched boolean;
begin
 if p_table not in ('finance_expenses','finance_petty_cash_entries') then raise exception 'Invalid expense table'; end if;
 select string_agg(format('%I',key),',' order by key) into columns from jsonb_object_keys(p_row) key
 where key<>'id' and exists(select 1 from pg_attribute where attrelid=('public.'||p_table)::regclass and attname=key and attnum>0 and not attisdropped and attgenerated='');
 if p_update then
  execute format('update public.%1$I t set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1)) where id=$2 returning to_jsonb(t)',p_table,columns) into result using p_row,p_row->>'id';
 else
  execute format('select to_jsonb(t) from public.%I t where id=$1',p_table) into result using p_row->>'id';
  if result is not null then
   select string_agg(format('%I',key),',' order by key) into compare_columns from jsonb_object_keys(p_row) key
   where key not in ('id','cash_advance_id') and exists(select 1 from pg_attribute where attrelid=('public.'||p_table)::regclass and attname=key and attnum>0 and not attisdropped and attgenerated='');
   execute format('select row(%2$s) is not distinct from (select row(%2$s) from jsonb_populate_record(null::public.%1$I,$1)) from public.%1$I where id=$2',p_table,compare_columns) into matched using p_row,p_row->>'id';
   if not matched then raise exception 'This expense ID was already saved with different details; refresh before retrying'; end if;
   return result;
  end if;
  execute format('insert into public.%1$I as t (id,%2$s) select id,%2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(t)',p_table,columns) into result using p_row;
 end if;
 if result is null then raise exception 'Expense not found or access denied'; end if;
 return result;
end $$;
create function public.finance_save_expense_receipt(p_scope text,p_rows jsonb,p_overall jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare row_data jsonb; actual jsonb; mirror jsonb; petty jsonb:='[]'; overall jsonb:='[]'; idx int:=0;
begin
 if p_scope not in ('petty','overall') or jsonb_array_length(p_rows)=0 then raise exception 'Invalid expense receipt'; end if;
 if p_scope='petty' and jsonb_array_length(p_overall)<>jsonb_array_length(p_rows) then raise exception 'Petty cash and Overall item counts must match'; end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
  if p_scope='petty' then
   actual:=public.finance_write_expense('finance_petty_cash_entries',row_data);
   petty:=petty||jsonb_build_array(actual);
   mirror:=(p_overall->idx)||jsonb_build_object('petty_cash_entry_id',actual->>'id','store_id',actual->>'store_id','entry_source','petty_cash','source_tag','Petty Cash',
    'is_cash_advance',actual->'is_cash_advance','employee_id',actual->'employee_id','cash_advance_id',actual->'cash_advance_id');
   overall:=overall||jsonb_build_array(public.finance_write_expense('finance_expenses',mirror));
  else overall:=overall||jsonb_build_array(public.finance_write_expense('finance_expenses',row_data)); end if;
  idx:=idx+1;
 end loop;
 return jsonb_build_object('petty',petty,'overall',overall);
end $$;
create function public.finance_update_expense(p_scope text,p_id text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare original public.finance_expenses; actual jsonb; mirror jsonb;
begin
 if p_scope='overall' then
  select * into original from public.finance_expenses where id=p_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if original.petty_cash_entry_id is not null then
   actual:=public.finance_write_expense('finance_petty_cash_entries',(p_data-'entry_source'-'source_tag'-'store_name'-'petty_cash_entry_id')||jsonb_build_object('id',original.petty_cash_entry_id,'store_id',original.store_id),true);
   mirror:=public.finance_write_expense('finance_expenses',p_data||jsonb_build_object('id',p_id,'store_id',original.store_id,'petty_cash_entry_id',original.petty_cash_entry_id,'entry_source','petty_cash','source_tag','Petty Cash','cash_advance_id',actual->'cash_advance_id'),true);
   return mirror;
  end if;
  return public.finance_write_expense('finance_expenses',p_data||jsonb_build_object('id',p_id),true);
 elsif p_scope='petty' then
  actual:=public.finance_write_expense('finance_petty_cash_entries',p_data||jsonb_build_object('id',p_id),true);
  for original in select * from public.finance_expenses where petty_cash_entry_id=p_id loop
   perform public.finance_write_expense('finance_expenses',p_data||jsonb_build_object('id',original.id,'petty_cash_entry_id',p_id,'entry_source','petty_cash','source_tag','Petty Cash','cash_advance_id',actual->'cash_advance_id'),true);
  end loop;
  return actual;
 end if;
 raise exception 'Invalid expense scope';
end $$;
create function public.finance_cash_advance_options() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.finance_cash_require_admin();
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'active',active) order by full_name),'[]') from public.payroll_employees),
 'advances',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'employee_id',employee_id,'advance_date',advance_date,'amount',amount,'status',status,'finance_source_table',finance_source_table,'finance_source_id',finance_source_id) order by advance_date desc),'[]') from public.payroll_cash_advances));
end $$;
revoke all on function public.finance_payroll_advance_guard(),public.finance_expense_advance_sync(),public.finance_linked_advance_repayment_guard(),public.finance_linked_advance_repayment_status() from public,anon,authenticated;
revoke all on function public.finance_write_expense(text,jsonb,boolean),public.finance_save_expense_receipt(text,jsonb,jsonb),public.finance_update_expense(text,text,jsonb),public.finance_cash_advance_options() from public,anon;
grant execute on function public.finance_write_expense(text,jsonb,boolean),public.finance_save_expense_receipt(text,jsonb,jsonb),public.finance_update_expense(text,text,jsonb),public.finance_cash_advance_options() to authenticated;
notify pgrst,'reload schema';
commit;
