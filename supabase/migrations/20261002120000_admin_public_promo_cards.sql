begin;
create table public.public_promo_cards (
 id text primary key,
 content jsonb not null,
 is_active boolean not null default true,
 starts_on date, ends_on date,
 sort_order integer not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),
 check(ends_on is null or starts_on is null or ends_on>=starts_on)
);
alter table public.public_promo_cards enable row level security;
create policy public_promo_read on public.public_promo_cards for select to anon,authenticated
using(is_active and (starts_on is null or starts_on<=(now() at time zone 'Asia/Manila')::date)
 and (ends_on is null or ends_on>=(now() at time zone 'Asia/Manila')::date));
revoke all on public.public_promo_cards from anon,authenticated;
grant select on public.public_promo_cards to anon,authenticated;
grant all on public.public_promo_cards to service_role;
insert into public.public_promo_cards(id,content,ends_on,sort_order) values('welcome-voucher','{"title":"Welcome Voucher is back!","label":"Welcome Voucher Promo","image":"/promos/welcome-voucher-october-2026.png","width":1385,"height":1136,"schedule":"Until October 31, 2026","offer":"Buy 1 Get 1 Cheesecake Milk Tea (R)","details":"Sign up and link your loyalty account to qualify for a Buy 1 Get 1 regular-size (16oz) Cheesecake Milk Tea Welcome Voucher. Your account must have at least ₱200 in previous completed purchases. Accounts that already received a Welcome Voucher, including used or expired vouchers, are not eligible for another. Voucher valid for 15 days from issuance.","tone":"bg-cyan-50 text-cyan-900","requiresId":false}'::jsonb,'2026-10-31',0);
insert into public.public_promo_cards(id,content,ends_on,sort_order) values('egc-holiday','{"title":"JUJA e-Gift Certificates","label":"e-GC 10+1 Promo","image":"/promos/egc-10-plus-1-v3.png","width":1386,"height":1135,"schedule":"Buy 10, get 1 FREE · ₱1,000","offer":"JUJA e-Gift Certificates — 10+1","details":"Get eleven ₱100 e-Gift Certificates for ₱1,000. Prefer a physical gift certificate? Send us a request.","tone":"bg-emerald-50 text-emerald-900","requiresId":false}'::jsonb,null,1);
insert into public.public_promo_cards(id,content,ends_on,sort_order) values('qcid','{"title":"Your city. Your perks.","label":"QCID Promo","image":"/promos/qcid-2026.jpg","width":960,"height":788,"schedule":"Monday–Wednesday · Until December 31, 2026","offer":"10% off food & drinks","details":"Present a valid QCID before payment. One redemption per day. Cannot be combined with other promos or discounts.","tone":"bg-violet-50 text-violet-900"}'::jsonb,'2026-12-31',2);
insert into public.public_promo_cards(id,content,ends_on,sort_order) values('teachers','{"title":"For the ones who inspire.","label":"Teachers’ Month Promo","image":"/promos/teachers-month-2026.png","width":1385,"height":1136,"schedule":"September 14–October 5, 2026","offer":"A well-deserved teacher treat","details":"10% off Monday–Friday, September 14–October 2. On October 5, enjoy 50% off one regular-size drink. Present a valid school ID. Daily limits apply: one eligible food, drink, and dessert for the 10% offer.","tone":"bg-rose-50 text-rose-900"}'::jsonb,'2026-10-05',3);
notify pgrst, 'reload schema';
commit;
