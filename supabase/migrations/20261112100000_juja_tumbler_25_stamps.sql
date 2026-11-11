begin;

alter table public.juja_stamp_cards drop constraint juja_stamp_cards_drink_stamps_check;
alter table public.juja_stamp_cards add constraint juja_stamp_cards_drink_stamps_check
  check (drink_stamps between 0 and 20);

-- Preserve the existing enrollment, promo-date, refund and permission rules.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.refresh_juja_stamp_card(uuid)'::regprocedure);
  if position('least(15,coalesce(sum(drink_quantity),0))' in definition)=0
    or position('signatures = 5 and drinks = 15' in definition)=0 then
    raise exception 'Unexpected JUJA stamp function; inspect before changing the target.';
  end if;
  definition := replace(definition,'least(15,coalesce(sum(drink_quantity),0))','least(20,coalesce(sum(drink_quantity),0))');
  definition := replace(definition,'signatures = 5 and drinks = 15','signatures = 5 and drinks = 20');
  definition := replace(definition,'FREE JUJA Tumbler — 20 JUJA Stamps','FREE 26oz JUJA Tumbler — 25 JUJA Stamps');
  execute definition;
end $$;

update public.vouchers set reward_text='FREE 26oz JUJA Tumbler — 25 JUJA Stamps'
where reward_type='juja_tumbler';
do $$ declare member uuid;
begin
  for member in select member_id from public.juja_stamp_cards loop
    perform public.refresh_juja_stamp_card(member);
  end loop;
end $$;

commit;
