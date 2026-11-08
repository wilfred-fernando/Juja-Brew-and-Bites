begin;

-- Keep every booking on today's Manila business date, even after its scheduled
-- end, so the cashier can still settle it. Hide earlier dates in this selector.
do $$
declare definition text; anchor text:='where b.status=''confirmed''';
begin
 select pg_get_functiondef('public.list_pos_confirmed_bookings(text)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Review confirmed booking query before adding date filter'; end if;
 execute replace(definition,anchor,$filter$
 where b.status='confirmed'
   and coalesce(b.business_date::date,(b.start_at at time zone 'Asia/Manila')::date)
       >= (statement_timestamp() at time zone 'Asia/Manila')::date
 $filter$);
end $$;

notify pgrst,'reload schema';
commit;
