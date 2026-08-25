alter table if exists public.function_room_bookings
  add column if not exists update_requested_at timestamptz,
  add column if not exists update_request_type text,
  add column if not exists update_request_status text,
  add column if not exists update_request_previous jsonb,
  add column if not exists update_request_requested jsonb,
  add column if not exists update_reviewed_at timestamptz,
  add column if not exists update_admin_note text;

comment on column public.function_room_bookings.update_requested_at is
  'Time the customer last requested booking detail or schedule changes.';
comment on column public.function_room_bookings.update_request_type is
  'Customer request type, such as details_update or reschedule.';
comment on column public.function_room_bookings.update_request_status is
  'Review state for the latest customer update request: pending, approved, adjusted, or rejected.';
comment on column public.function_room_bookings.update_request_previous is
  'Snapshot of booking details before the latest customer update request.';
comment on column public.function_room_bookings.update_request_requested is
  'Snapshot of the customer-requested booking details.';
comment on column public.function_room_bookings.update_reviewed_at is
  'Time an admin approved or adjusted the latest customer update request.';
comment on column public.function_room_bookings.update_admin_note is
  'Optional note included in the finalized booking update email.';

create index if not exists idx_function_room_bookings_update_request_review
  on public.function_room_bookings (update_request_status, update_requested_at desc)
  where update_request_status = 'pending';
