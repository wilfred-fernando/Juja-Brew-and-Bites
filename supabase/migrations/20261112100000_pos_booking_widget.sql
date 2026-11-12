begin;
create table public.pos_booking_widget_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  store_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.pos_booking_widget_devices enable row level security;
revoke all on public.pos_booking_widget_devices from public,anon,authenticated;
grant all on public.pos_booking_widget_devices to service_role;

create function public.read_pos_booking_widget(p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare device public.pos_booking_widget_devices; actor public.profiles; booking_store text; rows jsonb;
begin
  select * into device from public.pos_booking_widget_devices where token_hash=p_token_hash and expires_at>now();
  if device.device_id is null then return null; end if;
  select * into actor from public.profiles where id=device.user_id;
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin')
    or (lower(actor.role)='cashier' and actor.store_id::text is distinct from device.store_id) then return null; end if;
  if not exists(select 1 from auth.sessions where id=device.session_id and user_id=device.user_id) then return null; end if;
  select id::text into booking_store from public.stores where coalesce(store_name,name,'') ilike '%Pasong Tamo%' order by id limit 1;
  rows:='[]'::jsonb;
  if device.store_id=booking_store then
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'customer_name',b.customer_name,'event_type',b.event_type,
      'start_at',b.start_at,'end_at',b.end_at,'payment_status',b.payment_status,'package_id',b.package_id,
      'guest_count',b.guest_count) order by b.start_at,b.id),'[]'::jsonb) into rows
    from public.function_room_bookings b where b.status='confirmed' and b.end_at>now()
      and b.start_at < ((date_trunc('month',now() at time zone 'Asia/Manila')+interval '4 months') at time zone 'Asia/Manila')
      and coalesce(b.payment_status,'') not in ('expired','cancelled','canceled')
      and not exists(select 1 from public.booking_pos_settlements s where s.booking_id=b.id);
  end if;
  return jsonb_build_object('store_id',device.store_id,'bookings',rows,'generated_at',now());
end;
$$;
revoke all on function public.read_pos_booking_widget(text) from public,anon,authenticated;
grant execute on function public.read_pos_booking_widget(text) to service_role;
notify pgrst,'reload schema';
commit;
