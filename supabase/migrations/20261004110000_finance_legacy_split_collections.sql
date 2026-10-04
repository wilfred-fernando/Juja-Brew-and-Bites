begin;
create function public.finance_collection_payment_entries(p_row jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare label text:=coalesce(p_row->>'payment_method',p_row->>'payment_type'); part text; matched text[]; result jsonb:='[]';
begin
 if jsonb_typeof(p_row->'source_metadata'->'payment_splits')='array' and jsonb_array_length(p_row->'source_metadata'->'payment_splits')>0 then return p_row->'source_metadata'->'payment_splits'; end if;
 if jsonb_typeof(p_row->'payment_splits')='array' and jsonb_array_length(p_row->'payment_splits')>0 then return p_row->'payment_splits'; end if;
 if label ~ '\s+\+\s+' then
  for part in select regexp_split_to_table(label,'\s+\+\s+') loop
   matched:=regexp_match(part,'^(.+?)\s+[₱P]?\s*([0-9,]+(?:\.[0-9]{1,2})?)$','i');
   if matched is null then raise exception 'Unrecognized split payment: %',label; end if;
   result:=result||jsonb_build_array(jsonb_build_object('method',trim(matched[1]),'amount',replace(matched[2],',','')::numeric));
  end loop;
  return result;
 end if;
 return jsonb_build_array(jsonb_build_object('method',label,'amount',coalesce(nullif(p_row->>'total','')::numeric,nullif(p_row->>'net_amount','')::numeric,0)));
end $$;
revoke all on function public.finance_collection_payment_entries(jsonb) from public,anon,authenticated;
create or replace function public.finance_non_cash_totals(p_orders jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 with receipts as (
  select r, coalesce(nullif(r->>'total','')::numeric,nullif(r->>'net_amount','')::numeric,0) total,
   coalesce(nullif(r->>'refund_amount','')::numeric,0) refund
  from jsonb_array_elements(p_orders) r
  where lower(coalesce(r->>'status','')) in ('paid','closed','completed','complete','delivered','ready','partially refunded','partially_refunded','partial_refund')
    and nullif(r->>'voided_at','') is null
 ), splits as (
  select r,total,refund,public.finance_collection_payment_entries(r) entries
  from receipts
 ), lines as (
  select public.finance_non_cash_channel(coalesce(e->>'method',e->>'payment_method',e->>'type',e->>'name')) channel,
   greatest(0,coalesce(nullif(e->>'amount','')::numeric,nullif(e->>'value','')::numeric,0)) amount,
   greatest(0,least(1,case when total>0 then (total-refund)/total else 0 end)) ratio
  from splits cross join lateral jsonb_array_elements(entries) e
 ), totals as (select channel,round(sum(amount*ratio),2) amount from lines where channel is not null group by channel)
 select coalesce(jsonb_object_agg(channel,amount) filter(where amount>0),'{}') from totals;
$$;

create or replace function public.finance_capture_closed_shift(p_shift jsonb,p_orders jsonb default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_id text:=p_shift->>'id'; v_store text:=p_shift->>'store_id'; v_closed timestamptz:=(p_shift->>'created_at')::timestamptz;
 v_open timestamptz; v_previous timestamptz; v_rows jsonb; v_payments jsonb; actor uuid; entry record;
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
 actor:=coalesce(nullif(p_shift->>'cashier_id','')::uuid,(select id from public.profiles where lower(role) in ('admin','super_admin') order by id limit 1));
 if actor is null then raise exception 'Finance attribution requires an administrator profile'; end if;
 insert into public.finance_cash_closed_shifts(id,store_id,opened_at,closed_at,business_date,mode,payments)
 values(v_id,v_store,v_open,v_closed,(v_closed at time zone 'Asia/Manila')::date,p_shift->>'mode',v_payments) on conflict(id) do update set payments=excluded.payments;
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
revoke all on function public.finance_capture_closed_shift(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_capture_closed_shift(jsonb,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
