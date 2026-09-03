import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, statement_timeout: 8000 });
await db.connect();
try {
  // Every verification record and change is rolled back, including on failure.
  await db.query("BEGIN");
  const id = `VERIFY${randomUUID().replaceAll("-", "")}`;
  const insert = (name, type, idNumber, active = true) => db.query(
    "insert into public.pos_discount_beneficiaries (full_name,beneficiary_type,id_number,normalized_id_number,is_active) values ($1,$2,$3,$3,$4) returning id",
    [name, type, idNumber, active],
  );
  const rejectDuplicate = async (operation) => {
    await db.query("SAVEPOINT duplicate_check");
    let caught;
    try { await operation(); } catch (error) { caught = error; }
    await db.query("ROLLBACK TO SAVEPOINT duplicate_check");
    assert.equal(caught?.code, "23505");
    assert.equal(caught?.constraint, "pos_discount_beneficiaries_cross_type_identity");
  };
  const sc = await insert("Verification Person", "senior_citizen", id);
  await rejectDuplicate(() => insert("  verification   PERSON  ", "pwd", id.toLowerCase()));
  const repeated = await db.query(
    "insert into public.pos_discount_beneficiaries (full_name,beneficiary_type,id_number,normalized_id_number) values ($1,'senior_citizen',$2,$2) on conflict (beneficiary_type,normalized_id_number) do update set full_name=excluded.full_name returning id",
    ["Verification Person", id],
  );
  assert.equal(repeated.rows[0].id, sc.rows[0].id, "Same-type repeated saves reuse the record");
  const other = await insert("Another Verification Person", "pwd", id);
  await rejectDuplicate(() => db.query("update public.pos_discount_beneficiaries set full_name='Verification Person' where id=$1", [other.rows[0].id]));
  const inactive = await insert("Archived Verification Person", "pwd", `${id}X`, false);
  await insert("Archived Verification Person", "senior_citizen", `${id}X`);
  await rejectDuplicate(() => db.query("update public.pos_discount_beneficiaries set is_active=true where id=$1", [inactive.rows[0].id]));
  console.log("Verified cross-type duplicate rejection, normalized matching, same-type reuse, distinct people, edits and reactivation. Test records rolled back.");
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
