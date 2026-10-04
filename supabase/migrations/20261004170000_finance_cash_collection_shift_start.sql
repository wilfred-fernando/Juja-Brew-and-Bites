begin;
alter table public.finance_cash_closed_shifts add column cash_shift_started_at timestamptz;
create or replace function public.finance_capture_closed_shift(p_shift jsonb,p_orders jsonb default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_id text:=p_shift->>'id'; v_store text:=p_shift->>'store_id'; v_closed timestamptz:=(p_shift->>'created_at')::timestamptz;
 v_open timestamptz; v_previous timestamptz; v_rows jsonb; v_payments jsonb; actor uuid; entry record; v_cash numeric; v_summary jsonb; v_shift_start timestamptz;
begin
 if lower(coalesce(p_shift->>'mode','')) not in ('close','end_day') then return; end if;
 if v_id is null or v_store is null then raise exception 'Closed shift requires an ID and store'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_closed_shift:'||v_store,0));
 if exists(select 1 from public.finance_cash_closed_shifts where id=v_id) and coalesce(p_shift->>'_finance_refresh','false')<>'true' then return; end if;
 select max(closed_at) into v_previous from public.finance_cash_closed_shifts where store_id=v_store and closed_at<=v_closed;
 select min(created_at) into v_open from public.cashier_pos where store_id::text=v_store and mode='open' and created_at<=v_closed and (v_previous is null or created_at>=v_previous);
 v_open:=coalesce((select opened_at from public.finance_cash_closed_shifts where id=v_id),v_previous,v_open,date_trunc('day',v_closed at time zone 'Asia/Manila') at time zone 'Asia/Manila');
 if p_orders is null then
  select coalesce(jsonb_agg(row_data),'[]') into v_rows from (
   select to_jsonb(o) row_data from public.orders o where o.store_id::text=v_store and o.created_at>v_open and o.created_at<=v_closed
   union all
   select to_jsonb(w) from public.web_orders w where w.store_id::text=v_store and w.created_at>v_open and w.created_at<=v_closed
    and not exists(select 1 from public.orders o where o.source_web_order_id=w.id)
  ) q;
 else
  select coalesce(jsonb_agg(r),'[]') into v_rows from jsonb_array_elements(p_orders) r
   where r->>'store_id'=v_store and (r->>'created_at')::timestamptz>v_open and (r->>'created_at')::timestamptz<=v_closed
    and not (r->>'_finance_source'='web' and exists(select 1 from jsonb_array_elements(p_orders) pos where pos->>'source_web_order_id'=r->>'id' and pos->>'_finance_source'='pos'));
 end if;
 v_payments:=public.finance_non_cash_totals(v_rows);
 select coalesce(round(sum(greatest(0,(e->>'amount')::numeric)*greatest(0,least(1,case when coalesce(nullif(r->>'total','')::numeric,nullif(r->>'net_amount','')::numeric,0)>0 then 1-coalesce(nullif(r->>'refund_amount','')::numeric,0)/coalesce(nullif(r->>'total','')::numeric,nullif(r->>'net_amount','')::numeric,0) else 0 end))),2),0) into v_cash
 from jsonb_array_elements(v_rows) r cross join lateral jsonb_array_elements(public.finance_collection_payment_entries(r)) e
 where lower(trim(coalesce(e->>'method','')))='cash' and lower(coalesce(r->>'status','')) in ('paid','closed','completed','complete','delivered','ready','partially refunded','partially_refunded','partial_refund') and nullif(r->>'voided_at','') is null;
 v_summary:=case when jsonb_typeof(p_shift->'sales_summary')='string' then (p_shift->>'sales_summary')::jsonb else p_shift->'sales_summary' end;
 actor:=coalesce(nullif(p_shift->>'cashier_id','')::uuid,(select id from public.profiles where lower(role) in ('admin','super_admin') order by id limit 1));
 if actor is null then raise exception 'Finance attribution requires an administrator profile'; end if;
 insert into public.finance_cash_closed_shifts(id,store_id,opened_at,closed_at,business_date,mode,payments)
 values(v_id,v_store,v_open,v_closed,(v_closed at time zone 'Asia/Manila')::date,p_shift->>'mode',v_payments) on conflict(id) do update set payments=excluded.payments;
 v_shift_start:=nullif(v_summary->>'shiftStartedAt','')::timestamptz;
 if v_shift_start is null then
  select max(p.created_at) into v_shift_start from public.cashier_pos p
  where p.store_id::text=v_store and lower(p.mode)='open' and p.created_at<=v_closed
  and (nullif(p_shift->>'cashier_id','') is null or p.cashier_id::text=p_shift->>'cashier_id');
 end if;
 if v_shift_start>v_closed then raise exception 'Shift start cannot be after closure'; end if;
 update public.finance_cash_closed_shifts set cash_shift_started_at=v_shift_start,cash_sales=v_cash,
 declared_cash=coalesce(nullif(p_shift->>'cash_total','')::numeric,nullif(v_summary->>'actualCash','')::numeric),
 initial_fund=nullif(v_summary->>'startingCash','')::numeric where id=v_id;
 if exists(select 1 from public.finance_cash_receivables r where r.shift_id=v_id and not (v_payments ? r.channel) and exists(select 1 from public.finance_cash_transactions t where t.receivable_id=r.id)) then
  raise exception 'Cannot remove a channel with remittance history; review its remittances first';
 end if;
 delete from public.finance_cash_receivables r where r.shift_id=v_id and not (v_payments ? r.channel);
 for entry in select key,value from jsonb_each_text(v_payments) loop
  if exists(select 1 from public.finance_cash_receivables r where r.shift_id=v_id and r.channel=entry.key and
   (select coalesce(sum(case when t.kind='reversal' then -t.amount else t.amount end),0) from public.finance_cash_transactions t where t.receivable_id=r.id)>entry.value::numeric) then
   raise exception 'Corrected sales cannot be lower than recorded settlements';
  end if;
  insert into public.finance_cash_receivables(channel,period_start,period_end,gross_amount,reference,notes,created_by,store_id,shift_id)
  values(entry.key,(v_closed at time zone 'Asia/Manila')::date,(v_closed at time zone 'Asia/Manila')::date,entry.value::numeric,
   'Shift '||v_id,'Non-cash sales after shift close',actor,v_store,v_id) on conflict(channel,reference) do update set gross_amount=excluded.gross_amount;
 end loop;
end $$;

create or replace function public.finance_daily_cash_snapshot(p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 with cash_shifts as (select c.*, (cash_shift_started_at at time zone 'Asia/Manila')::date cash_date from public.finance_cash_closed_shifts c), days as (
 select store_id,cash_date business_date,count(*) shift_count,
 case when count(cash_sales)=count(*) then sum(cash_sales) end cash_sales
 from cash_shifts where cash_date<=p_to or cash_date is null group by store_id,cash_date
 ) select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('store_name',coalesce(s.name,d.store_id),'declared_cash',c.declared_cash,'initial_fund',c.initial_fund,
 'net_declared',c.declared_cash-c.initial_fund,'count_basis',c.mode,'transferred',coalesce(t.amount,0),'transfer_fees',coalesce(t.fees,0),
 'remaining',c.declared_cash-c.initial_fund-coalesce(t.amount,0),'variance',c.declared_cash-c.initial_fund-d.cash_sales,
 'source_account_id',a.id,'history',coalesce(t.history,'[]')) order by d.business_date desc nulls last,s.name),'[]') into result
 from days d left join public.stores s on s.id::text=d.store_id
 left join public.finance_cash_accounts a on a.petty_store_id=d.store_id
 left join lateral(select * from cash_shifts where store_id=d.store_id and cash_date=d.business_date
 order by (mode='end_day') desc,closed_at desc limit 1) c on true
 left join lateral(select sum(case when x.kind='reversal' then -x.amount else x.amount end) amount,
 sum(case when x.kind='reversal' then -x.fee else x.fee end) fees,
 jsonb_agg(jsonb_build_object('id',x.id,'date',x.transaction_date,'amount',x.amount,'fee',x.fee,'reference',x.reference,'kind',x.kind,'receiving_account',dest.name) order by x.transaction_date,x.created_at) history
 from public.finance_cash_sales_transfers l join public.finance_cash_transactions x on x.id=l.transaction_id or x.reversal_of=l.transaction_id
 left join public.finance_cash_accounts dest on dest.id=x.to_account_id
 where l.store_id=d.store_id and l.business_date=d.business_date and x.transaction_date<=p_to) t on true;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
