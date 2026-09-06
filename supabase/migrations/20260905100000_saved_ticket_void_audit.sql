-- Append-only audit history for saved POS ticket voids and suspicious mutations.

create table if not exists public.saved_ticket_audit_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  store_id uuid,
  action text not null check (action in (
    'item_voided',
    'ticket_voided',
    'ticket_deleted',
    'ticket_charged',
    'ticket_items_changed'
  )),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  ticket_name text,
  order_type text,
  item_name text,
  item_data jsonb,
  ticket_snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.saved_ticket_audit_logs
  drop constraint if exists saved_ticket_audit_logs_action_check;
alter table public.saved_ticket_audit_logs
  add constraint saved_ticket_audit_logs_action_check check (action in (
    'item_voided',
    'ticket_voided',
    'ticket_deleted',
    'ticket_charged',
    'ticket_items_changed'
  ));

create index if not exists saved_ticket_audit_logs_store_created_idx
  on public.saved_ticket_audit_logs (store_id, created_at desc);

create index if not exists saved_ticket_audit_logs_ticket_created_idx
  on public.saved_ticket_audit_logs (ticket_id, created_at desc);

alter table public.saved_ticket_audit_logs enable row level security;

drop policy if exists "Saved ticket audit history is store scoped" on public.saved_ticket_audit_logs;
create policy "Saved ticket audit history is store scoped"
  on public.saved_ticket_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role, '')) in ('admin', 'super_admin')
          or p.store_id = saved_ticket_audit_logs.store_id
        )
    )
  );

revoke all on public.saved_ticket_audit_logs from anon, authenticated;
grant select on public.saved_ticket_audit_logs to authenticated;

create or replace function public.saved_ticket_item_is_voided(p_item jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_item->>'voided', 'false')) in ('true', '1', 'yes')
    or lower(coalesce(p_item->>'isVoided', 'false')) in ('true', '1', 'yes')
    or lower(coalesce(p_item->>'is_voided', 'false')) in ('true', '1', 'yes')
    or lower(coalesce(p_item->>'status', p_item->>'item_status', '')) like '%void%'
    or lower(coalesce(p_item->>'status', p_item->>'item_status', '')) like '%refund%';
$$;

create or replace function public.log_saved_ticket_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_profile jsonb;
  v_actor_name text;
  v_action text;
  v_reason text;
  v_old_items jsonb;
  v_new_items jsonb;
  v_old_item jsonb;
  v_new_item jsonb;
  v_index integer;
  v_void_count integer := 0;
begin
  select to_jsonb(p)
    into v_actor_profile
  from public.profiles p
  where p.id = v_actor_id;

  v_actor_name := coalesce(
    nullif(v_actor_profile->>'full_name', ''),
    nullif(v_actor_profile->>'name', ''),
    nullif(v_actor_profile->>'email', ''),
    'Unknown staff account'
  );
  v_reason := nullif(btrim(current_setting('app.saved_ticket_audit_reason', true)), '');

  if tg_op = 'DELETE' then
    v_action := nullif(current_setting('app.saved_ticket_audit_action', true), '');
    if v_action is null then
      if exists (
        select 1
        from public.orders o
        where coalesce(o.source_metadata->>'open_ticket_id', o.source_metadata->>'saved_ticket_id') = old.id::text
          and lower(coalesce(o.status, '')) in ('paid', 'completed', 'delivered')
      ) then
        v_action := 'ticket_charged';
      else
        v_action := 'ticket_deleted';
      end if;
    end if;

    insert into public.saved_ticket_audit_logs (
      ticket_id, store_id, action, reason, actor_id, actor_name,
      ticket_name, order_type, ticket_snapshot
    ) values (
      old.id, old.store_id, v_action, v_reason, v_actor_id, v_actor_name,
      old.ticket_name, old.order_type, to_jsonb(old)
    );
    return old;
  end if;

  if old.items is not distinct from new.items then
    return new;
  end if;

  v_old_items := coalesce(old.items, '[]'::jsonb);
  v_new_items := coalesce(new.items, '[]'::jsonb);

  for v_index in 0..greatest(jsonb_array_length(v_new_items) - 1, -1) loop
    v_new_item := v_new_items->v_index;
    v_old_item := v_old_items->v_index;

    if public.saved_ticket_item_is_voided(v_new_item)
       and not public.saved_ticket_item_is_voided(v_old_item) then
      insert into public.saved_ticket_audit_logs (
        ticket_id, store_id, action, reason, actor_id, actor_name,
        ticket_name, order_type, item_name, item_data, ticket_snapshot
      ) values (
        new.id, new.store_id, 'item_voided', v_reason, v_actor_id, v_actor_name,
        new.ticket_name, new.order_type,
        coalesce(v_new_item->>'name', v_new_item->>'item_name', 'Unnamed item'),
        jsonb_build_object('line_index', v_index, 'before', v_old_item, 'after', v_new_item),
        to_jsonb(new)
      );
      v_void_count := v_void_count + 1;
    end if;
  end loop;

  -- A non-void item rewrite is also retained so items cannot be silently removed
  -- or quantities reduced outside the normal void workflow.
  if v_void_count = 0 then
    insert into public.saved_ticket_audit_logs (
      ticket_id, store_id, action, reason, actor_id, actor_name,
      ticket_name, order_type, item_data, ticket_snapshot
    ) values (
      new.id, new.store_id, 'ticket_items_changed', v_reason, v_actor_id, v_actor_name,
      new.ticket_name, new.order_type,
      jsonb_build_object('before', v_old_items, 'after', v_new_items),
      to_jsonb(new)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_saved_ticket_update on public.open_tickets;
create trigger audit_saved_ticket_update
after update of items on public.open_tickets
for each row
execute function public.log_saved_ticket_mutation();

drop trigger if exists audit_saved_ticket_delete on public.open_tickets;
create trigger audit_saved_ticket_delete
before delete on public.open_tickets
for each row
execute function public.log_saved_ticket_mutation();

create or replace function public.void_saved_ticket(
  p_ticket_id uuid,
  p_store_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A void reason is required.';
  end if;

  perform set_config('app.saved_ticket_audit_action', 'ticket_voided', true);
  perform set_config('app.saved_ticket_audit_reason', btrim(p_reason), true);

  delete from public.open_tickets
  where id = p_ticket_id
    and store_id = p_store_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Saved ticket was not found in the active store.';
  end if;
  return true;
end;
$$;

create or replace function public.void_saved_ticket_item(
  p_ticket_id uuid,
  p_store_id uuid,
  p_item_index integer,
  p_total_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket public.open_tickets%rowtype;
  v_item jsonb;
  v_items jsonb;
  v_timestamp text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A void reason is required.';
  end if;
  if p_item_index is null or p_item_index < 0 then
    raise exception 'A valid saved-ticket item is required.';
  end if;

  select *
    into v_ticket
  from public.open_tickets
  where id = p_ticket_id
    and store_id = p_store_id
  for update;

  if v_ticket.id is null then
    raise exception 'Saved ticket was not found in the active store.';
  end if;

  v_items := coalesce(v_ticket.items, '[]'::jsonb);
  if p_item_index >= jsonb_array_length(v_items) then
    raise exception 'Saved-ticket item no longer exists.';
  end if;

  v_item := v_items->p_item_index;
  if public.saved_ticket_item_is_voided(v_item) then
    raise exception 'Saved-ticket item is already voided.';
  end if;

  v_item := v_item
    || jsonb_build_object(
      'voided', true,
      'isVoided', true,
      'status', 'voided',
      'voidedAt', v_timestamp,
      'voided_at', v_timestamp
    );
  v_items := jsonb_set(v_items, array[p_item_index::text], v_item, false);

  perform set_config('app.saved_ticket_audit_action', 'item_voided', true);
  perform set_config('app.saved_ticket_audit_reason', btrim(p_reason), true);

  update public.open_tickets
  set items = v_items,
      total_amount = greatest(coalesce(p_total_amount, 0), 0)
  where id = p_ticket_id
    and store_id = p_store_id;

  return jsonb_build_object('items', v_items, 'total_amount', greatest(coalesce(p_total_amount, 0), 0));
end;
$$;

revoke all on function public.void_saved_ticket(uuid, uuid, text) from public, anon;
revoke all on function public.void_saved_ticket_item(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.void_saved_ticket(uuid, uuid, text) to authenticated;
grant execute on function public.void_saved_ticket_item(uuid, uuid, integer, numeric, text) to authenticated;

comment on table public.saved_ticket_audit_logs is
  'Append-only saved POS ticket mutation history. Authenticated clients may read but cannot insert, update, or delete rows.';
