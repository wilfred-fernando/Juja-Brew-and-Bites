begin;

create table if not exists public.messenger_customer_memories (
  psid text primary key references public.messenger_contacts(psid) on delete cascade,
  page_id text,
  summary text not null default '',
  preferred_branch text,
  fulfillment_preference text,
  common_orders jsonb not null default '[]'::jsonb,
  unresolved_concerns jsonb not null default '[]'::jsonb,
  previous_handoffs integer not null default 0 check (previous_handoffs >= 0),
  last_handoff_at timestamptz,
  source_event_count integer not null default 0 check (source_event_count >= 0),
  last_summarized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('unanswered', 'live_chat')),
  normalized_question text not null,
  sample_question text not null,
  suggested_answer text not null default '',
  source_event_ids text[] not null default '{}',
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, normalized_question)
);

create index if not exists messenger_customer_memories_updated_idx
  on public.messenger_customer_memories (updated_at desc);
create index if not exists messenger_knowledge_candidates_status_idx
  on public.messenger_knowledge_candidates (status, occurrence_count desc, updated_at desc);

drop trigger if exists set_messenger_customer_memories_updated_at on public.messenger_customer_memories;
create trigger set_messenger_customer_memories_updated_at
before update on public.messenger_customer_memories
for each row execute function public.set_messenger_updated_at();

drop trigger if exists set_messenger_knowledge_candidates_updated_at on public.messenger_knowledge_candidates;
create trigger set_messenger_knowledge_candidates_updated_at
before update on public.messenger_knowledge_candidates
for each row execute function public.set_messenger_updated_at();

alter table public.messenger_customer_memories enable row level security;
alter table public.messenger_knowledge_candidates enable row level security;
revoke all on table public.messenger_customer_memories from anon, authenticated;
revoke all on table public.messenger_knowledge_candidates from anon, authenticated;

alter table public.messenger_events add column if not exists search_text text not null default '';
alter table public.messenger_events add column if not exists search_document tsvector;

create or replace function public.set_messenger_event_search_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.search_text := left(coalesce(
    new.payload #>> '{message,text}',
    new.payload #>> '{postback,title}',
    new.payload #>> '{postback,payload}',
    ''
  ), 4000);
  new.search_document := to_tsvector('simple', new.search_text);
  return new;
end;
$$;

drop trigger if exists set_messenger_event_search_document on public.messenger_events;
create trigger set_messenger_event_search_document
before insert or update of payload on public.messenger_events
for each row execute function public.set_messenger_event_search_document();

update public.messenger_events
set payload = payload
where search_text = '' or search_document is null;

create index if not exists messenger_events_search_document_idx
  on public.messenger_events using gin (search_document);

create or replace function public.search_messenger_history(
  p_psid text,
  p_query text,
  p_limit integer default 6
)
returns table (
  event_id text,
  direction text,
  event_type text,
  message_text text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select e.event_id, e.direction, e.event_type, e.search_text, e.created_at
  from public.messenger_events e
  where e.psid = p_psid
    and e.created_at < now() - interval '5 minutes'
    and length(trim(coalesce(p_query, ''))) > 0
    and e.search_document @@ websearch_to_tsquery('simple', p_query)
  order by ts_rank_cd(e.search_document, websearch_to_tsquery('simple', p_query)) desc, e.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

create or replace function public.record_messenger_knowledge_candidate(
  p_source_type text,
  p_question text,
  p_suggested_answer text default '',
  p_source_event_ids text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_normalized text;
  v_id uuid;
begin
  if p_source_type not in ('unanswered', 'live_chat') then
    raise exception 'Unsupported Messenger knowledge source type.';
  end if;

  v_normalized := lower(regexp_replace(trim(coalesce(p_question, '')), '[^[:alnum:]]+', ' ', 'g'));
  v_normalized := left(regexp_replace(v_normalized, '\s+', ' ', 'g'), 500);
  if length(v_normalized) < 3 then
    raise exception 'A meaningful customer question is required.';
  end if;

  insert into public.messenger_knowledge_candidates (
    source_type,
    normalized_question,
    sample_question,
    suggested_answer,
    source_event_ids
  ) values (
    p_source_type,
    v_normalized,
    left(trim(p_question), 1000),
    left(trim(coalesce(p_suggested_answer, '')), 4000),
    coalesce(p_source_event_ids, '{}')
  )
  on conflict (source_type, normalized_question) do update set
    sample_question = excluded.sample_question,
    suggested_answer = case
      when public.messenger_knowledge_candidates.status = 'approved' then public.messenger_knowledge_candidates.suggested_answer
      when length(excluded.suggested_answer) > length(public.messenger_knowledge_candidates.suggested_answer) then excluded.suggested_answer
      else public.messenger_knowledge_candidates.suggested_answer
    end,
    source_event_ids = (
      select array_agg(distinct value)
      from unnest(public.messenger_knowledge_candidates.source_event_ids || excluded.source_event_ids) as item(value)
    ),
    occurrence_count = public.messenger_knowledge_candidates.occurrence_count + 1,
    status = case when public.messenger_knowledge_candidates.status = 'approved' then 'approved' else 'pending' end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_messenger_handoff(
  p_psid text,
  p_page_id text default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.messenger_customer_memories (
    psid,
    page_id,
    previous_handoffs,
    last_handoff_at
  ) values (
    p_psid,
    p_page_id,
    1,
    now()
  )
  on conflict (psid) do update set
    page_id = coalesce(excluded.page_id, public.messenger_customer_memories.page_id),
    previous_handoffs = public.messenger_customer_memories.previous_handoffs + 1,
    last_handoff_at = now(),
    updated_at = now();
$$;

create or replace function public.list_messenger_function_room_blockers(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  start_at timestamptz,
  end_at timestamptz,
  status text,
  payment_status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.start_at, b.end_at, b.status, b.payment_status, b.created_at
  from public.function_room_bookings b
  where b.status in ('pending', 'confirmed', 'cancellation_requested')
    and b.end_at >= p_from
    and b.start_at <= p_to
    and not (
      b.status = 'pending'
      and lower(coalesce(b.payment_status, '')) = 'waiting_for_payment'
      and b.payment_proof_url is null
      and b.created_at < now() - interval '24 hours'
    )
  order by b.start_at;
$$;

revoke all on function public.search_messenger_history(text, text, integer) from public, anon, authenticated;
revoke all on function public.record_messenger_knowledge_candidate(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.record_messenger_handoff(text, text) from public, anon, authenticated;
revoke all on function public.list_messenger_function_room_blockers(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.search_messenger_history(text, text, integer) to service_role;
grant execute on function public.record_messenger_knowledge_candidate(text, text, text, text[]) to service_role;
grant execute on function public.record_messenger_handoff(text, text) to service_role;
grant execute on function public.list_messenger_function_room_blockers(timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
