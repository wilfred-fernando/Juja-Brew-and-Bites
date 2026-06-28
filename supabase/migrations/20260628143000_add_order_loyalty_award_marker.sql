alter table public.orders
  add column if not exists loyalty_points_awarded numeric(12, 2),
  add column if not exists loyalty_points_awarded_at timestamptz;

create index if not exists idx_orders_loyalty_award_pending
  on public.orders (loyalty_member_id, paid_at, created_at)
  where loyalty_member_id is not null
    and loyalty_points_awarded_at is null
    and lower(coalesce(status, '')) in ('paid', 'closed', 'completed', 'complete', 'delivered');
