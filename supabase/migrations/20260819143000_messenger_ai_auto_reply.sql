begin;

alter table public.messenger_flow_nodes
  drop constraint if exists messenger_flow_nodes_node_type_check;
alter table public.messenger_flow_nodes
  add constraint messenger_flow_nodes_node_type_check
  check (node_type in ('message', 'question', 'condition', 'action', 'handoff', 'goto', 'ai', 'end'));

update public.messenger_flows
set name = 'AI assistant',
    description = 'Business-aware AI reply when no deterministic trigger matches.',
    updated_at = now()
where slug = 'fallback';

update public.messenger_flow_nodes
set node_type = 'ai',
    name = 'AI auto reply',
    config = jsonb_build_object(
      'instructions', 'Answer the customer directly using only verified JUJA Brew & Bites information. Prefer a helpful next step and direct uncertain or account-specific requests to staff.',
      'fallback_text', 'I’m unable to answer that automatically right now. Type “staff” and our team will help you.',
      'quick_replies', jsonb_build_array(
        jsonb_build_object('title', 'View menu', 'payload', 'MENU'),
        jsonb_build_object('title', 'Order online', 'payload', 'ORDER'),
        jsonb_build_object('title', 'Store details', 'payload', 'STORE_DETAILS'),
        jsonb_build_object('title', 'Talk to staff', 'payload', 'HUMAN_HELP')
      )
    ),
    updated_at = now()
where flow_id = '10000000-0000-4000-8000-000000000005'
  and node_key = 'fallback';

notify pgrst, 'reload schema';
commit;

