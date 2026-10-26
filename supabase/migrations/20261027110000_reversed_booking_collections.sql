begin;
create table public.booking_fee_receipt_reversals (
  order_id uuid primary key references public.orders(id),
  booking_id uuid not null references public.function_room_bookings(id),
  reason text not null,
  reversed_at timestamptz not null default now(),
  before_state jsonb not null,
  after_state jsonb not null
);
alter table public.booking_fee_receipt_reversals enable row level security;
revoke all on public.booking_fee_receipt_reversals from public,anon,authenticated;
grant all on public.booking_fee_receipt_reversals to service_role;

-- Preserve legitimate historical prepaid credit while excluding the erroneous
-- current-shift collection from collection reports.
create view public.booking_active_reservation_collections as
select v.* from public.booking_reservation_vouchers v
where not exists(select 1 from public.booking_fee_receipt_reversals r where r.order_id=v.collection_order_id);
revoke all on public.booking_active_reservation_collections from public,anon,authenticated;
grant select on public.booking_active_reservation_collections to service_role;
do $$ declare signature text; definition text; begin
  foreach signature in array array['public.list_pos_reservation_collections(text,timestamptz)','public.capture_reservation_shift_collections()'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    execute replace(definition,'public.booking_reservation_vouchers','public.booking_active_reservation_collections');
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
