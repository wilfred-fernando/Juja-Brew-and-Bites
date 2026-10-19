begin;

-- Reservation collections are liabilities, not a second merchandise sale.
-- Each collection belongs to the open shift that physically received it.
create table public.booking_reservation_vouchers (
  booking_id uuid primary key references public.function_room_bookings(id),
  code text not null unique default ('JUJA-RF-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash','Card','QRPH')),
  store_id text not null,
  cashier_id uuid not null references auth.users(id),
  shift_id text not null,
  collected_at timestamptz not null default now(),
  redeemed_order_id uuid unique references public.orders(id) deferrable initially deferred,
  redeemed_at timestamptz,
  check ((redeemed_order_id is null) = (redeemed_at is null))
);
alter table public.booking_reservation_vouchers enable row level security;
revoke all on public.booking_reservation_vouchers from anon, authenticated;
grant all on public.booking_reservation_vouchers to service_role;

create function public.booking_pos_actor(p_store_id text) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('admin','super_admin','cashier') then
    raise exception 'Staff login required';
  end if;
  if nullif(p_store_id,'') is null or
    (lower(actor.role)='cashier' and actor.store_id::text is distinct from p_store_id) then
    raise exception 'Wrong POS branch';
  end if;
  return actor.id;
end $$;
revoke all on function public.booking_pos_actor(text) from public,anon,authenticated;

create function public.list_pos_confirmed_bookings(p_store_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.booking_pos_actor(p_store_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'customer_name',b.customer_name,'business_date',b.business_date,
    'start_at',b.start_at,'end_at',b.end_at,'package_id',b.package_id,
    'deposit_amount',b.deposit_amount,'payment_status',b.payment_status,
    'payment_method',b.payment_method,'voucher',case when v.booking_id is null then null else
      jsonb_build_object('code',v.code,'amount',v.amount,'store_id',v.store_id,
        'redeemed_order_id',v.redeemed_order_id) end
    ) order by b.start_at)
    from public.function_room_bookings b
    left join public.booking_reservation_vouchers v on v.booking_id=b.id
    where b.status='confirmed' and (v.store_id is null or v.store_id=p_store_id)
      and v.redeemed_order_id is null
      and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id)), '[]'::jsonb);
end $$;

create function public.collect_booking_reservation_fee(p_booking_id uuid,p_store_id text,p_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid; booking public.function_room_bookings; voucher public.booking_reservation_vouchers;
  shift_row public.cashier_pos;
begin
  actor:=public.booking_pos_actor(p_store_id);
  perform pg_advisory_xact_lock(hashtextextended('reservation_shift:'||p_store_id,0));
  -- Same row lock is used by checkout and booking cancellation.
  select * into booking from public.function_room_bookings where id=p_booking_id for update;
  select * into voucher from public.booking_reservation_vouchers where booking_id=p_booking_id;
  if voucher.booking_id is not null then
    if voucher.store_id<>p_store_id then raise exception 'Fee was recorded in another branch'; end if;
    return to_jsonb(voucher); -- A retry never creates another collection.
  end if;
  if booking.id is null or booking.status<>'confirmed' then raise exception 'Select a confirmed booking'; end if;
  if p_method not in ('Cash','Card','QRPH') or coalesce(booking.payment_method,'')='Waived'
    or coalesce(booking.deposit_amount,0)<=0 or booking.deposit_amount::text='NaN' then
    raise exception 'A positive, non-waived reservation fee and payment method are required';
  end if;
  if exists(select 1 from public.booking_gc_batches where booking_id=p_booking_id) then
    raise exception 'Reservation fee already entered the cancellation e-GC process';
  end if;
  select * into shift_row from public.cashier_pos
    where store_id::text=p_store_id and (cashier_id=actor or mode='end_day')
    order by created_at desc limit 1 for update;
  if shift_row.id is null or shift_row.mode<>'open' or shift_row.cashier_id is distinct from actor then
    raise exception 'Open an online POS shift before recording the reservation fee';
  end if;
  update public.function_room_bookings set payment_method=p_method,payment_status='approved',updated_at=now()
    where id=p_booking_id;
  insert into public.booking_reservation_vouchers(booking_id,amount,payment_method,store_id,cashier_id,shift_id)
    values(p_booking_id,round(booking.deposit_amount,2),p_method,p_store_id,actor,shift_row.id::text)
    returning * into voucher;
  return to_jsonb(voucher);
end $$;

create function public.list_pos_reservation_collections(p_store_id text,p_from timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public.booking_pos_actor(p_store_id);
  if p_from is null then raise exception 'Shift start required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) || jsonb_build_object('customer_name',b.customer_name)
    order by v.collected_at) from public.booking_reservation_vouchers v
    join public.function_room_bookings b on b.id=v.booking_id
    where v.store_id=p_store_id and v.collected_at>=p_from and v.collected_at<=now()),'[]'::jsonb);
end $$;

-- Exactly one final settlement per booking, including bookings with a waived fee.
create table public.booking_pos_settlements (
  booking_id uuid primary key references public.function_room_bookings(id),
  order_id uuid not null unique references public.orders(id) deferrable initially deferred,
  checkout_key uuid not null unique,
  store_id text not null,
  cashier_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.booking_pos_settlements enable row level security;
revoke all on public.booking_pos_settlements from anon,authenticated;
grant all on public.booking_pos_settlements to service_role;

create function public.complete_pos_booking_sale(p_key uuid,p_booking_id uuid,p_order jsonb,p_items jsonb,p_voucher_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid; booking public.function_room_bookings; voucher public.booking_reservation_vouchers;
  draft public.orders; sale public.orders; settlement public.booking_pos_settlements;
  credit numeric:=0; paid numeric; credit_paid numeric; used integer; shift_row public.cashier_pos;
begin
  select * into draft from jsonb_populate_record(null::public.orders,p_order);
  actor:=public.booking_pos_actor(draft.store_id);
  perform pg_advisory_xact_lock(hashtextextended('reservation_shift:'||draft.store_id,0));
  if p_key is null then raise exception 'Checkout key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into booking from public.function_room_bookings where id=p_booking_id for update;
  select * into settlement from public.booking_pos_settlements where booking_id=p_booking_id;
  if settlement.booking_id is not null then
    if settlement.checkout_key<>p_key or settlement.cashier_id<>actor or settlement.store_id<>draft.store_id then
      raise exception 'Booking already has a final receipt';
    end if;
    select * into sale from public.orders where id=settlement.order_id;
    return jsonb_build_object('order',to_jsonb(sale),'replayed',true);
  end if;
  if booking.id is null or booking.status<>'confirmed' then raise exception 'Select a confirmed booking'; end if;
  if draft.source_web_order_id is not null then raise exception 'A web order cannot settle a booking'; end if;
  select * into shift_row from public.cashier_pos where store_id::text=draft.store_id
    and (cashier_id=actor or mode='end_day') order by created_at desc limit 1 for update;
  if shift_row.id is null or shift_row.mode<>'open' or shift_row.cashier_id is distinct from actor then
    raise exception 'Open an online POS shift before settling the booking';
  end if;
  select * into voucher from public.booking_reservation_vouchers where booking_id=p_booking_id for update;
  if voucher.booking_id is not null then
    if voucher.store_id<>draft.store_id or voucher.redeemed_order_id is not null then raise exception 'Reservation voucher is unavailable'; end if;
    credit:=voucher.amount;
  elsif coalesce(booking.deposit_amount,0)>0 and coalesce(booking.payment_method,'')<>'Waived' then
    raise exception 'Record the reservation fee collection before settling this booking';
  end if;
  if exists(select 1 from public.booking_gc_batches where booking_id=p_booking_id) then raise exception 'Booking fee is in cancellation processing'; end if;
  if draft.net_amount is null or draft.net_amount<credit or draft.net_amount::text in ('NaN','Infinity','-Infinity')
    or draft.total::numeric is distinct from draft.net_amount then raise exception 'Bill must cover the reservation voucher in full; no cash change for the voucher'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Sale items required'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(quantity numeric,net_amount numeric,gross_amount numeric,discount_amount numeric)
    where coalesce(quantity,0)<=0 or quantity::text in ('NaN','Infinity','-Infinity')
    or net_amount is null or net_amount<0 or net_amount::text in ('NaN','Infinity','-Infinity')
    or round(gross_amount-discount_amount,2) is distinct from round(net_amount,2)) then raise exception 'Invalid sale items'; end if;
  if round((select sum(i.net_amount) from jsonb_to_recordset(p_items) as i(net_amount numeric))
    -coalesce((draft.source_metadata->'order_discount'->>'amount')::numeric,0),2) is distinct from draft.net_amount
    or round(draft.gross_amount-draft.discount_amount,2) is distinct from draft.net_amount then raise exception 'Items do not match sale total'; end if;
  select coalesce(sum(amount),0),coalesce(sum(case when method='Reservation Fee Applied' then amount else 0 end),0)
    into paid,credit_paid from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric);
  if paid is distinct from draft.net_amount or credit_paid<>credit or
    exists(select 1 from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric)
      where amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity')
      or method is null or method not in ('Cash','Card','QRPH','Gcash','Reservation Fee Applied')) then
    raise exception 'Payment breakdown must cover the bill and match the reservation voucher';
  end if;
  if nullif(draft.source_metadata->>'open_ticket_id','') is not null then
    perform id from public.open_tickets where id=(draft.source_metadata->>'open_ticket_id')::uuid and store_id::text=draft.store_id
      and order_type='VIP Booking '||p_booking_id::text for update;
    if not found then raise exception 'Saved ticket is unavailable'; end if;
    if exists(select 1 from public.orders where source_metadata->>'open_ticket_id'=draft.source_metadata->>'open_ticket_id') then raise exception 'Saved ticket already charged'; end if;
  end if;
  if coalesce(draft.receipt_number,'')='' then raise exception 'Receipt required'; end if;
  draft.id:=gen_random_uuid();
  draft.cashier_id:=actor; draft.branch_id:=draft.store_id; draft.status:='paid'; draft.paid_at:=now();
  draft.customer_name:=booking.customer_name;
  draft.dining_option:='VIP Booking '||booking.id::text;
  draft.order_type:=draft.dining_option;
  draft.source_metadata:=coalesce(draft.source_metadata,'{}') || jsonb_build_object(
    'booking_id',booking.id,'reservation_credit',credit,'reservation_voucher_code',voucher.code,
    'reservation_remaining_collected',draft.net_amount-credit);
  insert into public.booking_pos_settlements(booking_id,order_id,checkout_key,store_id,cashier_id)
    values(booking.id,draft.id,p_key,draft.store_id,actor);
  if credit>0 then update public.booking_reservation_vouchers set redeemed_order_id=draft.id,redeemed_at=now() where booking_id=booking.id; end if;
  perform set_config('juja.booking_checkout_key',p_key::text,true);
  insert into public.orders(id,order_number,receipt_number,receipt_sequence,receipt_date,store_id,branch_id,customer_id,loyalty_member_id,customer_name,items,subtotal,total,discount,gross_amount,discount_amount,net_amount,order_type,cashier_id,paid_at,status,payment_method,source_metadata,dining_option)
  values(draft.id,draft.order_number,draft.receipt_number,draft.receipt_sequence,draft.receipt_date,draft.store_id,draft.branch_id,draft.customer_id,draft.loyalty_member_id,draft.customer_name,draft.items,draft.subtotal,draft.total,draft.discount,draft.gross_amount,draft.discount_amount,draft.net_amount,draft.order_type,draft.cashier_id,draft.paid_at,draft.status,draft.payment_method,draft.source_metadata,draft.dining_option) returning * into sale;
  insert into public.order_items(order_id,menu_item_id,name,category_name,quantity,unit_price,line_total,gross_amount,discount_amount,net_amount,source_metadata)
    select sale.id,i.menu_item_id,i.name,i.category_name,i.quantity,i.unit_price,i.line_total,i.gross_amount,i.discount_amount,i.net_amount,i.source_metadata from jsonb_populate_recordset(null::public.order_items,p_items) i;
  if coalesce(cardinality(p_voucher_ids),0)>0 then
    perform id from public.vouchers where id=any(p_voucher_ids) order by id for update;
    update public.vouchers set status='redeemed',redeemed_at=now() where id=any(p_voucher_ids)
      and coalesce(status,'active') in ('active','available') and redeemed_at is null and (expires_at is null or expires_at>now());
    get diagnostics used=row_count;
    if used<>cardinality(p_voucher_ids) then raise exception 'A loyalty voucher is no longer available'; end if;
  end if;
  if nullif(draft.source_metadata->>'discount_claim_key','') is not null then
    perform public.complete_pos_discount_claims((draft.source_metadata->>'discount_claim_key')::uuid,sale.id,sale.receipt_number);
  end if;
  return jsonb_build_object('order',to_jsonb(sale),'replayed',false);
end $$;

create function public.protect_booking_reservation_credit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='function_room_bookings' then
    if exists(select 1 from public.booking_pos_settlements where booking_id=old.id)
       and (new.status is distinct from old.status or new.deposit_amount is distinct from old.deposit_amount
         or new.payment_status is distinct from old.payment_status) then
      raise exception 'Booking already settled; reservation credit cannot be cancelled or issued again';
    end if;
    if exists(select 1 from public.booking_reservation_vouchers where booking_id=old.id)
      and (new.deposit_amount is distinct from old.deposit_amount or new.payment_method is distinct from old.payment_method) then
      raise exception 'Recorded reservation collections cannot be edited';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    if exists(select 1 from public.booking_pos_settlements where order_id=old.id) then raise exception 'Booking settlement cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.booking_pos_settlements where order_id=old.id) then
    if new.status is distinct from old.status or new.total is distinct from old.total or new.net_amount is distinct from old.net_amount
      or new.refunded_at is distinct from old.refunded_at or new.refund_amount is distinct from old.refund_amount
      or new.voided_at is distinct from old.voided_at or new.gross_amount is distinct from old.gross_amount
      or new.discount_amount is distinct from old.discount_amount or new.cashier_id is distinct from old.cashier_id
      or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount
      or new.paid_at is distinct from old.paid_at or new.receipt_number is distinct from old.receipt_number
      or new.payment_method is distinct from old.payment_method or new.store_id is distinct from old.store_id
      or new.source_metadata is distinct from old.source_metadata then
      raise exception 'Booking settlement requires a dedicated reversal; ordinary receipt corrections/refunds are unavailable';
    end if;
  end if;
  if new.source_metadata ? 'booking_id' or new.source_metadata ? 'reservation_credit'
    or coalesce(new.payment_method,'') ilike '%Reservation Fee Applied%'
    or new.source_metadata->'payment_splits' @> '[{"method":"Reservation Fee Applied"}]'::jsonb
    or coalesce(new.dining_option,'') ilike 'VIP Booking%' or coalesce(new.order_type,'') ilike 'VIP Booking%' then
    if not exists(select 1 from public.booking_pos_settlements s where s.order_id=new.id
      and s.booking_id::text=new.source_metadata->>'booking_id') then raise exception 'Use atomic VIP booking checkout'; end if;
  end if;
  return new;
end $$;
create trigger protect_booking_reservation_credit before insert or update or delete on public.orders
for each row execute function public.protect_booking_reservation_credit();
create trigger protect_settled_booking_fee before update on public.function_room_bookings
for each row execute function public.protect_booking_reservation_credit();

create function public.protect_booking_settlement_items() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if exists(select 1 from public.booking_pos_settlements s where s.order_id=new.order_id
      and s.checkout_key::text is distinct from current_setting('juja.booking_checkout_key',true)) then
      raise exception 'Use atomic VIP booking checkout for its items';
    end if;
    return new;
  end if;
  if exists(select 1 from public.booking_pos_settlements where order_id=old.order_id) then
    raise exception 'Booking settlement items require a dedicated reversal; ordinary refunds are unavailable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_booking_settlement_items before insert or update or delete on public.order_items
for each row execute function public.protect_booking_settlement_items();

revoke all on function public.list_pos_confirmed_bookings(text),public.collect_booking_reservation_fee(uuid,text,text),
  public.list_pos_reservation_collections(text,timestamptz),public.complete_pos_booking_sale(uuid,uuid,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.list_pos_confirmed_bookings(text),public.collect_booking_reservation_fee(uuid,text,text),
  public.list_pos_reservation_collections(text,timestamptz),public.complete_pos_booking_sale(uuid,uuid,jsonb,jsonb,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
