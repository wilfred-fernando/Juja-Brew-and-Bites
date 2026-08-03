-- Customers cannot modify bookings after cancellation, rejection, cancellation review, or expiry.
-- Staff/service-role operations remain available for administrative resolution.
create or replace function public.prevent_customer_terminal_booking_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- Direct database operations and service-role API calls are trusted backend work.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if auth.uid() is not null then
    select lower(coalesce(p.role, ''))
      into actor_role
      from public.profiles p
     where p.id = auth.uid()
     limit 1;
  end if;

  if actor_role in ('admin', 'super_admin', 'cashier') then
    return new;
  end if;

  if lower(coalesce(old.status, '')) in (
    'expired',
    'cancelled',
    'canceled',
    'rejected',
    'cancelled_gc',
    'cancellation_requested'
  ) then
    raise exception 'Cancelled or expired bookings can no longer be updated.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_customer_terminal_booking_updates
  on public.function_room_bookings;

create trigger trg_prevent_customer_terminal_booking_updates
before update on public.function_room_bookings
for each row
execute function public.prevent_customer_terminal_booking_updates();
