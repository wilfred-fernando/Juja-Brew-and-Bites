-- New issuances only; preserve previously issued full-value certificates.
create table public.booking_gc_batches (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.function_room_bookings(id),
  customer_name text,
  customer_email text,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending_approval' check (status in ('pending_approval','approved')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending','sending','sent','failed')),
  email_error text,
  email_started_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Valid through the Manila calendar date 90 days after creation; exclusive next midnight.
  expires_at timestamptz generated always as
    ((((created_at at time zone 'Asia/Manila')::date + 91)::timestamp) at time zone 'Asia/Manila') stored
);
create table public.booking_gc_certificates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.booking_gc_batches(id),
  sequence_number integer not null check (sequence_number > 0),
  -- Random numeric suffix lets Code 128 encode digit pairs compactly for email-sized images.
  code text not null unique default ('JUJA-GC-' || lpad(
    mod(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint, 1000000000000000000)::text, 18, '0')),
  amount numeric(12,2) not null default 100 check (amount = 100),
  status text not null default 'pending_approval' check (status in ('pending_approval','active','redeemed')),
  redeemed_at timestamptz,
  unique(batch_id, sequence_number)
);
alter table public.booking_gc_batches enable row level security;
alter table public.booking_gc_certificates enable row level security;
-- All mutations go through the authenticated admin API/service-only RPC.
revoke all on public.booking_gc_batches, public.booking_gc_certificates from anon, authenticated;
grant all on public.booking_gc_batches, public.booking_gc_certificates to service_role;

create function public.queue_booking_cancellation_gcs() returns trigger
language plpgsql security definer set search_path = public as $$
declare batch_uuid uuid;
begin
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
create trigger queue_booking_cancellation_gcs
after insert or update of status, payment_status on public.function_room_bookings
for each row execute function public.queue_booking_cancellation_gcs();

create function public.approve_booking_gc_batch(p_batch_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare batch public.booking_gc_batches; booking public.function_room_bookings;
begin
  if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then
    raise exception 'Admin access required';
  end if;
  -- Lock booking before batch to match the booking trigger lock order.
  select b.* into booking from public.function_room_bookings b
    join public.booking_gc_batches g on g.booking_id=b.id where g.id=p_batch_id for update of b;
  select * into batch from public.booking_gc_batches where id=p_batch_id for update;
  if batch.id is null then raise exception 'Certificate batch not found'; end if;
  if batch.expires_at <= statement_timestamp() then raise exception 'These certificates have expired'; end if;
  if batch.status='approved' then return; end if;
  if coalesce(booking.status,'') not in ('cancelled','canceled','cancelled_gc','cancellation_requested')
     or booking.payment_status is distinct from 'approved' then
    raise exception 'Only cancelled bookings with verified reservation payments qualify';
  end if;
  if exists(select 1 from public.booking_cancellation_gift_certificates where booking_id=booking.id) then
    raise exception 'This booking already has a legacy gift certificate';
  end if;
  if batch.amount is distinct from booking.deposit_amount or mod(batch.amount,100) <> 0
     or (select coalesce(sum(amount),0) from public.booking_gc_certificates where batch_id=batch.id) <> batch.amount then
    raise exception 'Reservation amount requires review; certificates must exactly cover the fee in PHP 100 units';
  end if;
  if coalesce(batch.customer_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid customer email is required';
  end if;
  update public.booking_gc_batches set status='approved', approved_by=p_actor, approved_at=now() where id=batch.id;
  update public.booking_gc_certificates set status='active' where batch_id=batch.id and status='pending_approval';
  update public.function_room_bookings set status='cancelled_gc' where id=booking.id;
end;
$$;
revoke all on function public.approve_booking_gc_batch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_booking_gc_batch(uuid,uuid) to service_role;
