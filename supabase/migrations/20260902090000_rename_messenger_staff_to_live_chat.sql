begin;

update public.messenger_ai_settings
set instructions = regexp_replace(instructions, '\mstaff\M', 'Live Chat', 'gi'),
    updated_at = now()
where instructions ~* '\mstaff\M';

update public.messenger_flow_nodes
set config = regexp_replace(
      replace(config::text, 'Talk to staff', 'Live Chat'),
      '\mstaff\M',
      'Live Chat',
      'gi'
    )::jsonb,
    updated_at = now()
where config::text ~* '\mstaff\M';

insert into public.messenger_triggers (flow_id, trigger_type, pattern, match_type, priority)
values
  ('10000000-0000-4000-8000-000000000004', 'keyword', 'live chat', 'contains', 95),
  ('10000000-0000-4000-8000-000000000004', 'keyword', 'livechat', 'contains', 95)
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
