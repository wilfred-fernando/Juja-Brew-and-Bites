begin;
create table public.finance_entry_edit_logs (
 id bigint generated always as identity primary key,
 source_table text not null, record_id text not null,
 action text not null check(action in ('INSERT','UPDATE','DELETE')),
 actor_id uuid, actor_name text not null,
 store_id text,store_name text,record_label text not null,
 changed_fields text[] not null,
 before_data jsonb,after_data jsonb,
 linked_update boolean not null,transaction_id text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index finance_entry_edit_log_date on public.finance_entry_edit_logs(recorded_at desc,id desc);
create index finance_entry_edit_log_record on public.finance_entry_edit_logs(source_table,record_id,id desc);
create index finance_entry_edit_log_actor on public.finance_entry_edit_logs(actor_id,recorded_at desc);
alter table public.finance_entry_edit_logs enable row level security;
revoke all on public.finance_entry_edit_logs from public,anon,authenticated,service_role;
grant select on public.finance_entry_edit_logs to authenticated;
create policy finance_entry_edit_log_admin_read on public.finance_entry_edit_logs for select to authenticated
 using(exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')));

create function public.finance_capture_entry_edit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare before_row jsonb;after_row jsonb; snapshot jsonb; fields text[]; actor uuid:=auth.uid(); actor_label text; branch text;branch_label text; label text; employee_name text;
begin
 before_row:=case when TG_OP<>'INSERT' then to_jsonb(OLD) end;
 after_row:=case when TG_OP<>'DELETE' then to_jsonb(NEW) end;
 select coalesce(array_agg(key order by key),'{}') into fields from (
  select jsonb_object_keys(coalesce(before_row,'{}')||coalesce(after_row,'{}')) key
 ) keys where key not in ('updated_at','created_at','date_submitted')
  and (before_row->key is distinct from after_row->key);
 if TG_OP='UPDATE' and cardinality(fields)=0 then return null; end if;
 snapshot:=coalesce(after_row,before_row);
 select coalesce(nullif(trim(full_name),''),nullif(trim(email),''),id::text) into actor_label from public.profiles where id=actor;
 actor_label:=coalesce(actor_label,case when actor is null then 'System / service job' else actor::text end);
 branch:=coalesce(snapshot->>'store_id',snapshot->>'from_store_id');
 select name into branch_label from public.stores where id::text=branch;
 if snapshot->>'employee_id' is not null then select full_name into employee_name from public.payroll_employees where id=snapshot->>'employee_id'; end if;
 label:=coalesce(nullif(snapshot->>'description',''),nullif(snapshot->>'particular',''),nullif(snapshot->>'reference',''),nullif(snapshot->>'payee',''),
  nullif(snapshot->>'name',''),nullif(snapshot->>'full_name',''),employee_name,nullif(snapshot->>'label',''),snapshot->>'id','Record');
 if employee_name is not null and label<>employee_name then label:=label||' — '||employee_name; end if;
 insert into public.finance_entry_edit_logs(source_table,record_id,action,actor_id,actor_name,store_id,store_name,record_label,changed_fields,before_data,after_data,linked_update,transaction_id)
 values(TG_TABLE_NAME,coalesce(snapshot->>'id',snapshot->>'transaction_id'),TG_OP,actor,actor_label,branch,branch_label,label,fields,before_row,after_row,pg_trigger_depth()>1,txid_current()::text);
 return null;
end $$;
create function public.finance_entry_log_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Finance audit records cannot be edited or deleted'; end $$;
create trigger finance_entry_log_immutable before update or delete on public.finance_entry_edit_logs for each row execute function public.finance_entry_log_immutable();

do $$ declare name text; begin
 foreach name in array array[
  'finance_expenses','finance_petty_cash_entries','finance_petty_cash_funds','finance_references','finance_delete_requests',
  'finance_daily_inventory_entries','finance_inventory_transfers',
  'finance_cash_accounts','finance_cash_receivables','finance_cash_transactions','finance_cash_account_controls','finance_cash_payment_queue','finance_cash_sales_transfers','finance_cash_closed_shifts',
  'payroll_entries','payroll_cash_advances','payroll_cash_advance_repayments','payroll_loans','payroll_loan_repayments','payroll_misc_deductions','payroll_periods','payroll_schedules','payroll_attendance','payroll_rate_changes','payroll_employees'
 ] loop
  if to_regclass('public.'||name) is null then raise exception 'Finance audit source table is missing: %',name; end if;
  execute format('create trigger finance_entry_edit_audit after insert or update or delete on public.%I for each row execute function public.finance_capture_entry_edit()',name);
 end loop;
end $$;

create function public.finance_entry_log_list(p_from date,p_to date,p_table text default null,p_action text default null,p_actor uuid default null,p_store text default null,p_search text default null,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Choose a valid log date range'; end if;
 with matched as (
  select id,source_table,record_id,action,actor_id,actor_name,store_id,store_name,record_label,changed_fields,linked_update,transaction_id,recorded_at,
   coalesce(after_data->>'or_si_no',before_data->>'or_si_no',after_data->>'reference',before_data->>'reference') reference
  from public.finance_entry_edit_logs where recorded_at>=(p_from::timestamp at time zone 'Asia/Manila')
   and recorded_at<((p_to+1)::timestamp at time zone 'Asia/Manila')
   and (nullif(p_table,'') is null or source_table=p_table)
   and (nullif(p_action,'') is null or action=p_action)
   and (p_actor is null or actor_id=p_actor)
   and (nullif(p_store,'') is null or store_id=p_store)
   and (nullif(trim(p_search),'') is null or record_label ilike '%'||p_search||'%' or record_id ilike '%'||p_search||'%' or actor_name ilike '%'||p_search||'%'
    or concat_ws(' ',before_data->>'or_si_no',after_data->>'or_si_no',before_data->>'reference',after_data->>'reference') ilike '%'||p_search||'%')
 ), paged as (select * from matched order by recorded_at desc,id desc limit greatest(1,least(coalesce(p_limit,50),200)) offset greatest(coalesce(p_offset,0),0))
 select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(paged) order by recorded_at desc,id desc) from paged),'[]')) into result;
 return result;
end $$;
create function public.finance_entry_log_detail(p_id bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 select to_jsonb(l) into result from public.finance_entry_edit_logs l where id=p_id;
 if result is null then raise exception 'Finance log entry not found'; end if;
 return result;
end $$;
create function public.finance_entry_log_options() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.finance_cash_require_admin();
 return jsonb_build_object('actors',coalesce((select jsonb_agg(to_jsonb(a) order by actor_name) from(select distinct on(actor_id) actor_id,actor_name from public.finance_entry_edit_logs where actor_id is not null order by actor_id,recorded_at desc,id desc) a),'[]'),
  'stores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.stores),'[]'),
  'tables',coalesce((select jsonb_agg(event_object_table order by event_object_table) from information_schema.triggers where trigger_schema='public' and trigger_name='finance_entry_edit_audit' and event_manipulation='INSERT'),'[]'));
end $$;
revoke all on function public.finance_capture_entry_edit(),public.finance_entry_log_immutable() from public,anon,authenticated,service_role;
revoke all on function public.finance_entry_log_list(date,date,text,text,uuid,text,text,integer,integer),public.finance_entry_log_detail(bigint),public.finance_entry_log_options() from public,anon;
grant execute on function public.finance_entry_log_list(date,date,text,text,uuid,text,text,integer,integer),public.finance_entry_log_detail(bigint),public.finance_entry_log_options() to authenticated;
notify pgrst,'reload schema';
commit;
