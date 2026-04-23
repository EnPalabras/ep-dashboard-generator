import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import path from "path";
import pool from "../src/server/db/pool.ts";
import { createViews } from "../src/server/db/views.ts";

async function main() {
  console.log("[init-db] creating tables...");
  const schema = readFileSync(path.resolve(import.meta.dir, "../src/batch/meta/schema.sql"), "utf-8");
  await pool.query(schema);
  console.log("[init-db] tables created");

  const registryPath = path.resolve(import.meta.dir, "../dashboards/registry.json");
  if (existsSync(registryPath)) {
    const entries = JSON.parse(readFileSync(registryPath, "utf-8"));
    for (const d of entries) {
      await pool.query(
        `INSERT INTO dashboards (slug, title, author, description, file, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [d.slug, d.title, d.author, d.description, d.file, d.created]
      );
    }
    console.log(`[init-db] seeded ${entries.length} dashboard(s) from registry.json`);
  }

  console.log("[init-db] creating materialized views...");
  await createViews();
  console.log("[init-db] done");

  await pool.end();
}

main();
