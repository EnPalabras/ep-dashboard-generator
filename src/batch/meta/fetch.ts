import pool from "../../server/db/pool.ts";
import { fetchCampaignInsights } from "./client.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function fetchAndStoreMetaData(lookbackDays = 3) {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    throw new Error("META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required");
  }

  const dateFrom = daysAgo(lookbackDays);
  const dateTo = daysAgo(0);

  console.log(`[meta] fetching insights from ${dateFrom} to ${dateTo}`);

  const results = await fetchCampaignInsights(adAccountId, accessToken, dateFrom, dateTo);
  console.log(`[meta] received ${results.length} rows`);

  if (results.length === 0) return;

  await pool.query(
    `
    INSERT INTO meta_campaign_insights
      (campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
       spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective)
    SELECT * FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
      $7::date[], $8::numeric[], $9::integer[], $10::integer[], $11::integer[],
      $12::integer[], $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
      $17::text[]
    ) AS t(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
           spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective)
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
    `,
    [
      results.map((r) => r.campaign_id),
      results.map((r) => r.campaign_name),
      results.map((r) => r.adset_id ?? null),
      results.map((r) => r.adset_name ?? null),
      results.map((r) => r.ad_id ?? null),
      results.map((r) => r.ad_name ?? null),
      results.map((r) => r.date_start),
      results.map((r) => r.spend),
      results.map((r) => r.impressions),
      results.map((r) => r.clicks),
      results.map((r) => r.conversions?.map((c) => Number(c.value)).reduce((a, b) => a + b, 0) ?? 0),
      results.map((r) => r.reach),
      results.map((r) => r.cpm),
      results.map((r) => r.cpp),
      results.map((r) => r.ctr),
      results.map((r) => r.cpc),
      results.map((r) => r.objective),
    ],
  );

  console.log(`[meta] upserted ${results.length} rows`);
}
