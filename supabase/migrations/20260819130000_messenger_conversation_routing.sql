begin;

create table if not exists public.messenger_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  start_node_key text not null default 'start',
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_flow_nodes (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.messenger_flows(id) on delete cascade,
  node_key text not null,
  node_type text not null check (node_type in ('message', 'question', 'condition', 'action', 'handoff', 'goto', 'end')),
  name text not null default '',
  config jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, node_key)
);

create table if not exists public.messenger_flow_edges (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.messenger_flows(id) on delete cascade,
  source_node_key text not null,
  source_handle text not null default 'default',
  target_node_key text not null,
  condition jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique (flow_id, source_node_key, source_handle, target_node_key)
);

create table if not exists public.messenger_triggers (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.messenger_flows(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('keyword', 'postback', 'get_started', 'fallback')),
  pattern text not null default '',
  match_type text not null default 'equals' check (match_type in ('equals', 'contains', 'starts_with', 'regex')),
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_contacts (
  psid text primary key,
  display_name text,
  first_name text,
  last_name text,
  locale text,
  timezone integer,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  bot_paused boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_sessions (
  id uuid primary key default gen_random_uuid(),
  psid text not null references public.messenger_contacts(psid) on delete cascade,
  flow_id uuid not null references public.messenger_flows(id) on delete cascade,
  current_node_key text,
  waiting_for_input boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'failed')),
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists messenger_sessions_one_active_per_contact
  on public.messenger_sessions (psid)
  where status = 'active';

create table if not exists public.messenger_events (
  event_id text primary key,
  psid text references public.messenger_contacts(psid) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists messenger_triggers_match_idx
  on public.messenger_triggers (trigger_type, is_active, priority desc);
create index if not exists messenger_nodes_flow_idx
  on public.messenger_flow_nodes (flow_id, node_key);
create index if not exists messenger_edges_flow_source_idx
  on public.messenger_flow_edges (flow_id, source_node_key, priority desc);
create index if not exists messenger_contacts_handoff_idx
  on public.messenger_contacts (bot_paused, last_message_at desc);
create index if not exists messenger_events_contact_idx
  on public.messenger_events (psid, created_at desc);

create or replace function public.set_messenger_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_messenger_flows_updated_at on public.messenger_flows;
create trigger set_messenger_flows_updated_at before update on public.messenger_flows
for each row execute function public.set_messenger_updated_at();
drop trigger if exists set_messenger_nodes_updated_at on public.messenger_flow_nodes;
create trigger set_messenger_nodes_updated_at before update on public.messenger_flow_nodes
for each row execute function public.set_messenger_updated_at();
drop trigger if exists set_messenger_triggers_updated_at on public.messenger_triggers;
create trigger set_messenger_triggers_updated_at before update on public.messenger_triggers
for each row execute function public.set_messenger_updated_at();
drop trigger if exists set_messenger_contacts_updated_at on public.messenger_contacts;
create trigger set_messenger_contacts_updated_at before update on public.messenger_contacts
for each row execute function public.set_messenger_updated_at();
drop trigger if exists set_messenger_sessions_updated_at on public.messenger_sessions;
create trigger set_messenger_sessions_updated_at before update on public.messenger_sessions
for each row execute function public.set_messenger_updated_at();

alter table public.messenger_flows enable row level security;
alter table public.messenger_flow_nodes enable row level security;
alter table public.messenger_flow_edges enable row level security;
alter table public.messenger_triggers enable row level security;
alter table public.messenger_contacts enable row level security;
alter table public.messenger_sessions enable row level security;
alter table public.messenger_events enable row level security;

revoke all on public.messenger_flows from anon, authenticated;
revoke all on public.messenger_flow_nodes from anon, authenticated;
revoke all on public.messenger_flow_edges from anon, authenticated;
revoke all on public.messenger_triggers from anon, authenticated;
revoke all on public.messenger_contacts from anon, authenticated;
revoke all on public.messenger_sessions from anon, authenticated;
revoke all on public.messenger_events from anon, authenticated;

insert into public.messenger_flows (id, name, slug, description, status, start_node_key)
values
  ('10000000-0000-4000-8000-000000000001', 'Welcome', 'welcome', 'Main greeting and navigation.', 'published', 'welcome'),
  ('10000000-0000-4000-8000-000000000002', 'Order online', 'order-online', 'Routes customers to the ordering site.', 'published', 'order'),
  ('10000000-0000-4000-8000-000000000003', 'Store details', 'store-details', 'Current branch addresses and operating hours.', 'published', 'store'),
  ('10000000-0000-4000-8000-000000000004', 'Human handoff', 'human-handoff', 'Pauses automation so staff can take over.', 'published', 'handoff'),
  ('10000000-0000-4000-8000-000000000005', 'Fallback', 'fallback', 'Default response when no trigger matches.', 'published', 'fallback')
on conflict (slug) do nothing;

insert into public.messenger_flow_nodes (flow_id, node_key, node_type, name, config, position_x, position_y)
values
  ('10000000-0000-4000-8000-000000000001', 'welcome', 'message', 'Welcome message',
   '{"text":"Hi! Welcome to JUJA Brew & Bites. How can I help you today?","quick_replies":[{"title":"View menu","payload":"MENU"},{"title":"Order online","payload":"ORDER"},{"title":"Store details","payload":"STORE_DETAILS"},{"title":"Talk to staff","payload":"HUMAN_HELP"}]}'::jsonb, 80, 80),
  ('10000000-0000-4000-8000-000000000002', 'order', 'message', 'Ordering link',
   '{"text":"Browse the current menu, choose your branch, and place your order online.","buttons":[{"type":"web_url","title":"Order online","url":"{{order_url}}"},{"type":"postback","title":"Store details","payload":"STORE_DETAILS"}]}'::jsonb, 80, 80),
  ('10000000-0000-4000-8000-000000000003', 'store', 'message', 'Branch information',
   '{"text":"JUJA Brew & Bites branches:\n\nVisayas Avenue: 36D Visayas Ave., Pasong Tamo, Quezon City — open daily, 10 AM to 12 midnight.\n\nCongressional Avenue: 8 Visayas Ave., Diliman, Quezon City — Monday to Saturday, 9 AM to 10 PM; closed Sunday.","quick_replies":[{"title":"Order online","payload":"ORDER"},{"title":"Talk to staff","payload":"HUMAN_HELP"}]}'::jsonb, 80, 80),
  ('10000000-0000-4000-8000-000000000004', 'handoff', 'handoff', 'Pause bot',
   '{"text":"A staff member can continue this conversation in Messenger. Please send your name, preferred branch, and what you need help with.","reason":"Customer requested staff"}'::jsonb, 80, 80),
  ('10000000-0000-4000-8000-000000000005', 'fallback', 'message', 'Fallback message',
   '{"text":"I can help with our menu, online ordering, store details, or connect you with staff.","quick_replies":[{"title":"View menu","payload":"MENU"},{"title":"Order online","payload":"ORDER"},{"title":"Store details","payload":"STORE_DETAILS"},{"title":"Talk to staff","payload":"HUMAN_HELP"}]}'::jsonb, 80, 80)
on conflict (flow_id, node_key) do nothing;

insert into public.messenger_triggers (flow_id, trigger_type, pattern, match_type, priority)
values
  ('10000000-0000-4000-8000-000000000001', 'get_started', 'GET_STARTED', 'equals', 100),
  ('10000000-0000-4000-8000-000000000001', 'keyword', 'hello', 'contains', 80),
  ('10000000-0000-4000-8000-000000000001', 'keyword', 'hi', 'equals', 80),
  ('10000000-0000-4000-8000-000000000002', 'postback', 'MENU', 'equals', 100),
  ('10000000-0000-4000-8000-000000000002', 'postback', 'ORDER', 'equals', 100),
  ('10000000-0000-4000-8000-000000000002', 'keyword', 'menu', 'contains', 70),
  ('10000000-0000-4000-8000-000000000002', 'keyword', 'order', 'contains', 70),
  ('10000000-0000-4000-8000-000000000003', 'postback', 'STORE_DETAILS', 'equals', 100),
  ('10000000-0000-4000-8000-000000000003', 'keyword', 'store', 'contains', 70),
  ('10000000-0000-4000-8000-000000000003', 'keyword', 'hours', 'contains', 70),
  ('10000000-0000-4000-8000-000000000003', 'keyword', 'address', 'contains', 70),
  ('10000000-0000-4000-8000-000000000004', 'postback', 'HUMAN_HELP', 'equals', 110),
  ('10000000-0000-4000-8000-000000000004', 'keyword', 'staff', 'contains', 90),
  ('10000000-0000-4000-8000-000000000004', 'keyword', 'human', 'contains', 90),
  ('10000000-0000-4000-8000-000000000005', 'fallback', '', 'equals', -100)
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
