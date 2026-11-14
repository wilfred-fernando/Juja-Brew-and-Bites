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
await db.exec(`
  alter table loyalty_members add column "Points balance" numeric default 0, add column "Available points" numeric default 0,
    add column "Total visits" integer default 0, add column "Total spent" numeric default 0,
    add column "First visit" text, add column "Last visit" text, add column customer_name text;
  alter table orders add column loyalty_points_awarded numeric, add column loyalty_points_awarded_at timestamptz,
    add column receipt_number text, add column customer_name text,add column store_id text,add column client_idempotency_key text,
    add column refund_amount numeric,add column net_amount numeric,add column payment_method text;
  alter table web_orders add column loyalty_points_awarded numeric, add column loyalty_points_awarded_at timestamptz,
    add column receipt_number text, add column customer_name text, add column loyalty_sale_total numeric,
    add column payment_status text,add column refund_amount numeric;
  create table loyalty_point_award_events(member_id uuid,source_type text,source_id uuid,receipt_number text,
    points_awarded numeric,sale_total numeric,points_balance_after numeric,available_points_after numeric,awarded_at timestamptz,
    unique(source_type,source_id));
`);
const awardMigration = await readFile(new URL('../supabase/migrations/20260801023000_loyalty_point_award_events.sql',import.meta.url),'utf8');
await db.exec(awardMigration.slice(awardMigration.indexOf('create or replace function public.award_loyalty_points_for_order(')));
await db.exec(await readFile(new URL('../supabase/migrations/20261113090000_stamp_drinks_no_loyalty_points.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261113100000_stamp_eligibility_refunds_duplicates.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261114090000_reschedule_juja_stamps_nov20.sql',import.meta.url),'utf8'));
// Only this disposable database gets a controllable clock.
await db.exec(`
  select set_config('test.clock_offset',(timestamptz '2026-11-20 00:00:01+08'-clock_timestamp())::text,false);
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
    create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2026-11-19 23:59:59.999999+08' $$;`);
  await assert.rejects(db.query('select join_juja_stamp_card($1)',[other]),/runs November 20/);
  const award = async (items,expected,requested=4,source='order',timestamp='2026-11-21 12:00:00+08',memberId=member) => {
    const table=source==='order'?'orders':'web_orders',date=source==='order'?'paid_at':'created_at';
    const row=await one(`insert into ${table}(loyalty_member_id,${date},items) values($1,$2,$3) returning id`,[memberId,timestamp,JSON.stringify(items)]);
    const rpc=source==='order'?'award_loyalty_points_for_order':'award_loyalty_points_for_web_order';
    await db.query(`select ${rpc}($1,$2,$3,100)`,[row.id,memberId,requested]);
    const recorded = await one(`select loyalty_points_awarded n,loyalty_points_awarded_at awarded_at from ${table} where id=$1`,[row.id]);
    assert.notEqual(recorded.n,null,'A zero-point stamp purchase must record an explicit award');
    assert.ok(recorded.awarded_at,'A zero-point stamp purchase needs an idempotency timestamp');
    assert.equal(Number(recorded.n),expected);
    assert.equal(Number((await one('select points_awarded n from loyalty_point_award_events where source_id=$1',[row.id])).n),expected);
    const before=Number((await one('select "Points balance" n from loyalty_members where id=$1',[memberId])).n);
    await db.query(`select ${rpc}($1,$2,$3,100)`,[row.id,memberId,requested]);
    assert.equal(Number((await one('select "Points balance" n from loyalty_members where id=$1',[memberId])).n),before,'Retry cannot add points again');
  };
  await award([line('LATTE (SIGNATURE)',1)],0);
  await award([line('MILK TEA (CLASSIC)',1)],0,4,'web_order');
  await award([line('LATTE (SIGNATURE)',1),{...line('WAFFLE',1),unitPrice:50}],2,6);
  await award([line('LATTE (SIGNATURE)',1),{...line('WAFFLE',1),unitPrice:50}, {...line('PROMOS',1),unitPrice:50}],2,6);
  await award([{...line('MILK TEA (CLASSIC)',1),discountBeneficiaryType:'qcid'}, {...line('WAFFLE',1),unitPrice:50}],2,2);
  await award([{...line('MILK TEA (CLASSIC)',1),appliedVoucher:{reward_type:'welcome'}}, {...line('WAFFLE',1),unitPrice:50}],2,2);
  await award([line('LATTE (SIGNATURE)',1)],4,4,'order','2026-11-19 12:00:00+08');
  await award([line('LATTE (SIGNATURE)',1)],4,4,'order','2027-01-16 12:00:00+08');
  const notJoined='44444444-4444-4444-8444-444444444444';
  await db.query('insert into loyalty_members(id,user_id) values($1,$1)',[notJoined]);
  await award([line('LATTE (SIGNATURE)',1)],4,4,'order','2026-11-21 12:00:00+08',notJoined);
  console.log('PASS: stamp drinks earn zero points; mixed baskets retain food points; web awards, zero-point retries, QCID/welcome/promo exclusions, non-enrolled and out-of-period purchases');
  await db.exec(`create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2026-11-20 00:00:00+08' $$;`);
  await db.query('select join_juja_stamp_card($1)',[other]);
  for (const timestamp of ['2026-11-19 23:59:59.999999+08','2026-11-20 00:00:00+08','2027-01-15 23:59:59.999999+08','2027-01-16 00:00:00+08']) {
    await db.query('insert into orders(loyalty_member_id,paid_at,items) values($1,$2,$3)',[other,timestamp,JSON.stringify([line('MILK TEA (CLASSIC)',1)])]);
    await db.query('insert into web_orders(loyalty_member_id,created_at,items) values($1,$2,$3)',[other,timestamp,JSON.stringify([line('LATTE (SIGNATURE)',1)])]);
  }
  const boundary = (await one('select get_juja_stamp_card($1) card',[other])).card;
  assert.equal(boundary.drink_stamps,2,'Only in-period POS purchases count, including both boundary days');
  assert.equal(boundary.signature_stamps,2,'Only in-period web purchases count');
  await db.exec(`create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2027-01-16 00:00:00+08' $$;`);
  await assert.rejects(db.query('select join_juja_stamp_card($1)',[other]),/runs November 20/);
  console.log('PASS: promo boundaries (Manila), opt-in, no backfill, ownership, permissions, category/quantity rules, web deduplication, automatic single voucher, retries, refunds, archival and redeemed reward protection');
  // Isolated campaign member for redemption/refund/duplicate scenarios.
  const strictMember='55555555-5555-4555-8555-555555555555';
  await db.exec(`select set_config('test.uid','${strictMember}',false);
    create or replace function public.juja_stamp_now() returns timestamptz language sql volatile as $$ select timestamptz '2026-11-21 12:00:00+08' $$;
    insert into loyalty_members(id,user_id) values('${strictMember}','${strictMember}');`);
  await db.query('select join_juja_stamp_card($1)',[strictMember]);
  const strictCount=async()=>Number((await one('select drink_stamps n from juja_stamp_cards where member_id=$1',[strictMember])).n);
  const strictSale=async(items,extra={})=>(await one(`insert into orders(loyalty_member_id,items,source_web_order_id,client_idempotency_key,receipt_number,store_id,payment_method)
    values($1,$2,$3,$4,$5,'branch-a',$6) returning id`,[strictMember,JSON.stringify(items),extra.webId||null,extra.retry||null,extra.receipt||null,extra.payment||'Cash'])).id;
  for(const excluded of [
    {...line('MILK TEA (CLASSIC)',1),net_amount:0},
    {...line('MILK TEA (CLASSIC)',1),discountAmount:100},
    {...line('MILK TEA (CLASSIC)',1),isFree:true},
    {...line('MILK TEA (CLASSIC)',1),isRedeemed:true},
    {...line('MILK TEA (CLASSIC)',1),appliedVoucher:{id:'voucher',reward_type:'points'}},
    {...line('MILK TEA (CLASSIC)',1),source_metadata:{pos_line_details:{appliedVoucher:{code:'REWARD'}}}},
    {...line('MILK TEA (CLASSIC)',1),source_metadata:{pos_line_details:{isFree:true}}},
    {...line('MILK TEA (CLASSIC)',1),redemption_id:'reward'}
  ]) { await strictSale([excluded]); assert.equal(await strictCount(),0,'Free and redeemed items cannot earn stamps even with a positive price'); }
  await strictSale([line('MILK TEA (CLASSIC)',1)],{payment:'No Payment Required'});
  assert.equal(await strictCount(),0);
  const partial=await strictSale([{...line('MILK TEA (CLASSIC)',4),freeQuantity:1,redeemedQuantity:1}]);
  assert.equal(await strictCount(),2,'Count only paid, non-redeemed units');
  await db.query("update orders set status='refunded',refund_amount=100 where id=$1",[partial]);
  assert.equal(await strictCount(),0,'Full refund automatically reverses stamps before portal refresh');
  await db.query("update orders set status='paid' where id=$1",[partial]);
  assert.equal(await strictCount(),0,'A stale status retry cannot undo the recorded full refund');
  const itemOrder=await strictSale([{...line('MILK TEA (CLASSIC)',2),net_amount:160}]);
  await db.query("insert into order_items(order_id,category_name,quantity,unit_price,net_amount,refund_amount,status,refunded_at) values($1,'MILK TEA (CLASSIC)',2,100,160,80,'partial_refund',now())",[itemOrder]);
  assert.equal(await strictCount(),1,'Partial refund uses the discounted paid unit value');
  await db.query('delete from order_items where order_id=$1',[itemOrder]);
  assert.equal(await strictCount(),0,'Deleting the final receipt item cannot resurrect stale JSON stamps');
  const uncertain=await strictSale([line('MILK TEA (CLASSIC)',2)]);
  await db.query("update orders set total=200,refund_amount=100,status='partial_refund' where id=$1",[uncertain]);
  assert.equal(await strictCount(),0,'An unreconciled partial refund cannot keep all original stamps');
  await db.query("insert into order_items(order_id,category_name,quantity,unit_price,net_amount,refund_amount,status) values($1,'MILK TEA (CLASSIC)',2,100,200,100,'partial_refund')",[uncertain]);
  assert.equal(await strictCount(),1,'Reconciled partial refund retains exactly the paid non-refunded unit');
  await db.query("update orders set status='refunded',refund_amount=200 where id=$1",[uncertain]);
  const webStrict=(await one('insert into web_orders(loyalty_member_id,items) values($1,$2) returning id',[strictMember,JSON.stringify([line('MILK TEA (CLASSIC)',2)])])).id;
  const webCopy=await strictSale([line('MILK TEA (CLASSIC)',2)],{webId:webStrict});
  await strictSale([line('MILK TEA (CLASSIC)',2)],{webId:webStrict});
  assert.equal(await strictCount(),2,'Multiple POS copies of one web sale cannot duplicate stamps');
  await db.query("update web_orders set status='refunded',payment_status='refunded' where id=$1",[webStrict]);
  assert.equal(await strictCount(),0,'Web refund reverses the shared stamps even while POS copies remain paid');
  await db.query("update orders set status='paid' where id=$1",[webCopy]);
  assert.equal(await strictCount(),0,'POS retry cannot restore stamps from a refunded web order');
  const offline=await strictSale([line('MILK TEA (CLASSIC)',2)],{retry:'offline-checkout-1'});
  await strictSale([line('MILK TEA (CLASSIC)',2)],{retry:'offline-checkout-1'});
  assert.equal(await strictCount(),2,'Offline replay with a different receipt UUID is still one purchase');
  await db.query('update orders set receipt_number=$1 where id=$2',['CORRECTED-123',offline]);
  assert.equal(await strictCount(),2,'Receipt edits keep the original canonical identity');
  await strictSale([line('MILK TEA (CLASSIC)',1)],{receipt:'DUP-123'});
  await strictSale([line('MILK TEA (CLASSIC)',1)],{receipt:'DUP-123'});
  assert.equal(await strictCount(),3,'Duplicate legacy store/receipt numbers cannot duplicate stamps');
  await strictSale([{...line('MILK TEA (CLASSIC)',1),cartItemId:'same-line'},{...line('MILK TEA (CLASSIC)',1),cartItemId:'same-line'}]);
  assert.equal(await strictCount(),4,'Repeated cart line identity counts once');
  await strictSale([{...line('MILK TEA (CLASSIC)',1),cartItemId:'line-a'},{...line('MILK TEA (CLASSIC)',1),cartItemId:'line-b'}]);
  assert.equal(await strictCount(),6,'Distinct legitimate lines of the same drink both count');
  const lateWeb=(await one('insert into web_orders(loyalty_member_id,items) values($1,$2) returning id',[strictMember,JSON.stringify([line('MILK TEA (CLASSIC)',1)])])).id;
  const lateCopy=await strictSale([line('MILK TEA (CLASSIC)',1)]);
  await db.query('update orders set source_web_order_id=$1 where id=$2',[lateWeb,lateCopy]);
  assert.equal(await strictCount(),7,'Linking a POS receipt to its web order later must merge the identities');
  const repeatCount=await strictCount();
  await Promise.all(Array.from({length:5},()=>db.query('select get_juja_stamp_card($1)',[strictMember])));
  assert.equal(await strictCount(),repeatCount,'Repeated/concurrent refresh requests never increment the ledger');
  const canonical=await one("select * from juja_stamp_purchases where member_id=$1 and drink_quantity>0 limit 1",[strictMember]);
  await assert.rejects(db.query('insert into juja_stamp_purchases values($1,$2,$3,0,1)',[member,canonical.source_type,canonical.source_id]),/duplicate key/);
  console.log('PASS: voucher/free/redemption exclusions, paid units, discounted partial refunds, full refund retries, web refund propagation, stale JSON protection, offline/receipt/web/line deduplication and one active owner');
} finally { await db.close(); }
