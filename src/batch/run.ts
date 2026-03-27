import "dotenv/config";
import { fetchAndStoreMetaData } from "./meta/fetch.ts";
import { refreshViews } from "../server/db/views.ts";
import pool from "../server/db/pool.ts";

async function main() {
  try {
    console.log("[batch] starting data fetch...");
    await fetchAndStoreMetaData();

    console.log("[batch] refreshing materialized views...");
    await refreshViews();

    console.log("[batch] done");
  } catch (err) {
    console.error("[batch] failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
