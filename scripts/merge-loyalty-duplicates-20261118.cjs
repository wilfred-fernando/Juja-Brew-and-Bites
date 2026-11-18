// Fixed, user-authorized pairs. Default is a rollback rehearsal; --apply commits.
const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
loadEnvConfig(process.cwd());
const plan = [
  ['JUJA2025000129', 'JUJA2026001070', 'Jasmin Andal'],
  ['JUJA2025000512', 'JUJA2026000955', 'Mikyla Ussher'],
  ['JUJA2026000725', 'JUJA2026000736', 'Jevieclaire Robea'],
  ['JUJA2025000197', 'JUJA2025000399', 'Marla Mae Caling'],
  ['JUJA2025000427', 'JUJA2026000743', 'Thea Bonto'],
  ['JUJA2025000584', 'JUJA2025000693', 'Thea Nadine Cabote'],
  ['JUJA2025000246', 'JUJA2026001065', 'Donna Torculas'],
  ['JUJA2025000041', 'JUJA2025000391', 'Lex Ann Dee'],
  ['JUJA2025000134', 'JUJA2026000943', 'Alexis Ople'],
  ['JUJA2025000141', 'JUJA2026000962', 'Aldrin Mirandilla'],
].filter((row) => (!process.argv.includes('--exclude-alexis') || row[2] !== 'Alexis Ople')
  && (!process.argv.includes('--only-alexis') || row[2] === 'Alexis Ople'));
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const cents = (v) => Math.round(Number(v || 0) * 100);
const dateValue = (v) => {
  if (!v) return 0;
  const us = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (us) return Date.UTC(2000 + Number(us[3]), Number(us[1]) - 1, Number(us[2]), Number(us[4]) % 12 + (us[6].toUpperCase() === 'PM' ? 12 : 0), Number(us[5]));
  let iso = String(v).replace(' ', 'T');
  if (/T.*[+-]\d{2}$/.test(iso)) iso += ':00';
  const result = Date.parse(iso);
  assert(Number.isFinite(result), `Unrecognized date: ${v}`);
  return result;
};
async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
  await db.connect();
  const apply = process.argv.includes('--apply');
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='8s'");
    await db.query(fs.readFileSync('supabase/migrations/20261118120000_loyalty_member_merge_aliases.sql', 'utf8'));
    const refs = (await db.query("select c.conrelid::regclass::text tbl,a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.loyalty_members'::regclass")).rows;
    const specs = [...refs.filter((r) => r.tbl !== 'loyalty_member_merge_aliases'),
      { tbl: 'orders', col: 'customer_id' }, { tbl: 'profiles', col: 'loyalty_account_id' },
      { tbl: 'loyalty_link_requests', col: 'matched_member_id' }, { tbl: 'juja_stamp_purchases', col: 'member_id' }];
    const table = (t) => t.split('.').map(quote).join('.');
    const tables = [...new Set(['loyalty_members', 'loyalty_member_merge_aliases', ...specs.map((r) => r.tbl)])].sort();
    // Briefly block concurrent writes while validating and moving related records.
    await db.query(`lock table ${tables.map(table).join(',')} in share row exclusive mode`);
    const allBefore = (await db.query('select * from loyalty_members order by id')).rows;
    const codes = plan.flatMap(([a, b]) => [a, b]);
    const members = allBefore.filter((r) => codes.includes(r.customer_code));
    assert.equal(members.length, plan.length * 2, 'Exactly the approved members must exist; do not rerun after applying');
    const ids = members.map((r) => r.id);
    const snapshots = {};
    const linkedProfiles = (await db.query('select id from profiles where loyalty_account_id=any($1::uuid[])', [ids])).rows;
    const profileIds = [...ids, ...members.map((r) => r.user_id).filter(Boolean), ...linkedProfiles.map((r) => r.id)];
    const queryIds = (t) => t === 'profiles' ? profileIds : ids;
    const conditions = (t) => [...specs.filter((s) => s.tbl === t).map((s) => `${quote(s.col)}::text=any($1::text[])`), ...(t === 'profiles' ? ['id::text=any($1::text[])'] : [])].join(' or ');
    for (const t of tables.filter((t) => !['loyalty_members', 'loyalty_member_merge_aliases'].includes(t))) {
      snapshots[t] = (await db.query(`select * from ${table(t)} where ${conditions(t)}`, [queryIds(t)])).rows;
    }
    assert.equal(snapshots.juja_stamp_cards.length, 0, 'Stamp cards need a separate merge strategy');
    assert.equal(snapshots.juja_stamp_purchases.length, 0);
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juja-loyalty-merge-20261118-'));
    fs.writeFileSync(path.join(backupDir, 'before.json'), JSON.stringify({ plan, members, snapshots }, null, 2));
    const unchangedHash = async (t) => {
      const result = await db.query(`select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by to_jsonb(t)::text),'')) hash from ${table(t)} t where not (${conditions(t)})`, [queryIds(t)]);
      return result.rows[0].hash;
    };
    const hashes = {};
    for (const t of Object.keys(snapshots)) hashes[t] = await unchangedHash(t);
    const disabled = (await db.query("select tgrelid::regclass::text tbl,tgname,tgenabled from pg_trigger where not tgisinternal and tgrelid in ('loyalty_members'::regclass,'vouchers'::regclass,'orders'::regclass,'web_orders'::regclass) and tgenabled <> 'D'")).rows;
    // Do not issue new vouchers, refresh stamps, or alter receipt snapshots during identity maintenance.
    // Foreign-key/unique constraints remain enabled throughout.
    for (const t of disabled) await db.query(`alter table ${table(t.tbl)} disable trigger ${quote(t.tgname)}`);
    const report = [];
    for (const [keepCode, removeCode, name] of plan) {
      const keep = members.find((r) => r.customer_code === keepCode);
      const remove = members.find((r) => r.customer_code === removeCode);
      assert(keepCode < removeCode, 'Keep the earliest issued loyalty code');
      assert(dateValue(keep['First visit']) <= dateValue(remove['First visit']), 'First visit must corroborate the older identity');
      const profileRows = snapshots.profiles.filter((r) => [keep.id, remove.id].includes(r.loyalty_account_id));
      const users = [...new Set([keep.user_id, remove.user_id, ...profileRows.map((r) => r.id)].filter(Boolean))];
      const useCurrentAlexis = name === 'Alexis Ople' && process.argv.includes('--alexis-current-login');
      if (!useCurrentAlexis) assert(users.length <= 1, `Conflicting login accounts: ${name}`);
      else assert.deepEqual(users.slice().sort(), ['56f582ae-f344-40f4-b93a-1395472a30f6', 'afd9517f-4b98-4ee7-8471-797aa39c293f'].sort());
      const userId = useCurrentAlexis ? 'afd9517f-4b98-4ee7-8471-797aa39c293f' : users[0] || null;
      if (userId) {
        const profile = (await db.query('select id,loyalty_account_id from profiles where id=$1', [userId])).rows[0];
        assert(profile, `Missing profile for ${name}`);
        assert(!profile.loyalty_account_id || [keep.id, remove.id].includes(profile.loyalty_account_id), 'Login already belongs to another loyalty account');
      }
      await db.query('insert into loyalty_member_merge_aliases(source_id,member_id,source_snapshot) values($1,$2,$3)', [remove.id, keep.id, remove]);
      await db.query('update loyalty_members set user_id=null where id=$1', [remove.id]);
      if (useCurrentAlexis) await db.query('update profiles set loyalty_account_id=null where loyalty_account_id=any($1::uuid[]) and id<>$2', [[keep.id, remove.id], userId]);
      const last = dateValue(keep['Last visit']) >= dateValue(remove['Last visit']) ? keep['Last visit'] : remove['Last visit'];
      await db.query(`update loyalty_members set customer_name=$2,user_id=$3,
        "Email"=coalesce(nullif("Email",''),$4),
        "Points balance"="Points balance"+$5::numeric,"Available points"="Available points"+$6::numeric,
        "Total spent"="Total spent"+$7::numeric,"Total visits"="Total visits"+$8::integer,"Last visit"=$9
        where id=$1`, [keep.id, name, userId, remove.Email, remove['Points balance'] || 0, remove['Available points'] || 0, remove['Total spent'] || 0, remove['Total visits'] || 0, last]);
      const sourceVouchers = snapshots.vouchers.filter((r) => r.member_id === remove.id);
      let maxIndex = Math.max(0, ...snapshots.vouchers.filter((r) => r.member_id === keep.id).map((r) => Number(r.reward_index || 0)));
      for (const v of sourceVouchers) {
        await db.query('update vouchers set member_id=$2,reward_index=$3 where id=$1', [v.id, keep.id, v.reward_index == null ? null : ++maxIndex]);
      }
      for (const ref of specs.filter((r) => !['vouchers', 'profiles', 'juja_stamp_cards', 'juja_stamp_purchases'].includes(r.tbl))) {
        await db.query(`update ${table(ref.tbl)} set ${quote(ref.col)}=$2 where ${quote(ref.col)}::text=$1`, [remove.id, keep.id]);
      }
      if (userId) await db.query('update profiles set loyalty_account_id=$2 where id=$1', [userId, keep.id]);
      const removed = await db.query('delete from loyalty_members where id=$1 returning id', [remove.id]);
      assert.equal(removed.rowCount, 1);
      const result = (await db.query('select * from loyalty_members where id=$1', [keep.id])).rows[0];
      for (const field of ['Points balance', 'Available points', 'Total spent', 'Total visits']) assert.equal(cents(result[field]), cents(keep[field]) + cents(remove[field]), `${name}: ${field}`);
      assert.equal(result.customer_code, keepCode);
      assert.equal(result.customer_name, name);
      report.push({ name, kept: keepCode, merged: removeCode, available: result['Available points'], spent: result['Total spent'], visits: result['Total visits'], linked: !!userId });
    }
    for (const t of disabled) {
      const mode = t.tgenabled === 'A' ? 'enable always' : t.tgenabled === 'R' ? 'enable replica' : 'enable';
      await db.query(`alter table ${table(t.tbl)} ${mode} trigger ${quote(t.tgname)}`);
    }
    const allAfter = (await db.query('select * from loyalty_members order by id')).rows;
    assert.equal(allBefore.length - allAfter.length, plan.length);
    assert.deepEqual(allAfter.filter((r) => !ids.includes(r.id)), allBefore.filter((r) => !ids.includes(r.id)), 'Unrelated members changed');
    const canonical = Object.fromEntries(plan.map(([a,b]) => [members.find((r) => r.customer_code === b).id, members.find((r) => r.customer_code === a).id]));
    for (const [t, before] of Object.entries(snapshots)) {
      assert.equal(await unchangedHash(t), hashes[t], `Unrelated rows changed in ${t}`);
      const after = (await db.query(`select * from ${table(t)} where ${conditions(t)}`, [queryIds(t)])).rows;
      assert.equal(after.length, before.length, `Lost or created records in ${t}`);
      const strip = (row) => {
        const copy = { ...row };
        for (const ref of specs.filter((r) => r.tbl === t)) if (canonical[copy[ref.col]]) copy[ref.col] = canonical[copy[ref.col]];
        if (t === 'vouchers') delete copy.reward_index;
        if (t === 'profiles') delete copy.loyalty_account_id; // Verified against the retained member below.
        return copy;
      };
      const sort = (rows) => rows.map((r) => JSON.stringify(strip(r))).sort();
      assert.deepEqual(sort(after), sort(before), `Unexpected non-identity changes in ${t}`);
    }
    await db.query('set constraints all immediate');
    const userLinks = (await db.query('select id,user_id from loyalty_members where id=any($1::uuid[]) and user_id is not null', [ids])).rows;
    for (const row of userLinks) assert.equal((await db.query('select loyalty_account_id from profiles where id=$1', [row.user_id])).rows[0]?.loyalty_account_id, row.id);
    fs.writeFileSync(path.join(backupDir, 'report.json'), JSON.stringify(report, null, 2));
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ mode: apply ? 'APPLIED' : 'ROLLBACK REHEARSAL PASSED', backupDir, merged: report, unchangedMembersVerified: true, preservedHistoryAndVouchers: true }, null, 2));
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
