import { defaultPublicPromos } from '../lib/publicPromos.js';
import fs from 'node:fs';
let sql = `begin;
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
`;
const quote = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
defaultPublicPromos.forEach((promo,index) => {
  const { id,end,...content }=promo;
  sql+=`insert into public.public_promo_cards(id,content,ends_on,sort_order) values(${quote(id)},${quote(JSON.stringify(content))}::jsonb,${quote(end)},${index});\n`;
});
sql+="notify pgrst, 'reload schema';\ncommit;\n";
fs.writeFileSync('supabase/migrations/20261002120000_admin_public_promo_cards.sql',sql);
