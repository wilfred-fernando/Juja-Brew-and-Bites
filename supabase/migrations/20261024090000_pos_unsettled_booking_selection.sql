begin;

-- Scheduling end time must not prevent the cashier from settling the final bill.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.list_pos_confirmed_bookings(text)'::regprocedure) into definition;
  definition := replace(definition, 'and b.end_at > statement_timestamp()', '');
  execute definition;

  select pg_get_functiondef('public.complete_pos_booking_sale(uuid,uuid,jsonb,jsonb,uuid[])'::regprocedure) into definition;
  if position('''reservation_booking_name'',booking.customer_name' in definition) = 0 then
    if position('''booking_id'',booking.id,' in definition) = 0 then
      raise exception 'Booking checkout metadata anchor missing';
    end if;
    definition := replace(definition, '''booking_id'',booking.id,',
      '''booking_id'',booking.id,''reservation_booking_name'',booking.customer_name,');
    execute definition;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
