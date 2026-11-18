-- Preserve the identities used by archived receipts after an authorized member merge.
create table if not exists public.loyalty_member_merge_aliases (
  source_id uuid primary key,
  member_id uuid not null references public.loyalty_members(id) on delete restrict,
  source_snapshot jsonb not null,
  merged_at timestamptz not null default now(),
  check (source_id <> member_id)
);
alter table public.loyalty_member_merge_aliases enable row level security;
revoke all on public.loyalty_member_merge_aliases from public, anon, authenticated;
grant all on public.loyalty_member_merge_aliases to service_role;
create index if not exists loyalty_member_merge_aliases_member_idx on public.loyalty_member_merge_aliases(member_id);
