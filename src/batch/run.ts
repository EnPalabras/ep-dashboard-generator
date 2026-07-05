import "dotenv/config";
import { fetchAndStoreMetaData } from "./meta/fetch.ts";
import { fetchAndStoreGA4Data } from "./ga4/fetch.ts";
import { fetchAndStoreGA4Reports } from "./ga4-reports/fetch.ts";
import { fetchAndStoreInstagram } from "./instagram/fetch.ts";
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

// Cada fuente en su propio try/catch: si una cae (credencial, API, permiso) no tumba al resto.
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err: any) {
    console.error(`[batch] ${name} FALLÓ (sigo con el resto):`, err?.message ?? err);
  }
}

async function main() {
  const opts = parseArgs();
  console.log("[batch] starting...");

  // Ingest propio (rico) → tablas nuestras en analytics (ep_analytics las posee).
  await step("meta (rich)", () => fetchAndStoreMetaData(opts));
  await step("ga4 daily (rich)", () => fetchAndStoreGA4Data(opts));

  // Ingest portado de server_en_palabras → tablas existentes de analytics (necesita write grant).
  await step("ga4 reports (sessions/events/funnel/product)", () => fetchAndStoreGA4Reports());
  await step("instagram", () => fetchAndStoreInstagram(opts.lookbackDays ?? 10));

  console.log("[batch] done");
  await pool.end();
}

main();
