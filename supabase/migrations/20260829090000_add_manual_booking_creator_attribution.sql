alter table if exists public.function_room_bookings
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_name text,
  add column if not exists created_by_email text,
  add column if not exists created_via text;

comment on column public.function_room_bookings.created_by_user_id is
  'Authenticated staff account that created a manual booking.';
comment on column public.function_room_bookings.created_by_name is
  'Staff display name captured when the manual booking was created.';
comment on column public.function_room_bookings.created_by_email is
  'Staff login email captured when the manual booking was created.';
comment on column public.function_room_bookings.created_via is
  'Manual booking entry point: admin or pos.';

create index if not exists idx_function_room_bookings_created_by_user
  on public.function_room_bookings (created_by_user_id, created_at desc)
  where created_by_user_id is not null;

create or replace function public.create_manual_booking(data json)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_id uuid := auth.uid();
  requester_role text;
  requester_name text;
  requester_email text := nullif(auth.jwt()->>'email', '');
  creator_source text;
  booking_result json;
  booking_id uuid;
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = 'Staff login is required.';
  end if;

  select
    lower(coalesce(p.role, '')),
    coalesce(nullif(trim(p.full_name), ''), nullif(auth.jwt()->>'email', ''), requester_id::text)
  into requester_role, requester_name
  from public.profiles p
  where p.id = requester_id;

  if requester_role not in ('cashier', 'admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'Cashier or admin access is required.';
  end if;

  creator_source := case lower(coalesce(data->>'created_via', ''))
    when 'pos' then 'pos'
    else 'admin'
  end;

  booking_result := public.create_booking(data);
  booking_id := nullif(booking_result->>'id', '')::uuid;

  update public.function_room_bookings
  set
    created_by_user_id = requester_id,
    created_by_name = requester_name,
    created_by_email = requester_email,
    created_via = creator_source
  where id = booking_id
  returning row_to_json(function_room_bookings.*) into booking_result;

  return booking_result;
end;
$function$;

revoke all on function public.create_manual_booking(json) from public;
revoke all on function public.create_manual_booking(json) from anon;
grant execute on function public.create_manual_booking(json) to authenticated;
