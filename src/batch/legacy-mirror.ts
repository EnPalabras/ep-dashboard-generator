import pg from "pg";
import pool from "../server/db/pool.ts";

const legacy = process.env.LEGACY_DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.LEGACY_DATABASE_URL,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
      options: "-c search_path=analytics,public",
    })
  : null;

const WRITE = /\b(insert|update|delete|truncate|setval)\b/i;

type QueryFn = (...args: unknown[]) => Promise<pg.QueryResult>;

const mirrored = {
  async query(...args: [unknown, ...unknown[]]): Promise<pg.QueryResult> {
    const result = await (pool.query as QueryFn)(...args);
    const text = typeof args[0] === "string" ? args[0] : ((args[0] as { text?: string })?.text ?? "");
    if (legacy && WRITE.test(text)) {
      await (legacy.query as QueryFn)(...args).catch((err: Error) =>
        console.error("[legacy] escritura fallo:", err.message),
      );
    }
    return result;
  },
};

export async function endLegacy() {
  await legacy?.end();
}

if (legacy) console.log("[legacy] espejo activo: las escrituras del batch también van al legacy");

export default mirrored;
