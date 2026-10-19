begin;
alter table public.booking_reservation_vouchers add column collection_order_id uuid unique
  references public.orders(id) deferrable initially deferred;

-- The approved fee is a normal POS receipt. The final receipt recognizes only
-- the remaining amount, while preserving the full bill and prepaid credit.
create function public.ensure_booking_reservation_receipt(p_booking_id uuid,p_store_id text default null,p_cashier_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.function_room_bookings; v public.booking_reservation_vouchers;
  shift_row public.cashier_pos; receipt record; order_uuid uuid; branch text; method text;
  line jsonb; received_at timestamptz;
begin
  select * into b from public.function_room_bookings where id=p_booking_id for update;
  select * into v from public.booking_reservation_vouchers where booking_id=p_booking_id for update;
  if v.collection_order_id is not null then return to_jsonb(v); end if;
  if b.id is null or b.status<>'confirmed' or b.payment_status<>'approved' then
    raise exception 'Confirm and approve the booking payment before creating its receipt';
  end if;
  if coalesce(b.deposit_amount,0)<=0 or b.payment_method='Waived' then return null; end if;
  method:=b.payment_method;
  if method not in ('Cash','Card','QRPH') or method is null then raise exception 'Select Cash, Card or QRPH for the approved reservation fee'; end if;
  if exists(select 1 from public.booking_gc_batches where booking_id=b.id)
    or exists(select 1 from public.booking_pos_settlements where booking_id=b.id) then raise exception 'Booking fee already cancelled or settled'; end if;
  branch:=coalesce(v.store_id,p_store_id,nullif(current_setting('juja.reservation_store_id',true),''));
  if branch is null then
    select p.store_id::text into branch from public.profiles p
      where p.id=auth.uid() and lower(p.role)='cashier';
  end if;
  if branch is null then
    select id::text into branch from public.stores
      where coalesce(store_name,name,'') ilike '%Pasong Tamo%' order by id limit 1;
  end if;
  if branch is null then raise exception 'Function-room branch could not be resolved'; end if;
  if p_cashier_id is null then
    select id into p_cashier_id from public.profiles where id=auth.uid() and lower(role)='cashier';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reservation_shift:'||branch,0));
  select s.* into shift_row from public.cashier_pos s where s.store_id::text=branch and s.mode='open'
    and s.cashier_id is not null and (p_cashier_id is null or s.cashier_id=p_cashier_id)
    and not exists(select 1 from public.cashier_pos later where later.store_id=s.store_id and later.created_at>s.created_at
      and (later.mode='end_day' or (later.cashier_id=s.cashier_id and later.mode in ('open','close'))))
    order by s.created_at desc limit 1 for update;
  if shift_row.id is null then raise exception 'Open an online shift in the booking branch before approving its reservation payment'; end if;
  if v.booking_id is not null and (v.shift_id<>shift_row.id::text or v.redeemed_order_id is not null) then
    raise exception 'This earlier reservation collection requires historical receipt reconciliation';
  end if;
  order_uuid:=gen_random_uuid();
  received_at:=coalesce(v.collected_at,now());
  if v.booking_id is null then
    insert into public.booking_reservation_vouchers(booking_id,amount,payment_method,store_id,cashier_id,shift_id,collected_at,collection_order_id)
      values(b.id,round(b.deposit_amount,2),method,branch,shift_row.cashier_id,shift_row.id::text,received_at,order_uuid) returning * into v;
  else
    update public.booking_reservation_vouchers set collection_order_id=order_uuid where booking_id=b.id returning * into v;
  end if;
  select * into receipt from public.generate_receipt_number(branch::uuid);
  line:=jsonb_build_object('name','Function Room Reservation Fee','quantity',1,'unitPrice',v.amount,'price',v.amount,
    'category','Reservations','categoryName','Reservations','instructions','Booking '||coalesce(b.reference_code,b.id::text));
  insert into public.orders(id,order_number,receipt_number,receipt_sequence,receipt_date,store_id,branch_id,customer_name,
    items,subtotal,total,discount,gross_amount,discount_amount,net_amount,order_type,dining_option,cashier_id,paid_at,created_at,
    status,payment_method,inventory_deducted,source_metadata)
  values(order_uuid,receipt.receipt_number,receipt.receipt_number,receipt.receipt_sequence,receipt.receipt_date,branch,branch,b.customer_name,
    jsonb_build_array(line),v.amount,v.amount::text,'0',v.amount,0,v.amount,'Reservation Fee','Reservation Fee',shift_row.cashier_id,
    received_at,received_at,'paid',method,true,jsonb_build_object('transaction_kind','booking_reservation_fee',
      'reservation_fee_booking_id',b.id,'reservation_voucher_code',v.code,'shift_id',v.shift_id,
      'payment_splits',jsonb_build_array(jsonb_build_object('method',method,'amount',v.amount)),
      'payment_label',method,'exclude_loyalty',true));
  insert into public.order_items(order_id,name,category_name,quantity,unit_price,line_total,gross_amount,discount_amount,net_amount,source_metadata)
    values(order_uuid,'Function Room Reservation Fee','Reservations',1,v.amount,v.amount,v.amount,0,v.amount,
      jsonb_build_object('reservation_fee_booking_id',b.id));
  return to_jsonb(v)||jsonb_build_object('receipt_number',receipt.receipt_number);
end $$;
revoke all on function public.ensure_booking_reservation_receipt(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.ensure_booking_reservation_receipt(uuid,text,uuid) to service_role;

create function public.receipt_approved_booking_fee() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='confirmed' and new.payment_status='approved' and coalesce(new.deposit_amount,0)>0
    and coalesce(new.payment_method,'')<>'Waived' then
    if tg_op='INSERT' then perform public.ensure_booking_reservation_receipt(new.id);
    elsif old.status is distinct from 'confirmed' or old.payment_status is distinct from 'approved' then
      perform public.ensure_booking_reservation_receipt(new.id);
    end if;
  end if;
  return new;
end $$;
create trigger receipt_approved_booking_fee after insert or update of status,payment_status on public.function_room_bookings
for each row execute function public.receipt_approved_booking_fee();

create or replace function public.collect_booking_reservation_fee(p_booking_id uuid,p_store_id text,p_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.function_room_bookings; v public.booking_reservation_vouchers;
begin
  actor:=public.booking_pos_actor(p_store_id);
  select * into b from public.function_room_bookings where id=p_booking_id for update;
  select * into v from public.booking_reservation_vouchers where booking_id=p_booking_id;
  if v.booking_id is not null and v.store_id<>p_store_id then raise exception 'Fee was recorded in another branch'; end if;
  if v.collection_order_id is not null then return to_jsonb(v); end if;
  if b.id is null or b.status<>'confirmed' then raise exception 'Select a confirmed booking'; end if;
  if p_method not in ('Cash','Card','QRPH') or p_method is null or b.payment_method='Waived' or coalesce(b.deposit_amount,0)<=0 then
    raise exception 'A positive non-waived reservation fee and payment method are required';
  end if;
  perform set_config('juja.reservation_store_id',p_store_id,true);
  update public.function_room_bookings set payment_status='approved',payment_method=p_method,updated_at=now() where id=b.id;
  return public.ensure_booking_reservation_receipt(b.id,p_store_id,null);
end $$;

-- Keep validation and idempotency in the existing atomic checkout. After the
-- full bill is validated, recognize only the amount not already receipted.
do $$
declare definition text; anchor text:='insert into public.booking_pos_settlements(booking_id,order_id,checkout_key,store_id,cashier_id)';
begin
  select pg_get_functiondef('public.complete_pos_booking_sale(uuid,uuid,jsonb,jsonb,uuid[])'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review booking checkout before applying fee receipts'; end if;
  definition:=replace(definition,anchor,$injection$
  if voucher.collection_order_id is not null and credit>0 then
    draft.source_metadata:=draft.source_metadata||jsonb_build_object(
      'reservation_collection_order_id',voucher.collection_order_id,'reservation_bill_total',draft.net_amount,
      'reservation_bill_subtotal',draft.gross_amount,'reservation_bill_payments',draft.source_metadata->'payment_splits',
      'reservation_recognized_credit',credit);
    draft.net_amount:=draft.net_amount-credit;
    draft.total:=draft.net_amount::text;
    draft.gross_amount:=draft.gross_amount-credit;
    draft.subtotal:=draft.gross_amount;
    draft.source_metadata:=jsonb_set(draft.source_metadata,'{payment_splits}',
      coalesce((select jsonb_agg(p) from jsonb_array_elements(draft.source_metadata->'payment_splits') p
        where p->>'method'<>'Reservation Fee Applied'),'[]'::jsonb));
    select case when count(*)=0 then 'Reservation Fee Applied' when count(*)=1 then min(p->>'method')
      else string_agg((p->>'method')||' '||(p->>'amount'),' + ') end into draft.payment_method
      from jsonb_array_elements(draft.source_metadata->'payment_splits') p;
    draft.source_metadata:=jsonb_set(draft.source_metadata,'{payment_label}',to_jsonb(draft.payment_method));
    with ordered as (select item,ord,(item->>'net_amount')::numeric net,
      sum((item->>'net_amount')::numeric) over(order by ord) cumulative,
      sum((item->>'net_amount')::numeric) over() total
      from jsonb_array_elements(p_items) with ordinality x(item,ord)), allocated as (
      select *,round(credit*cumulative/total,2)-round(credit*(cumulative-net)/total,2) applied from ordered)
    select jsonb_agg(item||jsonb_build_object('gross_amount',(item->>'gross_amount')::numeric-applied,
      'net_amount',net-applied,'line_total',net-applied,'source_metadata',coalesce(item->'source_metadata','{}')||
        jsonb_build_object('reservation_recognized_credit',applied,'reservation_original_line_net',net)) order by ord)
      into p_items from allocated;
  end if;
  insert into public.booking_pos_settlements(booking_id,order_id,checkout_key,store_id,cashier_id)
  $injection$);
  -- All booking operations lock the booking before the branch shift lock.
  definition:=replace(definition,'perform pg_advisory_xact_lock(hashtextextended(''reservation_shift:''||draft.store_id,0));','');
  definition:=replace(definition,'select * into booking from public.function_room_bookings where id=p_booking_id for update;',
    'select * into booking from public.function_room_bookings where id=p_booking_id for update; perform pg_advisory_xact_lock(hashtextextended(''reservation_shift:''||draft.store_id,0));');
  execute definition;
end $$;

-- Cancellation certificates from an already-receipted fee carry the same
-- prepaid sales value; redeeming them must not recognize that value twice.
create function public.recognize_reservation_gc_credit(p_order jsonb,p_items jsonb,p_credit numeric) returns jsonb
language plpgsql immutable set search_path=public as $$
declare draft public.orders; label text;
begin
  select * into draft from jsonb_populate_record(null::public.orders,p_order);
  draft.source_metadata:=coalesce(draft.source_metadata,'{}')||jsonb_build_object(
    'reservation_bill_total',draft.net_amount,'reservation_bill_subtotal',draft.gross_amount,
    'reservation_bill_payments',draft.source_metadata->'payment_splits','reservation_recognized_credit',p_credit);
  draft.net_amount:=draft.net_amount-p_credit; draft.total:=draft.net_amount::text;
  draft.gross_amount:=draft.gross_amount-p_credit; draft.subtotal:=draft.gross_amount;
  draft.source_metadata:=jsonb_set(draft.source_metadata,'{payment_splits}',coalesce((
    select jsonb_agg(jsonb_build_object('method',method,'amount',amount-case when method='JUJA e-GC' then p_credit else 0 end))
    from (select p->>'method' method,sum((p->>'amount')::numeric) amount
      from jsonb_array_elements(draft.source_metadata->'payment_splits') p group by p->>'method') grouped
    where amount-case when method='JUJA e-GC' then p_credit else 0 end>0),'[]'::jsonb));
  select case when count(*)=0 then 'JUJA e-GC' when count(*)=1 then min(p->>'method')
    else string_agg((p->>'method')||' '||(p->>'amount'),' + ') end into label
    from jsonb_array_elements(draft.source_metadata->'payment_splits') p;
  draft.payment_method:=label; draft.source_metadata:=jsonb_set(draft.source_metadata,'{payment_label}',to_jsonb(label));
  with ordered as (select item,ord,(item->>'net_amount')::numeric net,
    sum((item->>'net_amount')::numeric) over(order by ord) cumulative,sum((item->>'net_amount')::numeric) over() total
    from jsonb_array_elements(p_items) with ordinality x(item,ord)), allocated as (
    select *,round(p_credit*cumulative/total,2)-round(p_credit*(cumulative-net)/total,2) applied from ordered)
  select jsonb_agg(item||jsonb_build_object('gross_amount',(item->>'gross_amount')::numeric-applied,
    'net_amount',net-applied,'line_total',net-applied,'source_metadata',coalesce(item->'source_metadata','{}')||
      jsonb_build_object('reservation_recognized_credit',applied,'reservation_original_line_net',net)) order by ord) into p_items from allocated;
  return jsonb_build_object('order',to_jsonb(draft),'items',p_items);
end $$;
revoke all on function public.recognize_reservation_gc_credit(jsonb,jsonb,numeric) from public,anon,authenticated;

do $$
declare definition text; anchor text:='draft.cashier_id:=actor.id;';
begin
  select pg_get_functiondef('public.complete_pos_gc_sale(uuid,jsonb,jsonb,text[],uuid[])'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review cancellation certificate checkout before fee receipt recognition'; end if;
  definition:=replace(definition,'gc_total numeric:=0;','recognized_credit numeric; credit_result jsonb; gc_total numeric:=0;');
  execute replace(definition,anchor,$injection$
  select coalesce(sum(c.amount),0) into recognized_credit from public.booking_gc_certificates c
    join public.booking_gc_batches b on b.id=c.batch_id join public.booking_reservation_vouchers v on v.booking_id=b.booking_id
    where v.collection_order_id is not null and c.code=any(p_codes);
  if recognized_credit>0 then
    credit_result:=public.recognize_reservation_gc_credit(to_jsonb(draft),p_items,recognized_credit);
    select * into draft from jsonb_populate_record(null::public.orders,credit_result->'order');
    p_items:=credit_result->'items';
  end if;
  draft.cashier_id:=actor.id;
  $injection$);
end $$;

do $$
declare definition text; anchor text:='if redeemed=0 and sale.pos_gc_checkout_key is null';
begin
  select pg_get_functiondef('public.enforce_pos_gc_payment_ledger()'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review e-GC redemption ledger validation before fee receipts'; end if;
  execute replace(definition,anchor,$injection$
  if sale.pos_gc_checkout_key is not null and coalesce((sale.source_metadata->>'reservation_recognized_credit')::numeric,0)>0 then
    if (sale.source_metadata->>'reservation_recognized_credit')::numeric<>(
      select coalesce(sum(r.amount),0) from public.booking_gc_redemptions r
      join public.booking_gc_certificates c on c.id=r.certificate_id join public.booking_gc_batches b on b.id=c.batch_id
      join public.booking_reservation_vouchers v on v.booking_id=b.booking_id
      where r.order_id=sale.id and v.collection_order_id is not null) then
      raise exception 'Prepaid receipt credit does not match redeemed reservation certificates';
    end if;
    splits:=sale.source_metadata->'reservation_bill_payments';
  end if;
  if redeemed=0 and sale.pos_gc_checkout_key is null
  $injection$);
end $$;

-- The normal receipt now supplies collections. Only legacy unreceipted ledger
-- entries remain an extra input to Finance and POS cash totals.
do $$
declare definition text; anchor text:='from public.booking_reservation_vouchers v where v.store_id=v_store and v.collected_at>v_open';
begin
  select pg_get_functiondef('public.finance_capture_closed_shift(jsonb,jsonb)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review Finance reservation receipt integration'; end if;
  execute replace(definition,anchor,'from public.booking_reservation_vouchers v where v.collection_order_id is null and v.store_id=v_store and v.collected_at>v_open');
end $$;

create function public.protect_reservation_collection_receipt() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.source_metadata->>'transaction_kind'='booking_reservation_fee' and not exists(
      select 1 from public.booking_reservation_vouchers v where v.collection_order_id=new.id
        and v.booking_id::text=new.source_metadata->>'reservation_fee_booking_id') then raise exception 'Use approved booking fee receipt creation'; end if;
    return new;
  end if;
  if exists(select 1 from public.booking_reservation_vouchers where collection_order_id=old.id)
    or coalesce((old.source_metadata->>'reservation_recognized_credit')::numeric,0)>0 then
    raise exception 'Reservation fee receipts use the booking cancellation process; ordinary refunds or edits are unavailable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_reservation_collection_receipt before insert or update or delete on public.orders
for each row execute function public.protect_reservation_collection_receipt();
create or replace function public.capture_reservation_shift_collections() returns trigger
language plpgsql security definer set search_path=public as $$
declare since_at timestamptz; summary jsonb; previous jsonb; payments jsonb;
  cash_amount numeric:=0; total_amount numeric:=0; rows jsonb; entry record; previous_cash numeric; cash_adjustment numeric;
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
  previous_cash:=coalesce((summary->>'reservationCashAdjustment')::numeric,(summary->>'reservationCashCollected')::numeric,0);
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb),coalesce(sum(amount),0),coalesce(sum(amount) filter(where payment_method='Cash'),0)
    into rows,total_amount,cash_amount from public.booking_reservation_vouchers v
    where store_id=new.store_id::text and collected_at>=since_at and collected_at<=new.created_at;
  select coalesce(sum(amount),0) into cash_adjustment from public.booking_reservation_vouchers
    where store_id=new.store_id::text and collected_at>=since_at and collected_at<=new.created_at
      and payment_method='Cash' and collection_order_id is null;
  payments:=coalesce(summary->'payments','{}'::jsonb);
  for entry in select method,coalesce(sum(amount),0) amount from unnest(array['Cash','Card','QRPH']) method
    left join public.booking_reservation_vouchers v on v.payment_method=method and v.store_id=new.store_id::text
      and v.collected_at>=since_at and v.collected_at<=new.created_at and v.collection_order_id is null group by method loop
    payments:=jsonb_set(payments,array[entry.method],to_jsonb(coalesce((payments->>entry.method)::numeric,0)
      -coalesce((previous->>entry.method)::numeric,case when entry.method='Cash' then previous_cash else 0 end)+entry.amount));
  end loop;
  new.sales_summary:=summary||jsonb_build_object('reservationFeeCollected',total_amount,'reservationCashCollected',cash_amount,
    'reservationCollections',rows,'reservationCashAdjustment',cash_adjustment,'reservationCollectionPayments',(select coalesce(jsonb_object_agg(payment_method,amount),'{}')
      from (select payment_method,sum(amount) amount from public.booking_reservation_vouchers
        where store_id=new.store_id::text and collected_at>=since_at and collected_at<=new.created_at and collection_order_id is null group by payment_method) q),
    'cashPayments',coalesce((summary->>'cashPayments')::numeric,0)-previous_cash+cash_adjustment,
    'expectedCash',coalesce((summary->>'expectedCash')::numeric,0)-previous_cash+cash_adjustment,'payments',payments);
  return new;
end $$;

-- Include normal receipt references in the selector's private voucher details.
do $$ declare definition text; begin
  select pg_get_functiondef('public.list_pos_confirmed_bookings(text)'::regprocedure) into definition;
  execute replace(definition,'''redeemed_order_id'',v.redeemed_order_id','''collection_order_id'',v.collection_order_id,''collection_receipt_number'',(select o.receipt_number from public.orders o where o.id=v.collection_order_id),''redeemed_order_id'',v.redeemed_order_id');
end $$;
notify pgrst,'reload schema';
commit;
