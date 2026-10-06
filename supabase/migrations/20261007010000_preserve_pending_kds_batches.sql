begin;
set local lock_timeout = '5s';

-- Older open POS clients still update the parent card and retire prior items.
-- Redirect their newly added lines into an independent, retry-safe batch.
create or replace function public.preserve_pending_pos_kds_batch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  additions jsonb;
  batch_key text;
  batch public.kds_tickets%rowtype;
begin
  if old.source_type <> 'pos' or old.source_id like '%:batch:%'
    or old.status in ('voided', 'rejected') then return new; end if;

  select jsonb_agg(item order by position) into additions
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) with ordinality incoming(item, position)
  where item->>'id' is not null and not exists (
    select 1 from jsonb_array_elements(coalesce(old.items, '[]'::jsonb)) prior
    where prior->>'id' = item->>'id'
  );
  if additions is null then return new; end if;

  select md5(string_agg(item->>'id', '|' order by item->>'id')) into batch_key
  from jsonb_array_elements(additions) item;
  batch := old;
  batch.id := gen_random_uuid();
  batch.source_id := old.source_id || ':batch:legacy-' || batch_key;
  batch.items := additions;
  batch.created_at := now();
  batch.source_created_at := now();
  batch.updated_at := now();
  batch.status := 'preparing';
  batch.started_at := now();
  batch.ready_at := null;
  batch.completed_at := null;
  batch.voided_at := null;
  insert into public.kds_tickets select (batch).* on conflict (source_type, source_id) do nothing;
  -- Return the original row so the legacy client receives an acknowledgement
  -- without changing pending items or resetting their kitchen progress.
  return old;
end;
$$;
revoke all on function public.preserve_pending_pos_kds_batch() from public;
drop trigger if exists preserve_pending_pos_kds_batch on public.kds_tickets;
create trigger preserve_pending_pos_kds_batch before update of items on public.kds_tickets
for each row execute function public.preserve_pending_pos_kds_batch();
commit;
