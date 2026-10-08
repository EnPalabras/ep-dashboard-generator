import { Router } from "express";
import { buildValues } from "../queries/index.ts";
import { getQuery } from "../dashboards/store.ts";
import { readOnly } from "../mcp/readonly.ts";
import { metaAdAccountIds } from "../../batch/meta/fetch.ts";

const router = Router();

// Queries de cada dashboard (guardadas en la base): /api/q/<slug>/<query>, en sólo lectura sobre v2.
router.get("/q/:slug/:query", async (req, res) => {
  const name = `${req.params.slug}/${req.params.query}`;
  try {
    const q = await getQuery(req.params.slug, req.params.query);
    if (!q) {
      res.status(404).json({ error: `Unknown query: ${name}` });
      return;
    }
    const r = await readOnly(q.sql, buildValues(q, req.query as Record<string, string | undefined>));
    res.json(r.rows.map((row) => Object.fromEntries(r.fields.map((f, i) => [f, row[i]]))));
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
