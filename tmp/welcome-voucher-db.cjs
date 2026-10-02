const fs = require('fs');
const { Client } = require('pg');
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const sql = fs.readFileSync(process.argv[2], 'utf8');
    const result = await db.query(sql);
    for (const r of Array.isArray(result) ? result : [result]) if (r.rows.length) console.log(JSON.stringify(r.rows));
  } finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
