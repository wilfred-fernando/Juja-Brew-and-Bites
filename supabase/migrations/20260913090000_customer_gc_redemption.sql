-- Share a single redemption ledger across customer checkout and POS.
alter table public.web_orders add column if not exists source_metadata jsonb not null default '{}';
alter table public.web_orders add column gc_codes text[] not null default '{}';
alter table public.web_orders add column gc_amount numeric(12,2) not null default 0 check(gc_amount>=0);
alter table public.web_orders add column gc_remainder_method text;
alter table public.web_orders add column gc_released_at timestamptz;
alter table public.booking_gc_redemptions alter column order_id drop not null;
alter table public.booking_gc_redemptions alter column receipt_number drop not null;
alter table public.booking_gc_redemptions alter column cashier_id drop not null;
alter table public.booking_gc_redemptions add column web_order_id uuid references public.web_orders(id);
alter table public.booking_gc_redemptions add constraint gc_redemption_has_order check(order_id is not null or web_order_id is not null);
create index gc_redemptions_web_order on public.booking_gc_redemptions(web_order_id);
create table public.web_gc_release_events (
 id uuid primary key default gen_random_uuid(), web_order_id uuid not null references public.web_orders(id),
 certificate_id uuid not null references public.booking_gc_certificates(id), amount numeric not null,
 actor_id uuid, reason text not null, released_at timestamptz not null default now(),
 unique(web_order_id,certificate_id)
);
alter table public.web_gc_release_events enable row level security;
revoke all on public.web_gc_release_events from public,anon,authenticated;
grant all on public.web_gc_release_events to service_role;

create function public.validate_customer_gc(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cert public.booking_gc_certificates; expiry timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in to redeem e-GCs'; end if;
 select c.* into cert from public.booking_gc_certificates c join public.booking_gc_batches b on b.id=c.batch_id
 where c.code=upper(trim(p_code)) and c.status='active' and c.redeemed_at is null and b.status='approved' and b.expires_at>statement_timestamp();
 if cert.id is null then raise exception 'Code is invalid, awaiting approval, expired, or already used'; end if;
 select expires_at into expiry from public.booking_gc_batches where id=cert.batch_id;
 return jsonb_build_object('code',cert.code,'amount',cert.amount,'expires_at',expiry);
end;
$$;
revoke all on function public.validate_customer_gc(text) from public,anon;
grant execute on function public.validate_customer_gc(text) to authenticated;

create function public.submit_customer_gc_order(p_order jsonb,p_codes text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare draft public.web_orders; sale public.web_orders; cert public.booking_gc_certificates; gc_total numeric:=0; remainder numeric;
begin
 if auth.uid() is null then raise exception 'Sign in to redeem e-GCs'; end if;
 select * into draft from jsonb_populate_record(null::public.web_orders,p_order);
 if nullif(draft.client_idempotency_key,'') is null then raise exception 'Checkout reference required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(draft.client_idempotency_key,0));
 select * into sale from public.web_orders where client_idempotency_key=draft.client_idempotency_key;
 if sale.id is not null then
  if sale.user_id is distinct from auth.uid() then raise exception 'Checkout belongs to another customer'; end if;
  return jsonb_build_object('row',to_jsonb(sale),'created',false);
 end if;
 if coalesce(cardinality(p_codes),0) not between 1 and 100 then raise exception 'Choose 1 to 100 certificates'; end if;
 select array_agg(upper(trim(c)) order by upper(trim(c))) into p_codes from unnest(p_codes)c;
 if (select count(distinct c) from unnest(p_codes)c)<>cardinality(p_codes) then raise exception 'Duplicate certificate codes'; end if;
 if draft.total is null or draft.total<=0 or draft.total::text in ('NaN','Infinity','-Infinity') or draft.subtotal is null or draft.subtotal<0
  or coalesce(draft.delivery_fee,0)<0 or draft.total<>round(draft.subtotal+coalesce(draft.delivery_fee,0),2)
  or jsonb_typeof(draft.items) is distinct from 'array' or jsonb_array_length(draft.items)=0 then raise exception 'Invalid order total or items'; end if;
 if exists(select 1 from jsonb_array_elements(draft.items)i where coalesce((i->>'quantity')::numeric,(i->>'qty')::numeric,0)<=0
  or coalesce((i->>'unitPrice')::numeric,(i->>'price')::numeric,0)<0) then raise exception 'Invalid item quantity or price'; end if;
 if draft.subtotal is distinct from round((select sum(greatest(0,coalesce((i->>'unitPrice')::numeric,(i->>'price')::numeric,0)*coalesce((i->>'quantity')::numeric,(i->>'qty')::numeric,0)
  -greatest(0,coalesce((i->>'discountAmount')::numeric,(i->>'discount_amount')::numeric,0)))) from jsonb_array_elements(draft.items)i),2) then raise exception 'Items do not match the subtotal'; end if;
 if draft.store_id is null then raise exception 'Select a branch'; end if;
 for cert in select * from public.booking_gc_certificates where code=any(p_codes) order by id for update loop
  if cert.status<>'active' or cert.redeemed_at is not null or not exists(select 1 from public.booking_gc_batches where id=cert.batch_id and status='approved' and expires_at>statement_timestamp()) then raise exception 'An e-GC is expired or already used'; end if;
  gc_total:=gc_total+cert.amount;
 end loop;
 if gc_total<>cardinality(p_codes)*100 then raise exception 'An e-GC was not found'; end if;
 if gc_total>draft.subtotal then raise exception 'e-GC value cannot exceed the item subtotal; delivery is paid separately'; end if;
 remainder:=draft.total-gc_total;
 if remainder>0 and (coalesce(draft.payment_method,'') not in ('Cash','QRPH') or (draft.fulfillment_type='DELIVERY' and draft.payment_method<>'QRPH')) then raise exception 'Select a valid payment method for the remaining balance'; end if;
 if remainder>0 and draft.payment_method='QRPH' and nullif(draft.payment_proof_url,'') is null then raise exception 'QRPH payment proof required for the remaining balance'; end if;
 draft.delivery_service_level:='regular'; draft.delivery_priority_fee:=0;
 draft.id:=gen_random_uuid(); draft.user_id:=auth.uid(); draft.branch_id:=draft.store_id::text;
 draft.status:=case when draft.scheduled_for>now() then 'scheduled' else 'pending' end; draft.order_status:=draft.status;
 draft.gc_codes:=p_codes; draft.gc_amount:=gc_total; draft.gc_remainder_method:=case when remainder>0 then draft.payment_method else null end;
 draft.payment_status:=case when remainder=0 then 'approved' when draft.payment_method='QRPH' then 'submitted' else 'pending' end;
 draft.source_metadata:=jsonb_build_object('payment_splits',jsonb_build_array(jsonb_build_object('method','JUJA e-GC','amount',gc_total)) || case when remainder>0 then jsonb_build_array(jsonb_build_object('method',draft.payment_method,'amount',remainder)) else '[]'::jsonb end);
 draft.payment_method:=case when remainder=0 then 'JUJA e-GC' else draft.payment_method end;
 insert into public.web_orders(id,user_id,customer_name,branch_id,store_id,order_source,order_status,items,subtotal,total,status,dining_option,fulfillment_type,fulfillment_time,scheduled_for,schedule_label,delivery_address,delivery_latitude,delivery_longitude,delivery_provider,delivery_status,delivery_service_level,delivery_priority_fee,delivery_fee,delivery_currency,delivery_quote_id,delivery_distance_meters,delivery_quoted_at,customer_contact,payment_method,payment_status,payment_proof_url,client_idempotency_key,gc_codes,gc_amount,gc_remainder_method,source_metadata)
 values(draft.id,draft.user_id,draft.customer_name,draft.branch_id,draft.store_id,'web',draft.order_status,draft.items,draft.subtotal,draft.total,draft.status,draft.dining_option,draft.fulfillment_type,draft.fulfillment_time,draft.scheduled_for,draft.schedule_label,draft.delivery_address,draft.delivery_latitude,draft.delivery_longitude,draft.delivery_provider,draft.delivery_status,draft.delivery_service_level,draft.delivery_priority_fee,draft.delivery_fee,draft.delivery_currency,draft.delivery_quote_id,draft.delivery_distance_meters,draft.delivery_quoted_at,draft.customer_contact,draft.payment_method,draft.payment_status,draft.payment_proof_url,draft.client_idempotency_key,draft.gc_codes,draft.gc_amount,draft.gc_remainder_method,draft.source_metadata) returning * into sale;
 insert into public.booking_gc_redemptions(certificate_id,web_order_id,store_id,amount)
 select id,sale.id,sale.store_id::text,amount from public.booking_gc_certificates where code=any(p_codes);
 update public.booking_gc_certificates set status='redeemed',redeemed_at=now() where code=any(p_codes);
 return jsonb_build_object('row',to_jsonb(sale),'created',true);
end;
$$;
revoke all on function public.submit_customer_gc_order(jsonb,text[]) from public,anon;
grant execute on function public.submit_customer_gc_order(jsonb,text[]) to authenticated;

create function public.release_cancelled_web_gcs() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.gc_codes is distinct from old.gc_codes or new.gc_amount is distinct from old.gc_amount or new.gc_remainder_method is distinct from old.gc_remainder_method
  or new.gc_released_at is distinct from old.gc_released_at then raise exception 'e-GC payment details cannot be changed directly'; end if;
 if old.gc_amount>0 and not exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin','cashier'))
  and (new.payment_status is distinct from old.payment_status or new.payment_method is distinct from old.payment_method
    or new.total is distinct from old.total or new.subtotal is distinct from old.subtotal or new.items is distinct from old.items
    or new.user_id is distinct from old.user_id or new.store_id is distinct from old.store_id or new.payment_proof_url is distinct from old.payment_proof_url
    or new.source_metadata is distinct from old.source_metadata) then raise exception 'e-GC order payment and items cannot be changed after submission'; end if;
 if old.gc_released_at is not null and new.status not in ('cancelled','canceled','rejected') then raise exception 'A cancelled e-GC order cannot be reopened'; end if;
 if old.gc_amount>0 and old.gc_released_at is null and new.status in ('cancelled','canceled','rejected') then
  if old.status in ('paid','completed','delivered','closed') then raise exception 'A completed order requires the refund workflow'; end if;
  if exists(select 1 from public.orders where source_web_order_id=old.id) then raise exception 'This order is already charged; use the refund workflow'; end if;
  perform c.id from public.booking_gc_certificates c join public.booking_gc_redemptions r on r.certificate_id=c.id where r.web_order_id=old.id order by c.id for update of c;
  insert into public.web_gc_release_events(web_order_id,certificate_id,amount,actor_id,reason)
   select old.id,certificate_id,amount,auth.uid(),new.status from public.booking_gc_redemptions where web_order_id=old.id and order_id is null;
  update public.booking_gc_certificates set status='active',redeemed_at=null
   where id in(select certificate_id from public.booking_gc_redemptions where web_order_id=old.id and order_id is null);
  delete from public.booking_gc_redemptions where web_order_id=old.id and order_id is null;
  new.gc_released_at:=now();
 end if;
 return new;
end;
$$;
create trigger release_cancelled_web_gcs before update on public.web_orders for each row execute function public.release_cancelled_web_gcs();

create function public.enforce_web_gc_ledger() returns trigger
language plpgsql security definer set search_path=public as $$
declare w public.web_orders; applied numeric; released numeric; tender numeric;
begin
 select * into w from public.web_orders where id=new.id;
 select coalesce(sum(amount),0) into applied from public.booking_gc_redemptions where web_order_id=w.id;
 select coalesce(sum(amount),0) into released from public.web_gc_release_events where web_order_id=w.id;
 select coalesce(sum((p->>'amount')::numeric),0) into tender from jsonb_array_elements(case when jsonb_typeof(w.source_metadata->'payment_splits')='array' then w.source_metadata->'payment_splits' else '[]'::jsonb end)p where p->>'method'='JUJA e-GC';
 if tender<>w.gc_amount then raise exception 'e-GC tender must match its redemption ledger'; end if;
 if w.gc_amount=0 and cardinality(w.gc_codes)=0 and applied=0 and released=0 and coalesce(w.payment_method,'') not like '%JUJA e-GC%' then return null; end if;
 if w.gc_amount<=0 or w.gc_amount> w.total or cardinality(w.gc_codes)*100<>w.gc_amount then raise exception 'Invalid e-GC order payment'; end if;
 if w.gc_released_at is not null then
  if released<>w.gc_amount or applied<>0 or w.status not in ('cancelled','canceled','rejected') then raise exception 'Invalid e-GC release'; end if;
 elsif applied<>w.gc_amount or exists(select 1 from public.booking_gc_redemptions r join public.booking_gc_certificates c on c.id=r.certificate_id
  where r.web_order_id=w.id and (r.store_id is distinct from w.store_id::text or not(c.code=any(w.gc_codes)))) then raise exception 'e-GC orders require a matching redemption ledger'; end if;
 return null;
end;
$$;
create constraint trigger enforce_web_gc_ledger after insert or update on public.web_orders deferrable initially deferred for each row execute function public.enforce_web_gc_ledger();

create or replace function public.complete_pos_gc_sale(p_key uuid,p_order jsonb,p_items jsonb,p_codes text[],p_voucher_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 actor public.profiles; draft public.orders; sale public.orders; cert public.booking_gc_certificates;
 gc_total numeric:=0; paid_total numeric; gc_paid numeric; code_count integer; voucher_count integer;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin') then raise exception 'POS access required'; end if;
 if p_key is null then raise exception 'Checkout key required'; end if;
 select * into draft from jsonb_populate_record(null::public.orders,p_order);
 if coalesce(draft.store_id,'')='' or (lower(actor.role)='cashier' and actor.store_id::text is distinct from draft.store_id) then raise exception 'Wrong POS branch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into sale from public.orders where pos_gc_checkout_key=p_key;
 if sale.id is not null then
   if sale.cashier_id is distinct from actor.id or sale.store_id is distinct from draft.store_id then raise exception 'Checkout belongs to another cashier'; end if;
   return jsonb_build_object('order',to_jsonb(sale),'replayed',true);
 end if;
 if draft.source_web_order_id is not null then
   perform id from public.web_orders where id=draft.source_web_order_id and store_id::text=draft.store_id
    and coalesce(status,'') not in ('cancelled','canceled','rejected') and gc_released_at is null for update;
   if not found then raise exception 'Web order is no longer available in this branch'; end if;
   if exists(select 1 from public.orders where source_web_order_id=draft.source_web_order_id) then raise exception 'Web order already charged'; end if;
 end if;
 if coalesce(cardinality(p_codes),0)=0 or cardinality(p_codes)>100 then raise exception 'Choose between 1 and 100 certificates'; end if;
 select array_agg(upper(trim(c)) order by upper(trim(c))) into p_codes from unnest(p_codes)c;
 select count(distinct upper(trim(c))) into code_count from unnest(p_codes) c;
 if code_count<>cardinality(p_codes) then raise exception 'Duplicate certificate codes'; end if;
 if draft.net_amount is null or draft.net_amount<=0 or draft.net_amount::text='NaN'
    or draft.total::numeric is distinct from draft.net_amount then raise exception 'Invalid sale total'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Sale items required'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as i(quantity numeric,net_amount numeric,gross_amount numeric,discount_amount numeric)
   where coalesce(quantity,0)<=0 or net_amount is null or net_amount<0 or net_amount::text='NaN'
     or round(gross_amount-discount_amount,2) is distinct from round(net_amount,2)) then raise exception 'Invalid sale items'; end if;
 if round((select sum(i.net_amount) from jsonb_to_recordset(p_items) as i(net_amount numeric))
   -coalesce((draft.source_metadata->'order_discount'->>'amount')::numeric,0),2) is distinct from draft.net_amount then raise exception 'Items do not match sale total'; end if;
 -- Stable lock order prevents deadlocks when two tills submit overlapping codes.
 for cert in select * from public.booking_gc_certificates where code in (select upper(trim(c)) from unnest(p_codes)c) order by id for update loop
   if not exists(select 1 from public.booking_gc_redemptions r where r.certificate_id=cert.id and r.web_order_id=draft.source_web_order_id and r.order_id is null) and (cert.status<>'active' or cert.redeemed_at is not null or not exists(select 1 from public.booking_gc_batches where id=cert.batch_id and status='approved' and expires_at>statement_timestamp())) then raise exception 'A certificate is expired or no longer available'; end if;
   gc_total:=gc_total+cert.amount;
 end loop;
 if gc_total<>100*cardinality(p_codes) then raise exception 'A certificate was not found'; end if;
 if gc_total>draft.net_amount then raise exception 'Certificate value cannot exceed the bill; no cash change is issued for certificates'; end if;
 select sum(amount),sum(case when method='JUJA e-GC' then amount else 0 end) into paid_total,gc_paid
   from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric);
 if paid_total is distinct from draft.net_amount or gc_paid is distinct from gc_total
   or exists(select 1 from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric) where coalesce(amount,0)<=0 or coalesce(trim(method),'')='') then raise exception 'Payment amounts do not cover the sale correctly'; end if;
 draft.cashier_id:=actor.id;
 draft.branch_id:=draft.store_id;
 draft.status:='paid';
 draft.paid_at:=now();
 draft.source_metadata:=coalesce(draft.source_metadata,'{}') || jsonb_build_object('gc_codes',to_jsonb(p_codes),'gc_amount',gc_total);
 if coalesce(draft.receipt_number,'')='' then raise exception 'Receipt number required'; end if;
 insert into public.orders(order_number,receipt_number,receipt_sequence,receipt_date,source_web_order_id,store_id,branch_id,customer_id,loyalty_member_id,customer_name,items,subtotal,total,discount,gross_amount,discount_amount,net_amount,order_type,cashier_id,paid_at,status,payment_method,source_metadata,dining_option,pos_gc_checkout_key)
 values(draft.order_number,draft.receipt_number,draft.receipt_sequence,draft.receipt_date,draft.source_web_order_id,draft.store_id,draft.branch_id,draft.customer_id,draft.loyalty_member_id,draft.customer_name,draft.items,draft.subtotal,draft.total,draft.discount,draft.gross_amount,draft.discount_amount,draft.net_amount,draft.order_type,draft.cashier_id,draft.paid_at,draft.status,draft.payment_method,draft.source_metadata,draft.dining_option,p_key) returning * into sale;
 insert into public.order_items(order_id,menu_item_id,name,category_name,quantity,unit_price,line_total,gross_amount,discount_amount,net_amount,source_metadata)
 select sale.id,i.menu_item_id,i.name,i.category_name,i.quantity,i.unit_price,i.line_total,i.gross_amount,i.discount_amount,i.net_amount,i.source_metadata from jsonb_populate_recordset(null::public.order_items,p_items) i;
 if coalesce(cardinality(p_voucher_ids),0)>0 then
   -- Voucher use is part of this transaction too, so a rejected GC cannot consume a voucher.
   perform id from public.vouchers where id=any(p_voucher_ids) order by id for update;
   update public.vouchers set status='redeemed',redeemed_at=now()
     where id=any(p_voucher_ids) and coalesce(status,'active') in ('active','available') and redeemed_at is null and (expires_at is null or expires_at>now());
   get diagnostics voucher_count=row_count;
   if voucher_count<>cardinality(p_voucher_ids) then raise exception 'A loyalty voucher is no longer available'; end if;
 end if;
 if nullif(draft.source_metadata->>'open_ticket_id','') is not null then
   perform id from public.open_tickets where id=(draft.source_metadata->>'open_ticket_id')::uuid and store_id::text=draft.store_id for update;
   if not found then raise exception 'Saved ticket is no longer available in this branch'; end if;
   if exists(select 1 from public.orders where source_metadata->>'open_ticket_id'=draft.source_metadata->>'open_ticket_id') then raise exception 'Saved ticket already charged'; end if;
 end if;
 if nullif(draft.source_metadata->>'discount_claim_key','') is not null then
   perform public.complete_pos_discount_claims((draft.source_metadata->>'discount_claim_key')::uuid,sale.id,sale.receipt_number);
 end if;
 insert into public.booking_gc_redemptions(certificate_id,order_id,receipt_number,cashier_id,store_id,amount)
 select id,sale.id,sale.receipt_number,actor.id,sale.store_id,amount from public.booking_gc_certificates
 where code in (select upper(trim(c)) from unnest(p_codes)c)
 on conflict(certificate_id) do update set order_id=excluded.order_id,receipt_number=excluded.receipt_number,cashier_id=excluded.cashier_id
 where booking_gc_redemptions.web_order_id=draft.source_web_order_id and booking_gc_redemptions.order_id is null;
 update public.booking_gc_certificates set status='redeemed',redeemed_at=now()
 where code in (select upper(trim(c)) from unnest(p_codes)c);
 return jsonb_build_object('order',to_jsonb(sale),'replayed',false);
end;
$$;
revoke all on function public.complete_pos_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) from public,anon;
grant execute on function public.complete_pos_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) to authenticated;


create or replace function public.enforce_pos_gc_payment_ledger() returns trigger
language plpgsql security definer set search_path=public as $$
declare sale public.orders; redeemed numeric; tender numeric; codes integer; splits jsonb;
begin
 select * into sale from public.orders where id=new.id;
 if sale.id is null then return null; end if;
 if sale.source_web_order_id is not null and exists(select 1 from public.web_orders w where w.id=sale.source_web_order_id and w.gc_amount>0
  and w.gc_amount<>(select coalesce(sum(amount),0) from public.booking_gc_redemptions where web_order_id=w.id and order_id=sale.id)) then
  raise exception 'Apply the web order e-GCs before completing this sale';
 end if;
 splits:=case when jsonb_typeof(sale.source_metadata->'payment_splits')='array' then sale.source_metadata->'payment_splits' else '[]'::jsonb end;
 select coalesce(sum(amount),0),count(*) into redeemed,codes from public.booking_gc_redemptions where order_id=sale.id;
 if redeemed=0 and sale.pos_gc_checkout_key is null and not (coalesce(sale.source_metadata,'{}') ? 'gc_codes')
   and coalesce(sale.payment_method,'') not like '%JUJA e-GC%'
   and not exists(select 1 from jsonb_array_elements(splits) p where p->>'method'='JUJA e-GC') then return null; end if;
 select coalesce(sum((p->>'amount')::numeric),0) into tender
   from jsonb_array_elements(splits) p where p->>'method'='JUJA e-GC';
 if redeemed=0 or sale.pos_gc_checkout_key is null or tender<>redeemed
   or jsonb_array_length(coalesce(sale.source_metadata->'gc_codes','[]'))<>codes
   or exists(select 1 from public.booking_gc_redemptions r join public.booking_gc_certificates c on c.id=r.certificate_id
     where r.order_id=sale.id and (r.cashier_id is distinct from sale.cashier_id or r.store_id is distinct from sale.store_id
       or r.receipt_number is distinct from sale.receipt_number or not (sale.source_metadata->'gc_codes' ? c.code))) then
   raise exception 'e-GC payments require a matching redemption ledger';
 end if;
 return null;
end;
$$;
