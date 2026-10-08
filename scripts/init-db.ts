import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import pool, { v2 } from "../src/server/db/pool.ts";
import { createViews } from "../src/server/db/views.ts";

async function main() {
  console.log("[init-db] creating tables...");
  const schema = readFileSync(path.resolve(import.meta.dir, "../src/batch/meta/schema.sql"), "utf-8");
  await pool.query(schema);
  const ga4Schema = readFileSync(path.resolve(import.meta.dir, "../src/batch/ga4/schema.sql"), "utf-8");
  await pool.query(ga4Schema);
  const gAdsSchema = readFileSync(path.resolve(import.meta.dir, "../src/batch/google-ads/schema.sql"), "utf-8");
  await pool.query(gAdsSchema);
  if (v2) {
    const gscSchema = readFileSync(path.resolve(import.meta.dir, "../src/batch/gsc/schema.sql"), "utf-8");
    await v2.query(gscSchema);
    const dashboardsSchema = readFileSync(path.resolve(import.meta.dir, "../src/server/dashboards/schema.sql"), "utf-8");
    await v2.query(dashboardsSchema);
  }
  console.log("[init-db] tables created");

  console.log("[init-db] creating materialized views...");
  await createViews();
  console.log("[init-db] done");

  await pool.end();
}

main();
