import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import pool from "../src/server/db/pool.ts";

const SCHEMAS = [
  "src/batch/meta/schema.sql",
  "src/batch/ga4/schema.sql",
  "src/batch/google-ads/schema.sql",
  "src/batch/gsc/schema.sql",
  "src/batch/tiktok/schema.sql",
  "src/batch/instagram/schema.sql",
  "src/batch/mercadolibre/schema.sql",
  "src/server/dashboards/schema.sql",
];

async function main() {
  for (const file of SCHEMAS) {
    await pool.query(readFileSync(path.resolve(import.meta.dir, "..", file), "utf-8"));
    console.log(`[init-db] ${file}`);
  }
  await pool.end();
}

main();
