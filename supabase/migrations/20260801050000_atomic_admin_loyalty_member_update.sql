-- Prevent the admin edit modal from overwriting points or visits earned after
-- the modal was opened. Profile edits and numeric deltas are committed in one
-- locked database transaction.
create or replace function public.update_loyalty_member_admin(
  p_member_id uuid,
  p_customer_name text,
  p_phone text,
  p_note text,
  p_points_delta numeric default 0,
  p_visits_delta integer default 0
)
returns public.loyalty_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.loyalty_members%rowtype;
  v_points_delta numeric(12, 2) := round(coalesce(p_points_delta, 0)::numeric, 2);
  v_visits_delta integer := coalesce(p_visits_delta, 0);
  v_before_points numeric(12, 2);
  v_before_available numeric(12, 2);
  v_repair_id uuid;
begin
  if auth.uid() is null or not public.inventory_is_admin() then
    raise exception 'Only admin accounts can update loyalty members.';
  end if;

  select * into v_member
  from public.loyalty_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Loyalty member was not found.';
  end if;

  v_before_points := coalesce(v_member."Points balance", 0);
  v_before_available := coalesce(v_member."Available points", 0);

  update public.loyalty_members
  set customer_name = nullif(btrim(p_customer_name), ''),
      "Phone" = nullif(btrim(p_phone), ''),
      "Note" = p_note,
      "Points balance" = round(greatest(v_before_points + v_points_delta, 0)::numeric, 2),
      "Available points" = round(greatest(v_before_available + v_points_delta, 0)::numeric, 2),
      "Total visits" = greatest(coalesce("Total visits", 0) + v_visits_delta, 0)
  where id = p_member_id
  returning * into v_member;

  if v_points_delta <> 0 then
    insert into public.loyalty_point_balance_repairs (
      repair_key,
      member_id,
      points_balance_delta,
      available_points_delta,
      points_balance_before,
      available_points_before,
      points_balance_after,
      available_points_after,
      reason
    ) values (
      'admin-adjustment:' || gen_random_uuid()::text,
      p_member_id,
      v_member."Points balance" - v_before_points,
      v_member."Available points" - v_before_available,
      v_before_points,
      v_before_available,
      v_member."Points balance",
      v_member."Available points",
      'Manual admin loyalty adjustment by ' || auth.uid()::text
    )
    returning id into v_repair_id;
  end if;

  return v_member;
end;
$$;

revoke all on function public.update_loyalty_member_admin(uuid, text, text, text, numeric, integer) from public, anon;
grant execute on function public.update_loyalty_member_admin(uuid, text, text, text, numeric, integer) to authenticated;
