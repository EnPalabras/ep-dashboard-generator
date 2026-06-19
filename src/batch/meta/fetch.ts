import pool from "../../server/db/pool.ts";
import {
  fetchCampaignInsights,
  fetchAccountInsights,
  fetchAdEntities,
  pickAction,
  pickRoas,
  type MetaAccountInsight,
} from "./client.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
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

  await storeAdInsights(adAccountId, accessToken, dateFrom, dateTo);

  try {
    await storeAdEntities(adAccountId, accessToken);
  } catch (err: any) {
    console.error("[meta] ad entities failed:", err.message);
  }

  try {
    await storeAccountDaily(adAccountId, accessToken, dateFrom, dateTo);
  } catch (err: any) {
    console.error("[meta] account daily failed:", err.message);
  }

  try {
    await storeAccountTotals(adAccountId, accessToken);
  } catch (err: any) {
    console.error("[meta] account totals failed:", err.message);
  }
}

async function storeAdInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
) {
  console.log(`[meta] fetching ad insights from ${dateFrom} to ${dateTo}`);
  const results = await fetchCampaignInsights(adAccountId, accessToken, dateFrom, dateTo);
  console.log(`[meta] received ${results.length} ad rows`);
  if (results.length === 0) return;

  await pool.query(
    `
    INSERT INTO meta_campaign_insights
      (campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
       spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective,
       frequency, purchase_roas, omni_purchase, omni_purchase_value)
    SELECT * FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
      $7::date[], $8::numeric[], $9::integer[], $10::integer[], $11::integer[],
      $12::integer[], $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
      $17::text[], $18::numeric[], $19::numeric[], $20::integer[], $21::numeric[]
    ) AS t(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
           spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective,
           frequency, purchase_roas, omni_purchase, omni_purchase_value)
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
      objective = EXCLUDED.objective,
      frequency = EXCLUDED.frequency,
      purchase_roas = EXCLUDED.purchase_roas,
      omni_purchase = EXCLUDED.omni_purchase,
      omni_purchase_value = EXCLUDED.omni_purchase_value
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
      results.map((r) => r.frequency ?? 0),
      results.map((r) => pickRoas(r.purchase_roas)),
      results.map((r) => pickAction(r.actions, "omni_purchase")),
      results.map((r) => pickAction(r.action_values, "omni_purchase")),
    ]
  );

  console.log(`[meta] upserted ${results.length} ad rows`);
}

async function storeAdEntities(adAccountId: string, accessToken: string) {
  console.log("[meta] fetching ad entities (effective_status)");
  const ads = await fetchAdEntities(adAccountId, accessToken);
  console.log(`[meta] received ${ads.length} ad entities`);
  if (ads.length === 0) return;

  await pool.query(
    `
    INSERT INTO meta_ad_entities
      (ad_id, ad_name, campaign_id, campaign_name, adset_id, effective_status, updated_at)
    SELECT *, NOW() FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
    ) AS t(ad_id, ad_name, campaign_id, campaign_name, adset_id, effective_status)
    ON CONFLICT (ad_id)
    DO UPDATE SET
      ad_name = EXCLUDED.ad_name,
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      adset_id = EXCLUDED.adset_id,
      effective_status = EXCLUDED.effective_status,
      updated_at = NOW()
    `,
    [
      ads.map((a) => a.id),
      ads.map((a) => a.name ?? null),
      ads.map((a) => a.campaign_id ?? null),
      ads.map((a) => a.campaign?.name ?? null),
      ads.map((a) => a.adset_id ?? null),
      ads.map((a) => a.effective_status ?? null),
    ]
  );

  console.log(`[meta] upserted ${ads.length} ad entities`);
}

async function storeAccountDaily(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
) {
  console.log(`[meta] fetching account daily from ${dateFrom} to ${dateTo}`);
  const rows = await fetchAccountInsights(adAccountId, accessToken, dateFrom, dateTo, true);
  console.log(`[meta] received ${rows.length} account-daily rows`);
  if (rows.length === 0) return;

  await pool.query(
    `
    INSERT INTO meta_account_daily
      (account_id, date, amount_spent, impressions, reach, frequency, ctr, cpm,
       purchase_roas, omni_purchase, omni_purchase_value, updated_at)
    SELECT $1, * , NOW() FROM UNNEST(
      $2::date[], $3::numeric[], $4::bigint[], $5::bigint[], $6::numeric[],
      $7::numeric[], $8::numeric[], $9::numeric[], $10::integer[], $11::numeric[]
    ) AS t(date, amount_spent, impressions, reach, frequency, ctr, cpm,
           purchase_roas, omni_purchase, omni_purchase_value)
    ON CONFLICT (account_id, date)
    DO UPDATE SET
      amount_spent = EXCLUDED.amount_spent,
      impressions = EXCLUDED.impressions,
      reach = EXCLUDED.reach,
      frequency = EXCLUDED.frequency,
      ctr = EXCLUDED.ctr,
      cpm = EXCLUDED.cpm,
      purchase_roas = EXCLUDED.purchase_roas,
      omni_purchase = EXCLUDED.omni_purchase,
      omni_purchase_value = EXCLUDED.omni_purchase_value,
      updated_at = NOW()
    `,
    [
      adAccountId,
      rows.map((r) => r.date_start),
      rows.map((r) => r.spend ?? 0),
      rows.map((r) => r.impressions ?? 0),
      rows.map((r) => r.reach ?? 0),
      rows.map((r) => r.frequency ?? 0),
      rows.map((r) => r.ctr ?? 0),
      rows.map((r) => r.cpm ?? 0),
      rows.map((r) => pickRoas(r.purchase_roas)),
      rows.map((r) => pickAction(r.actions, "omni_purchase")),
      rows.map((r) => pickAction(r.action_values, "omni_purchase")),
    ]
  );

  console.log(`[meta] upserted ${rows.length} account-daily rows`);
}

async function storeAccountTotals(adAccountId: string, accessToken: string) {
  const today = daysAgo(0);
  const windows = [
    { label: "last_7d", from: daysAgo(6), to: today },
    { label: "last_28d", from: daysAgo(27), to: today },
    { label: "mtd", from: firstOfMonth(), to: today },
  ];

  for (const w of windows) {
    const rows = await fetchAccountInsights(adAccountId, accessToken, w.from, w.to, false);
    const r: MetaAccountInsight = rows[0] ?? {};

    await pool.query(
      `
      INSERT INTO meta_account_totals
        (account_id, window_label, period_from, period_to, amount_spent, reach, impressions,
         frequency, ctr, cpm, purchase_roas, omni_purchase, omni_purchase_value, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (account_id, window_label)
      DO UPDATE SET
        period_from = EXCLUDED.period_from,
        period_to = EXCLUDED.period_to,
        amount_spent = EXCLUDED.amount_spent,
        reach = EXCLUDED.reach,
        impressions = EXCLUDED.impressions,
        frequency = EXCLUDED.frequency,
        ctr = EXCLUDED.ctr,
        cpm = EXCLUDED.cpm,
        purchase_roas = EXCLUDED.purchase_roas,
        omni_purchase = EXCLUDED.omni_purchase,
        omni_purchase_value = EXCLUDED.omni_purchase_value,
        computed_at = NOW()
      `,
      [
        adAccountId,
        w.label,
        w.from,
        w.to,
        r.spend ?? 0,
        r.reach ?? 0,
        r.impressions ?? 0,
        r.frequency ?? 0,
        r.ctr ?? 0,
        r.cpm ?? 0,
        pickRoas(r.purchase_roas),
        pickAction(r.actions, "omni_purchase"),
        pickAction(r.action_values, "omni_purchase"),
      ]
    );
    console.log(`[meta] upserted account totals: ${w.label} (${w.from}..${w.to})`);
  }
}
