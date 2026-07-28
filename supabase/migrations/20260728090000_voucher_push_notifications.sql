create table if not exists public.voucher_push_notifications (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  event_type text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint voucher_push_notifications_event_type_check
    check (event_type in ('earned', 'expiring_3_days', 'expiring_1_day', 'expiring_today', 'expired')),
  constraint voucher_push_notifications_once_per_event
    unique (voucher_id, event_type)
);

create index if not exists voucher_push_notifications_member_idx
  on public.voucher_push_notifications (member_id, sent_at desc);

create index if not exists voucher_push_notifications_event_idx
  on public.voucher_push_notifications (event_type, sent_at desc);

alter table public.voucher_push_notifications enable row level security;
