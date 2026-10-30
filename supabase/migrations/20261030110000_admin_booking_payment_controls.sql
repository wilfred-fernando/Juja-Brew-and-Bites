begin;
-- Explicit Admin selection takes precedence over older automatic defaults.
do $$ declare definition text; anchor text:='booking_result := public.create_booking(data);'; begin
  select pg_get_functiondef('public.create_manual_booking(json)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review manual booking RPC before adding payment selection'; end if;
  if position('Explicit Admin payment selection' in definition)=0 then
    execute replace(definition,anchor,$inject$
  -- Explicit Admin payment selection; cashiers still require Admin review.
  if requester_role in ('admin','super_admin') and data->>'manual_payment_review' is not null then
    if data->>'manual_payment_review' not in ('pending','approved') then raise exception 'Select Pending or Approved payment'; end if;
    if coalesce(data->>'payment_method','') not in ('Cash','Card','QRPH','Waived') then raise exception 'Select Cash, Card, QRPH or Waived'; end if;
    data:=jsonb_set(data::jsonb,'{payment_status}',to_jsonb(case
      when data->>'payment_method'='Waived' then 'waived'::text
      when data->>'manual_payment_review'='approved' then 'approved'::text
      when data->>'payment_method'='Cash' then 'cash_pending'::text
      else 'submitted'::text end))::json;
  end if;
  booking_result := public.create_booking(data);
$inject$);
  end if;
end $$;

create function public.admin_set_booking_payment(p_booking_id uuid,p_choice text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.function_room_bookings; v public.booking_reservation_vouchers; next_status text; receipt jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then raise exception 'Admin access required'; end if;
  if p_choice not in ('pending','approved') or p_choice is null then raise exception 'Select Pending or Approved payment'; end if;
  select * into b from public.function_room_bookings where id=p_booking_id for update;
  if b.id is null or b.status is distinct from 'confirmed' or b.start_at is null or b.start_at<=now() then raise exception 'Select a confirmed upcoming booking'; end if;
  if coalesce(b.payment_status,'') not in ('cash_pending','submitted','waiting_for_payment','approved','waived') then raise exception 'Only pending reservation payments can be reviewed'; end if;
  select * into v from public.booking_reservation_vouchers where booking_id=b.id;
  if b.payment_status='approved' then
    if p_choice='pending' then raise exception 'An approved payment cannot be reset to Pending; use the payment reversal process'; end if;
    return jsonb_build_object('booking',to_jsonb(b),'voucher',to_jsonb(v),'unchanged',true);
  end if;
  if p_choice='pending' and v.booking_id is not null then raise exception 'A credited payment cannot be reset to Pending'; end if;
  if b.payment_method='Waived' then next_status:='waived';
  elsif p_choice='approved' then
    if b.payment_method is null or b.payment_method not in ('Cash','Card','QRPH') then raise exception 'Select Cash, Card or QRPH in Edit before approving payment'; end if;
    next_status:='approved';
  else next_status:=case when b.payment_method='Cash' then 'cash_pending' when b.payment_method is null then 'waiting_for_payment' else 'submitted' end;
  end if;
  update public.function_room_bookings set payment_status=next_status,updated_at=now() where id=b.id returning * into b;
  -- Explicit payment approval is distinct from an extension/schedule edit.
  if next_status='approved' and b.deposit_amount>0 then receipt:=public.ensure_booking_reservation_receipt(b.id); end if;
  return jsonb_build_object('booking',to_jsonb(b),'voucher',receipt);
end $$;
revoke all on function public.admin_set_booking_payment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_set_booking_payment(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
