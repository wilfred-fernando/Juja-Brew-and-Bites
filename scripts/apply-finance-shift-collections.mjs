import fs from 'node:fs';
import {spawn} from 'node:child_process';
import pg from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const argument=process.argv.indexOf('--wrangler');
const entry=argument>=0?process.argv[argument+1]:null;
if(!entry)throw new Error('Pass --wrangler with the installed Wrangler entry point to backfill archived shifts.');
async function archive(sql){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[entry,'d1','execute','juja-history-archive','--remote','--config','cloudflare/d1-archive/wrangler.toml','--command',sql,'--json'],{stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
  child.on('error',reject);child.on('close',code=>{if(code)return reject(new Error('Archive read failed: '+errors));try{const result=JSON.parse(output);if(result.some(r=>!r.success))throw new Error('Archive read failed');resolve(result.flatMap(r=>r.results));}catch(e){reject(e);}});
 });
}
const [archivedShifts,archivedOrders]=await Promise.all([
 archive("SELECT payload_json FROM archive_shifts ORDER BY created_at"),
 archive("SELECT source_type,payload_json FROM archive_orders WHERE business_date >= '2026-06-28' ORDER BY created_at")
]);
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='15s'");
 await db.query("select pg_advisory_xact_lock(hashtextextended('finance_closed_shift_migration',0))");
 await db.query('lock table public.cashier_pos in share row exclusive mode');
 const installed=(await db.query("select to_regprocedure('public.finance_capture_closed_shift(jsonb,jsonb)') installed")).rows[0].installed;
 if(!installed)await db.query(fs.readFileSync('supabase/migrations/20261004100000_finance_closed_shift_collections.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 if(!(await db.query("select to_regprocedure('public.finance_collection_payment_entries(jsonb)') installed")).rows[0].installed)
  await db.query(fs.readFileSync('supabase/migrations/20261004110000_finance_legacy_split_collections.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const liveShifts=(await db.query("select to_jsonb(s) payload from public.cashier_pos s where lower(mode) in ('close','end_day') order by created_at")).rows.map(r=>r.payload);
 const liveOrders=(await db.query("select to_jsonb(o)||jsonb_build_object('_finance_source','pos') payload from public.orders o union all select to_jsonb(w)||jsonb_build_object('_finance_source','web') from public.web_orders w")).rows.map(r=>r.payload);
 const shiftMap=new Map(archivedShifts.map(r=>{const s=JSON.parse(r.payload_json);return [s.id,s];}));
 liveShifts.forEach(s=>shiftMap.set(s.id,s));
 const orderMap=new Map(archivedOrders.map(r=>{const o={...JSON.parse(r.payload_json),_finance_source:r.source_type==='WEB'?'web':'pos'};return [o._finance_source+':'+o.id,o];}));
 liveOrders.forEach(o=>orderMap.set(o._finance_source+':'+o.id,o));
 const allOrders=[...orderMap.values()];const converted=new Set(allOrders.filter(o=>o._finance_source==='pos').map(o=>o.source_web_order_id).filter(Boolean));
 const orders=allOrders.filter(o=>o._finance_source!=='web'||!converted.has(o.id));
 const previous=new Map();let imported=0;
 const sorted=[...shiftMap.values()].filter(s=>['close','end_day'].includes(String(s.mode).toLowerCase())).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id)));
 for(const shift of sorted){
  const end=new Date(shift.created_at).getTime();
  const start=previous.get(String(shift.store_id))??end-48*3600000;
  const receipts=orders.filter(o=>String(o.store_id)===String(shift.store_id)&&new Date(o.created_at).getTime()>start&&new Date(o.created_at).getTime()<=end);
  await db.query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({...shift,_finance_refresh:process.argv.includes('--repair')}),JSON.stringify(receipts)]);
  previous.set(String(shift.store_id),end);imported++;
  if(imported%50===0)console.log(`Processed ${imported} of ${sorted.length} closed shifts.`);
 }
 const totals=(await db.query("select (select count(*)::int from public.finance_cash_closed_shifts) closed_shifts,count(*)::int collection_rows,coalesce(sum(gross_amount),0)::text non_cash_sales from public.finance_cash_receivables where shift_id is not null")).rows[0];
 if(totals.closed_shifts!==sorted.length)throw new Error('Closed shift backfill coverage mismatch');
 await db.query("notify pgrst,'reload schema'");
 await db.query(process.argv.includes('--verify')?'rollback':'commit');
 console.log((process.argv.includes('--verify')?'PASS: actual closed-shift history verified; all changes rolled back. ':'Closed-shift collection migration applied; archived and live shifts imported. ')+JSON.stringify({processed:imported,...totals}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
