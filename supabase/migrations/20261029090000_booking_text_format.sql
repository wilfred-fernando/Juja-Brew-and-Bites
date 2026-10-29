begin;
create or replace function public.format_booking_label(p_value text) returns text
language sql immutable set search_path=public as $$
  select initcap(regexp_replace(btrim(p_value),'[[:space:]]+',' ','g'));
$$;

create or replace function public.format_booking_text() returns trigger
language plpgsql set search_path=public as $$
begin
  new.customer_name:=public.format_booking_label(new.customer_name);
  new.event_type:=public.format_booking_label(new.event_type);
  return new;
end $$;
create trigger format_booking_text before insert or update of customer_name,event_type
on public.function_room_bookings for each row execute function public.format_booking_text();

update public.function_room_bookings
set customer_name=public.format_booking_label(customer_name),event_type=public.format_booking_label(event_type)
where customer_name is distinct from public.format_booking_label(customer_name)
   or event_type is distinct from public.format_booking_label(event_type);
notify pgrst,'reload schema';
commit;
