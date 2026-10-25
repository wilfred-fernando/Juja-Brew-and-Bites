begin;
alter table public.function_room_bookings drop constraint function_room_bookings_extension_hours_check;
alter table public.function_room_bookings add constraint function_room_bookings_extension_hours_check check (extension_hours >= 0);

create or replace function public.enforce_booking_extension_limit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and new.extension_hours is not distinct from old.extension_hours then return new; end if;
  if coalesce(new.extension_hours,0)>2
     and not coalesce(auth.role()='service_role',false)
     and not exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')) then
    raise exception 'Only Admin can add more than two extension hours';
  end if;
  return new;
end $$;
create trigger enforce_booking_extension_limit before insert or update of extension_hours
on public.function_room_bookings for each row execute function public.enforce_booking_extension_limit();
notify pgrst,'reload schema';
commit;
