const {loadEnvConfig}=require('@next/env');const {Client}=require('pg');const fs=require('fs');const assert=require('assert/strict');const {randomUUID}=require('crypto');loadEnvConfig(process.cwd());
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});await db.connect();const schema='physical_gc_test_'+randomUUID().replaceAll('-','');try{
await db.query('BEGIN');await db.query('SET LOCAL statement_timeout=15000');await db.query(`CREATE SCHEMA ${schema}`);
await db.query(`CREATE TABLE ${schema}.function_room_bookings(id uuid primary key,status text,payment_status text,deposit_amount numeric,customer_name text,email text); CREATE TABLE ${schema}.profiles(id uuid,role text,store_id text); CREATE TABLE ${schema}.booking_cancellation_gift_certificates(booking_id uuid)`);
const actor=(await db.query("select id from public.profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;
await db.query(`insert into ${schema}.profiles values($1,'admin','branch')`,[actor]);
for(const file of ['20260912090000_booking_gc_approval_batches.sql','20260912120000_gc_purchases.sql','20260930190000_physical_gift_certificates.sql','20260930200000_gc_ten_plus_one.sql']){await db.query(fs.readFileSync('supabase/migrations/'+file,'utf8').replaceAll('public.',schema+'.').replaceAll('set search_path=public','set search_path='+schema).replaceAll('set search_path = public','set search_path = '+schema));}
const request=randomUUID();await db.query(`select ${schema}.generate_physical_gc_stock($1,2,$2)`,[request,actor]);await db.query(`select ${schema}.generate_physical_gc_stock($1,2,$2)`,[request,actor]);
const stock=(await db.query(`select b.*,c.code,c.status certificate_status from ${schema}.booking_gc_batches b join ${schema}.booking_gc_certificates c on c.batch_id=b.id order by b.stock_sequence`)).rows;assert.equal(stock.length,2);assert.equal(stock[0].certificate_status,'pending_approval');assert.equal(stock[0].email_status,'not_required');
const rejects=async(sql,args,pattern)=>{await db.query('SAVEPOINT invalid');await assert.rejects(db.query(sql,args),pattern);await db.query('ROLLBACK TO SAVEPOINT invalid');};
await rejects(`select ${schema}.generate_physical_gc_stock($1,1,$2)`,[randomUUID(),randomUUID()],/Admin access/);
await rejects(`update ${schema}.booking_gc_batches set email_status='sending' where id=$1`,[stock[0].id],/physical_gc_no_email/);
const input={request_key:randomUUID(),customer_name:'Test physical buyer',customer_email:'',quantity:1,source:'pos',store_id:'branch',payment_method:'Cash',certificate_format:'physical',stock_batch_id:stock[0].id,payment_verified:true};
await rejects(`select ${schema}.create_gc_purchase($1,$2)`,[{...input,payment_verified:false},actor],/Verify payment/);
const purchase=(await db.query(`select ${schema}.create_gc_purchase($1,$2) result`,[input,actor])).rows[0].result;assert.equal(purchase.status,'approved');
const retry=(await db.query(`select ${schema}.create_gc_purchase($1,$2) result`,[input,actor])).rows[0].result;assert.equal(retry.id,purchase.id);
await rejects(`select ${schema}.create_gc_purchase($1,$2)`,[{...input,request_key:randomUUID()},actor],/not unsold/);
const active=(await db.query(`select b.*,c.status certificate_status from ${schema}.booking_gc_batches b join ${schema}.booking_gc_certificates c on c.batch_id=b.id where b.id=$1`,[stock[0].id])).rows[0];assert.equal(active.certificate_status,'active');assert.equal(active.email_status,'not_required');assert(active.expires_at > new Date(Date.now()+150*86400000));
const direct=(await db.query(`select ${schema}.create_gc_purchase($1,$2) result`,[{...input,request_key:randomUUID(),stock_batch_id:null},actor])).rows[0].result;assert.equal(direct.status,'pending_review');
for (const format of ['digital','physical']) {
 const promo={...input,request_key:randomUUID(),stock_batch_id:null,quantity:10,package:'ten_plus_one',certificate_format:format,customer_email:'test@example.com'};
 const result=(await db.query(`select ${schema}.create_gc_purchase($1,$2) result`,[promo,actor])).rows[0].result;
 assert.equal(Number(result.amount),1000);assert.equal(result.issued_quantity,11);
 const batch=(await db.query(`select * from ${schema}.booking_gc_batches where purchase_id=$1`,[result.id])).rows[0];assert.equal(Number(batch.amount),1100);
 await db.query(`select ${schema}.review_gc_purchase($1,$2,true,true)`,[batch.id,actor]);
 const count=(await db.query(`select count(*)::int n,sum(amount)::int value from ${schema}.booking_gc_certificates where batch_id=$1 and status='active'`,[batch.id])).rows[0];assert.equal(count.n,11);assert.equal(count.value,1100);
 assert.equal(batch.email_status,format==='physical'?'not_required':'pending');
 const repeat=(await db.query(`select ${schema}.create_gc_purchase($1,$2) result`,[promo,actor])).rows[0].result;assert.equal(repeat.id,result.id);
 await rejects(`select ${schema}.create_gc_purchase($1,$2)`,[{...promo,request_key:randomUUID(),quantity:9},actor],/gc_package_quantity/);
}
console.log('PASS: 10+1 digital and physical issue 11 certificates, collect 1000, approve face value 1100, reject malformed packages and retain idempotency.');
console.log('PASS: migration, inactive stock, generation retries, admin authorization, database email prohibition, payment verification, atomic activation, duplicate-sale protection, six-month validity, physical purchase approval queue. ROLLBACK only; no emails.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
