begin;
create function public.payroll_guard_monthly_overlap() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target public.payroll_periods;
begin
 if NEW.status='void' or coalesce(NEW.thirteenth_month_pay,0)>0 then return NEW; end if;
 perform 1 from public.payroll_employees where id=NEW.employee_id for update;
 select * into target from public.payroll_periods where id=NEW.period_id;
 if target.id like '13th-month-%' then return NEW; end if;
 if exists(select 1 from public.payroll_entries e join public.payroll_periods p on p.id=e.period_id
 where e.employee_id=NEW.employee_id and e.id<>NEW.id and e.status<>'void' and coalesce(e.thirteenth_month_pay,0)=0
 and p.id not like '13th-month-%' and p.period_start<=target.period_end and p.period_end>=target.period_start
 and (p.id like 'monthly-%' or target.id like 'monthly-%')) then
 raise exception 'This employee already has payroll overlapping the monthly period. Review the existing payroll first.'; end if;
 return NEW;
end $$;
create trigger payroll_monthly_overlap before insert or update on public.payroll_entries for each row execute function public.payroll_guard_monthly_overlap();
create function public.payroll_generate_monthly(p_month text,p_entry jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare start_date date; end_date date; v_period_id text; v_employee_id text:=p_entry->>'employee_id'; period public.payroll_periods; entry public.payroll_entries;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')) then raise exception 'Payroll administrator access required'; end if;
 if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Select a valid payroll month'; end if;
 start_date:=(p_month||'-01')::date;end_date:=(start_date+interval '1 month - 1 day')::date;v_period_id:='monthly-'||p_month;
 perform 1 from public.payroll_employees where id=v_employee_id for update;
 if not found then raise exception 'Select a valid employee'; end if;
 select * into entry from public.payroll_entries where payroll_entries.period_id=v_period_id and payroll_entries.employee_id=v_employee_id;
 if found then
  if entry.status='void' then raise exception 'Monthly payroll was voided. Review it before generating again.'; end if;
  select * into period from public.payroll_periods where id=v_period_id;
  return jsonb_build_object('entry',to_jsonb(entry),'period',to_jsonb(period));
 end if;
 if not exists(select 1 from public.payroll_attendance where payroll_attendance.employee_id=v_employee_id and work_date between start_date and end_date) then raise exception 'No attendance found for this employee and month'; end if;
 insert into public.payroll_periods(id,label,period_start,period_end,pay_date,status)
 values(v_period_id,'Monthly Payroll '||p_month,start_date,end_date,end_date+1,'draft') on conflict(id) do nothing;
 select * into period from public.payroll_periods where id=v_period_id;
 if period.period_start<>start_date or period.period_end<>end_date or period.pay_date<>end_date+1 or period.status<>'draft' then raise exception 'Monthly period is locked or has conflicting dates'; end if;
 insert into public.payroll_entries(id,period_id,employee_id,daily_rate,days_worked,overtime_hours,overtime_rate,absent_days,late_minutes,late_rate_per_minute,undertime_minutes,undertime_rate_per_minute,allowance_15th,allowance_30th,payroll_allowance,payroll_adjustment,sss_deduction,philhealth_deduction,hmdf_deduction,cash_advance_deduction,misc_deduction_total,loan_repayment_total,gross_total,deduction_total,net_total,status,notes,generated_at)
 values(v_period_id||'-'||v_employee_id,v_period_id,v_employee_id,coalesce((p_entry->>'daily_rate')::numeric,0),coalesce((p_entry->>'days_worked')::numeric,0),coalesce((p_entry->>'overtime_hours')::numeric,0),coalesce((p_entry->>'overtime_rate')::numeric,0),coalesce((p_entry->>'absent_days')::numeric,0),coalesce((p_entry->>'late_minutes')::numeric,0),coalesce((p_entry->>'late_rate_per_minute')::numeric,0),coalesce((p_entry->>'undertime_minutes')::numeric,0),coalesce((p_entry->>'undertime_rate_per_minute')::numeric,0),coalesce((p_entry->>'allowance_15th')::numeric,0),coalesce((p_entry->>'allowance_30th')::numeric,0),coalesce((p_entry->>'payroll_allowance')::numeric,0),coalesce((p_entry->>'payroll_adjustment')::numeric,0),coalesce((p_entry->>'sss_deduction')::numeric,0),coalesce((p_entry->>'philhealth_deduction')::numeric,0),coalesce((p_entry->>'hmdf_deduction')::numeric,0),coalesce((p_entry->>'cash_advance_deduction')::numeric,0),coalesce((p_entry->>'misc_deduction_total')::numeric,0),coalesce((p_entry->>'loan_repayment_total')::numeric,0),coalesce((p_entry->>'gross_total')::numeric,0),coalesce((p_entry->>'deduction_total')::numeric,0),coalesce((p_entry->>'net_total')::numeric,0),'draft',p_entry->>'notes',now()) returning * into entry;
 return jsonb_build_object('entry',to_jsonb(entry),'period',to_jsonb(period));
end $$;
revoke all on function public.payroll_generate_monthly(text,jsonb),public.payroll_guard_monthly_overlap() from public,anon,authenticated;
grant execute on function public.payroll_generate_monthly(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
