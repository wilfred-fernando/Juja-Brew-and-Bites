const { loadEnvConfig } = require('@next/env'); loadEnvConfig(process.cwd());
const { Client } = require('pg');
const fs = require('fs');
const assert = require('node:assert/strict');
const migrations = ['supabase/migrations/20261031090000_category_cup_inventory.sql', 'supabase/migrations/20261031100000_hot_cup_inventory.sql'];
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    const before = await one("select count(*) n, coalesce(sum(current_stock),0) stock from inventory_items");
    for (const migration of migrations) await db.query(fs.readFileSync(migration,'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,''));
    assert.equal((await one("select count(*)::int n from menu_item_ingredients where menu_item_id like 'category:%'")).n,39);
    // Rehearse repeated installation as well.
    for (const migration of migrations) await db.query(fs.readFileSync(migration,'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,''));
    assert.equal((await one("select count(*)::int n from menu_item_ingredients where menu_item_id like 'category:%'")).n,39);
    await db.query('savepoint fixtures');
    const admin = await one("select id from profiles where lower(role) in ('admin','super_admin') limit 1");
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",[admin.id,JSON.stringify({sub:admin.id,role:'authenticated'})]);
    const store = await one('select id from stores limit 1');
    const categories = (await db.query("select distinct substring(menu_item_id from 10) category from menu_item_ingredients where menu_item_id like 'category:%'")).rows;
    let count=0;
    async function check(category, label, expected, legacy=false) {
      const menu = await one('select id,name from menu_items where category=$1 limit 1',[category]);
      const options = label ? [{groupName:'Variant', name:label}] : [];
      const savedLine = {id:menu.id, name:menu.name, quantity:2, selectedOptions:options};
      const order = await one("insert into orders(branch_id,store_id,items,status) values($1,$1,$2,'completed') returning id",[String(store.id),JSON.stringify([savedLine])]);
      const line={menu_item_id:menu.id,name:menu.name,quantity:2};
      if(!legacy)line.selected_options=options;
      const call=async()=> (await one('select deduct_inventory_for_pos_order($1,$2,$3) result',[String(order.id),JSON.stringify([line]),admin.id])).result;
      await call();
      const tx = (await db.query("select c.common_name,t.quantity_effect from inventory_transactions t join common_inventory_names c on c.id=t.common_name_id where t.reference_id=$1 and c.common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz')",[String(order.id)])).rows;
      assert.equal(tx.length,expected?1:0,`${category} ${label}`);
      if(expected){assert.equal(tx[0].common_name,expected);assert.equal(Number(tx[0].quantity_effect),-2);}
      assert.equal((await call()).duplicate,true);
      await one('select restore_inventory_for_void_order($1,$2)',[String(order.id),admin.id]);
      const total=await one("select coalesce(sum(quantity_effect),0) n from inventory_transactions where reference_id=$1",[String(order.id)]);
      assert.equal(Number(total.n),0);
      count++;
    }
    for(const {category} of categories){const family=['JUICE','MILK TEA (CLASSIC)','MILK TEA (CHEESECAKE)','MILK TEA (SEA SALT)','SHAKE'].includes(category)?'Slim':'Pet';
      await check(category,'Regular',`${family} Cup - 16oz`);
      await check(category,'Large',`${family} Cup - ${family==='Slim'?'22':'20'}oz`);
    }
    await check('LATTE (COFFEE)','Iced (R)','Pet Cup - 16oz');
    await check('LATTE (COFFEE)','Iced (L)','Pet Cup - 20oz',true);
    await check('LATTE (COFFEE)','Hot (R)','Hot Cup 12oz');
    await check('LATTE (NON-COFFEE)','Hot (R)','Hot Cup 12oz',true);
    await check('LATTE (SIGNATURE)','Hot (L)','Hot Cup 12oz');
    await check('SHAKE',null,'Slim Cup - 16oz');
    await check('PARFAIT',null,'Pet Cup - 16oz');
    await check('CAKE','Large',null);
    await db.query('set constraints all immediate');
    await db.query('rollback to savepoint fixtures');
    const after=await one('select coalesce(sum(current_stock),0) stock from inventory_items');
    assert.equal(Number(after.stock),Number(before.stock));
    if(process.argv.includes('--apply')) await db.query('commit'); else await db.query('rollback');
    console.log(`${count} cup/category/size, quantity, duplicate-call, void restoration and exclusion checks passed; fixtures rolled back; migration ${process.argv.includes('--apply')?'installed':'rolled back'}.`);
  } catch(e) { await db.query('rollback'); throw e; } finally { await db.end(); }
})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1;});
