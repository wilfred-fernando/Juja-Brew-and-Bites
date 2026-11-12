require('@next/env').loadEnvConfig(process.cwd());
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {S3Client,HeadObjectCommand,PutObjectCommand}=require('@aws-sdk/client-s3');
(async()=>{
  if(!process.argv.includes('--apply'))throw new Error('Pass --apply to publish the verified POS v2.3 APK.');
  const body=fs.readFileSync('artifacts/android-widget/juja-pos-v2.3.apk'),sha=createHash('sha256').update(body).digest('hex');
  const bucket=process.env.CLOUDFLARE_R2_BUCKET||'juja-assets',key='apk-downloads/juja-pos-v2.3.apk';
  const endpoint=process.env.CLOUDFLARE_R2_ENDPOINT||`https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const client=new S3Client({region:'auto',endpoint,credentials:{accessKeyId:process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,secretAccessKey:process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY}});
  let existing;try{existing=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;}
  if(existing){assert.equal(existing.Metadata?.sha256,sha,'An immutable v2.3 APK already exists with different contents.');}
  else await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/vnd.android.package-archive',CacheControl:'public, max-age=31536000, immutable',Metadata:{sha256:sha}}));
  const verified=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));assert.equal(verified.ContentLength,body.length);assert.equal(verified.Metadata?.sha256,sha);
  console.log(JSON.stringify({url:'https://files.jujabrewandbites.com/'+key,bytes:body.length,sha256:sha,verified:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
