create index if not exists idx_function_room_bookings_unpaid_hold_expiry
  on public.function_room_bookings (created_at)
  where status = 'pending'
    and payment_status = 'waiting_for_payment'
    and payment_proof_url is null;

create or replace function public.create_booking(data json)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  result json;
begin
  update public.function_room_bookings
  set
    status = 'expired',
    updated_at = now()
  where status = 'pending'
    and payment_status = 'waiting_for_payment'
    and payment_proof_url is null
    and created_at <= now() - interval '24 hours';

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
    (data->>'start_at')::timestamptz,
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
