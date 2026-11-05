begin;
-- Old paper GCs were issued outside this system. Registration happens only on a
-- successful sale; a global canonical serial can be redeemed once across branches.
create table public.legacy_physical_gc_redemptions (
 serial text primary key check (serial ~ '^[A-Z0-9]{1,64}$' and serial not like 'JUJAGC%'),
 amount numeric(12,2) not null default 100 check(amount=100),
 order_id uuid not null references public.orders(id),
 receipt_number text not null,
 cashier_id uuid not null references public.profiles(id),
 store_id text not null,
 redeemed_at timestamptz not null default now()
);
alter table public.legacy_physical_gc_redemptions enable row level security;
revoke all on public.legacy_physical_gc_redemptions from public,anon,authenticated;
grant all on public.legacy_physical_gc_redemptions to service_role;
create function public.normalize_legacy_gc_serial(p_serial text) returns text
language sql immutable strict set search_path=public as $$
 select regexp_replace(upper(trim(p_serial)), '[^A-Z0-9]', '', 'g');
$$;
revoke all on function public.normalize_legacy_gc_serial(text) from public,anon,authenticated;
create function public.validate_pos_legacy_gc(p_serial text,p_store_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles; serial_value text:=public.normalize_legacy_gc_serial(p_serial);
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin') then raise exception 'POS access required'; end if;
 if coalesce(p_store_id,'')='' or (lower(actor.role)='cashier' and actor.store_id::text is distinct from p_store_id) then raise exception 'Wrong POS branch'; end if;
 if serial_value is null or serial_value='' or length(serial_value)>64 or serial_value like 'JUJAGC%' then raise exception 'Enter a valid old physical GC serial'; end if;
 if exists(select 1 from public.legacy_physical_gc_redemptions where serial=serial_value) then raise exception 'Physical GC serial % has already been redeemed',serial_value; end if;
 return jsonb_build_object('serial',serial_value,'amount',100);
end; $$;
revoke all on function public.validate_pos_legacy_gc(text,text) from public,anon;
grant execute on function public.validate_pos_legacy_gc(text,text) to authenticated;
create or replace function public.complete_pos_legacy_gc_sale(p_key uuid,p_order jsonb,p_items jsonb,p_serials text[],p_voucher_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 actor public.profiles; draft public.orders; sale public.orders; serial_value text;
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
 if nullif(draft.source_metadata->>'open_ticket_id','') is not null then
   perform id from public.open_tickets where id=(draft.source_metadata->>'open_ticket_id')::uuid and store_id::text=draft.store_id for update;
   if not found then raise exception 'Saved ticket is no longer available in this branch'; end if;
   if exists(select 1 from public.orders where source_metadata->>'open_ticket_id'=draft.source_metadata->>'open_ticket_id') then raise exception 'Saved ticket already charged'; end if;
 end if;
 if coalesce(cardinality(p_serials),0)=0 or cardinality(p_serials)>100 then raise exception 'Choose between 1 and 100 physical GCs'; end if;
 select array_agg(public.normalize_legacy_gc_serial(c) order by public.normalize_legacy_gc_serial(c)) into p_serials from unnest(p_serials)c;
 if exists(select 1 from unnest(p_serials)c where c is null or c='' or length(c)>64 or c like 'JUJAGC%') then raise exception 'Enter a valid old physical GC serial'; end if;
 select count(distinct c) into code_count from unnest(p_serials)c;
 if code_count<>cardinality(p_serials) then raise exception 'Duplicate physical GC serials'; end if;
 for serial_value in select c from unnest(p_serials)c order by c loop
   perform pg_advisory_xact_lock(hashtextextended('legacy-gc:'||serial_value,0));
   if exists(select 1 from public.legacy_physical_gc_redemptions where serial=serial_value) then raise exception 'Physical GC serial % has already been redeemed',serial_value; end if;
 end loop;
 gc_total:=100*cardinality(p_serials);
 if draft.net_amount is null or draft.net_amount<=0 or draft.net_amount::text='NaN'
    or draft.total::numeric is distinct from draft.net_amount then raise exception 'Invalid sale total'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Sale items required'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as i(quantity numeric,net_amount numeric,gross_amount numeric,discount_amount numeric)
   where coalesce(quantity,0)<=0 or net_amount is null or net_amount<0 or net_amount::text='NaN'
     or round(gross_amount-discount_amount,2) is distinct from round(net_amount,2)) then raise exception 'Invalid sale items'; end if;
 if round((select sum(i.net_amount) from jsonb_to_recordset(p_items) as i(net_amount numeric))
   -coalesce((draft.source_metadata->'order_discount'->>'amount')::numeric,0),2) is distinct from draft.net_amount then raise exception 'Items do not match sale total'; end if;
 if gc_total>draft.net_amount then raise exception 'Certificate value cannot exceed the bill; no cash change is issued for certificates'; end if;
 select sum(amount),sum(case when method='Legacy Physical GC' then amount else 0 end) into paid_total,gc_paid
   from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric);
 if paid_total is distinct from draft.net_amount or gc_paid is distinct from gc_total
   or exists(select 1 from jsonb_to_recordset(draft.source_metadata->'payment_splits') as p(method text,amount numeric) where coalesce(amount,0)<=0 or coalesce(trim(method),'')='') then raise exception 'Payment amounts do not cover the sale correctly'; end if;
 draft.cashier_id:=actor.id;
 draft.branch_id:=draft.store_id;
 draft.status:='paid';
 draft.paid_at:=now();
 draft.source_metadata:=coalesce(draft.source_metadata,'{}') || jsonb_build_object('legacy_gc_serials',to_jsonb(p_serials),'legacy_gc_amount',gc_total);
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
 if nullif(draft.source_metadata->>'discount_claim_key','') is not null then
   perform public.complete_pos_discount_claims((draft.source_metadata->>'discount_claim_key')::uuid,sale.id,sale.receipt_number);
 end if;
 insert into public.legacy_physical_gc_redemptions(serial,order_id,receipt_number,cashier_id,store_id)
 select c,sale.id,sale.receipt_number,actor.id,sale.store_id from unnest(p_serials)c;
 return jsonb_build_object('order',to_jsonb(sale),'replayed',false);
end;
$$;
revoke all on function public.complete_pos_legacy_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) from public,anon;
grant execute on function public.complete_pos_legacy_gc_sale(uuid,jsonb,jsonb,text[],uuid[]) to authenticated;
-- The shared checkout key also protects retries for legacy payments. The e-GC
-- guard delegates these orders to the separate legacy ledger guard below.
do $$
declare definition text; anchor text:='if sale.id is null then return null; end if;';
begin
 select pg_get_functiondef('public.enforce_pos_gc_payment_ledger()'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Review e-GC payment guard before enabling legacy GCs'; end if;
 execute replace(definition,anchor,'if sale.id is null or exists(select 1 from public.legacy_physical_gc_redemptions where order_id=sale.id) then return null; end if;');
end $$;
create function public.enforce_legacy_gc_payment_ledger() returns trigger
language plpgsql security definer set search_path=public as $$
declare sale public.orders; redeemed numeric; tender numeric; serial_count integer; splits jsonb;
begin
 select * into sale from public.orders where id=new.id;
 if sale.id is null then return null; end if;
 splits:=case when jsonb_typeof(sale.source_metadata->'payment_splits')='array' then sale.source_metadata->'payment_splits' else '[]'::jsonb end;
 select coalesce(sum(amount),0),count(*) into redeemed,serial_count from public.legacy_physical_gc_redemptions where order_id=sale.id;
 if redeemed=0 and not (coalesce(sale.source_metadata,'{}') ? 'legacy_gc_serials')
   and coalesce(sale.payment_method,'') not ilike '%Legacy Physical GC%'
   and not exists(select 1 from jsonb_array_elements(splits)p where p->>'method'='Legacy Physical GC') then return null; end if;
 select coalesce(sum((p->>'amount')::numeric),0) into tender from jsonb_array_elements(splits)p where p->>'method'='Legacy Physical GC';
 if redeemed=0 or sale.pos_gc_checkout_key is null or tender<>redeemed
   or jsonb_array_length(coalesce(sale.source_metadata->'legacy_gc_serials','[]'))<>serial_count
   or coalesce((sale.source_metadata->>'legacy_gc_amount')::numeric,0)<>redeemed
   or coalesce(sale.source_metadata,'{}') ? 'gc_codes'
   or exists(select 1 from jsonb_array_elements(splits)p where p->>'method'='JUJA e-GC')
   or exists(select 1 from public.legacy_physical_gc_redemptions r where r.order_id=sale.id and
     (r.cashier_id is distinct from sale.cashier_id or r.store_id is distinct from sale.store_id
      or r.receipt_number is distinct from sale.receipt_number or not (sale.source_metadata->'legacy_gc_serials' ? r.serial))) then
   raise exception 'Legacy physical GC payments require a matching redemption ledger';
 end if;
 return null;
end; $$;
revoke all on function public.enforce_legacy_gc_payment_ledger() from public,anon,authenticated;
create constraint trigger enforce_legacy_gc_payment_ledger after insert or update on public.orders
deferrable initially deferred for each row execute function public.enforce_legacy_gc_payment_ledger();
notify pgrst,'reload schema';
commit;
