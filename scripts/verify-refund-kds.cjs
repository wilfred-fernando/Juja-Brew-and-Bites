// Read-only outcome checks plus rollback-only fixtures for the reported refund.
require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const assert = require('node:assert/strict');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin');
    const { rows: [order] } = await db.query("select * from orders where receipt_number='P6371207'");
    assert.equal(order.status, 'refunded');
    const { rows: itemRows } = await db.query('select status,refunded_at from order_items where order_id=$1', [order.id]);
    assert(itemRows.every(item => item.status === 'refunded' && item.refunded_at));
    const { rows: [card] } = await db.query('select * from kds_tickets where order_id=$1 limit 1', [order.id]);
    assert.equal(card.status, 'voided');
    assert(card.items.every(item => item.voided));
    const root = require('node:crypto').randomUUID();
    const fixtures = [root, `${root}:batch:test`, `${root}-unrelated`];
    for (const source of fixtures) {
      await db.query(`insert into kds_tickets(source_type,source_id,store_id,status,items)
        values('pos',$1,$2,'preparing',$3::jsonb)`, [source, order.store_id, JSON.stringify(card.items.map(item => ({ ...item, voided: false, status: 'preparing' })))]);
    }
    await db.query(`update orders set source_metadata=source_metadata || jsonb_build_object('open_ticket_id',$2::text),status=status where id=$1`, [order.id, root]);
    for (const source of fixtures) {
      const { rows: [result] } = await db.query('select status,items from kds_tickets where source_id=$1', [source]);
      assert.equal(result.status, source.endsWith('-unrelated') ? 'preparing' : 'voided');
      assert(result.items.every(item => item.voided === !source.endsWith('-unrelated')));
    }
    await db.query('update orders set status=status where id=$1', [order.id]);
    assert.equal((await db.query('select count(*)::int n from kds_tickets where source_id=any($1)', [fixtures])).rows[0].n, 3);
    console.log('Passed: refunded card, item flags, saved-ticket root/batch matching, unrelated exclusion, and repeat refund. All fixtures rolled back.');
  } finally {
    await db.query('rollback');
    await db.end();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
