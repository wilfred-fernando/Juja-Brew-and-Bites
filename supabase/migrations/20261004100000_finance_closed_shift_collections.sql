begin;
alter table public.finance_cash_receivables add column store_id text, add column shift_id text;
create unique index finance_cash_shift_channel on public.finance_cash_receivables(shift_id,channel) where shift_id is not null;
create table public.finance_cash_closed_shifts (
 id text primary key, store_id text not null, opened_at timestamptz, closed_at timestamptz not null,
 business_date date not null, mode text not null, payments jsonb not null, captured_at timestamptz not null default now()
);
alter table public.finance_cash_closed_shifts enable row level security;
revoke all on public.finance_cash_closed_shifts from public,anon,authenticated;
grant select on public.finance_cash_closed_shifts to authenticated;
create policy cash_closed_shift_admin_read on public.finance_cash_closed_shifts for select to authenticated
 using(exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')));

create function public.finance_non_cash_channel(p_name text) returns text
language sql immutable set search_path=pg_catalog as $$
 select case regexp_replace(lower(trim(p_name)),'[ _-]','','g')
 when 'cash' then null when 'nopaymentrequired' then null when 'waived' then null
 when 'gcash' then 'GCash' when 'qrph' then 'QRPH' when 'grabpay' then 'GrabPay'
 when 'grabfood' then 'GrabFood' when 'shopeefood' then 'ShopeeFood'
 when 'panda' then 'Foodpanda' when 'foodpanda' then 'Foodpanda' when 'card' then 'Card'
 when 'grabdineout' then 'Grab Dine Out' else nullif(trim(p_name),'') end;
$$;

-- Uses the same split-payment and proportional-refund rules as the POS close report.
create function public.finance_non_cash_totals(p_orders jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 with receipts as (
  select r, coalesce(nullif(r->>'total','')::numeric,nullif(r->>'net_amount','')::numeric,0) total,
   coalesce(nullif(r->>'refund_amount','')::numeric,0) refund
  from jsonb_array_elements(p_orders) r
  where lower(coalesce(r->>'status','')) in ('paid','closed','completed','complete','delivered','ready','partially refunded','partially_refunded','partial_refund')
    and nullif(r->>'voided_at','') is null
 ), splits as (
  select r,total,refund, case
   when jsonb_typeof(r->'source_metadata'->'payment_splits')='array' and jsonb_array_length(r->'source_metadata'->'payment_splits')>0 then r->'source_metadata'->'payment_splits'
   when jsonb_typeof(r->'payment_splits')='array' and jsonb_array_length(r->'payment_splits')>0 then r->'payment_splits'
   else jsonb_build_array(jsonb_build_object('method',coalesce(r->>'payment_method',r->>'payment_type'),'amount',total)) end entries
  from receipts
 ), lines as (
  select public.finance_non_cash_channel(coalesce(e->>'method',e->>'payment_method',e->>'type',e->>'name')) channel,
   greatest(0,coalesce(nullif(e->>'amount','')::numeric,nullif(e->>'value','')::numeric,0)) amount,
   greatest(0,least(1,case when total>0 then (total-refund)/total else 0 end)) ratio
  from splits cross join lateral jsonb_array_elements(entries) e
 ), totals as (select channel,round(sum(amount*ratio),2) amount from lines where channel is not null group by channel)
 select coalesce(jsonb_object_agg(channel,amount) filter(where amount>0),'{}') from totals;
$$;

create function public.finance_capture_closed_shift(p_shift jsonb,p_orders jsonb default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_id text:=p_shift->>'id'; v_store text:=p_shift->>'store_id'; v_closed timestamptz:=(p_shift->>'created_at')::timestamptz;
 v_open timestamptz; v_previous timestamptz; v_rows jsonb; v_payments jsonb; actor uuid; entry record;
begin
 if lower(coalesce(p_shift->>'mode','')) not in ('close','end_day') then return; end if;
 if v_id is null or v_store is null then raise exception 'Closed shift requires an ID and store'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_closed_shift:'||v_store,0));
 if exists(select 1 from public.finance_cash_closed_shifts where id=v_id) then return; end if;
 select max(closed_at) into v_previous from public.finance_cash_closed_shifts where store_id=v_store and closed_at<=v_closed;
 select min(created_at) into v_open from public.cashier_pos where store_id::text=v_store and mode='open' and created_at<=v_closed and (v_previous is null or created_at>=v_previous);
 v_open:=coalesce(v_previous,v_open,date_trunc('day',v_closed at time zone 'Asia/Manila') at time zone 'Asia/Manila');
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
 actor:=coalesce(nullif(p_shift->>'cashier_id','')::uuid,(select id from public.profiles where lower(role) in ('admin','super_admin') order by id limit 1));
 if actor is null then raise exception 'Finance attribution requires an administrator profile'; end if;
 insert into public.finance_cash_closed_shifts(id,store_id,opened_at,closed_at,business_date,mode,payments)
 values(v_id,v_store,v_open,v_closed,(v_closed at time zone 'Asia/Manila')::date,p_shift->>'mode',v_payments);
 for entry in select key,value from jsonb_each_text(v_payments) loop
  insert into public.finance_cash_receivables(channel,period_start,period_end,gross_amount,reference,notes,created_by,store_id,shift_id)
  values(entry.key,(v_closed at time zone 'Asia/Manila')::date,(v_closed at time zone 'Asia/Manila')::date,entry.value::numeric,
   'Shift '||v_id,'Non-cash sales after shift close',actor,v_store,v_id);
 end loop;
end $$;
revoke all on function public.finance_capture_closed_shift(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_capture_closed_shift(jsonb,jsonb) to service_role;

create function public.finance_closed_shift_collection_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.finance_capture_closed_shift(to_jsonb(new));
 return null;
end $$;
revoke all on function public.finance_closed_shift_collection_trigger() from public,anon,authenticated;
create trigger finance_closed_shift_collections after insert on public.cashier_pos
 for each row execute function public.finance_closed_shift_collection_trigger();

create function public.finance_cash_collection_snapshot(p_to date) returns jsonb
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
 ) p on true where r.period_end<=p_to;
 return result;
end $$;
revoke all on function public.finance_cash_collection_snapshot(date) from public,anon;
grant execute on function public.finance_cash_collection_snapshot(date) to authenticated;
notify pgrst,'reload schema';
commit;
