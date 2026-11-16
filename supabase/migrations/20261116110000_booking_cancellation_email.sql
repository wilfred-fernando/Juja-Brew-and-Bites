begin;
create table public.booking_cancellation_emails (
  booking_id uuid primary key references public.function_room_bookings(id),
  booking_snapshot jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  error text
);
alter table public.booking_cancellation_emails enable row level security;
revoke all on public.booking_cancellation_emails from public,anon,authenticated;
grant all on public.booking_cancellation_emails to service_role;
create function public.queue_booking_cancellation_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('cancelled','canceled','cancelled_gc') and old.status not in ('cancelled','canceled','cancelled_gc') then
    insert into public.booking_cancellation_emails(booking_id,booking_snapshot) values(new.id,to_jsonb(new)) on conflict(booking_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_booking_cancellation_email after update of status on public.function_room_bookings
for each row execute function public.queue_booking_cancellation_email();
-- No backfill: historical cancellations must not send unsolicited repeat mail.
notify pgrst,'reload schema';
commit;
