begin;
alter table public.finance_cash_closed_shifts add column cash_sales numeric(14,2),add column declared_cash numeric(14,2),add column initial_fund numeric(14,2);
create table public.finance_cash_sales_transfers (
 transaction_id uuid primary key references public.finance_cash_transactions(id), store_id text not null,business_date date not null,created_at timestamptz not null default now()
);
alter table public.finance_cash_sales_transfers enable row level security;
revoke all on public.finance_cash_sales_transfers from public,anon,authenticated;
grant select on public.finance_cash_sales_transfers to authenticated;
create policy cash_sales_transfer_admin_read on public.finance_cash_sales_transfers for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')));
create or replace function public.finance_capture_closed_shift(p_shift jsonb,p_orders jsonb default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_id text:=p_shift->>'id'; v_store text:=p_shift->>'store_id'; v_closed timestamptz:=(p_shift->>'created_at')::timestamptz;
 v_open timestamptz; v_previous timestamptz; v_rows jsonb; v_payments jsonb; actor uuid; entry record; v_cash numeric; v_summary jsonb;
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
 update public.finance_cash_closed_shifts set cash_sales=v_cash,
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

create function public.finance_daily_cash_snapshot(p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 with days as (
 select store_id,business_date,count(*) shift_count,
 case when count(cash_sales)=count(*) then sum(cash_sales) end cash_sales
 from public.finance_cash_closed_shifts where business_date<=p_to group by store_id,business_date
 ) select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('store_name',coalesce(s.name,d.store_id),'declared_cash',c.declared_cash,'initial_fund',c.initial_fund,
 'net_declared',c.declared_cash-c.initial_fund,'count_basis',c.mode,'transferred',coalesce(t.amount,0),'transfer_fees',coalesce(t.fees,0),
 'remaining',c.declared_cash-c.initial_fund-coalesce(t.amount,0),'variance',c.declared_cash-c.initial_fund-d.cash_sales,
 'source_account_id',a.id,'history',coalesce(t.history,'[]')) order by d.business_date desc,s.name),'[]') into result
 from days d left join public.stores s on s.id::text=d.store_id
 left join public.finance_cash_accounts a on a.petty_store_id=d.store_id
 left join lateral(select * from public.finance_cash_closed_shifts where store_id=d.store_id and business_date=d.business_date
 order by (mode='end_day') desc,closed_at desc limit 1) c on true
 left join lateral(select sum(case when x.kind='reversal' then -x.amount else x.amount end) amount,
 sum(case when x.kind='reversal' then -x.fee else x.fee end) fees,
 jsonb_agg(jsonb_build_object('id',x.id,'date',x.transaction_date,'amount',x.amount,'fee',x.fee,'reference',x.reference,'kind',x.kind,'receiving_account',dest.name) order by x.transaction_date,x.created_at) history
 from public.finance_cash_sales_transfers l join public.finance_cash_transactions x on x.id=l.transaction_id or x.reversal_of=l.transaction_id
 left join public.finance_cash_accounts dest on dest.id=x.to_account_id
 where l.store_id=d.store_id and l.business_date=d.business_date and x.transaction_date<=p_to) t on true;
 return result;
end $$;
create function public.finance_cash_sales_transfer(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare daily jsonb; source_id uuid; tid uuid; t public.finance_cash_transactions; transferred numeric;
begin
 perform public.finance_cash_require_admin();
 perform pg_advisory_xact_lock(hashtextextended('cash-sales:'||(p_data->>'store_id')||':'||(p_data->>'business_date'),0));
 select x.id into tid from public.finance_cash_transactions x join public.finance_cash_sales_transfers l on l.transaction_id=x.id
 where x.request_id=nullif(p_data->>'request_id','')::uuid;
 if tid is not null then return tid; end if;
 select e into daily from jsonb_array_elements(public.finance_daily_cash_snapshot('9999-12-31')) e where e->>'store_id'=p_data->>'store_id' and e->>'business_date'=p_data->>'business_date';
 if daily is null or daily->>'net_declared' is null then raise exception 'Declared cash and initial fund are required before tracking a transfer'; end if;
 source_id:=(daily->>'source_account_id')::uuid;
 if source_id is null then raise exception 'Branch petty cash account is missing'; end if;
 if nullif(p_data->>'transaction_id','') is not null then
  select * into t from public.finance_cash_transactions where id=(p_data->>'transaction_id')::uuid for update;
  if t.id is null or exists(select 1 from public.finance_cash_sales_transfers where transaction_id=t.id) then raise exception 'Transfer not found or already assigned'; end if;
 else
  tid:=public.finance_cash_post(p_data||jsonb_build_object('kind','transfer','from_account_id',source_id));
  select * into t from public.finance_cash_transactions where id=tid;
 end if;
 if t.kind<>'transfer' or t.from_account_id<>source_id or t.transaction_date<(p_data->>'business_date')::date
 or exists(select 1 from public.finance_cash_transactions where reversal_of=t.id) then raise exception 'Choose an active transfer from this branch on or after the sales date'; end if;
 if t.amount>(daily->>'remaining')::numeric then raise exception 'Transfer exceeds untransferred declared cash'; end if;
 insert into public.finance_cash_sales_transfers(transaction_id,store_id,business_date) values(t.id,p_data->>'store_id',(p_data->>'business_date')::date);
 return t.id;
end $$;
revoke all on function public.finance_daily_cash_snapshot(date),public.finance_cash_sales_transfer(jsonb) from public,anon;
grant execute on function public.finance_daily_cash_snapshot(date),public.finance_cash_sales_transfer(jsonb) to authenticated;
-- Recover declarations still present online; missing archived counts stay unknown.
update public.finance_cash_closed_shifts c set declared_cash=p.cash_total,
 initial_fund=nullif((case when jsonb_typeof(to_jsonb(p)->'sales_summary')='string' then (to_jsonb(p)->>'sales_summary')::jsonb else to_jsonb(p)->'sales_summary' end)->>'startingCash','')::numeric
 from public.cashier_pos p where p.id::text=c.id;
notify pgrst,'reload schema';
commit;
