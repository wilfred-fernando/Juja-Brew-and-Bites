begin;
create function public.list_pos_booking_reminders(p_store_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare booking_store text;
begin
  perform public.booking_pos_actor(p_store_id);
  -- Function-room bookings are hosted at Pasong Tamo, including historical
  -- bookings with no reservation-voucher branch attached.
  select id::text into booking_store from public.stores
    where coalesce(store_name,name,'') ilike '%Pasong Tamo%' order by id limit 1;
  if p_store_id is distinct from booking_store then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'reference_code',b.reference_code,'customer_name',b.customer_name,
    'status',b.status,'payment_status',b.payment_status,'start_at',b.start_at,'end_at',b.end_at,
    'package_id',b.package_id,'guest_count',b.guest_count,'event_type',b.event_type
  ) order by b.start_at,b.id) from public.function_room_bookings b
    where b.status='confirmed' and coalesce(b.payment_status,'') not in ('expired','cancelled')
      and b.start_at>statement_timestamp() and b.start_at<=statement_timestamp()+interval '4 hours'
      and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id)), '[]'::jsonb);
end $$;
revoke all on function public.list_pos_booking_reminders(text) from public,anon;
grant execute on function public.list_pos_booking_reminders(text) to authenticated;
notify pgrst,'reload schema';
commit;
