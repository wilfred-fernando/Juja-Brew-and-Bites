begin;

alter table public.messenger_contacts
  add column if not exists page_id text;
alter table public.messenger_events
  add column if not exists page_id text;

create index if not exists messenger_contacts_page_idx
  on public.messenger_contacts (page_id, last_message_at desc);
create index if not exists messenger_events_page_idx
  on public.messenger_events (page_id, created_at desc);

notify pgrst, 'reload schema';
commit;

