create table if not exists public.booking_cancellation_gift_certificates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.function_room_bookings(id) on delete cascade,
  code text not null unique,
  customer_name text,
  customer_email text,
  customer_contact text,
  amount numeric(12, 2) not null default 0,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  approved_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_cancellation_gc_booking_id_key
  on public.booking_cancellation_gift_certificates(booking_id);

alter table public.booking_cancellation_gift_certificates enable row level security;

drop policy if exists "Admins can view booking cancellation gift certificates" on public.booking_cancellation_gift_certificates;
create policy "Admins can view booking cancellation gift certificates"
  on public.booking_cancellation_gift_certificates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

drop policy if exists "Admins can manage booking cancellation gift certificates" on public.booking_cancellation_gift_certificates;
create policy "Admins can manage booking cancellation gift certificates"
  on public.booking_cancellation_gift_certificates
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
    )
  );

comment on table public.booking_cancellation_gift_certificates is
  'Gift certificate credits generated when an approved function-room booking cancellation is approved by admin.';
