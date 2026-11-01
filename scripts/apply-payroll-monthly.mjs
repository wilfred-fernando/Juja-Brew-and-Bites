import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{await db.query(fs.readFileSync('supabase/migrations/20261101110000_payroll_monthly_summary_only.sql','utf8'));console.log('Removed obsolete monthly payroll creation RPC and overlap guard. Existing payroll records retained; monthly summary is read-only.');}finally{await db.end();}
