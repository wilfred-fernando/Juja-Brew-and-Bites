begin;

alter table public.messenger_contacts
  add column if not exists auto_resume_at timestamptz;

create index if not exists messenger_contacts_auto_resume_idx
  on public.messenger_contacts (auto_resume_at)
  where bot_paused = true and auto_resume_at is not null;

notify pgrst, 'reload schema';
commit;
