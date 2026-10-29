begin;
alter table public.booking_reservation_vouchers
  add column collection_source text not null default 'pos_collection'
    check (collection_source in ('pos_collection','historical_credit')),
  alter column payment_method drop not null,
  alter column cashier_id drop not null,
  alter column shift_id drop not null,
  alter column collected_at drop not null;
alter table public.booking_reservation_vouchers add constraint booking_collection_required_fields check (
  (collection_source='historical_credit' and collection_order_id is null and shift_id is null and collected_at is null)
  or (collection_source='pos_collection' and payment_method is not null and cashier_id is not null and shift_id is not null and collected_at is not null)
);

-- Credit issued for a previously confirmed payment is not a new collection.
create or replace view public.booking_active_reservation_collections as
select v.booking_id,v.code,v.amount,v.payment_method,v.store_id,v.cashier_id,v.shift_id,
  v.collected_at,v.redeemed_order_id,v.redeemed_at,v.collection_order_id
from public.booking_reservation_vouchers v
where v.collection_source='pos_collection'
  and not exists(select 1 from public.booking_fee_receipt_reversals r where r.order_id=v.collection_order_id);

do $$ declare definition text; anchor text:='if v.collection_order_id is not null then return to_jsonb(v); end if;'; begin
  select pg_get_functiondef('public.ensure_booking_reservation_receipt(uuid,text,uuid)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review booking receipt helper before adding historical credits'; end if;
  execute replace(definition,anchor,anchor || E'\n  if v.collection_source=''historical_credit'' then return to_jsonb(v); end if;');
end $$;
notify pgrst,'reload schema';
commit;
