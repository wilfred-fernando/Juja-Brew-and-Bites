begin;
-- Change new receipt notes without editing existing financial records.
do $$ declare definition text; anchor text:='coalesce(b.reference_code,b.id::text)'; begin
  select pg_get_functiondef('public.ensure_booking_reservation_receipt(uuid,text,uuid)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review reservation receipt note before applying booking name'; end if;
  execute replace(definition,anchor,'coalesce(nullif(trim(b.customer_name),''''),''Function Room'')');
end $$;
notify pgrst,'reload schema';
commit;
