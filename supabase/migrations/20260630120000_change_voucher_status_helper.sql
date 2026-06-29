-- Helper to safely change one voucher status.
-- Usage:
--   select public.change_voucher_status('<voucher-id>', 'redeemed');
--   select public.change_voucher_status('<voucher-id>', 'active');
-- Allowed statuses: active, redeemed, expired, cancelled, voided.

create or replace function public.change_voucher_status(
  p_voucher_id uuid,
  p_status text,
  p_changed_at timestamptz default now()
)
returns public.vouchers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_voucher public.vouchers;
begin
  if p_voucher_id is null then
    raise exception 'voucher id is required';
  end if;

  if v_status not in ('active', 'redeemed', 'expired', 'cancelled', 'voided') then
    raise exception 'invalid voucher status: %. Allowed statuses: active, redeemed, expired, cancelled, voided', p_status;
  end if;

  update public.vouchers
  set
    status = v_status,
    redeemed_at = case
      when v_status = 'redeemed' then coalesce(p_changed_at, now())
      when v_status in ('active', 'expired', 'cancelled', 'voided') then null
      else redeemed_at
    end
  where id = p_voucher_id
  returning *
  into v_voucher;

  if not found then
    raise exception 'voucher not found: %', p_voucher_id;
  end if;

  return v_voucher;
end;
$$;

comment on function public.change_voucher_status(uuid, text, timestamptz)
is 'Safely changes one voucher status and keeps redeemed_at consistent.';
