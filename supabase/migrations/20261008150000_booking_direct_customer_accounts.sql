begin;
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

  if nullif(data->>'user_id', '') is not null or nullif(data->>'member_id', '') is not null then
    if not exists (
      select 1 from public.profiles p join auth.users u on u.id = p.id
      where p.id = nullif(data->>'user_id', '')::uuid
        and lower(p.role) = 'customer' and u.email_confirmed_at is not null
        and (nullif(data->>'member_id', '') is null or exists (
          select 1 from public.loyalty_members m where m.id = nullif(data->>'member_id', '')::uuid
            and (m.user_id = p.id or p.loyalty_account_id = m.id)
        ))
    ) then
      raise exception using errcode = '22023', message = 'Select a valid linked customer account.';
    end if;
  end if;

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

-- Covers direct Admin edits as well as server-side adjusted booking approvals.
create or replace function public.validate_booking_customer_retag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not distinct from old.user_id and new.member_id is not distinct from old.member_id then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1 from public.profiles where id = auth.uid() and lower(role) in ('admin','super_admin','cashier')
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required to change the linked customer.';
  end if;
  if new.user_id is null and new.member_id is null then return new; end if;
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = new.user_id and lower(p.role) = 'customer' and u.email_confirmed_at is not null
      and (new.member_id is null or exists (
        select 1 from public.loyalty_members m where m.id = new.member_id
          and (m.user_id = p.id or p.loyalty_account_id = m.id)
      ))
  ) then
    raise exception using errcode = '22023', message = 'Select a valid linked customer account.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_booking_customer_retag on public.function_room_bookings;
create trigger validate_booking_customer_retag before update of user_id, member_id
on public.function_room_bookings for each row execute function public.validate_booking_customer_retag();
commit;
