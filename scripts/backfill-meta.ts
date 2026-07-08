import "dotenv/config";
import { fetchAndStoreMetaData } from "../src/batch/meta/fetch.ts";
import pool from "../src/server/db/pool.ts";

// Backfill de Meta en tramos MENSUALES. La API de Meta rechaza rangos largos a nivel
// anuncio + breakdown por plataforma ("Please reduce the amount of data you're asking for"),
// así que el backfill histórico va mes por mes.
//
// Uso:
//   bun run scripts/backfill-meta.ts                    -> 2025-01-01 .. hoy
//   bun run scripts/backfill-meta.ts 2025-06-01         -> desde esa fecha .. hoy
//   bun run scripts/backfill-meta.ts 2025-01-01 2025-03-31

function monthlyChunks(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const end = new Date(to + "T00:00:00");
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (;;) {
    const start = new Date(y, m - 1, 1);
    if (start > end) break;
    const monthEnd = new Date(y, m, 0); // último día del mes m
    const chunkTo = monthEnd < end ? monthEnd : end;
    const p = (n: number) => String(n).padStart(2, "0");
    out.push({ from: `${y}-${p(m)}-01`, to: `${chunkTo.getFullYear()}-${p(chunkTo.getMonth() + 1)}-${p(chunkTo.getDate())}` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function main() {
  const from = process.argv[2] || "2025-01-01";
  const to = process.argv[3] || new Date().toISOString().slice(0, 10);
  const chunks = monthlyChunks(from, to);
  console.log(`[backfill-meta] ${chunks.length} tramos mensuales: ${from} .. ${to}`);
  let ok = 0;
  for (const chunk of chunks) {
    try {
      console.log(`[backfill-meta] === ${chunk.from} .. ${chunk.to} ===`);
      await fetchAndStoreMetaData(chunk);
      ok++;
    } catch (e: any) {
      console.error(`[backfill-meta] ${chunk.from} FALLÓ:`, e?.message?.slice(0, 160) ?? e);
    }
  }
  console.log(`[backfill-meta] listo: ${ok}/${chunks.length} tramos OK`);
  await pool.end();
}

main();
