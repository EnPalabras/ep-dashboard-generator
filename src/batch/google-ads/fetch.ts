import pool from "../../server/db/pool.ts";
import { ga4CredsFromEnv, runReport, ga4DateToISO, type GA4Credentials } from "../ga4/client.ts";
import type { FetchOptions } from "../ga4/fetch.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function fetchAndStoreGoogleAds(opts: FetchOptions = {}) {
  const creds = ga4CredsFromEnv();
  if (!creds) throw new Error("GA_* (service account) requeridas para Google Ads");

  const to = opts.to ?? daysAgo(0);
  const from = opts.from ?? daysAgo(opts.lookbackDays ?? 3);
  await storeCampaigns(creds, from, to);
}

async function storeCampaigns(creds: GA4Credentials, from: string, to: string) {
  console.log(`[google-ads] fetching from ${from} to ${to}`);
  const rows = await runReport(creds, {
    dimensions: ["date", "sessionGoogleAdsCampaignName"],
    metrics: ["advertiserAdCost", "advertiserAdClicks", "advertiserAdImpressions", "keyEvents", "totalRevenue"],
    startDate: from,
    endDate: to,
  });

  const num = (s: string | undefined) => Number(s) || 0;
  type Agg = {
    date: string; campaign_name: string;
    cost: number; clicks: number; impressions: number; key_events: number; total_revenue: number;
  };
  const acc = new Map<string, Agg>();
  for (const r of rows) {
    const date = ga4DateToISO(r.date ?? "");
    const campaign_name = r.sessionGoogleAdsCampaignName || "(not set)";
    const key = `${date}|${campaign_name}`;
    const cur = acc.get(key) ?? { date, campaign_name, cost: 0, clicks: 0, impressions: 0, key_events: 0, total_revenue: 0 };
    cur.cost += num(r.advertiserAdCost);
    cur.clicks += num(r.advertiserAdClicks);
    cur.impressions += num(r.advertiserAdImpressions);
    cur.key_events += num(r.keyEvents);
    cur.total_revenue += num(r.totalRevenue);
    acc.set(key, cur);
  }

  // Las filas sin costo son tráfico de Google Ads sin gasto imputado ese día
  // (ej. Shopping Free Listings): no son inversión, no entran.
  const agg = [...acc.values()].filter((r) => r.cost > 0);
  console.log(`[google-ads] ${rows.length} filas GA4 → ${agg.length} con costo`);
  if (agg.length === 0) return;

  await pool.query(
    `
    INSERT INTO google_ads_daily
      (date, campaign_name, cost, clicks, impressions, key_events, total_revenue)
    SELECT * FROM UNNEST(
      $1::date[], $2::text[], $3::numeric[], $4::integer[], $5::integer[], $6::numeric[], $7::numeric[]
    ) AS t(date, campaign_name, cost, clicks, impressions, key_events, total_revenue)
    ON CONFLICT (date, campaign_name)
    DO UPDATE SET
      cost = EXCLUDED.cost,
      clicks = EXCLUDED.clicks,
      impressions = EXCLUDED.impressions,
      key_events = EXCLUDED.key_events,
      total_revenue = EXCLUDED.total_revenue
    `,
    [
      agg.map((r) => r.date),
      agg.map((r) => r.campaign_name),
      agg.map((r) => r.cost),
      agg.map((r) => Math.round(r.clicks)),
      agg.map((r) => Math.round(r.impressions)),
      agg.map((r) => r.key_events),
      agg.map((r) => r.total_revenue),
    ]
  );
  console.log(`[google-ads] google_ads_daily ${from}..${to}: ${agg.length} filas`);
}
