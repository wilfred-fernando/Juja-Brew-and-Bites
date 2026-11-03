begin;

-- Use the reservation's Manila business date, regardless of the inquiry date.
create or replace function public.enforce_december_booking_policy() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor_role text;
begin
  if extract(month from new.business_date) <> 12 and extract(month from old.business_date) <> 12 then
    return new;
  end if;
  if (new.status = 'cancelled_gc' and old.status is distinct from new.status)
     or (coalesce(new.converted_to_gc,false) and not coalesce(old.converted_to_gc,false)) then
    raise exception 'December cancellation reservation fees are forfeited and cannot be converted to a GC.';
  end if;
  if new.start_at is distinct from old.start_at or new.business_date is distinct from old.business_date then
    if coalesce(auth.role(),'') not in ('anon','authenticated') then return new; end if;
    select lower(role) into actor_role from public.profiles where id=auth.uid();
    if actor_role in ('admin','super_admin','cashier') then return new; end if;
    if old.start_at < statement_timestamp() + interval '72 hours' then
      raise exception 'December rescheduling is allowed only at least 3 days (72 hours) before the booking start time.';
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_december_booking_policy before update on public.function_room_bookings
for each row execute function public.enforce_december_booking_policy();

create or replace function public.queue_booking_cancellation_gcs() returns trigger
language plpgsql security definer set search_path = public as $$
declare batch_uuid uuid;
begin
  if extract(month from new.business_date) = 12 then return new; end if;
  if coalesce(new.status,'') not in ('cancelled','canceled','cancellation_requested','cancelled_gc')
     or new.payment_status is distinct from 'approved' or coalesce(new.deposit_amount,0) <= 0 then
    return new;
  end if;
  if exists (select 1 from public.booking_cancellation_gift_certificates where booking_id = new.id) then
    return new;
  end if;
  insert into public.booking_gc_batches(booking_id,customer_name,customer_email,amount)
  values(new.id,new.customer_name,new.email,new.deposit_amount)
  on conflict (booking_id) do nothing returning id into batch_uuid;
  if batch_uuid is not null then
    insert into public.booking_gc_certificates(batch_id,sequence_number)
    select batch_uuid, n from generate_series(1, floor(new.deposit_amount / 100)::integer) n;
  end if;
  return new;
end;
$$;

-- Also protect explicit GC issuance/approval, including a batch queued before
-- this policy. Previously approved/issued certificates are left unchanged.
create or replace function public.prevent_december_booking_gc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'approved' or new.status is distinct from 'approved' then return new; end if;
  end if;
  if exists (select 1 from public.function_room_bookings where id=new.booking_id and extract(month from business_date)=12) then
    raise exception 'December cancellation reservation fees are forfeited and cannot be converted to a GC.';
  end if;
  return new;
end;
$$;
create trigger prevent_december_booking_gc before insert or update of status on public.booking_gc_batches
for each row execute function public.prevent_december_booking_gc();
create trigger prevent_december_legacy_booking_gc before insert on public.booking_cancellation_gift_certificates
for each row execute function public.prevent_december_booking_gc();

update public.messenger_ai_settings
set instructions = concat(coalesce(instructions,''), E'\n\nDECEMBER-ONLY BOOKING POLICY\n',
  'Whenever a customer asks about a December function-room booking, availability, or package for a December event, proactively explain: rescheduling is allowed only at least 3 days (72 hours) before the booking start time. If a December booking is cancelled, the reservation fee is forfeited and will not be converted to a gift certificate (GC). Apply this based on the booking date in Asia/Manila, not the inquiry date. This overrides conflicting general notes, saved memories, and prior conversations for December only. Other months retain their existing policy.'),
reference_notes = replace(replace(coalesce(reference_notes,''),
  'Updates or rescheduling are available only when the booking starts at least two days later.',
  'Updates require at least two days. Rescheduling requires at least two days outside December, and at least three days (72 hours) before a December booking starts.'),
  'Cancellation of an approved booking is a request that requires admin review before any gift-certificate conversion;',
  'Outside December, cancellation of an approved booking requires admin review before any gift-certificate conversion; for December cancellations the reservation fee is forfeited and no GC is issued;'),
updated_at = now()
where id=1 and position('DECEMBER-ONLY BOOKING POLICY' in coalesce(instructions,''))=0;

notify pgrst, 'reload schema';
commit;
