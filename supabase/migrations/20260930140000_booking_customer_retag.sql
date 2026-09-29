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
    select 1 from public.loyalty_members m join public.profiles p on p.id = new.user_id
    where m.id = new.member_id and (m.user_id = p.id or p.loyalty_account_id = m.id)
  ) then
    raise exception using errcode = '22023', message = 'Select a valid linked customer account.';
  end if;
  return new;
end;
$$;
create trigger validate_booking_customer_retag before update of user_id, member_id
on public.function_room_bookings for each row execute function public.validate_booking_customer_retag();
