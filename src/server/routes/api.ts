import { Router } from "express";
import pool, { v2 } from "../db/pool.ts";
import { queries, buildValues } from "../queries/index.ts";
import { metaAdAccountIds } from "../../batch/meta/fetch.ts";

const router = Router();

// Queries co-locadas por dashboard: /api/q/<slug>/<query> → dashboards/<slug>.sql
router.get("/q/:slug/:query", async (req, res) => {
  const name = `${req.params.slug}/${req.params.query}`;
  const q = queries[name];
  if (!q) {
    res.status(404).json({ error: `Unknown query: ${name}` });
    return;
  }

  if (q.db === "v2" && !v2) {
    res.status(503).json({ error: "Falta DATABASE_URL_SECONDARY para leer de v2" });
    return;
  }

  try {
    const values = buildValues(q, req.query as Record<string, string | undefined>);
    const result = q.db === "v2" ? await v2!.query(q.sql, values) : await pool.query(q.sql, values);
    res.json(result.rows);
  } catch (err: any) {
    console.error(`[api] named query "${name}" failed:`, err.message);
    res.status(500).json({ error: "Query failed" });
  }
});

// ID de cuenta de Meta para armar links al Administrador de anuncios desde los dashboards.
// Con varias cuentas, la vigente es la última de META_AD_ACCOUNT_IDS.
router.get("/meta/config", (_req, res) => {
  res.json({ ad_account_id: metaAdAccountIds().at(-1) ?? "" });
});

export default router;
