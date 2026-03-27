import pool from "./pool.ts";

export const ALLOWED_VIEWS = [
  "mv_meta_daily",
  "mv_meta_weekly",
  "mv_meta_by_campaign",
] as const;

export type ViewName = (typeof ALLOWED_VIEWS)[number];

export function isAllowedView(name: string): name is ViewName {
  return (ALLOWED_VIEWS as readonly string[]).includes(name);
}

const VIEW_DEFINITIONS: Record<ViewName, string> = {
  mv_meta_daily: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_meta_daily AS
    SELECT
      date,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END AS ctr,
      CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 2) ELSE 0 END AS cpc
    FROM meta_campaign_insights
    GROUP BY date
    ORDER BY date DESC
  `,
  mv_meta_weekly: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_meta_weekly AS
    SELECT
      date_trunc('week', date)::date AS week,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END AS ctr,
      CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 2) ELSE 0 END AS cpc
    FROM meta_campaign_insights
    GROUP BY week
    ORDER BY week DESC
  `,
  mv_meta_by_campaign: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_meta_by_campaign AS
    SELECT
      campaign_id,
      campaign_name,
      SUM(spend) AS total_spend,
      SUM(impressions) AS total_impressions,
      SUM(clicks) AS total_clicks,
      SUM(conversions) AS total_conversions,
      CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END AS ctr,
      CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 2) ELSE 0 END AS cpc,
      MIN(date) AS first_date,
      MAX(date) AS last_date
    FROM meta_campaign_insights
    GROUP BY campaign_id, campaign_name
    ORDER BY total_spend DESC
  `,
};

export async function createViews() {
  for (const [name, sql] of Object.entries(VIEW_DEFINITIONS)) {
    try {
      await pool.query(sql);
      console.log(`[views] created ${name}`);
    } catch (err: any) {
      console.error(`[views] failed to create ${name}:`, err.message);
    }
  }
}

export async function refreshViews() {
  for (const name of ALLOWED_VIEWS) {
    try {
      await pool.query(`REFRESH MATERIALIZED VIEW ${name}`);
      console.log(`[views] refreshed ${name}`);
    } catch (err: any) {
      console.error(`[views] failed to refresh ${name}:`, err.message);
    }
  }
}
