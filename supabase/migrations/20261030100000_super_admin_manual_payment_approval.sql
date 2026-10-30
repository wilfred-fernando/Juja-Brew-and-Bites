begin;
-- Decide from the authenticated profile, never from client-supplied role data.
do $$ declare definition text; anchor text:='booking_result := public.create_booking(data);'; begin
  select pg_get_functiondef('public.create_manual_booking(json)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review manual booking creation before applying automatic payment approval'; end if;
  if position('Super Admin manual payment approval' in definition)=0 then
    execute replace(definition,anchor,$injection$
  -- Super Admin manual payment approval. Keep explicitly pending bookings
  -- pending; payment approval alone does not confirm their schedule.
  if requester_role='super_admin' then
    if coalesce(data->>'payment_method','') not in ('Cash','Card','QRPH','Waived') then
      raise exception 'Select Cash, Card, QRPH, or Waived for the reservation fee';
    end if;
    data:=jsonb_set(data::jsonb,'{payment_status}',to_jsonb(
      case when data->>'payment_method'='Waived' then 'waived'::text else 'approved'::text end))::json;
  end if;
  booking_result := public.create_booking(data);
$injection$);
  end if;
end $$;
notify pgrst,'reload schema';
commit;
