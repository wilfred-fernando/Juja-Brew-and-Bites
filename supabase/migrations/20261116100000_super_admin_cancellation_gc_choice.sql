begin;
alter table public.function_room_bookings
  add column cancellation_gc_choice text check(cancellation_gc_choice in ('generate','forfeit')),
  add column cancellation_gc_decided_by uuid references auth.users(id),
  add column cancellation_gc_decided_at timestamptz;

create function public.protect_booking_cancellation_gc_choice() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.cancellation_gc_choice is not distinct from old.cancellation_gc_choice
      and new.cancellation_gc_decided_by is not distinct from old.cancellation_gc_decided_by
      and new.cancellation_gc_decided_at is not distinct from old.cancellation_gc_decided_at then return new; end if;
  elsif new.cancellation_gc_choice is null and new.cancellation_gc_decided_by is null and new.cancellation_gc_decided_at is null then return new;
  end if;
  if coalesce(auth.role(),'') in ('anon','authenticated') then raise exception 'Use the Super Admin cancellation action'; end if;
  if new.cancellation_gc_choice is not null and not exists(select 1 from public.profiles where id=new.cancellation_gc_decided_by and lower(role)='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  return new;
end;
$$;
create trigger protect_booking_cancellation_gc_choice before insert or update on public.function_room_bookings
for each row execute function public.protect_booking_cancellation_gc_choice();

-- Preserve the existing queue and December policy; only an explicit forfeiture
-- prevents this booking from queuing future certificates.
do $$ declare definition text; begin
  select pg_get_functiondef('public.queue_booking_cancellation_gcs()'::regprocedure) into definition;
  if position('cancellation_gc_choice' in definition)=0 then
    if position('begin' in definition)=0 then raise exception 'Review cancellation GC queue before installing choice'; end if;
    execute replace(definition,'begin',E'begin\n  if new.cancellation_gc_choice = ''forfeit'' then return new; end if;');
  end if;
end $$;

create function public.prevent_forfeited_booking_gc() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.function_room_bookings where id=new.booking_id and cancellation_gc_choice='forfeit') then
    if tg_op='INSERT' then raise exception 'Reservation fee forfeited; no GC can be generated'; end if;
    if new.status='approved' and old.status is distinct from 'approved' then raise exception 'Reservation fee forfeited; no GC can be approved'; end if;
  end if;
  return new;
end;
$$;
create trigger prevent_forfeited_booking_gc before insert or update of status on public.booking_gc_batches
for each row execute function public.prevent_forfeited_booking_gc();
create trigger prevent_forfeited_legacy_booking_gc before insert on public.booking_cancellation_gift_certificates
for each row execute function public.prevent_forfeited_booking_gc();

create function public.super_admin_cancel_booking(p_booking_id uuid,p_generate_gc boolean,p_actor uuid,p_only_requested boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.function_room_bookings; batch public.booking_gc_batches; choice text;
begin
  if not exists(select 1 from public.profiles where id=p_actor and lower(role)='super_admin') then raise exception 'Super Admin access required'; end if;
  if p_generate_gc is null then raise exception 'Select Generate GC or Do not generate GC'; end if;
  choice:=case when p_generate_gc then 'generate' else 'forfeit' end;
  select * into b from public.function_room_bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  if b.cancellation_gc_choice is not null then
    if b.status='cancelled' and b.cancellation_gc_choice=choice then return to_jsonb(b); end if;
    raise exception 'This cancellation decision is already recorded; refresh the booking';
  end if;
  if b.start_at<=now() or b.status not in ('pending','confirmed','cancellation_requested')
    or (p_only_requested and b.status<>'cancellation_requested') then raise exception 'Select an upcoming active booking eligible for cancellation'; end if;
  if exists(select 1 from public.booking_pos_settlements where booking_id=b.id) then raise exception 'Booking already settled'; end if;
  select * into batch from public.booking_gc_batches where booking_id=b.id for update;
  if exists(select 1 from public.booking_cancellation_gift_certificates where booking_id=b.id)
    or batch.status='approved'
    or exists(select 1 from public.booking_gc_certificates where batch_id=batch.id and status in ('active','redeemed')) then
    raise exception 'A GC has already been issued; cancellation requires a separate review';
  end if;
  if p_generate_gc then
    if extract(month from b.business_date)=12 then raise exception 'December cancellation reservation fees are forfeited and cannot be converted to a GC'; end if;
    if b.payment_status is distinct from 'approved' or coalesce(b.deposit_amount,0)<100 or b.payment_method='Waived' or mod(b.deposit_amount,100)<>0 then
      raise exception 'GC generation requires an approved reservation fee in multiples of PHP 100';
    end if;
    if batch.status='rejected' then raise exception 'This GC batch was rejected and requires a separate review'; end if;
  elsif batch.id is not null then
    update public.booking_gc_batches set status='rejected' where id=batch.id and status='pending_approval';
  end if;
  update public.function_room_bookings set status='cancelled',cancellation_gc_choice=choice,
    cancellation_gc_decided_by=p_actor,cancellation_gc_decided_at=now(),updated_at=now() where id=b.id returning * into b;
  return to_jsonb(b);
end;
$$;
revoke all on function public.super_admin_cancel_booking(uuid,boolean,uuid,boolean) from public,anon,authenticated;
grant execute on function public.super_admin_cancel_booking(uuid,boolean,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
