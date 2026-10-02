select id,is_active,ends_on from public.public_promo_cards order by sort_order;
begin;
insert into public.public_promo_cards(id,content,is_active) values ('__verify_promo__','{"title":"Verification"}',false);
update public.public_promo_cards set content=content||'{"title":"Edited"}'::jsonb where id='__verify_promo__';
do $$ begin
 if not exists(select 1 from public.public_promo_cards where id='__verify_promo__' and content->>'title'='Edited') then raise exception 'Edit failed'; end if;
end $$;
set local role anon;
select count(*) as public_visible_count from public.public_promo_cards;
do $$ begin
 if exists(select 1 from public.public_promo_cards where id='__verify_promo__') then raise exception 'Disabled promo exposed'; end if;
 begin
  update public.public_promo_cards set is_active=false;
  raise exception 'Anonymous mutation allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
delete from public.public_promo_cards where id='__verify_promo__';
do $$ begin
 if exists(select 1 from public.public_promo_cards where id='__verify_promo__') then raise exception 'Delete failed'; end if;
end $$;
rollback;
