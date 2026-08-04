-- December function-room bookings use four fixed three-hour slots.
create or replace function public.validate_december_function_room_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local_start timestamp;
  local_end timestamp;
  allowed_start_hours integer[] := array[10, 14, 18, 22];
begin
  if new.business_date is null or new.start_at is null then
    return new;
  end if;

  if extract(month from new.business_date) <> 12 then
    return new;
  end if;

  local_start := new.start_at at time zone 'Asia/Manila';
  local_end := new.end_at at time zone 'Asia/Manila';

  if local_start::date <> new.business_date
     or not (extract(hour from local_start)::integer = any(allowed_start_hours))
     or extract(minute from local_start) <> 0
     or extract(second from local_start) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'December bookings must start at 10:00 AM, 2:00 PM, 6:00 PM, or 10:00 PM (Asia/Manila).';
  end if;

  if coalesce(new.duration_hours, 0) <> 3
     or coalesce(new.extension_hours, 0) <> 0
     or local_end <> local_start + interval '3 hours' then
    raise exception using
      errcode = '22023',
      message = 'December bookings use fixed 3-hour slots and cannot be extended.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_december_function_room_slot
  on public.function_room_bookings;

-- The existing trg_set_function_room_booking_times trigger runs first by name,
-- so this validator checks the normalized end_at and blocked_range values.
create trigger trg_validate_december_function_room_slot
before insert or update of business_date, start_at, end_at, duration_hours, extension_hours
on public.function_room_bookings
for each row
execute function public.validate_december_function_room_slot();
