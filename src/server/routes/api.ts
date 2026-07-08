import { Router } from "express";
import pool from "../db/pool.ts";
import { queries, buildValues } from "../queries/index.ts";

const router = Router();

// Queries co-locadas por dashboard: /api/q/<slug>/<query> → dashboards/<slug>.sql
router.get("/q/:slug/:query", async (req, res) => {
  const name = `${req.params.slug}/${req.params.query}`;
  const q = queries[name];
  if (!q) {
    res.status(404).json({ error: `Unknown query: ${name}` });
    return;
  }

  try {
    const values = buildValues(q, req.query as Record<string, string | undefined>);
    const result = await pool.query(q.sql, values);
    res.json(result.rows);
  } catch (err: any) {
    console.error(`[api] named query "${name}" failed:`, err.message);
    res.status(500).json({ error: "Query failed" });
  }
});

// ID de cuenta de Meta para armar links al Administrador de anuncios desde los dashboards.
router.get("/meta/config", (_req, res) => {
  res.json({ ad_account_id: process.env.META_AD_ACCOUNT_ID || "" });
});

export default router;
