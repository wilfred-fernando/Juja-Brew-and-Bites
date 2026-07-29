-- Enforce the one-hour function-room buffer in the database so stale clients
-- and simultaneous submissions cannot create overlapping reservations.
create or replace function public.create_booking(data json)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  result json;
  requested_start timestamptz;
  requested_end timestamptz;
begin
  update public.function_room_bookings
  set
    status = 'expired',
    updated_at = now()
  where status = 'pending'
    and payment_status = 'waiting_for_payment'
    and payment_proof_url is null
    and created_at <= now() - interval '24 hours';

  requested_start := (data->>'start_at')::timestamptz;
  requested_end := coalesce(
    nullif(data->>'end_at', '')::timestamptz,
    requested_start
      + make_interval(
          mins => 179 + coalesce((data->>'extension_hours')::int, 0) * 60
        )
  );

  if requested_end <= requested_start then
    raise exception using
      errcode = '22023',
      message = 'Booking end time must be after its start time.';
  end if;

  -- Serialize room reservations while checking and inserting the new booking.
  perform pg_advisory_xact_lock(hashtext('function_room_bookings'));

  if exists (
    select 1
    from public.function_room_bookings b
    where b.status in ('pending', 'confirmed', 'cancellation_requested')
      and not (
        b.status = 'pending'
        and b.payment_status = 'waiting_for_payment'
        and b.payment_proof_url is null
        and b.created_at <= now() - interval '24 hours'
      )
      and requested_start < b.end_at + interval '1 hour'
      and requested_end > b.start_at - interval '1 hour'
  ) then
    raise exception using
      errcode = '23P01',
      message = 'This schedule overlaps an existing booking or its one-hour buffer. Please choose another time.';
  end if;

  insert into public.function_room_bookings (
    user_id,
    member_id,
    package_id,
    customer_name,
    event_type,
    business_date,
    start_at,
    duration_hours,
    extension_hours,
    guest_count,
    contact_number,
    email,
    deposit_amount,
    payment_status,
    payment_method,
    payment_proof_url,
    status
  )
  values (
    nullif(data->>'user_id', '')::uuid,
    nullif(data->>'member_id', '')::uuid,
    (data->>'package_id')::int,
    data->>'customer_name',
    data->>'event_type',
    (data->>'business_date')::date,
    requested_start,
    (data->>'duration_hours')::int,
    (data->>'extension_hours')::int,
    (data->>'guest_count')::int,
    data->>'contact_number',
    data->>'email',
    (data->>'deposit_amount')::numeric,
    data->>'payment_status',
    nullif(data->>'payment_method', ''),
    nullif(data->>'payment_proof_url', ''),
    data->>'status'
  )
  returning row_to_json(function_room_bookings.*) into result;

  return result;
end;
$function$;
