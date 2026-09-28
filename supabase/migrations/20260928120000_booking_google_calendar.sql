begin;

-- One durable desired state per booking. No FK: deleted bookings still need syncing.
create table public.booking_google_calendar_sync (
  booking_id text primary key,
  payload jsonb not null,
  revision bigint not null default 1,
  synced_revision bigint not null default 0,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  synced_at timestamptz
);
alter table public.booking_google_calendar_sync enable row level security;
revoke all on public.booking_google_calendar_sync from anon, authenticated;
grant all on public.booking_google_calendar_sync to service_role;

create function public.queue_booking_google_calendar()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare snapshot jsonb; previous_snapshot jsonb;
begin
  snapshot := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  if TG_OP = 'DELETE' then snapshot := snapshot || '{"status":"cancelled"}'::jsonb; end if;
  if snapshot->>'status' = 'confirmed' then
    -- Ignore unrelated writes; never let a pending request overwrite approved details.
    snapshot := jsonb_build_object(
      'id', snapshot->>'id', 'customer_name', snapshot->>'customer_name',
      'package_id', snapshot->>'package_id', 'guest_count', snapshot->>'guest_count',
      'start_at', snapshot->>'start_at', 'end_at', snapshot->>'end_at', 'status', 'confirmed');
    if (snapshot->>'end_at')::timestamptz < now()
       and not exists(select 1 from public.booking_google_calendar_sync where booking_id = snapshot->>'id') then
      return null;
    end if;
  elsif snapshot->>'status' in ('cancelled', 'cancelled_gc', 'rejected', 'expired') then
    select payload into previous_snapshot from public.booking_google_calendar_sync where booking_id = snapshot->>'id';
    if previous_snapshot is null then return null; end if;
    snapshot := previous_snapshot || '{"status":"cancelled"}'::jsonb;
  else
    return null;
  end if;
  insert into public.booking_google_calendar_sync as q (booking_id, payload)
  values (snapshot->>'id', snapshot)
  on conflict (booking_id) do update set payload = excluded.payload,
    revision = q.revision + 1, attempts = 0, next_attempt_at = now(), last_error = null
  where q.payload is distinct from excluded.payload;
  return null;
end;
$$;

create function public.claim_booking_google_calendar()
returns setof public.booking_google_calendar_sync
language sql security definer set search_path = pg_catalog, public as $$
  with candidate as (
    select booking_id from public.booking_google_calendar_sync
    where synced_revision < revision and next_attempt_at <= now()
      and (lease_until is null or lease_until < now())
    order by next_attempt_at, booking_id for update skip locked limit 1
  )
  update public.booking_google_calendar_sync q
  set lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
  from candidate c where q.booking_id = c.booking_id returning q.*;
$$;

create function public.finish_booking_google_calendar(p_booking_id text, p_token uuid, p_revision bigint, p_error text)
returns void language sql security definer set search_path = pg_catalog, public as $$
  update public.booking_google_calendar_sync
  set synced_revision = case when p_error is null then p_revision else synced_revision end,
      synced_at = case when p_error is null then now() else synced_at end,
      attempts = case when p_error is null or revision <> p_revision then 0 else attempts + 1 end,
      last_error = case when revision <> p_revision then null else left(p_error, 300) end,
      next_attempt_at = case when p_error is null or revision <> p_revision then now()
        else now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7)))::integer) end,
      lease_token = null, lease_until = null
  where booking_id = p_booking_id and lease_token = p_token;
$$;

revoke all on function public.queue_booking_google_calendar() from public, anon, authenticated;
revoke all on function public.claim_booking_google_calendar() from public, anon, authenticated;
revoke all on function public.finish_booking_google_calendar(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.claim_booking_google_calendar() to service_role;
grant execute on function public.finish_booking_google_calendar(text, uuid, bigint, text) to service_role;

lock table public.function_room_bookings in share row exclusive mode;
create trigger booking_google_calendar_change after insert or update or delete
on public.function_room_bookings for each row execute function public.queue_booking_google_calendar();

-- Seed existing upcoming confirmed bookings atomically with trigger installation.
insert into public.booking_google_calendar_sync (booking_id, payload)
select id::text, jsonb_build_object('id', id::text, 'customer_name', customer_name,
  'package_id', package_id::text, 'guest_count', guest_count::text,
  'start_at', start_at, 'end_at', end_at, 'status', 'confirmed')
from public.function_room_bookings where status = 'confirmed' and end_at >= now();
commit;
