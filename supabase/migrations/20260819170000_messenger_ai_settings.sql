begin;

create table if not exists public.messenger_ai_settings (
  id smallint primary key default 1 check (id = 1),
  instructions text not null default '',
  reference_notes text not null default '',
  include_live_menu boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.messenger_ai_settings (id, instructions, reference_notes, include_live_menu)
values (
  1,
  'Answer directly and naturally as JujaBot. Use the live menu database for customer-facing menu names and prices. If a requested fact is not in the provided reference, say so and offer the relevant public link or staff assistance.',
  '',
  true
)
on conflict (id) do nothing;

alter table public.messenger_ai_settings enable row level security;
revoke all on table public.messenger_ai_settings from anon, authenticated;

notify pgrst, 'reload schema';
commit;
