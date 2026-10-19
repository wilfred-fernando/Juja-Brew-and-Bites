begin;

-- Keep ongoing and upcoming confirmed bookings; exclude ended bookings immediately.
create or replace function public.list_pos_confirmed_bookings(p_store_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.booking_pos_actor(p_store_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'customer_name',b.customer_name,'business_date',b.business_date,
    'start_at',b.start_at,'end_at',b.end_at,'package_id',b.package_id,
    'deposit_amount',b.deposit_amount,'payment_status',b.payment_status,
    'payment_method',b.payment_method,'voucher',case when v.booking_id is null then null else
      jsonb_build_object('code',v.code,'amount',v.amount,'store_id',v.store_id,
        'collection_order_id',v.collection_order_id,'collection_receipt_number',(select o.receipt_number from public.orders o where o.id=v.collection_order_id),'redeemed_order_id',v.redeemed_order_id) end
    ) order by b.start_at)
    from public.function_room_bookings b
    left join public.booking_reservation_vouchers v on v.booking_id=b.id
    where b.status='confirmed'
      and b.end_at > statement_timestamp()
      and coalesce(b.payment_status,'') not in ('cancelled','expired') and (v.store_id is null or v.store_id=p_store_id)
      and v.redeemed_order_id is null
      and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id)), '[]'::jsonb);
end $$;

notify pgrst,'reload schema';
commit;
