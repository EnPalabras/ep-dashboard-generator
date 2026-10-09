import "dotenv/config";
import pool from "../src/server/db/pool.ts";
import { fetchAndStoreFxRates } from "../src/batch/fx/fetch.ts";
import { ga4CredsFromEnv } from "../src/batch/ga4/client.ts";
import { storeSiteDaily, storeDeviceRegionDaily } from "../src/batch/ga4/site.ts";
import { metaAdAccountIds } from "../src/batch/meta/fetch.ts";
import { storeAdVideo, storeAdDemographics, storeAdRegions } from "../src/batch/meta/breakdowns.ts";

// Uso: bun run scripts/backfill-finanzas.ts <fx|ga4|meta> [from] [to]
const [what, from = "2025-01-01", to = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);

function months(a: string, b: string): [string, string][] {
  const out: [string, string][] = [];
  for (let d = new Date(`${a}T00:00:00Z`); d.toISOString().slice(0, 10) <= b; ) {
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const e = end.toISOString().slice(0, 10);
    out.push([d.toISOString().slice(0, 10), e < b ? e : b]);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

if (what === "fx") await fetchAndStoreFxRates();
if (what === "ga4") {
  const creds = ga4CredsFromEnv()!;
  for (const [a, b] of months(from, to)) {
    await storeSiteDaily(creds, a, b);
    await storeDeviceRegionDaily(creds, a, b);
  }
}
if (what === "meta") {
  const token = process.env.META_ACCESS_TOKEN!;
  await Promise.all(
    metaAdAccountIds().map(async (id) => {
      const { rows } = await pool.query(
        `SELECT min(date)::text AS a, max(date)::text AS b FROM meta_account_daily
         WHERE account_id = $1 AND amount_spent > 0 AND date BETWEEN $2 AND $3`,
        [id, from, to],
      );
      if (!rows[0]?.a) return;
      for (const [a, b] of months(rows[0].a, rows[0].b).reverse()) {
        console.log(`[backfill] ${id} ${a}..${b}`);
        await Promise.all(
          [storeAdVideo, storeAdDemographics, storeAdRegions].map((fn) =>
            fn(id, token, a, b).catch((err: any) => console.error(`[backfill] ${id} ${a} ${fn.name} falló:`, err.message)),
          ),
        );
      }
    }),
  );
}
await pool.end();
