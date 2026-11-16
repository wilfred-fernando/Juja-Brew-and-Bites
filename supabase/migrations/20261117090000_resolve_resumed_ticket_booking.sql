begin;
-- The new-ticket picker remains today/upcoming only. A saved ticket can settle
-- its own confirmed, unsettled booking after the calendar date has passed.
create function public.get_pos_saved_ticket_booking(p_store_id text,p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 perform public.booking_pos_actor(p_store_id);
 return (select jsonb_build_object(
   'id',b.id,'customer_name',b.customer_name,'business_date',b.business_date,
   'start_at',b.start_at,'end_at',b.end_at,'package_id',b.package_id,
   'deposit_amount',b.deposit_amount,'payment_status',b.payment_status,'payment_method',b.payment_method,
   'voucher',case when v.booking_id is null then null else jsonb_build_object(
     'code',v.code,'amount',v.amount,'store_id',v.store_id,'collection_order_id',v.collection_order_id,
     'collection_receipt_number',(select o.receipt_number from public.orders o where o.id=v.collection_order_id),
     'redeemed_order_id',v.redeemed_order_id) end)
   from public.open_tickets t join public.function_room_bookings b
     on b.id::text=lower(substring(t.order_type from '(?i)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'))
   left join public.booking_reservation_vouchers v on v.booking_id=b.id
   where t.id=p_ticket_id and t.store_id::text=p_store_id and t.order_type ~* '^VIP Booking([[:space:]]|$)'
     and b.status='confirmed' and coalesce(b.payment_status,'') not in ('cancelled','expired')
     and (v.store_id is null or v.store_id=p_store_id) and v.redeemed_order_id is null
     and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id));
end $$;
revoke all on function public.get_pos_saved_ticket_booking(text,uuid) from public,anon;
grant execute on function public.get_pos_saved_ticket_booking(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
