begin;
-- Keep v2.3's confirmed-only feed unchanged while the new calendar uses status
-- cards. Authentication/session/branch checks remain in the existing function.
create or replace function public.read_pos_booking_calendar_widget(p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare payload jsonb; booking_store text; rows jsonb:='[]'::jsonb;
begin
  payload:=public.read_pos_booking_widget(p_token_hash);
  if payload is null then return null; end if;
  select id::text into booking_store from public.stores where coalesce(store_name,name,'') ilike '%Pasong Tamo%' order by id limit 1;
  if payload->>'store_id'=booking_store then
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'customer_name',b.customer_name,'event_type',b.event_type,
      'business_date',b.business_date,'status',b.status,'start_at',b.start_at,'end_at',b.end_at,'payment_status',b.payment_status,
      'package_id',b.package_id,'package_name',coalesce(p.name,'Package '||b.package_id),'guest_count',b.guest_count)
      order by b.start_at,b.id),'[]'::jsonb) into rows
    from public.function_room_bookings b left join public.function_room_packages p on p.id=b.package_id
    where b.status in ('pending','confirmed') and b.end_at>now()
      and b.start_at<((date_trunc('month',now() at time zone 'Asia/Manila')+interval '4 months 14 days') at time zone 'Asia/Manila')
      and coalesce(b.payment_status,'') not in ('expired','cancelled','canceled')
      and not (b.status='pending' and b.payment_status='waiting_for_payment' and b.payment_proof_url is null and b.created_at<=now()-interval '24 hours')
      and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id);
  end if;
  return jsonb_set(payload,'{bookings}',rows);
end;
$$;
revoke all on function public.read_pos_booking_calendar_widget(text) from public,anon,authenticated;
grant execute on function public.read_pos_booking_calendar_widget(text) to service_role;
notify pgrst,'reload schema';
commit;
