begin;

-- Return only collection existence; do not grant access to the voucher table.
create function public.admin_booking_fee_is_recorded(p_booking_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')) then
    raise exception 'Admin access required';
  end if;
  return exists(select 1 from public.booking_reservation_vouchers where booking_id=p_booking_id);
end;
$$;
revoke all on function public.admin_booking_fee_is_recorded(uuid) from public,anon,authenticated;
grant execute on function public.admin_booking_fee_is_recorded(uuid) to authenticated;

create function public.validate_booking_fee_amount_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.deposit_amount is not distinct from old.deposit_amount then return new; end if;
  if coalesce(auth.role(),'') in ('anon','authenticated') and not exists (
    select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')
  ) then raise exception 'Only Admin can change the reservation fee amount'; end if;
  if new.deposit_amount is null or new.deposit_amount < 0 or new.deposit_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Enter a valid non-negative reservation fee amount';
  end if;
  return new;
end;
$$;
create trigger validate_booking_fee_amount_change before update of deposit_amount on public.function_room_bookings
for each row execute function public.validate_booking_fee_amount_change();

-- An explicit correction from zero to a paid amount is a new collection action.
-- Schedule/extension edits and retries must never create another receipt.
create function public.receipt_corrected_zero_booking_fee() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.deposit_amount=0 and new.deposit_amount>0 and new.status='confirmed'
     and new.payment_status='approved' and coalesce(new.payment_method,'')<>'Waived' then
    perform public.ensure_booking_reservation_receipt(new.id);
  end if;
  return new;
end;
$$;
create trigger receipt_corrected_zero_booking_fee after update of deposit_amount on public.function_room_bookings
for each row execute function public.receipt_corrected_zero_booking_fee();

notify pgrst, 'reload schema';
commit;
