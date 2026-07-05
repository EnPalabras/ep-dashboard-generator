import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
  // Nuestras tablas (Meta/GA4 ricas, registry) viven en el schema `analytics`.
  // Con search_path los nombres sin calificar resuelven ahí; `public."Orders"` sigue explícito.
  options: "-c search_path=analytics,public",
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("[db] connected"))
  .catch((err) => console.error("[db] connection failed", err.message));

export default pool;
