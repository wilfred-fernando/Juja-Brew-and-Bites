-- Preserve existing certificate promises; new cancellation batches get 30 days.
alter table public.booking_gc_batches
  add column cancellation_validity_days integer not null default 90
  check (cancellation_validity_days in (30, 90));
alter table public.booking_gc_batches alter column cancellation_validity_days set default 30;
alter table public.booking_gc_batches drop column expires_at;
alter table public.booking_gc_batches add column expires_at timestamptz generated always as (
  (case when purchase_id is not null
    then ((created_at at time zone 'Asia/Manila')::date + interval '6 months' + interval '1 day')
    else (((created_at at time zone 'Asia/Manila')::date + cancellation_validity_days + 1)::timestamp)
  end) at time zone 'Asia/Manila'
) stored;
