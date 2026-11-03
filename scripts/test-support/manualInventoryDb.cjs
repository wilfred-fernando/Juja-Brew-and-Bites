// Local PostgreSQL fallback when DATABASE_URL is unavailable.
// npm install --prefix tmp/manual-inventory-check --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
const { PGlite } = require('../../tmp/manual-inventory-check/node_modules/@electric-sql/pglite');
const fs = require('fs');
class Client {
 async connect() {
  this.db = new PGlite();
  await this.db.exec(fs.readFileSync('scripts/test-support/manual-inventory-schema.sql','utf8'));
  const source=fs.readFileSync('supabase/migrations/20260611000000_inventory_system_setup.sql','utf8');
  await this.db.exec(source.slice(source.indexOf('create or replace function public.inventory_current_role()'),source.indexOf('create or replace function public.inventory_convert_quantity(')));
 }
 async query(sql,args) {
  if(args?.length)return this.db.query(sql,args);
  const results=await this.db.exec(sql);return results[results.length-1] || {rows:[]};
 }
 async end(){await this.db.close();}
}
module.exports={Client};
