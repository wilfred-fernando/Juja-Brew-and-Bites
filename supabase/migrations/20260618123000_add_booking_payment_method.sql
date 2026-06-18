alter table if exists public.function_room_bookings
  add column if not exists payment_method text;

comment on column public.function_room_bookings.payment_method is
  'Customer selected booking payment method, such as cash or online.';
