import pool from "../../server/db/pool.ts";
import { fetchCampaignInsights } from "./client.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function fetchAndStoreMetaData(lookbackDays = 7) {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    throw new Error("META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required");
  }

  const dateFrom = daysAgo(lookbackDays);
  const dateTo = daysAgo(0);

  console.log(`[meta] fetching insights from ${dateFrom} to ${dateTo}`);

  const insights = await fetchCampaignInsights(adAccountId, accessToken, dateFrom, dateTo);
  console.log(`[meta] received ${insights.length} rows`);

  if (insights.length === 0) return;

  // Upsert each row
  const upsertQuery = `
    INSERT INTO meta_campaign_insights
      (campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
       spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (campaign_id, adset_id, ad_id, date)
    DO UPDATE SET
      campaign_name = EXCLUDED.campaign_name,
      adset_name = EXCLUDED.adset_name,
      ad_name = EXCLUDED.ad_name,
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      conversions = EXCLUDED.conversions,
      reach = EXCLUDED.reach,
      cpm = EXCLUDED.cpm,
      cpp = EXCLUDED.cpp,
      ctr = EXCLUDED.ctr,
      cpc = EXCLUDED.cpc,
      objective = EXCLUDED.objective
  `;

  for (const row of insights) {
    const conversions = row.conversions
      ? typeof row.conversions === "string"
        ? parseInt(row.conversions, 10)
        : row.conversions
      : 0;

    await pool.query(upsertQuery, [
      row.campaign_id,
      row.campaign_name,
      row.adset_id ?? null,
      row.adset_name ?? null,
      row.ad_id ?? null,
      row.ad_name ?? null,
      row.date_start,
      parseFloat(row.spend) || 0,
      parseInt(row.impressions) || 0,
      parseInt(row.clicks) || 0,
      conversions,
      parseInt(row.reach) || 0,
      parseFloat(row.cpm) || 0,
      parseFloat(row.cpp) || 0,
      parseFloat(row.ctr) || 0,
      parseFloat(row.cpc) || 0,
      row.objective,
    ]);
  }

  console.log(`[meta] upserted ${insights.length} rows`);
}
