begin;

-- Enforce review even for older POS clients and direct booking RPC calls.
create or replace function public.enforce_cashier_booking_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor_role text;
begin
  select lower(role) into actor_role from public.profiles where id=auth.uid();
  if actor_role='cashier' then
    if tg_op='INSERT' then
      new.status:='pending';
      new.payment_status:=case new.payment_method when 'Waived' then 'waived' when 'Cash' then 'cash_pending' else 'submitted' end;
    elsif (new.status='confirmed' and new.status is distinct from old.status)
       or (old.status='pending' and new.payment_status='approved' and new.payment_status is distinct from old.payment_status) then
      raise exception 'Admin approval is required for cashier bookings';
    end if;
  end if;
  return new;
end $$;
create trigger enforce_cashier_booking_review before insert or update of status,payment_status
on public.function_room_bookings for each row execute function public.enforce_cashier_booking_review();

notify pgrst,'reload schema';
commit;
