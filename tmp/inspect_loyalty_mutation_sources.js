/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),path=require('path'); const {Client}=require('pg');
for(const line of fs.readFileSync(path.join(process.cwd(),'.env.local'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();try{
 const tables=await c.query(`select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%loyal%' or table_name ilike '%point%' or table_name ilike '%refund%') order by table_name`);
 const cols=await c.query(`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and (table_name ilike '%loyal%' or table_name ilike '%point%' or table_name ilike '%refund%') order by table_name,ordinal_position`);
 const funcs=await c.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%loyal%' or p.proname ilike '%point%' or p.proname ilike '%refund%') order by p.proname`);
 console.log(JSON.stringify({tables:tables.rows,columns:cols.rows,functions:funcs.rows},null,2));
}finally{await c.end();}})().catch(e=>{console.error(e);process.exit(1)});
