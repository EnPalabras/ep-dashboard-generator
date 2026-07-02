import { Router } from "express";
import pool from "../db/pool.ts";
import { isAllowedView } from "../db/views.ts";
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

router.get("/query/:viewName", async (req, res) => {
  const { viewName } = req.params;

  if (!isAllowedView(viewName)) {
    res.status(400).json({ error: `Unknown view: ${viewName}` });
    return;
  }

  const { from, to, limit } = req.query;

  let query = `SELECT * FROM ${viewName}`;
  const params: string[] = [];
  const conditions: string[] = [];

  if (from) {
    params.push(from as string);
    const dateCol = viewName === "mv_meta_weekly" ? "week" : viewName === "mv_meta_by_campaign" ? "first_date" : "date";
    conditions.push(`${dateCol} >= $${params.length}`);
  }

  if (to) {
    params.push(to as string);
    const dateCol = viewName === "mv_meta_weekly" ? "week" : viewName === "mv_meta_by_campaign" ? "last_date" : "date";
    conditions.push(`${dateCol} <= $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (limit) {
    params.push(limit as string);
    query += ` LIMIT $${params.length}`;
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error(`[api] query failed:`, err.message);
    res.status(500).json({ error: "Query failed" });
  }
});

router.get("/meta/daily", async (req, res) => {
  const { from, to } = req.query;
  const params: string[] = [];
  let query = "SELECT * FROM mv_meta_daily";
  const conditions: string[] = [];

  if (from) {
    params.push(from as string);
    conditions.push(`date >= $${params.length}`);
  }
  if (to) {
    params.push(to as string);
    conditions.push(`date <= $${params.length}`);
  }
  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  query += " ORDER BY date DESC";

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Query failed" });
  }
});

router.get("/meta/config", (_req, res) => {
  // ID de cuenta para armar links al Administrador de anuncios desde los dashboards.
  res.json({ ad_account_id: process.env.META_AD_ACCOUNT_ID || "" });
});

router.get("/meta/campaigns", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM mv_meta_by_campaign ORDER BY total_spend DESC");
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Query failed" });
  }
});

export default router;
