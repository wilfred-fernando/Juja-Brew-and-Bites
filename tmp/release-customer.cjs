const fs = require('fs');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Client } = require('pg');
for (const name of ['.env.local', '.env.r2-migration']) {
  for (const line of fs.readFileSync(name, 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/); if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
async function main() {
  if (process.argv[2] === 'database') {
    const db = new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
    await db.connect();
    const r = await db.query("select to_regclass('public.customer_order_push_outbox') as outbox, exists(select 1 from information_schema.columns where table_schema='public' and table_name='customer_push_tokens' and column_name='order_progress_supported') as capability");
    console.log(r.rows[0]);
    if (!r.rows[0].outbox || !r.rows[0].capability) {
      await db.query('BEGIN');
      try { await db.query(fs.readFileSync('supabase/migrations/20261010120000_customer_order_progress_push.sql','utf8')); await db.query('COMMIT'); console.log('Applied customer notification migration'); }
      catch(e) {await db.query('ROLLBACK'); throw e;}
    }
    await db.end(); return;
  }
  const file='releases/juja-customer-v2.1.apk'; const body=fs.readFileSync(file);
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const s3=new S3Client({region:'auto',endpoint:process.env.CLOUDFLARE_R2_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,secretAccessKey:process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY}});
  const target={Bucket:process.env.CLOUDFLARE_R2_BUCKET || 'juja-assets',Key:'apk-downloads/juja-customer-v2.1.apk'};
  await s3.send(new PutObjectCommand({...target,Body:body,ContentType:'application/vnd.android.package-archive',CacheControl:'public, max-age=3600',Metadata:{sha256:hash}}));
  const head=await s3.send(new HeadObjectCommand(target));
  if(head.ContentLength!==body.length || head.Metadata.sha256!==hash) throw Error('Upload verification failed');
  console.log(JSON.stringify({uploaded:target.Key,bytes:body.length,sha256:hash}));
}
main().catch(e=>{console.error(e.message);process.exit(1)});
