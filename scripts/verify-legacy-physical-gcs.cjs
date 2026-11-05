const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
loadEnvConfig(process.cwd());

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  const schema = 'legacy_gc_test_' + randomUUID().replaceAll('-', '');
  try {
    await db.query('BEGIN');
    await db.query('SET LOCAL statement_timeout=20000');
    await db.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['orders', 'order_items', 'profiles', 'vouchers', 'open_tickets', 'web_orders', 'booking_gc_redemptions', 'booking_gc_certificates']) {
      await db.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
    }
    await db.query(`ALTER TABLE ${schema}.orders ADD PRIMARY KEY(id)`);
    await db.query(`ALTER TABLE ${schema}.orders ADD UNIQUE(pos_gc_checkout_key)`);
    await db.query(`ALTER TABLE ${schema}.profiles ADD PRIMARY KEY(id)`);
    await db.query(`CREATE FUNCTION ${schema}.complete_pos_discount_claims(uuid,uuid,text) RETURNS void LANGUAGE sql AS 'SELECT'`);
    const existingGuard = (await db.query("select pg_get_functiondef('public.enforce_pos_gc_payment_ledger()'::regprocedure) definition")).rows[0].definition
      .replace('if sale.id is null or exists(select 1 from public.legacy_physical_gc_redemptions where order_id=sale.id) then return null; end if;', 'if sale.id is null then return null; end if;');
    await db.query(existingGuard.replaceAll('public.', schema + '.').replaceAll("search_path TO 'public'", "search_path TO '" + schema + "'"));
    await db.query(`create constraint trigger enforce_pos_gc_payment_ledger after insert or update on ${schema}.orders deferrable initially deferred for each row execute function ${schema}.enforce_pos_gc_payment_ledger()`);
    const migration = readFileSync('supabase/migrations/20261105090000_legacy_physical_gc_redemption.sql', 'utf8')
      .replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
      .replaceAll('public.', schema + '.').replaceAll('search_path=public', 'search_path=' + schema);
    await db.query(migration);
    const actor = randomUUID(), store = randomUUID();
    await db.query(`INSERT INTO ${schema}.profiles(id,role,store_id) VALUES($1,'cashier',$2)`, [actor, store]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    const serial = 'TEST-' + randomUUID();
    const order = { receipt_number: 'TEST-LEGACY', store_id: store, total: '250', net_amount: 250,
      gross_amount: 250, discount_amount: 0, payment_method: 'Legacy Physical GC 100 + Cash 150', items: [],
      source_metadata: { payment_splits: [{ method: 'Legacy Physical GC', amount: 100 }, { method: 'Cash', amount: 150 }] } };
    const items = [{ source_metadata: {}, name: 'Rollback test', quantity: 1, unit_price: 250, line_total: 250, gross_amount: 250, net_amount: 250, discount_amount: 0 }];
    const submit = (key, serials = [serial], draft = order, lines = items) => db.query(`select ${schema}.complete_pos_legacy_gc_sale($1,$2,$3,$4) result`, [key, draft, JSON.stringify(lines), serials]);
    const reject = async (fn, pattern) => {
      await db.query('SAVEPOINT invalid_case');
      await assert.rejects(fn, pattern);
      await db.query('ROLLBACK TO SAVEPOINT invalid_case');
    };
    await reject(() => submit(randomUUID(), [serial, serial.toLowerCase().replaceAll('-', ' ')]), /Duplicate/);
    await reject(() => submit(randomUUID(), ['JUJA-GC-123']), /valid old/);
    await reject(() => submit(randomUUID(), ['---']), /valid old/);
    await reject(() => submit(randomUUID(), [serial], { ...order, store_id: randomUUID() }), /Wrong POS branch/);
    await reject(() => submit(randomUUID(), [serial, 'SECOND', 'THIRD']), /cannot exceed/);
    await reject(() => submit(randomUUID(), [serial], { ...order, source_metadata: { payment_splits: [{ method: 'Cash', amount: 250 }] } }), /Payment amounts/);
    // A failure after sale insertion must roll back the order and serial together.
    await db.query(`ALTER TABLE ${schema}.order_items ADD CONSTRAINT test_write_failure CHECK(name<>'FAIL')`);
    await reject(() => submit(randomUUID(), [serial], order, [{ ...items[0], name: 'FAIL' }]), /test_write_failure/);
    assert.equal((await db.query(`select count(*)::int n from ${schema}.orders`)).rows[0].n, 0);
    assert.equal((await db.query(`select count(*)::int n from ${schema}.legacy_physical_gc_redemptions`)).rows[0].n, 0);
    const ticket = randomUUID();
    await db.query(`insert into ${schema}.open_tickets(id,store_id,items,total_amount) values($1,$2,'[]',250)`, [ticket, store]);
    order.source_metadata.open_ticket_id = ticket;
    const key = randomUUID();
    const sale = (await submit(key)).rows[0].result;
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
    assert.equal(sale.replayed, false);
    assert.equal((await submit(key)).rows[0].result.replayed, true);
    const ledger = (await db.query(`select * from ${schema}.legacy_physical_gc_redemptions`)).rows;
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].serial, serial.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    assert.equal(Number(ledger[0].amount), 100);
    assert.equal(ledger[0].order_id, sale.order.id);
    await reject(async () => {
      await db.query(`insert into ${schema}.orders select (jsonb_populate_record(null::${schema}.orders,$1)).*`, [{ ...sale.order, id: randomUUID(), pos_gc_checkout_key: randomUUID() }]);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    }, /matching redemption ledger/);
    delete order.source_metadata.open_ticket_id;
    await reject(() => submit(randomUUID()), /already been redeemed/);
    await reject(() => db.query(`select ${schema}.validate_pos_legacy_gc($1,$2)`, [serial.toLowerCase(), store]), /already been redeemed/);
    await db.query(`update ${schema}.profiles set role='admin' where id=$1`, [actor]);
    await reject(() => submit(randomUUID(), [serial], { ...order, store_id: randomUUID() }), /already been redeemed/);
    await db.query(`update ${schema}.profiles set role='customer' where id=$1`, [actor]);
    await reject(() => submit(randomUUID(), ['UNUSED']), /POS access required/);
    assert.equal((await db.query(`select has_table_privilege('authenticated','${schema}.legacy_physical_gc_redemptions','INSERT') allowed`)).rows[0].allowed, false);
    assert.equal((await db.query(`select has_function_privilege('anon','${schema}.complete_pos_legacy_gc_sale(uuid,jsonb,jsonb,text[],uuid[])','EXECUTE') allowed`)).rows[0].allowed, false);
    console.log('PASS: saved-ticket sale, canonical serials, duplicate and cross-branch reuse rejection, replay, failed-write rollback, payment validation and permissions. All test data rolled back.');
  } finally { await db.query('ROLLBACK'); await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
