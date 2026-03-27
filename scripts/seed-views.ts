import "dotenv/config";
import pool from "../src/server/db/pool.ts";
import { refreshViews } from "../src/server/db/views.ts";

async function main() {
  console.log("[seed-views] refreshing materialized views...");
  await refreshViews();
  console.log("[seed-views] done");
  await pool.end();
}

main();
