begin;
-- Reporting only: do not delete or rewrite historical financial records.
create view public.finance_cash_reporting_receivables as
 select r.* from public.finance_cash_receivables r
 left join public.finance_cash_closed_shifts s on s.id=r.shift_id
 where coalesce(r.cash_sales_date,(s.cash_shift_started_at at time zone 'Asia/Manila')::date,r.period_start)>=date '2026-08-11';
create view public.finance_cash_reporting_transactions as
 select t.* from public.finance_cash_transactions t
 left join public.finance_cash_transactions original on original.id=t.reversal_of
 left join public.finance_cash_receivables r on r.id=coalesce(original.receivable_id,t.receivable_id)
 left join public.finance_cash_closed_shifts s on s.id=r.shift_id
 left join public.finance_cash_sales_transfers l on l.transaction_id=coalesce(original.id,t.id)
 where t.transaction_date>=date '2026-08-11' and coalesce(original.transaction_date,t.transaction_date)>=date '2026-08-11'
 and (r.id is null or coalesce(r.cash_sales_date,(s.cash_shift_started_at at time zone 'Asia/Manila')::date,r.period_start)>=date '2026-08-11')
 and (l.transaction_id is null or l.business_date>=date '2026-08-11');
revoke all on public.finance_cash_reporting_receivables,public.finance_cash_reporting_transactions from public,anon,authenticated;
create or replace function public.finance_cash_snapshot(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.finance_cash_require_admin();
  if p_from > p_to then raise exception 'Invalid reporting period'; end if;
  p_from:=greatest(p_from,date '2026-08-11');
  with movements as (
    select t.*, case when t.kind='reversal' then -1 else 1 end as direction,
      coalesce(o.kind,t.kind) as effective_kind
    from public.finance_cash_reporting_transactions t left join public.finance_cash_transactions o on o.id=t.reversal_of
  ), legs as (
    select to_account_id as account_id, transaction_date, direction*(amount-fee) as value from movements where to_account_id is not null
    union all select from_account_id,transaction_date,-direction*amount from movements where from_account_id is not null
  )
  select jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'opening',coalesce((select sum(value) from legs where account_id=a.id and transaction_date<p_from),0),
      'balance',coalesce((select sum(value) from legs where account_id=a.id and transaction_date<=p_to),0))), '[]') from public.finance_cash_accounts a),
    'receivables',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('outstanding',r.gross_amount-coalesce((select sum(direction*amount) from movements where receivable_id=r.id and transaction_date<=p_to),0))), '[]') from public.finance_cash_reporting_receivables r where period_end<=p_to),
    'transactions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc,x.created_at desc),'[]') from (select m.*,exists(select 1 from public.finance_cash_transactions rev where rev.reversal_of=m.id and rev.transaction_date<=p_to) as reversed from movements m where transaction_date between p_from and p_to) x),
    'flow',jsonb_build_object(
      'inflow',coalesce((select sum(direction*(amount-fee)) from movements where effective_kind in ('inflow','collection') and transaction_date between p_from and p_to),0),
      'outflow',coalesce((select sum(direction*case when effective_kind='outflow' then amount else fee end) from movements where effective_kind in ('outflow','transfer') and transaction_date between p_from and p_to),0),
      'fees',coalesce((select sum(direction*fee) from movements where transaction_date between p_from and p_to),0))) into result;
  return result;
end $$;

create or replace function public.finance_cash_position_snapshot(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; enriched jsonb; payments jsonb;
begin
 perform public.finance_cash_require_admin();
 result:=public.finance_cash_snapshot(p_from,p_to);
 with payment_state as (
 select p.*,e.event->>'status' as as_of_status from public.finance_cash_payment_queue p
 cross join lateral(select event from jsonb_array_elements(p.audit_log) with ordinality entries(event,position)
 where (event->>'date')::date<=p_to order by position desc limit 1) e
 where p.scheduled_date>=date '2026-08-11'
 ), movement as (
  select t.*,case when t.kind='reversal' then -1 else 1 end direction,coalesce(o.kind,t.kind) effective_kind
  from public.finance_cash_reporting_transactions t left join public.finance_cash_transactions o on o.id=t.reversal_of
 ), legs as (
  select to_account_id account_id,transaction_date,direction*(amount-fee) value from movement where to_account_id is not null
  union all select from_account_id,transaction_date,-direction*amount from movement where from_account_id is not null
 )
 select coalesce(jsonb_agg(a||jsonb_build_object(
  'minimum_balance',coalesce(c.minimum_balance,0),'released_pending',coalesce(q.released,0),'scheduled_pending',coalesce(q.scheduled,0),
  'available',((a->>'balance')::numeric-coalesce(c.minimum_balance,0)-coalesce(q.released,0)-coalesce(q.scheduled,0)),
  'opening_adjustments',coalesce(m.openings,0),'cash_in',coalesce(m.cash_in,0),'collections',coalesce(m.collections,0),
  'transfers_in',coalesce(m.transfers_in,0),'payments',coalesce(m.payments,0),'transfers_out',coalesce(m.transfers_out,0),
  'transfer_fees',coalesce(m.transfer_fees,0),
  'statement_date',b.effective_date,'statement_balance',b.statement_balance,'statement_notes',b.notes,
  'statement_ledger',case when b.id is not null then coalesce((select sum(value) from legs where account_id=(a->>'id')::uuid and transaction_date<=b.effective_date),0) end,
  'variance',case when b.id is not null then b.statement_balance-coalesce((select sum(value) from legs where account_id=(a->>'id')::uuid and transaction_date<=b.effective_date),0) end)
  order by a->>'name'),'[]') into enriched
 from jsonb_array_elements(result->'accounts') a
 left join lateral (select * from public.finance_cash_account_controls where account_id=(a->>'id')::uuid and effective_date<=p_to order by effective_date desc,created_at desc,id desc limit 1) c on true
 left join lateral (select * from public.finance_cash_account_controls where account_id=(a->>'id')::uuid and effective_date<=p_to and effective_date>=date '2026-08-11' and statement_balance is not null order by effective_date desc,created_at desc,id desc limit 1) b on true
 left join lateral (
  select sum(amount) filter(where as_of_status='released') released,
    sum(amount) filter(where as_of_status='scheduled') scheduled
  from payment_state where account_id=(a->>'id')::uuid and scheduled_date<=p_to
 ) q on true
 left join lateral (
  select sum(direction*amount) filter(where effective_kind='opening' and to_account_id=(a->>'id')::uuid) openings,
   sum(direction*amount) filter(where effective_kind='inflow' and to_account_id=(a->>'id')::uuid) cash_in,
   sum(direction*(amount-fee)) filter(where effective_kind='collection' and to_account_id=(a->>'id')::uuid) collections,
   sum(direction*(amount-fee)) filter(where effective_kind='transfer' and to_account_id=(a->>'id')::uuid) transfers_in,
   sum(direction*amount) filter(where effective_kind='outflow' and from_account_id=(a->>'id')::uuid) payments,
   sum(direction*amount) filter(where effective_kind='transfer' and from_account_id=(a->>'id')::uuid) transfers_out,
   sum(direction*fee) filter(where effective_kind='transfer' and from_account_id=(a->>'id')::uuid) transfer_fees
  from movement where transaction_date between p_from and p_to
 ) m on true;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('account_name',a.name,'status_as_of',
  (select event->>'status' from jsonb_array_elements(p.audit_log) with ordinality events(event,position) where (event->>'date')::date<=p_to order by position desc limit 1))
  order by p.due_date,p.created_at),'[]') into payments
 from public.finance_cash_payment_queue p join public.finance_cash_accounts a on a.id=p.account_id where p.scheduled_date between date '2026-08-11' and p_to;
 return result||jsonb_build_object('accounts',enriched,'payment_queue',payments);
end $$;
create or replace function public.finance_daily_cash_snapshot(p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 with cash_shifts as (select c.*, (cash_shift_started_at at time zone 'Asia/Manila')::date cash_date from public.finance_cash_closed_shifts c), days as (
 select store_id,cash_date business_date,count(*) shift_count,
 case when count(cash_sales)=count(*) then sum(cash_sales) end cash_sales
 from cash_shifts where cash_date between date '2026-08-11' and p_to group by store_id,cash_date
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
 from public.finance_cash_sales_transfers l join public.finance_cash_reporting_transactions x on x.id=l.transaction_id or x.reversal_of=l.transaction_id
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
 from public.finance_cash_reporting_receivables r left join public.stores s on s.id::text=r.store_id
 left join lateral (
  select sum((case when kind='reversal' then -1 else 1 end)*(amount-fee)) remitted,
    sum((case when kind='reversal' then -1 else 1 end)*fee) deductions,
    jsonb_agg(jsonb_build_object('id',t.id,'date',t.transaction_date,'amount',t.amount-t.fee,'deductions',t.fee,
      'reference',t.reference,'kind',t.kind,'reversed',exists(select 1 from public.finance_cash_transactions rev where rev.reversal_of=t.id and rev.transaction_date<=p_to)) order by t.transaction_date desc,t.created_at desc) history
  from public.finance_cash_reporting_transactions t where t.receivable_id=r.id and transaction_date<=p_to
 ) p on true where r.period_end<=p_to and r.cash_sales_date is null;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
