import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("[db] connected"))
  .catch((err) => console.error("[db] connection failed", err.message));

export default pool;
