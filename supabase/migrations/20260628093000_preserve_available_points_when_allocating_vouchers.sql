-- Allocate point reward vouchers from Available points without consuming the balance.
-- Available points are the customer's visible/redeemable points ledger and should
-- only reset at the annual reset boundary, not during voucher creation.

CREATE OR REPLACE FUNCTION public.ensure_vouchers_for_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  available_pts numeric;
  member_code text;
  linked_user uuid;
  target_count int;
  existing_count int;
  missing_count int;
  next_idx int;
  voucher_code text;
  i int;
BEGIN
  -- keep statuses fresh
  PERFORM public.expire_vouchers();

  SELECT
    COALESCE("Available points", 0),
    COALESCE(customer_code, ''),
    user_id
  INTO available_pts, member_code, linked_user
  FROM public.loyalty_members
  WHERE id = p_member_id;

  -- Imported Loyverse members must not auto-convert points until linked.
  IF linked_user IS NULL THEN
    RETURN;
  END IF;

  target_count := FLOOR(available_pts / 100);

  IF target_count <= 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO existing_count
  FROM public.vouchers
  WHERE member_id = p_member_id
    AND COALESCE(reward_type, 'points') = 'points'
    AND status = 'active'
    AND redeemed_at IS NULL
    AND expires_at > now();

  missing_count := GREATEST(target_count - existing_count, 0);

  IF missing_count <= 0 THEN
    RETURN;
  END IF;

  FOR i IN 1..missing_count LOOP
    SELECT COALESCE(MAX(reward_index), 0) + 1
    INTO next_idx
    FROM public.vouchers
    WHERE member_id = p_member_id;

    voucher_code :=
      'JUJA-' || member_code || '-' || next_idx::text || '-' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    INSERT INTO public.vouchers (
      member_id,
      reward_index,
      code,
      reward_text,
      issued_at,
      expires_at,
      status,
      reward_type
    )
    VALUES (
      p_member_id,
      next_idx,
      voucher_code,
      'FREE reward (16oz drink / waffle / mini donuts)',
      now(),
      now() + interval '90 days',
      'active',
      'points'
    )
    ON CONFLICT (member_id, reward_index) DO NOTHING;
  END LOOP;
END;
$function$;
