import pg from "pg";

const makePool = (connectionString: string) =>
  new pg.Pool({
    connectionString,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
    // Nuestras tablas (Meta/GA4 ricas, registry) viven en el schema `analytics`.
    // Con search_path los nombres sin calificar resuelven ahí; `public."Orders"` sigue explícito.
    options: "-c search_path=analytics,public",
  });

const primary = makePool(process.env.DATABASE_URL as string);

// Dual-write a la base de v2 mientras el legacy sigue siendo el que leen los
// dashboards y Metabase. Las lecturas van sólo al primario a propósito: el batch
// consulta tablas que v2 no tiene (public.productsparsed, public."Orders").
const secondary = process.env.DATABASE_URL_SECONDARY
  ? makePool(process.env.DATABASE_URL_SECONDARY)
  : null;

// setval cuenta como escritura: avanza la secuencia de las tablas con id serial.
const WRITE = /\b(insert|update|delete|truncate|create|alter|setval)\b/i;

const textOf = (q: unknown): string =>
  typeof q === "string" ? q : ((q as { text?: string })?.text ?? "");

type QueryFn<R extends pg.QueryResultRow> = (...args: unknown[]) => Promise<pg.QueryResult<R>>;

const pool = {
  async query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    ...args: [unknown, ...unknown[]]
  ): Promise<pg.QueryResult<R>> {
    const result = await (primary.query as QueryFn<R>)(...args);

    if (secondary && WRITE.test(textOf(args[0]))) {
      // No propaga: el legacy es el que se lee hoy, no se rompe por un fallo del secundario.
      await (secondary.query as QueryFn<R>)(...args).catch((err: Error) =>
        console.error("[db] escritura al secundario fallo:", err.message),
      );
    }

    return result;
  },

  async end() {
    await primary.end();
    if (secondary) await secondary.end();
  },
};

primary
  .query("SELECT NOW()")
  .then(() => console.log("[db] primary connected"))
  .catch((err) => console.error("[db] primary connection failed", err.message));

secondary
  ?.query("SELECT NOW()")
  .then(() => console.log("[db] secondary connected (dual-write activo)"))
  .catch((err) => console.error("[db] secondary connection failed", err.message));

export default pool;
