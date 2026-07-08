import "dotenv/config";
import pool from "../src/server/db/pool.ts";
import { queries, buildValues } from "../src/server/queries/index.ts";

// Prueba una named query (read-only) contra la DB, para verificar un dashboard sin
// levantar el server. Uso:
//   bun run query:check <slug>/<query> [from=YYYY-MM-DD] [to=YYYY-MM-DD] [otro=valor]
// Si no pasás from/to, usa los últimos 30 días por defecto.

const name = process.argv[2];
if (!name) {
  console.error("Uso: bun run query:check <slug>/<query> [from=.. to=.. ...]");
  console.error("Queries disponibles:\n  " + Object.keys(queries).sort().join("\n  "));
  process.exit(1);
}

const q = queries[name];
if (!q) {
  console.error(`Query "${name}" no encontrada. Disponibles:\n  ` + Object.keys(queries).sort().join("\n  "));
  process.exit(1);
}

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const args = Object.fromEntries(process.argv.slice(3).map((kv) => kv.split("=")));
const params: Record<string, string> = { from: daysAgo(30), to: daysAgo(0), ...args };

try {
  const r = await pool.query(q.sql, buildValues(q, params));
  console.log(`✅ ${name}: ${r.rowCount} filas (params: ${JSON.stringify(params)})`);
  console.log(JSON.stringify(r.rows.slice(0, 5), null, 2));
} catch (e: any) {
  console.error(`❌ ${name} falló:`, e.message);
  process.exit(1);
} finally {
  await pool.end();
}
