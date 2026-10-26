begin;
alter table public.function_room_bookings add column first_confirmed_at timestamptz;
-- Historical confirmations must never become new collections through an edit.
update public.function_room_bookings b set first_confirmed_at=coalesce(b.created_at,now())
where b.status='confirmed' or b.payment_status='approved'
  or to_jsonb(b)->'update_request_previous'->>'status'='confirmed'
  or exists(select 1 from public.booking_reservation_vouchers v where v.booking_id=b.id);

create function public.track_booking_first_confirmation() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then new.first_confirmed_at:=case when new.status='confirmed' then now() else null end;
  else
    new.first_confirmed_at:=old.first_confirmed_at;
    if new.first_confirmed_at is null and new.status='confirmed' then new.first_confirmed_at:=now(); end if;
  end if;
  return new;
end $$;
create trigger track_booking_first_confirmation before insert or update on public.function_room_bookings
for each row execute function public.track_booking_first_confirmation();

create or replace function public.receipt_approved_booking_fee() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='confirmed' and new.payment_status='approved' and coalesce(new.deposit_amount,0)>0
    and coalesce(new.payment_method,'')<>'Waived' then
    if tg_op='INSERT' then
      perform public.ensure_booking_reservation_receipt(new.id);
    elsif old.first_confirmed_at is null then
      perform public.ensure_booking_reservation_receipt(new.id);
    end if;
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
commit;
