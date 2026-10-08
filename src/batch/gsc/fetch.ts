import { v2 } from "../../server/db/pool.ts";
import { gscCredsFromEnv, querySearchAnalytics, type GscCredentials, type GscDimension, type GscSearchType } from "./client.ts";
import type { FetchOptions } from "../ga4/fetch.ts";

const SEARCH_TYPES: GscSearchType[] = ["web", "image"];
// GSC publica con 2-3 días de atraso y retoca los últimos días.
const MIN_LOOKBACK_DAYS = 7;
const CHUNK = 5000;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Target {
  table: string;
  dimensions: GscDimension[];
}

const TARGETS: Target[] = [
  { table: "gsc_site_daily", dimensions: ["date", "country", "device"] },
  { table: "gsc_page_daily", dimensions: ["date", "page"] },
  { table: "gsc_query_daily", dimensions: ["date", "query", "page", "country", "device"] },
];

export async function fetchAndStoreSearchConsole(opts: FetchOptions = {}) {
  const creds = gscCredsFromEnv();
  if (!creds) throw new Error("GA_* (service account) requeridas para Search Console");
  if (!v2) throw new Error("Search Console se escribe sólo en v2 y falta DATABASE_URL_SECONDARY");

  const to = opts.to ?? daysAgo(0);
  const from = opts.from ?? daysAgo(Math.max(opts.lookbackDays ?? 0, MIN_LOOKBACK_DAYS));

  for (const target of TARGETS) {
    for (const type of SEARCH_TYPES) {
      await store(creds, target, type, from, to);
    }
  }
}

async function store(creds: GscCredentials, { table, dimensions: cols }: Target, type: GscSearchType, from: string, to: string) {
  const rows = await querySearchAnalytics(creds, { startDate: from, endDate: to, dimensions: cols, type });
  const key = ["date", "search_type", ...cols.filter((c) => c !== "date")];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const dimArrays = cols.map((_, j) => chunk.map((r) => r.keys[j]));
    const params = [
      ...dimArrays,
      chunk.map(() => type),
      chunk.map((r) => r.clicks),
      chunk.map((r) => r.impressions),
      chunk.map((r) => r.ctr),
      chunk.map((r) => r.position),
    ];
    const casts = cols.map((c, j) => `$${j + 1}::${c === "date" ? "date" : "text"}[]`);
    const n = cols.length;
    await v2!.query(
      `
      INSERT INTO ${table} (${cols.join(", ")}, search_type, clicks, impressions, ctr, position)
      SELECT * FROM UNNEST(
        ${casts.join(", ")}, $${n + 1}::text[], $${n + 2}::integer[], $${n + 3}::integer[],
        $${n + 4}::numeric[], $${n + 5}::numeric[]
      )
      ON CONFLICT (${key.join(", ")})
      DO UPDATE SET
        clicks = EXCLUDED.clicks,
        impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr,
        position = EXCLUDED.position,
        updated_at = now()
      `,
      params,
    );
  }
  console.log(`[gsc] ${table} ${type} ${from}..${to}: ${rows.length} filas`);
}
