import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("[db] connected"))
  .catch((err) => console.error("[db] connection failed", err.message));

/**
 * Pool secundario read-only a la DB de server_en_palabras (ventas/negocio reales).
 * Solo existe si ANALYTICS_DATABASE_URL está seteada. Las named queries marcadas
 * con `-- @db analytics` corren acá; el resto usa el pool primario.
 */
export const analyticsPool = process.env.ANALYTICS_DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
      ssl: process.env.ANALYTICS_PG_SSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

if (analyticsPool) {
  analyticsPool
    .query("SELECT NOW()")
    .then(() => console.log("[db] analytics (read-only) connected"))
    .catch((err) => console.error("[db] analytics connection failed", err.message));
}

export default pool;
