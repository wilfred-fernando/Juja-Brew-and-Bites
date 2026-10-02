select code,is_active,ends_at at time zone 'Asia/Manila' as ends_at_manila from public.voucher_campaigns where code='WELCOME-VOUCHER';
select code,end_date from public.promotions where code='WELCOME-VOUCHER';
begin;
create temporary table welcome_check_counts (blocked_issuance integer, blocked_renewal integer, blocked_direct_insert integer);
do $$
declare item record; result record; issue_count integer:=0; renewal_count integer:=0; insert_count integer:=0; rejected boolean;
begin
  for item in select v.* from public.vouchers v join public.loyalty_members m on m.id=v.member_id
    where m.user_id is not null and public.is_welcome_reward(v.reward_type,v.code,v.reward_text)
      and (v.redeemed_at is not null or lower(coalesce(v.status,'')) in ('used','redeemed','expired') or v.expires_at<=now()) loop
    select * into result from public.create_welcome_voucher_if_needed(item.member_id);
    if result.created<>0 then raise exception 'Repeat issuance allowed'; end if;
    issue_count:=issue_count+1;
    rejected:=false;
    begin
      update public.vouchers set status='active',redeemed_at=null,expires_at=now()+interval '15 days' where id=item.id;
    exception when raise_exception then
      if sqlerrm not like 'Used or expired Welcome Vouchers%' then raise; end if;
      rejected:=true;
    end;
    if not rejected then raise exception 'Renewal allowed'; end if;
    renewal_count:=renewal_count+1;
    rejected:=false;
    begin
      insert into public.vouchers(member_id,reward_index,code,reward_text,reward_type,status,issued_at,expires_at)
      values(item.member_id,999999,'WELCOME-VERIFY-'||left(replace(gen_random_uuid()::text,'-',''),12),item.reward_text,'welcome','active',now(),now()+interval '15 days');
    exception when raise_exception then rejected:=true;
    end;
    if not rejected then raise exception 'Direct repeat insert allowed'; end if;
    insert_count:=insert_count+1;
  end loop;
  insert into welcome_check_counts values(issue_count,renewal_count,insert_count);
end $$;
select * from welcome_check_counts;
rollback;
