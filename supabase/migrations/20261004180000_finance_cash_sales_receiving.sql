begin;
alter table public.finance_cash_receivables add column cash_sales_date date;
create unique index finance_cash_sales_receivable_day on public.finance_cash_receivables(store_id,cash_sales_date) where cash_sales_date is not null;
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
 'source_label','Cash Sales','history',coalesce(t.history,'[]')) order by d.business_date desc nulls last,s.name),'[]') into result
 from days d left join public.stores s on s.id::text=d.store_id
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
create or replace function public.finance_cash_collection_snapshot(p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('store_name',coalesce(s.name,r.store_id,'Manual entry'),
 'remitted',coalesce(p.remitted,0),'deductions',coalesce(p.deductions,0),
 'outstanding',r.gross_amount-coalesce(p.remitted,0)-coalesce(p.deductions,0),
 'remittances',coalesce(p.history,'[]')) order by r.period_end desc,r.channel),'[]') into result
 from public.finance_cash_receivables r left join public.stores s on s.id::text=r.store_id
 left join lateral (
  select sum((case when kind='reversal' then -1 else 1 end)*(amount-fee)) remitted,
    sum((case when kind='reversal' then -1 else 1 end)*fee) deductions,
    jsonb_agg(jsonb_build_object('id',t.id,'date',t.transaction_date,'amount',t.amount-t.fee,'deductions',t.fee,
      'reference',t.reference,'kind',t.kind,'reversed',exists(select 1 from public.finance_cash_transactions rev where rev.reversal_of=t.id and rev.transaction_date<=p_to)) order by t.transaction_date desc,t.created_at desc) history
  from public.finance_cash_transactions t where t.receivable_id=r.id and transaction_date<=p_to
 ) p on true where r.period_end<=p_to and r.cash_sales_date is null;
 return result;
end $$;

create function public.finance_cash_sales_allocation_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.finance_cash_receivables; daily jsonb;
begin
 if NEW.kind<>'collection' then return null; end if;
 select * into r from public.finance_cash_receivables where id=NEW.receivable_id;
 if r.cash_sales_date is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-sales:'||r.store_id||':'||r.cash_sales_date::text,0));
 select e into daily from jsonb_array_elements(public.finance_daily_cash_snapshot('9999-12-31')) e where e->>'store_id'=r.store_id and e->>'business_date'=r.cash_sales_date::text;
 if daily->>'remaining' is null or NEW.amount>(daily->>'remaining')::numeric then raise exception 'Transfer exceeds untransferred declared cash'; end if;
 insert into public.finance_cash_sales_transfers(transaction_id,store_id,business_date) values(NEW.id,r.store_id,r.cash_sales_date);
 return null;
end $$;
create trigger finance_cash_sales_allocation after insert on public.finance_cash_transactions for each row execute function public.finance_cash_sales_allocation_trigger();
revoke all on function public.finance_cash_sales_allocation_trigger() from public,anon,authenticated;
create or replace function public.finance_cash_sales_transfer(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare daily jsonb; tid uuid; rid uuid; t public.finance_cash_transactions;
begin
 perform public.finance_cash_require_admin();
 perform pg_advisory_xact_lock(hashtextextended('cash-sales:'||(p_data->>'store_id')||':'||(p_data->>'business_date'),0));
 select x.id into tid from public.finance_cash_transactions x join public.finance_cash_sales_transfers l on l.transaction_id=x.id where x.request_id=nullif(p_data->>'request_id','')::uuid;
 if tid is not null then return tid; end if;
 select e into daily from jsonb_array_elements(public.finance_daily_cash_snapshot('9999-12-31')) e where e->>'store_id'=p_data->>'store_id' and e->>'business_date'=p_data->>'business_date';
 if daily is null or daily->>'net_declared' is null then raise exception 'Declared cash and initial fund are required before receiving cash sales'; end if;
 if nullif(p_data->>'transaction_id','') is not null then
  select * into t from public.finance_cash_transactions where id=(p_data->>'transaction_id')::uuid for update;
  if t.id is null then raise exception 'Receipt not found'; end if;
  if exists(select 1 from public.finance_cash_sales_transfers where transaction_id=t.id and store_id=p_data->>'store_id' and business_date=(p_data->>'business_date')::date) then return t.id; end if;
  if exists(select 1 from public.finance_cash_sales_transfers where transaction_id=t.id) then raise exception 'Receipt already assigned to another cash sales day'; end if;
  if t.kind<>'inflow' or t.from_account_id is not null or t.source_table is not null or t.transaction_date<(p_data->>'business_date')::date or exists(select 1 from public.finance_cash_transactions where reversal_of=t.id) then raise exception 'Choose an active Cash In on or after the sales date; transfers debiting another fund cannot be linked as cash sales'; end if;
  if t.amount>(daily->>'remaining')::numeric then raise exception 'Receipt exceeds untransferred declared cash'; end if;
  insert into public.finance_cash_sales_transfers(transaction_id,store_id,business_date) values(t.id,p_data->>'store_id',(p_data->>'business_date')::date);
  return t.id;
 end if;
 if (p_data->>'amount')::numeric>(daily->>'remaining')::numeric or (daily->>'net_declared')::numeric<=0 then raise exception 'Transfer exceeds untransferred declared cash'; end if;
 insert into public.finance_cash_receivables(channel,period_start,period_end,gross_amount,reference,notes,store_id,cash_sales_date)
 values('Cash Sales',(p_data->>'business_date')::date,(p_data->>'business_date')::date,(daily->>'net_declared')::numeric,
 'Cash Sales '||(p_data->>'store_id')||' / '||(p_data->>'business_date'),'Declared cash less initial fund',p_data->>'store_id',(p_data->>'business_date')::date)
 on conflict(store_id,cash_sales_date) where cash_sales_date is not null do update set gross_amount=excluded.gross_amount returning id into rid;
 tid:=public.finance_cash_post(p_data||jsonb_build_object('kind','collection','from_account_id',null,'receivable_id',rid,
 'notes','Cash Sales - '||(daily->>'store_name')||' / '||(p_data->>'business_date')||case when nullif(p_data->>'notes','') is not null then ' — '||(p_data->>'notes') else '' end));
 return tid;
end $$;
create or replace function public.finance_remittance_petty_cash_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare leg record; channel text;
begin
 if NEW.source_table is not null then return null; end if;
 select r.channel into channel from public.finance_cash_receivables r where id=NEW.receivable_id;
 for leg in
 select a.petty_store_id branch,sum(value)*(case when NEW.kind='reversal' then -1 else 1 end) amount from (
 select NEW.to_account_id account_id,NEW.amount-NEW.fee value where NEW.to_account_id is not null
 union all select NEW.from_account_id,-NEW.amount where NEW.from_account_id is not null
 ) legs join public.finance_cash_accounts a on a.id=legs.account_id where a.petty_store_id is not null group by a.petty_store_id
 loop
  insert into public.finance_petty_cash_funds(id,store_id,fund_date,source_of_fund,particular,amount,created_by,remittance_transaction_id)
  values('movement_'||NEW.id::text||'_'||leg.branch,leg.branch,NEW.transaction_date,
   case when channel='Cash Sales' then 'CASH SALES' when channel is not null then 'REMITTANCE - '||channel when leg.amount<0 then 'CASH MOVEMENT OUT' else 'CASH MOVEMENT IN' end,
   NEW.reference,leg.amount,NEW.created_by,NEW.id);
 end loop;
 return null;
end $$;
notify pgrst,'reload schema';
commit;
