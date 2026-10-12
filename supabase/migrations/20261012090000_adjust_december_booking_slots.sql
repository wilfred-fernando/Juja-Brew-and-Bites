-- Keep December's three-hour/no-extension policy, but permit custom staff
-- times and replacement customer slots within 10 AM through 2 AM next day.
-- Existing room overlap/buffer constraints remain responsible for conflicts.
create or replace function public.validate_december_function_room_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local_start timestamp;
  local_end timestamp;
begin
  if new.business_date is null or new.start_at is null
     or extract(month from new.business_date) <> 12 then
    return new;
  end if;
  local_start := new.start_at at time zone 'Asia/Manila';
  local_end := new.end_at at time zone 'Asia/Manila';
  if local_start < new.business_date + interval '10 hours'
     or local_end > new.business_date + interval '26 hours' then
    raise exception using errcode = '22023',
      message = 'December bookings must fit between 10 AM and 2 AM the next day (Asia/Manila).';
  end if;
  if coalesce(new.duration_hours, 0) <> 3
     or coalesce(new.extension_hours, 0) <> 0
     or local_end <> local_start + interval '3 hours' then
    raise exception using errcode = '22023',
      message = 'December bookings use three-hour slots and cannot be extended.';
  end if;
  return new;
end;
$$;
