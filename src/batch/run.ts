import "dotenv/config";
import { fetchAndStoreMetaData } from "./meta/fetch.ts";
import { fetchAndStoreGA4Data } from "./ga4/fetch.ts";
import { refreshViews } from "../server/db/views.ts";
import pool from "../server/db/pool.ts";

// Uso:
//   bun run batch                -> últimos 3 días
//   bun run batch 540            -> últimos 540 días
//   bun run batch 2025-01-01     -> desde esa fecha hasta hoy
//   bun run batch 2025-01-01 2025-01-31  -> rango explícito (útil para tramos del backfill)
function parseArgs(): { lookbackDays?: number; from?: string; to?: string } {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const a = process.argv[2];
  const b = process.argv[3];
  if (!a) return { lookbackDays: 3 };
  if (isDate(a)) return { from: a, to: isDate(b) ? b : undefined };
  const n = parseInt(a);
  return { lookbackDays: Number.isFinite(n) && n > 0 ? n : 3 };
}

async function main() {
  try {
    const opts = parseArgs();

    console.log("[batch] starting data fetch...");
    await fetchAndStoreMetaData(opts);

    // GA4 en su propio try/catch: si falla (credencial, API caída) no tumba a Meta.
    try {
      await fetchAndStoreGA4Data(opts);
    } catch (err) {
      console.error("[batch] GA4 fetch failed (sigo con el resto):", err);
    }

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
