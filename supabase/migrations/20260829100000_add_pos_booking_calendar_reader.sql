create or replace function public.list_pos_booking_calendar(
  p_start_date date,
  p_end_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_role text;
  result json;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Staff login is required.';
  end if;

  select lower(coalesce(p.role, ''))
  into requester_role
  from public.profiles p
  where p.id = auth.uid();

  if requester_role not in ('cashier', 'admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'Cashier or admin access is required.';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date <= p_start_date
    or p_end_date - p_start_date > 42 then
    raise exception using errcode = '22023', message = 'Calendar date range must be between 1 and 42 days.';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', b.id,
        'reference_code', b.reference_code,
        'customer_name', b.customer_name,
        'event_type', b.event_type,
        'business_date', b.business_date,
        'start_at', b.start_at,
        'end_at', b.end_at,
        'guest_count', b.guest_count,
        'package_id', b.package_id,
        'package_name', coalesce(pkg.name, 'Package ' || b.package_id::text),
        'status', b.status,
        'created_by_name', b.created_by_name,
        'created_via', b.created_via
      )
      order by b.start_at asc
    ),
    '[]'::json
  )
  into result
  from public.function_room_bookings b
  left join public.function_room_packages pkg on pkg.id = b.package_id
  where b.business_date >= p_start_date
    and b.business_date < p_end_date
    and b.status in ('pending', 'confirmed')
    and not (
      b.status = 'pending'
      and b.payment_status = 'waiting_for_payment'
      and b.payment_proof_url is null
      and b.created_at <= now() - interval '24 hours'
    );

  return result;
end;
$function$;

revoke all on function public.list_pos_booking_calendar(date, date) from public;
revoke all on function public.list_pos_booking_calendar(date, date) from anon;
grant execute on function public.list_pos_booking_calendar(date, date) to authenticated;
