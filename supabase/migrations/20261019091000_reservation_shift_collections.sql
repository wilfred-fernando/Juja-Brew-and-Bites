begin;

-- Serialize a fee collection with shift closure and refresh collection fields
-- server-side, so a stale POS cannot omit money already received.
create function public.capture_reservation_shift_collections() returns trigger
language plpgsql security definer set search_path=public as $$
declare since_at timestamptz; summary jsonb; previous jsonb; payments jsonb;
  cash_amount numeric:=0; total_amount numeric:=0; rows jsonb; entry record; previous_cash numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('reservation_shift:'||new.store_id::text,0));
  if new.mode not in ('close','end_day') then return new; end if;
  select created_at into since_at from public.cashier_pos
    where store_id::text=new.store_id::text and mode='open' and created_at<=new.created_at
      and (new.cashier_id is null or cashier_id=new.cashier_id)
    order by created_at desc limit 1;
  if since_at is null then return new; end if;
  summary:=coalesce(new.sales_summary,'{}'::jsonb);
  previous:=coalesce(summary->'reservationCollectionPayments','{}'::jsonb);
  previous_cash:=coalesce((summary->>'reservationCashCollected')::numeric,0);
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb),coalesce(sum(amount),0),coalesce(sum(amount) filter(where payment_method='Cash'),0)
    into rows,total_amount,cash_amount from public.booking_reservation_vouchers v
    where store_id=new.store_id::text and collected_at>=since_at and collected_at<=new.created_at;
  payments:=coalesce(summary->'payments','{}'::jsonb);
  for entry in select method,coalesce(sum(amount),0) amount from unnest(array['Cash','Card','QRPH']) method
    left join public.booking_reservation_vouchers v on v.payment_method=method and v.store_id=new.store_id::text
      and v.collected_at>=since_at and v.collected_at<=new.created_at group by method loop
    payments:=jsonb_set(payments,array[entry.method],to_jsonb(coalesce((payments->>entry.method)::numeric,0)
      -coalesce((previous->>entry.method)::numeric,case when entry.method='Cash' then previous_cash else 0 end)+entry.amount));
  end loop;
  new.sales_summary:=summary||jsonb_build_object('reservationFeeCollected',total_amount,'reservationCashCollected',cash_amount,
    'reservationCollections',rows,'reservationCollectionPayments',(select coalesce(jsonb_object_agg(payment_method,amount),'{}')
      from (select payment_method,sum(amount) amount from public.booking_reservation_vouchers
        where store_id=new.store_id::text and collected_at>=since_at and collected_at<=new.created_at group by payment_method) q),
    'cashPayments',coalesce((summary->>'cashPayments')::numeric,0)-previous_cash+cash_amount,
    'expectedCash',coalesce((summary->>'expectedCash')::numeric,0)-previous_cash+cash_amount,'payments',payments);
  return new;
end $$;
create trigger capture_reservation_shift_collections before insert on public.cashier_pos
for each row execute function public.capture_reservation_shift_collections();

-- Payment credit is an earlier collection, not a new Finance receivable.
create or replace function public.finance_non_cash_channel(p_name text) returns text
language sql immutable set search_path=pg_catalog as $$
 select case regexp_replace(lower(trim(p_name)),'[ _-]','','g')
 when 'cash' then null when 'nopaymentrequired' then null when 'waived' then null
 when 'reservationfeeapplied' then null
 when 'gcash' then 'GCash' when 'qrph' then 'QRPH' when 'grabpay' then 'GrabPay'
 when 'grabfood' then 'GrabFood' when 'shopeefood' then 'ShopeeFood'
 when 'panda' then 'Foodpanda' when 'foodpanda' then 'Foodpanda' when 'card' then 'Card'
 when 'grabdineout' then 'Grab Dine Out' else nullif(trim(p_name),'') end;
$$;

-- Keep the existing Finance close algorithm, with ledger collections included
-- in the same receipt window as ordinary payments. Abort on unexpected drift.
do $$
declare definition text; anchor text:='v_payments:=public.finance_non_cash_totals(v_rows);';
begin
  select pg_get_functiondef('public.finance_capture_closed_shift(jsonb,jsonb)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review the current Finance close function before installing reservation collections'; end if;
  definition:=replace(definition,anchor,$injection$
  v_rows:=v_rows || coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.code,'created_at',v.collected_at,'store_id',v.store_id,'total',v.amount,'net_amount',v.amount,
    'status','paid','payment_method',v.payment_method,
    'source_metadata',jsonb_build_object('payment_splits',jsonb_build_array(jsonb_build_object('method',v.payment_method,'amount',v.amount)))))
    from public.booking_reservation_vouchers v where v.store_id=v_store and v.collected_at>v_open and v.collected_at<=v_closed),'[]'::jsonb);
  v_payments:=public.finance_non_cash_totals(v_rows);
  $injection$);
  execute definition;
end $$;
notify pgrst,'reload schema';
commit;
