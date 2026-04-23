import { fetchCampaignInsights } from "../src/batch/meta/client";
import { readFileSync, writeFileSync } from "fs";
import pool from "../src/server/db/pool";
import type { MetaInsight } from "../src/batch/meta/client";

const { META_AD_ACCOUNT_ID, META_ACCESS_TOKEN } = process.env;

if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
  throw new Error("META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required");
}

const results = await fetchCampaignInsights(META_AD_ACCOUNT_ID, META_ACCESS_TOKEN, "2026-04-01", "2026-04-11");
writeFileSync("results.json", JSON.stringify(results, null, 2));
//const results = JSON.parse(readFileSync("results.json", "utf-8")) as MetaInsight[];

await pool.query(`
  INSERT INTO meta_campaign_insights (campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date, spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective)
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
    $7::date[], $8::numeric[], $9::integer[], $10::integer[], $11::integer[],
    $12::integer[], $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
    $17::text[]
  ) AS t(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date, spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective)
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
`, [
  results.map(r => r.campaign_id),
  results.map(r => r.campaign_name),
  results.map(r => r.adset_id),
  results.map(r => r.adset_name),
  results.map(r => r.ad_id),
  results.map(r => r.ad_name),
  results.map(r => r.date_start),
  results.map(r => r.spend),
  results.map(r => r.impressions),
  results.map(r => r.clicks),
  results.map(r => r.conversions?.map(c => c.value).reduce((a, b) => a + b, 0) ?? null),
  results.map(r => r.reach),
  results.map(r => r.cpm),
  results.map(r => r.cpp),
  results.map(r => r.ctr),
  results.map(r => r.cpc),
  results.map(r => r.objective),
]);

console.log(`inserted ${results.length} rows`);