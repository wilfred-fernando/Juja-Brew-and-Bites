-- Append-only POS cart accountability events. D1 receives idempotent archive copies.

create table if not exists public.pos_cart_audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  cart_session_id uuid not null,
  store_id uuid not null,
  action text not null check (action in ('item_added', 'item_removed')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  item_data jsonb not null,
  cart_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pos_cart_audit_logs_store_created_idx
  on public.pos_cart_audit_logs (store_id, created_at desc);

create index if not exists pos_cart_audit_logs_session_created_idx
  on public.pos_cart_audit_logs (cart_session_id, created_at);

alter table public.pos_cart_audit_logs enable row level security;

drop policy if exists "POS cart audit history is store scoped" on public.pos_cart_audit_logs;
create policy "POS cart audit history is store scoped"
  on public.pos_cart_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role, '')) in ('admin', 'super_admin')
          or p.store_id = pos_cart_audit_logs.store_id
        )
    )
  );

revoke all on public.pos_cart_audit_logs from anon, authenticated;
grant select on public.pos_cart_audit_logs to authenticated;

create or replace function public.prevent_pos_cart_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'POS cart audit logs are append-only';
end;
$$;

drop trigger if exists prevent_pos_cart_audit_update_delete on public.pos_cart_audit_logs;
create trigger prevent_pos_cart_audit_update_delete
before update or delete on public.pos_cart_audit_logs
for each row execute function public.prevent_pos_cart_audit_mutation();

create or replace function public.log_pos_cart_event(
  p_client_event_id uuid,
  p_cart_session_id uuid,
  p_store_id uuid,
  p_action text,
  p_item_data jsonb,
  p_cart_context jsonb default '{}'::jsonb
)
returns public.pos_cart_audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile jsonb;
  v_item_name text;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_result public.pos_cart_audit_logs;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select to_jsonb(p)
    into v_profile
  from public.profiles p
  where p.id = v_actor_id;

  if not found or lower(coalesce(v_profile->>'role', '')) not in ('cashier', 'admin', 'super_admin') then
    raise exception 'POS audit access is not allowed';
  end if;

  if p_store_id is null or (
    lower(coalesce(v_profile->>'role', '')) = 'cashier'
    and nullif(v_profile->>'store_id', '')::uuid is distinct from p_store_id
  ) then
    raise exception 'POS cart event does not belong to the authenticated cashier store';
  end if;

  if lower(coalesce(p_action, '')) not in ('item_added', 'item_removed') then
    raise exception 'Unsupported POS cart audit action';
  end if;

  if p_item_data is null or jsonb_typeof(p_item_data) <> 'object' then
    raise exception 'POS cart item data is required';
  end if;

  v_item_name := coalesce(nullif(p_item_data->>'name', ''), nullif(p_item_data->>'item_name', ''), 'Unnamed item');
  v_quantity := greatest(1, coalesce(nullif(p_item_data->>'quantity', '')::numeric, nullif(p_item_data->>'qty', '')::numeric, 1));
  v_unit_price := coalesce(nullif(p_item_data->>'unitPrice', '')::numeric, nullif(p_item_data->>'unit_price', '')::numeric, nullif(p_item_data->>'price', '')::numeric, 0);
  v_line_total := coalesce(nullif(p_item_data->>'lineTotal', '')::numeric, nullif(p_item_data->>'line_total', '')::numeric, nullif(p_item_data->>'net_amount', '')::numeric, v_unit_price * v_quantity);

  insert into public.pos_cart_audit_logs (
    client_event_id, cart_session_id, store_id, action, actor_id, actor_name,
    item_name, quantity, unit_price, line_total, item_data, cart_context
  ) values (
    p_client_event_id, p_cart_session_id, p_store_id, lower(p_action), v_actor_id,
    coalesce(nullif(v_profile->>'full_name', ''), nullif(v_profile->>'name', ''), nullif(v_profile->>'email', ''), 'Unknown staff account'),
    v_item_name, v_quantity, v_unit_price, v_line_total, p_item_data, coalesce(p_cart_context, '{}'::jsonb)
  )
  on conflict (client_event_id) do nothing;

  select * into v_result
  from public.pos_cart_audit_logs
  where client_event_id = p_client_event_id;

  return v_result;
end;
$$;

revoke all on function public.log_pos_cart_event(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_pos_cart_event(uuid, uuid, uuid, text, jsonb, jsonb) to authenticated;

comment on table public.pos_cart_audit_logs is
  'Append-only POS cart item add/remove history. client_event_id makes offline retries idempotent.';
