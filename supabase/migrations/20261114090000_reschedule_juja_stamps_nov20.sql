begin;
do $$ declare signature text; definition text; member uuid;
begin
  foreach signature in array array[
    'public.join_juja_stamp_card(uuid)',
    'public.refresh_juja_stamp_card(uuid)',
    'public.juja_points_after_stamp_exclusion(uuid,text,uuid,numeric)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('2026-11-15' in definition)=0 then raise exception 'Review promo dates in % before rescheduling',signature; end if;
    definition:=replace(definition,'2026-11-15','2026-11-20');
    definition:=replace(definition,'November 15, 2026','November 20, 2026');
    execute definition;
  end loop;
  for member in select member_id from public.juja_stamp_cards order by member_id loop
    perform public.refresh_juja_stamp_card(member);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
