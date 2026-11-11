import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jujaStampPhase, JUJA_STAMP_START, JUJA_STAMP_END } from '../lib/loyalty/jujaStampCampaign.mjs';

// Install the isolated test engine with:
// npm install --prefix tmp/juja-stamp-tests --no-package-lock --ignore-scripts @electric-sql/pglite
const { PGlite } = await import('../tmp/juja-stamp-tests/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const member = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create table loyalty_members(id uuid primary key, user_id uuid);
  create table menu_categories(name text, discount_entitlement_group text);
  create table menu_items(id uuid primary key, category text);
  create table vouchers(id uuid primary key default gen_random_uuid(), member_id uuid references loyalty_members,
    reward_index integer, code text unique, reward_text text, reward_type text, status text check(status in ('active','redeemed','expired')),
    issued_at timestamptz, expires_at timestamptz not null, redeemed_at timestamptz);
  create table orders(id uuid primary key default gen_random_uuid(), loyalty_member_id uuid, customer_id text,
    source_web_order_id uuid, paid_at timestamptz default clock_timestamp(), created_at timestamptz default clock_timestamp(),
    items jsonb, status text default 'paid', total numeric default 100, source_metadata jsonb, dining_option text);
  create table web_orders(id uuid primary key default gen_random_uuid(), loyalty_member_id uuid,
    created_at timestamptz default clock_timestamp(), items jsonb, status text default 'paid', total numeric default 100, source_metadata jsonb);
  create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid references orders on delete cascade,
    menu_item_id uuid, category_name text, quantity numeric, unit_price numeric, line_total numeric, net_amount numeric,
    status text, refunded_at timestamptz, refund_amount numeric, source_metadata jsonb);
  insert into menu_categories values ('LATTE (SIGNATURE)','drink'), ('MILK TEA (CLASSIC)','drink'),('WAFFLE','dessert'),('.ADD ON',null);
  insert into loyalty_members values ('${member}','${user}'),('${other}','${other}');
  select set_config('test.uid','${user}',false);
`);
await db.exec((await readFile(new URL('../supabase/migrations/20261112090000_juja_tumbler_stamps.sql', import.meta.url),'utf8')));
await db.exec((await readFile(new URL('../supabase/migrations/20261112100000_juja_tumbler_25_stamps.sql', import.meta.url),'utf8')));
// Only this disposable database gets a controllable clock.
await db.exec(`
  select set_config('test.clock_offset',(timestamptz '2026-11-15 00:00:01+08'-clock_timestamp())::text,false);
  create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$
    select clock_timestamp()+current_setting('test.clock_offset')::interval $$;
  alter table orders alter column paid_at set default public.juja_stamp_now();
  alter table orders alter column created_at set default public.juja_stamp_now();
  alter table web_orders alter column created_at set default public.juja_stamp_now();
`);
const one = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
const card = async () => (await one('select get_juja_stamp_card($1) card',[member])).card;
const line = (category,quantity) => ({category,quantity,unitPrice:100});
const sale = async (items, extra={}) => (await one(`insert into orders(loyalty_member_id,items,status,source_web_order_id,source_metadata)
  values($1,$2,$3,$4,$5) returning id`,[member,JSON.stringify(items),extra.status||'paid',extra.webId||null,JSON.stringify(extra.metadata||{})])).id;
try {
  assert.equal(jujaStampPhase(Date.parse(JUJA_STAMP_START)-1),'upcoming');
  assert.equal(jujaStampPhase(JUJA_STAMP_START),'active');
  assert.equal(jujaStampPhase(Date.parse(JUJA_STAMP_END)-1),'active');
  assert.equal(jujaStampPhase(JUJA_STAMP_END),'ended');
  await sale([line('LATTE (SIGNATURE)',50),line('MILK TEA (CLASSIC)',50)]);
  assert.equal(await card(),null,'Purchases cannot auto-enroll customers');
  await db.query('select join_juja_stamp_card($1)',[member]);
  const joined = (await card()).joined_at;
  assert.equal((await card()).drink_stamps,0,'Pre-join sales must not count');
  await db.query('select join_juja_stamp_card($1)',[member]);
  assert.equal((await card()).joined_at,joined,'Repeated join must preserve enrollment time');
  await assert.rejects(db.query('select join_juja_stamp_card($1)',[other]),/not linked/);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select refresh_juja_stamp_card($1)',[member]),/permission denied/);
  await assert.rejects(db.query('update juja_stamp_cards set signature_stamps=5'),/permission denied/);
  await db.exec('reset role');
  await sale([line('WAFFLE',30),line('.ADD ON',30)]);
  await sale([line('MILK TEA (CLASSIC)',30)],{status:'pending'});
  await sale([line('MILK TEA (CLASSIC)',30)],{metadata:{booking_id:'test'}});
  assert.equal((await card()).drink_stamps,0,'Food, add-ons, pending and booking sales do not count');
  const signatures = await sale([line('LATTE (SIGNATURE)',6)]);
  assert.equal((await card()).signature_stamps,5);
  assert.equal((await card()).drink_stamps,0,'Excess signature drinks cannot fill regular slots');
  assert.equal((await one('select count(*)::int n from vouchers')).n,0);
  const web = (await one('insert into web_orders(loyalty_member_id,items) values($1,$2) returning id',[member,JSON.stringify([line('MILK TEA (CLASSIC)',4)])])).id;
  await sale([line('MILK TEA (CLASSIC)',4)],{webId:web});
  assert.equal((await card()).drink_stamps,4,'Web-to-POS copy must count only once');
  await sale([line('MILK TEA (CLASSIC)',11)]);
  assert.equal((await card()).drink_stamps,15);
  assert.equal((await one('select count(*)::int n from vouchers')).n,0,'The former 20-stamp total must not issue a reward');
  const final = await sale([line('MILK TEA (CLASSIC)',5)]);
  // Inspect before portal refresh to prove reward is created at checkout.
  const earned = await one('select voucher_id from juja_stamp_cards where member_id=$1',[member]);
  assert.ok(earned.voucher_id);
  assert.equal((await one('select reward_text from vouchers')).reward_text,'FREE 26oz JUJA Tumbler — 25 JUJA Stamps');
  await card(); await card();
  assert.equal((await one('select count(*)::int n from vouchers')).n,1,'Retries create only one voucher');
  await db.query("update orders set status='refunded' where id=$1",[final]);
  assert.equal((await card()).drink_stamps,15);
  assert.equal((await one('select status from vouchers')).status,'expired','Refund invalidates an unclaimed reward');
  await db.query("update orders set status='paid' where id=$1",[final]);
  assert.equal((await one('select status from vouchers')).status,'active');
  assert.equal((await card()).voucher_id,earned.voucher_id,'Re-qualification reuses the voucher');
  // Persisted receipt items override JSON; an individual drink refund removes its stamps.
  await db.query('insert into order_items(order_id,category_name,quantity,unit_price,net_amount) values($1,$2,5,100,500)',[final,'MILK TEA (CLASSIC)']);
  await db.query('update order_items set refund_amount=200 where order_id=$1',[final]);
  assert.equal((await card()).drink_stamps,18);
  await db.query('update order_items set refund_amount=0 where order_id=$1',[final]);
  await db.exec("update vouchers set status='redeemed',redeemed_at=clock_timestamp()");
  await db.query("update orders set status='refunded' where id=$1",[signatures]);
  assert.equal((await one('select status from vouchers')).status,'redeemed','Refund never makes a used reward reusable');
  assert.equal((await one('select count(*)::int n from vouchers')).n,1);
  const beforeArchive = (await card()).drink_stamps;
  await db.query('delete from orders where id=$1',[final]);
  assert.equal((await card()).drink_stamps,beforeArchive,'Archiving a receipt must retain earned stamps');
  await db.query('update orders set loyalty_member_id=null,customer_id=null where id=$1',[signatures]);
  assert.equal((await card()).signature_stamps,0,'Removing a member from a receipt cannot leave its stamps behind');
  await db.exec(`select set_config('test.uid','${other}',false);
    create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2026-11-14 23:59:59.999999+08' $$;`);
  await assert.rejects(db.query('select join_juja_stamp_card($1)',[other]),/runs November 15/);
  await db.exec(`create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2026-11-15 00:00:00+08' $$;`);
  await db.query('select join_juja_stamp_card($1)',[other]);
  for (const timestamp of ['2026-11-14 23:59:59.999999+08','2026-11-15 00:00:00+08','2027-01-15 23:59:59.999999+08','2027-01-16 00:00:00+08']) {
    await db.query('insert into orders(loyalty_member_id,paid_at,items) values($1,$2,$3)',[other,timestamp,JSON.stringify([line('MILK TEA (CLASSIC)',1)])]);
    await db.query('insert into web_orders(loyalty_member_id,created_at,items) values($1,$2,$3)',[other,timestamp,JSON.stringify([line('LATTE (SIGNATURE)',1)])]);
  }
  const boundary = (await one('select get_juja_stamp_card($1) card',[other])).card;
  assert.equal(boundary.drink_stamps,2,'Only in-period POS purchases count, including both boundary days');
  assert.equal(boundary.signature_stamps,2,'Only in-period web purchases count');
  await db.exec(`create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2027-01-16 00:00:00+08' $$;`);
  await assert.rejects(db.query('select join_juja_stamp_card($1)',[other]),/runs November 15/);
  console.log('PASS: promo boundaries (Manila), opt-in, no backfill, ownership, permissions, category/quantity rules, web deduplication, automatic single voucher, retries, refunds, archival and redeemed reward protection');
} finally { await db.close(); }
