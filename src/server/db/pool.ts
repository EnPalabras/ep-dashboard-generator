import pg from "pg";

// Base de v2. Las tablas del generador (Meta, GA4, dashboards, …) están en el schema `analytics`.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
  options: "-c search_path=analytics,public",
});

export default pool;
