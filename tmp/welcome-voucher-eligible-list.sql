select distinct on (m.user_id)
  coalesce(nullif(p.full_name,''),m.customer_name) as customer_name,
  coalesce(nullif(m.customer_code,''),m."Customer ID",m.id::text) as loyalty_number,
  public.welcome_account_purchase_total(m.id) as qualifying_spend
from public.loyalty_members m
left join public.profiles p on p.id=m.user_id
where m.user_id is not null
  and public.welcome_account_purchase_total(m.id)>=200
  and not exists(select 1 from public.vouchers v
    join public.loyalty_members x on x.id=v.member_id
    where x.user_id=m.user_id and public.is_welcome_reward(v.reward_type,v.code,v.reward_text))
order by m.user_id,m.customer_name;
