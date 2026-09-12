-- Online-only checkout: sale, items, and certificate redemption commit together.
alter table public.orders add column pos_gc_checkout_key uuid unique;
create table public.booking_gc_redemptions (
  certificate_id uuid primary key references public.booking_gc_certificates(id),
  order_id uuid not null references public.orders(id),
  receipt_number text not null,
  cashier_id uuid not null references auth.users(id),
  store_id text not null,
  amount numeric(12,2) not null check (amount=100),
  redeemed_at timestamptz not null default now()
);
alter table public.booking_gc_redemptions enable row level security;
revoke all on public.booking_gc_redemptions from anon, authenticated;
grant all on public.booking_gc_redemptions to service_role;
create index booking_gc_redemptions_order on public.booking_gc_redemptions(order_id);

create function public.validate_pos_booking_gc(p_code text, p_store_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles; cert public.booking_gc_certificates;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin') then raise exception 'POS access required'; end if;
  if lower(actor.role)='cashier' and actor.store_id::text is distinct from p_store_id then raise exception 'Wrong POS branch'; end if;
  select c.* into cert from public.booking_gc_certificates c join public.booking_gc_batches b on b.id=c.batch_id
    where c.code=upper(trim(p_code)) and c.status='active' and c.redeemed_at is null and b.status='approved' and b.expires_at>statement_timestamp();
  if cert.id is null then raise exception 'Code is invalid, awaiting approval, expired, or already redeemed'; end if;
  return jsonb_build_object('code',cert.code,'amount',cert.amount,'expires_at',(select expires_at from public.booking_gc_batches where id=cert.batch_id));
end;
$$;
revoke all on function public.validate_pos_booking_gc(text,text) from public,anon;
grant execute on function public.validate_pos_booking_gc(text,text) to authenticated;

create function public.complete_pos_gc_sale(p_key uuid,p_order jsonb,p_items jsonb,p_codes text[],p_voucher_ids uuid[] default '{}') returns jsonb
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
   if cert.status<>'active' or cert.redeemed_at is not null or not exists(select 1 from public.booking_gc_batches where id=cert.batch_id and status='approved' and expires_at>statement_timestamp()) then raise exception 'A certificate is expired or no longer available'; end if;
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
 if draft.source_web_order_id is not null then
   perform id from public.web_orders where id=draft.source_web_order_id
     and coalesce(store_id::text,branch_id::text)=draft.store_id for update;
   if not found then raise exception 'Web order does not belong to this branch'; end if;
   if exists(select 1 from public.orders where source_web_order_id=draft.source_web_order_id) then raise exception 'Web order already charged'; end if;
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
 where code in (select upper(trim(c)) from unnest(p_codes)c);
 update public.booking_gc_certificates set status='redeemed',redeemed_at=now()
 where code in (select upper(trim(c)) from unnest(p_codes)c);
 return jsonb_build_object('order',to_jsonb(sale),'replayed',false);
end;
$$;
revoke all on function public.complete_pos_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) from public,anon;
grant execute on function public.complete_pos_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) to authenticated;

-- Direct REST inserts/edits cannot claim an e-GC payment without its secure ledger.
create function public.enforce_pos_gc_payment_ledger() returns trigger
language plpgsql security definer set search_path=public as $$
declare sale public.orders; redeemed numeric; tender numeric; codes integer; splits jsonb;
begin
 select * into sale from public.orders where id=new.id;
 if sale.id is null then return null; end if;
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
create constraint trigger enforce_pos_gc_payment_ledger after insert or update on public.orders
deferrable initially deferred for each row execute function public.enforce_pos_gc_payment_ledger();
