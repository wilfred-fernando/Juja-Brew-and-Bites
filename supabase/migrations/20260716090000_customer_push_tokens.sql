create table if not exists public.customer_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'native',
  app text not null default 'customer',
  device_id text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_push_tokens_user_idx
  on public.customer_push_tokens(user_id)
  where enabled = true;

alter table public.customer_push_tokens enable row level security;

drop policy if exists "customer push tokens select own" on public.customer_push_tokens;
create policy "customer push tokens select own"
  on public.customer_push_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "customer push tokens insert own" on public.customer_push_tokens;
create policy "customer push tokens insert own"
  on public.customer_push_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "customer push tokens update own" on public.customer_push_tokens;
create policy "customer push tokens update own"
  on public.customer_push_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "customer push tokens delete own" on public.customer_push_tokens;
create policy "customer push tokens delete own"
  on public.customer_push_tokens
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.customer_push_tokens to authenticated;
