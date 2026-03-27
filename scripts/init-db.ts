import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import pool from "../src/server/db/pool.ts";
import { createViews } from "../src/server/db/views.ts";

async function main() {
  console.log("[init-db] creating tables...");
  const schema = readFileSync(path.resolve(import.meta.dir, "../src/batch/meta/schema.sql"), "utf-8");
  await pool.query(schema);
  console.log("[init-db] tables created");

  console.log("[init-db] creating materialized views...");
  await createViews();
  console.log("[init-db] done");

  await pool.end();
}

main();
