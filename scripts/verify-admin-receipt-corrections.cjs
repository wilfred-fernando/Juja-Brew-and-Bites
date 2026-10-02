const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
for (const file of ['.env.local']) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  const helper = await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync('lib/reports/receiptCorrections.js')).toString('base64')}`);
  const breakdown = await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync('lib/posDiscountBreakdown.js')).toString('base64')}`);
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    const installed=(await db.query("select to_regclass('public.admin_receipt_corrections') is not null installed")).rows[0].installed;
    if (!installed) await db.query(fs.readFileSync('supabase/migrations/20261002120000_admin_receipt_corrections.sql', 'utf8'));
    await db.query('savepoint fixtures');
    const auditCount=Number((await db.query('select count(*) from admin_receipt_edit_audit')).rows[0].count);
    const actor = (await db.query("select id from profiles where role in ('admin','super_admin') limit 1")).rows[0]?.id;
    const store = (await db.query('select id from stores where is_active=true limit 1')).rows[0]?.id;
    assert.ok(actor && store, 'Admin and store fixtures are required');
    const a = randomUUID(), b = randomUUID(), id = randomUUID(), webId = randomUUID();
    const shift = `receipt-test-${randomUUID()}`, opened = `receipt-test-open-${randomUUID()}`;
    const paidAt = '2026-10-02T04:00:00Z';
    await db.query('insert into loyalty_members(id,customer_name,customer_code,"Points balance","Available points","Total spent","Total visits") values($1,\'Receipt test A\',$3,24,24,100,1),($2,\'Receipt test B\',$4,10,10,0,0)', [a, b, a, b]);
    await db.query("insert into web_orders(id,store_id,branch_id,status,order_status,receipt_number,items,subtotal,total,created_at,completed_at,payment_method,loyalty_member_id) values($1,$2,$6,'completed','completed',$3,'[]',100,100,$4,$4,'Cash',$5)", [webId, store, `T${id.slice(0,7)}`, paidAt, a, store]);
    await db.query("insert into orders(id,source_web_order_id,store_id,status,receipt_number,subtotal,gross_amount,total,net_amount,discount,discount_amount,payment_method,customer_id,loyalty_member_id,loyalty_points_awarded,loyalty_points_awarded_at,created_at,paid_at,source_metadata,items) values($1,$2,$3,'paid',$4,100,100,'100',100,'0',0,'Cash',$9,$5,4,$6,$6,$6,$7,$8)",
      [id, webId, store, `T${id.slice(0,7)}`, a, paidAt, { payment_splits: [{ method: 'Cash', amount: 100 }] }, JSON.stringify([{ name: 'Drink A', quantity: 1, unitPrice: 50 }, { name: 'Drink B', quantity: 1, unitPrice: 50 }]), a]);
    for (const name of ['Drink A','Drink B']) await db.query('insert into order_items(id,order_id,name,item_name,category_name,quantity,unit_price,line_total,gross_amount,discount_amount,net_amount) values($1,$2,$3,$3,\'Drinks\',1,50,50,50,0,50)', [randomUUID(), id, name]);
    await db.query("insert into loyalty_point_award_events(id,member_id,source_type,source_id,points_awarded,sale_total,points_balance_after,available_points_after,awarded_at) overriding system value values($1,$2,'order',$3,4,100,24,24,$4)", [-Date.now(), a, id, paidAt]);
    const summary = { grossSales: 100, netSales: 100, discounts: 0, refunds: 0, cashPayments: 100, cashRefunds: 0, expectedCash: 150, payments: { Cash: 100 }, paymentTransactions: { Cash: 1 } };
    await db.query("insert into cashier_pos(id,store_id,mode,cash_total,created_at) values($1,$2,'open',50,'2026-10-02T03:00:00Z')", [opened, store]);
    await db.query("insert into cashier_pos(id,store_id,mode,cash_total,sales_summary,created_at) values($1,$2,'close',150,$3,'2026-10-02T05:00:00Z')", [shift, store, summary]);
    const contextFor = async (source = 'order', sourceId = id, archive = {}) => (await db.query('select admin_receipt_edit_context($1,$2,$3) result', [source, sourceId, archive])).rows[0].result;
    const shiftRow = async () => (await db.query('select * from cashier_pos where id=$1', [shift])).rows[0];
    const totals = (receipt, items) => ({ ...helper.receiptMoney(receipt), payments: helper.receiptPaymentSplits(receipt), discountBreakdown: breakdown.buildShiftDiscountBreakdown([receipt], items) });
    async function correct(context, { member = b, amount = 10, method = 'Card', requestId = randomUUID(), source = 'order', sourceId = id, archive = {}, shifts = null } = {}) {
      const patch = helper.buildReceiptCorrection(context, { discountType: 'amount', discountValue: amount, discountName: 'Service recovery', payments: [{ method, amount: 0 }] });
      const points = member ? Number((patch.items.reduce((sum, row) => sum + row.net_amount, 0) * 0.04).toFixed(2)) : 0;
      const result = await db.query('select correct_admin_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) result',
        [source, sourceId, archive, context.version, requestId, actor, 'Receipt regression test', patch, member, points, patch.net, totals(context.receipt, context.items), totals(patch.receipt, patch.items), JSON.stringify(shifts || [await shiftRow()])]);
      await db.query('set constraints all immediate');
      return { ...result.rows[0].result, requestId };
    }
    async function expectFailure(run, pattern) {
      await db.query('savepoint expected_failure');
      let error;
      try { await run(); } catch (caught) { error = caught; }
      await db.query('rollback to savepoint expected_failure');
      assert.ok(error, 'Expected transaction to fail'); assert.match(error.message, pattern);
    }
    const original = await contextFor();
    const saved = await correct(original);
    assert.equal(Number(saved.context.receipt.total), 90);
    assert.equal(Number(saved.context.receipt.receipt_points_balance), 13.6);
    assert.equal(saved.context.receipt.loyalty_member_id, b);
    assert.equal(saved.context.items.reduce((sum, row) => sum + row.net_amount, 0), 90);
    assert.equal(saved.context.items.reduce((sum, row) => sum + row.discount_amount, 0), 10);
    assert.equal(Number(saved.context.linkedWebReceipt.total), 90);
    assert.equal(saved.context.linkedWebReceipt.loyalty_member_id, b);
    let members = (await db.query('select id,"Points balance","Available points","Total spent","Total visits" from loyalty_members where id=any($1) order by id', [[a,b]])).rows;
    const oldMember = members.find(row => row.id === a), newMember = members.find(row => row.id === b);
    assert.equal(Number(oldMember['Available points']),20); assert.equal(Number(oldMember['Total spent']),0); assert.equal(oldMember['Total visits'],0);
    assert.equal(Number(newMember['Available points']),13.6); assert.equal(Number(newMember['Total spent']),90); assert.equal(newMember['Total visits'],1);
    let closed = await shiftRow();
    assert.equal(closed.sales_summary.netSales,90); assert.equal(closed.sales_summary.discounts,10);
    assert.equal(closed.sales_summary.cashPayments,0); assert.equal(closed.sales_summary.expectedCash,50);
    assert.equal(closed.sales_summary.payments.Card,90); assert.equal(closed.sales_summary.paymentTransactions.Cash,0);
    assert.equal(Number(closed.cash_total),150);
    const replay = await correct(original, { requestId: saved.requestId }); assert.equal(replay.replayed,true);
    assert.deepEqual((await db.query('select id,"Points balance","Available points","Total spent","Total visits" from loyalty_members where id=any($1) order by id', [[a,b]])).rows,members);
    await expectFailure(() => correct(original), /Receipt changed/);
    assert.equal(Number((await db.query("update orders set receipt_points_balance=999 where id=$1 returning receipt_points_balance", [id])).rows[0].receipt_points_balance),13.6);
    const changed = await correct(await contextFor(), { amount: 20 });
    assert.equal(Number(changed.context.receipt.total),80);
    assert.equal(Number(changed.context.receipt.loyalty_points_awarded),3.2);
    assert.equal(Number((await db.query('select "Available points" from loyalty_members where id=$1',[b])).rows[0]['Available points']),13.2);
    const unlinked = await correct(await contextFor(), { member: null, amount: 20 });
    assert.equal(unlinked.context.receipt.loyalty_member_id,null); assert.equal(unlinked.context.receipt.receipt_points_balance,null);
    assert.equal(Number((await db.query('select "Available points" from loyalty_members where id=$1',[b])).rows[0]['Available points']),10);
    const restored = await correct(await contextFor(), { member: b, amount: 0, method: 'Cash' });
    assert.equal(Number(restored.context.receipt.total),100);
    assert.equal(Number(restored.context.receipt.loyalty_points_awarded),4);
    assert.equal((await shiftRow()).sales_summary.expectedCash,150);
    await db.query('update loyalty_members set "Available points"=0 where id=$1',[b]);
    await expectFailure(async () => correct(await contextFor(), { member:null, amount:0 }), /already spent/);
    // An unredeemed reward can be withdrawn atomically to recover its points.
    await db.query('savepoint unused_reward');
    await db.query('update loyalty_members set "Points balance"=114 where id=$1',[b]);
    const voucherId=randomUUID();
    await db.query("insert into vouchers(id,member_id,reward_index,code,reward_text,reward_type,status,issued_at,expires_at,points_consumed,points_consumed_at) values($1,$2,1,$3,'100 Points Reward','points','active',now(),now()+interval '90 days',100,now())",[voucherId,b,`PTS100-${voucherId}`]);
    const reclaimed=await correct(await contextFor(),{member:null,amount:0});
    assert.equal(reclaimed.voucherChanges.length,1);
    assert.equal((await db.query('select status from vouchers where id=$1',[voucherId])).rows[0].status,'expired');
    assert.equal(Number((await db.query('select "Available points" from loyalty_members where id=$1',[b])).rows[0]['Available points']),96);
    await db.query('rollback to savepoint unused_reward');
    await db.query('update loyalty_members set "Available points"=14 where id=$1',[b]);
    await expectFailure(() => db.query("update web_orders set total=1 where id=$1", [webId]), /Items and totals cannot/);
    await expectFailure(() => contextFor('web_order', webId), /linked POS receipt/);
    // Same transaction path for purged receipts; no replacement sale is inserted.
    const archiveId = randomUUID(), archiveItem = randomUUID();
    const archive = { receipt: { id:archiveId, store_id:store, status:'paid', receipt_number:'ARCHIVE-TEST', created_at:paidAt, paid_at:paidAt,
      total:'50', net_amount:50, gross_amount:50, discount_amount:0, discount:'0', payment_method:'Cash', items:[], source_metadata:{} },
      items:[{ id:archiveItem, order_id:archiveId, name:'Archived drink', category_name:'Drinks', quantity:1, unit_price:50, gross_amount:50, discount_amount:0, net_amount:50, line_total:50 }] };
    const archiveShiftId = `archived-shift-${randomUUID()}`;
    const archivedShift = { id:archiveShiftId, store_id:store, mode:'close', cash_total:50, created_at:'2026-10-02T05:00:00Z',
      sales_summary:{grossSales:50,netSales:50,discounts:0,cashPayments:50,cashRefunds:0,expectedCash:50,payments:{Cash:50},paymentTransactions:{Cash:1}} };
    await db.query("insert into sales_archive_batches(shift_id,store_id,opened_at,closed_at,business_date,status) values($1,$2,'2026-10-02T03:00:00Z','2026-10-02T05:00:00Z','2026-10-02','purged')",[archiveShiftId,store]);
    const archived = await correct(await contextFor('order',archiveId,archive), { sourceId:archiveId, archive, amount:5, member:b, shifts:[archivedShift] });
    assert.equal(Number(archived.context.receipt.total),45);
    assert.equal((await db.query('select count(*) from orders where id=$1',[archiveId])).rows[0].count,'0');
    assert.equal((await db.query('select count(*) from admin_receipt_corrections where source_id=$1',[archiveId])).rows[0].count,'1');
    const shiftOverride = (await db.query('select shift from admin_receipt_shift_corrections where shift_id=$1',[archiveShiftId])).rows[0].shift;
    assert.equal(shiftOverride.sales_summary.netSales,45); assert.equal(shiftOverride.sales_summary.cashPayments,0); assert.equal(shiftOverride.sales_summary.expectedCash,0);
    assert.equal(Number(shiftOverride.cash_total),50);
    const merged = helper.applyReceiptCorrections({orders:[archive.receipt],orderItems:archive.items,webOrders:[],shiftRecords:[]}, [{source_type:'order',source_id:archiveId,receipt:archived.context.receipt,items:archived.context.items}]);
    assert.equal(Number(merged.orders[0].total),45); assert.equal(merged.orderItems[0].net_amount,45);
    const refunded = {...archived.context.receipt,status:'refunded',refund_amount:45,updated_at:'2099-01-01T00:00:00Z'};
    const newer = helper.applyReceiptCorrections({orders:[refunded],orderItems:[{...archive.items[0],refund_amount:45}],webOrders:[],shiftRecords:[]}, [{source_type:'order',source_id:archiveId,receipt:archived.context.receipt,items:archived.context.items}]);
    assert.equal(newer.orders[0].status,'refunded'); assert.equal(newer.orderItems[0].refund_amount,45);
    assert.equal((await db.query("select has_function_privilege('authenticated','correct_admin_receipt(text,uuid,jsonb,text,uuid,uuid,text,jsonb,uuid,numeric,numeric,jsonb,jsonb,jsonb)','execute') allowed")).rows[0].allowed,false);
    assert.equal(Number((await db.query('select count(*) from admin_receipt_edit_audit')).rows[0].count),auditCount+5);
    const fractional = helper.buildReceiptCorrection({receipt:{id:randomUUID(),total:1,gross_amount:1,discount_amount:0,items:[],source_metadata:{}},items:[{gross_amount:.33,net_amount:.33},{gross_amount:.33,net_amount:.33},{gross_amount:.34,net_amount:.34}]}, {discountType:'percent',discountValue:33.33,discountName:'Rounding',payments:[{method:'Cash',amount:0}]});
    assert.equal(fractional.net,.67); assert.equal(fractional.items.reduce((sum,row)=>sum+helper.cents(row.net_amount),0),67);
    assert.throws(() => helper.buildReceiptCorrection(original,{discountType:'amount',discountValue:101,discountName:'Invalid',payments:[{method:'Cash',amount:0}]}),/exceed/);
    await db.query('rollback to savepoint fixtures');
    await db.query('set constraints all immediate');
    if (process.argv.includes('--apply')) { await db.query('commit'); console.log('Receipt corrections migration committed; all fixtures rolled back.'); }
    else { await db.query('rollback'); console.log(installed ? 'Installed migration verified; all fixtures rolled back.' : 'Migration and fixtures rolled back.'); }
    console.log('PASS: loyalty transfer/unlink/relink, discount edits, linked web receipt, payment/shift deltas, immutable snapshots, idempotency, stale edits, unused-reward recovery, spent-point protection, archive receipt/shift overlays, service-only access, and cent rounding.');
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode=1; });
