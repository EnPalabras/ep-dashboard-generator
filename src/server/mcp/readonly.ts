import pg from "pg";

const url = process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL_SECONDARY;

// Base de v2, sólo lectura. Con DATABASE_URL_READONLY se usa el rol ep_readonly; la transacción
// READ ONLY y el protocolo extendido (una sola sentencia por consulta) valen para cualquier rol.
const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
      options: "-c search_path=analytics,public",
      max: 5,
      types: {
        getTypeParser: ((oid: number, format?: "text" | "binary") =>
          oid === pg.types.builtins.DATE ? (v: string) => v : pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
      },
    })
  : null;

export const TIMEOUT_MS = Number(process.env.MCP_QUERY_TIMEOUT_MS) || 300_000;

export interface ReadResult {
  fields: string[];
  rows: unknown[][];
  ms: number;
}

export async function readOnly(sql: string, values: unknown[] = [], timeoutMs = TIMEOUT_MS): Promise<ReadResult> {
  if (!pool) throw new Error("Falta DATABASE_URL_READONLY (o DATABASE_URL_SECONDARY) para leer de v2");
  const client = await pool.connect();
  const t = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    const r = await client.query({ text: sql, values, rowMode: "array", queryMode: "extended" } as pg.QueryConfig);
    return { fields: r.fields.map((f) => f.name), rows: r.rows as unknown[][], ms: Date.now() - t };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
