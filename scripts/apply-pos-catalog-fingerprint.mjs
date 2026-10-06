import fs from 'node:fs';
import pg from 'pg';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
await db.connect();
try {
  await db.query('begin');
  await db.query("set local lock_timeout = '5s'");
  await db.query(fs.readFileSync('supabase/migrations/20261006100000_pos_catalog_fingerprint.sql', 'utf8'));
  const { rows } = await db.query('select public.pos_catalog_fingerprint() fingerprint');
  if (!/^[a-f0-9]{32}$/.test(rows[0]?.fingerprint || '')) throw new Error('Invalid catalog fingerprint');
  await db.query(process.argv.includes('--apply') ? 'commit' : 'rollback');
  console.log(process.argv.includes('--apply') ? 'Catalog fingerprint installed; schema reload requested.' : 'Catalog fingerprint validated; transaction rolled back.');
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally {
  await db.end();
}
