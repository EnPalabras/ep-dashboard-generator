import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: false },
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("[db] connected"))
  .catch((err) => console.error("[db] connection failed", err.message));

export default pool;
