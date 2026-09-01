import pool from "../../server/db/pool.ts";
import {
  fetchCampaignInsights,
  fetchPlatformInsights,
  fetchAccountInsights,
  fetchAdEntities,
  pickAction,
  pickRoas,
  extractMetrics,
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

export interface FetchOptions {
  /** Días hacia atrás desde hoy (default 3). Ignorado si se pasa `from`. */
  lookbackDays?: number;
  /** Fecha de inicio explícita YYYY-MM-DD (para backfill). */
  from?: string;
  /** Fecha de fin explícita YYYY-MM-DD (default: hoy). */
  to?: string;
}

export async function fetchAndStoreMetaData(opts: FetchOptions = {}) {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    throw new Error("META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required");
  }

  const dateTo = opts.to ?? daysAgo(0);
  const dateFrom = opts.from ?? daysAgo(opts.lookbackDays ?? 3);

  // Las tablas tienen `id SERIAL` + UNIQUE(...): si la secuencia queda atrasada
  // respecto de max(id) (restore/copia de datos con ids explícitos), TODO insert de
  // fila nueva revienta con duplicate key en el pkey. La resincronizamos antes de insertar.
  await syncSerialSequences(["meta_campaign_insights", "meta_platform_insights"]);

  try {
    await storeAdInsights(adAccountId, accessToken, dateFrom, dateTo);
  } catch (err: any) {
    console.error("[meta] ad insights failed:", err.message);
  }

  try {
    await storePlatformInsights(adAccountId, accessToken, dateFrom, dateTo);
  } catch (err: any) {
    console.error("[meta] platform insights failed:", err.message);
  }

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

/** Pone cada secuencia de `id` en max(id), para que nextval no choque con filas existentes. */
async function syncSerialSequences(tables: string[]) {
  for (const t of tables) {
    try {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
                       (SELECT coalesce(max(id), 1) FROM ${t}))`,
        [t]
      );
    } catch (err: any) {
      console.error(`[meta] no pude sincronizar la secuencia de ${t}:`, err.message);
    }
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

  const m = results.map((r) => extractMetrics(r));

  await pool.query(
    `
    INSERT INTO meta_campaign_insights
      (campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
       spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective,
       frequency, purchase_roas, omni_purchase, omni_purchase_value,
       quality_ranking, engagement_rate_ranking, conversion_rate_ranking, buying_type,
       purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view,
       post_save, comment, link_click, shares, post_reaction,
       messaging_first_reply, messaging_started, cpa_purchase, website_purchase_roas)
    SELECT * FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
      $7::date[], $8::numeric[], $9::integer[], $10::integer[], $11::integer[],
      $12::integer[], $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
      $17::text[], $18::numeric[], $19::numeric[], $20::integer[], $21::numeric[],
      $22::text[], $23::text[], $24::text[], $25::text[],
      $26::integer[], $27::numeric[], $28::integer[], $29::integer[], $30::integer[], $31::integer[],
      $32::integer[], $33::integer[], $34::integer[], $35::integer[], $36::integer[],
      $37::integer[], $38::integer[], $39::numeric[], $40::numeric[]
    ) AS t(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date,
           spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective,
           frequency, purchase_roas, omni_purchase, omni_purchase_value,
           quality_ranking, engagement_rate_ranking, conversion_rate_ranking, buying_type,
           purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view,
           post_save, comment, link_click, shares, post_reaction,
           messaging_first_reply, messaging_started, cpa_purchase, website_purchase_roas)
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
      omni_purchase_value = EXCLUDED.omni_purchase_value,
      quality_ranking = EXCLUDED.quality_ranking,
      engagement_rate_ranking = EXCLUDED.engagement_rate_ranking,
      conversion_rate_ranking = EXCLUDED.conversion_rate_ranking,
      buying_type = EXCLUDED.buying_type,
      purchase = EXCLUDED.purchase,
      purchase_value = EXCLUDED.purchase_value,
      add_to_cart = EXCLUDED.add_to_cart,
      initiate_checkout = EXCLUDED.initiate_checkout,
      view_content = EXCLUDED.view_content,
      landing_page_view = EXCLUDED.landing_page_view,
      post_save = EXCLUDED.post_save,
      comment = EXCLUDED.comment,
      link_click = EXCLUDED.link_click,
      shares = EXCLUDED.shares,
      post_reaction = EXCLUDED.post_reaction,
      messaging_first_reply = EXCLUDED.messaging_first_reply,
      messaging_started = EXCLUDED.messaging_started,
      cpa_purchase = EXCLUDED.cpa_purchase,
      website_purchase_roas = EXCLUDED.website_purchase_roas
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
      m.map((x) => x.omni_purchase),
      m.map((x) => x.omni_purchase_value),
      results.map((r) => r.quality_ranking ?? null),
      results.map((r) => r.engagement_rate_ranking ?? null),
      results.map((r) => r.conversion_rate_ranking ?? null),
      results.map((r) => r.buying_type ?? null),
      m.map((x) => x.purchase),
      m.map((x) => x.purchase_value),
      m.map((x) => x.add_to_cart),
      m.map((x) => x.initiate_checkout),
      m.map((x) => x.view_content),
      m.map((x) => x.landing_page_view),
      m.map((x) => x.post_save),
      m.map((x) => x.comment),
      m.map((x) => x.link_click),
      m.map((x) => x.shares),
      m.map((x) => x.post_reaction),
      m.map((x) => x.messaging_first_reply),
      m.map((x) => x.messaging_started),
      m.map((x) => x.cpa_purchase),
      m.map((x) => x.website_purchase_roas),
    ]
  );

  console.log(`[meta] upserted ${results.length} ad rows`);
}

async function storePlatformInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
) {
  console.log(`[meta] fetching platform insights from ${dateFrom} to ${dateTo}`);
  const rows = await fetchPlatformInsights(adAccountId, accessToken, dateFrom, dateTo);
  console.log(`[meta] received ${rows.length} platform rows`);
  if (rows.length === 0) return;

  const m = rows.map((r) => extractMetrics(r));

  await pool.query(
    `
    INSERT INTO meta_platform_insights
      (campaign_id, adset_id, ad_id, date, publisher_platform, platform_position,
       spend, impressions, clicks, reach, frequency, ctr, cpm, cpc,
       omni_purchase, omni_purchase_value, purchase, purchase_value, add_to_cart, updated_at)
    SELECT *, NOW() FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::date[], $5::text[], $6::text[],
      $7::numeric[], $8::integer[], $9::integer[], $10::integer[], $11::numeric[],
      $12::numeric[], $13::numeric[], $14::numeric[],
      $15::integer[], $16::numeric[], $17::integer[], $18::numeric[], $19::integer[]
    ) AS t(campaign_id, adset_id, ad_id, date, publisher_platform, platform_position,
           spend, impressions, clicks, reach, frequency, ctr, cpm, cpc,
           omni_purchase, omni_purchase_value, purchase, purchase_value, add_to_cart)
    ON CONFLICT (campaign_id, adset_id, ad_id, date, publisher_platform, platform_position)
    DO UPDATE SET
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      reach = EXCLUDED.reach,
      frequency = EXCLUDED.frequency,
      ctr = EXCLUDED.ctr,
      cpm = EXCLUDED.cpm,
      cpc = EXCLUDED.cpc,
      omni_purchase = EXCLUDED.omni_purchase,
      omni_purchase_value = EXCLUDED.omni_purchase_value,
      purchase = EXCLUDED.purchase,
      purchase_value = EXCLUDED.purchase_value,
      add_to_cart = EXCLUDED.add_to_cart,
      updated_at = NOW()
    `,
    [
      rows.map((r) => r.campaign_id),
      rows.map((r) => r.adset_id ?? null),
      rows.map((r) => r.ad_id ?? null),
      rows.map((r) => r.date_start),
      rows.map((r) => r.publisher_platform ?? "unknown"),
      rows.map((r) => r.platform_position ?? "unknown"),
      rows.map((r) => r.spend ?? 0),
      rows.map((r) => r.impressions ?? 0),
      rows.map((r) => r.clicks ?? 0),
      rows.map((r) => r.reach ?? 0),
      rows.map((r) => r.frequency ?? 0),
      rows.map((r) => r.ctr ?? 0),
      rows.map((r) => r.cpm ?? 0),
      rows.map((r) => r.cpc ?? 0),
      m.map((x) => x.omni_purchase),
      m.map((x) => x.omni_purchase_value),
      m.map((x) => x.purchase),
      m.map((x) => x.purchase_value),
      m.map((x) => x.add_to_cart),
    ]
  );

  console.log(`[meta] upserted ${rows.length} platform rows`);
}

async function storeAdEntities(adAccountId: string, accessToken: string) {
  console.log("[meta] fetching ad entities (effective_status)");
  const ads = await fetchAdEntities(adAccountId, accessToken);
  console.log(`[meta] received ${ads.length} ad entities`);
  if (ads.length === 0) return;

  await pool.query(
    `
    INSERT INTO meta_ad_entities
      (ad_id, ad_name, campaign_id, campaign_name, adset_id, effective_status,
       meta_updated_time, preview_link, updated_at)
    SELECT *, NOW() FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
      $7::timestamptz[], $8::text[]
    ) AS t(ad_id, ad_name, campaign_id, campaign_name, adset_id, effective_status,
           meta_updated_time, preview_link)
    ON CONFLICT (ad_id)
    DO UPDATE SET
      ad_name = EXCLUDED.ad_name,
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      adset_id = EXCLUDED.adset_id,
      effective_status = EXCLUDED.effective_status,
      meta_updated_time = EXCLUDED.meta_updated_time,
      preview_link = EXCLUDED.preview_link,
      updated_at = NOW()
    `,
    [
      ads.map((a) => a.id),
      ads.map((a) => a.name ?? null),
      ads.map((a) => a.campaign_id ?? null),
      ads.map((a) => a.campaign?.name ?? null),
      ads.map((a) => a.adset_id ?? null),
      ads.map((a) => a.effective_status ?? null),
      ads.map((a) => a.updated_time ?? null),
      ads.map((a) => a.preview_shareable_link ?? null),
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

  const m = rows.map((r) => extractMetrics(r));

  await pool.query(
    `
    INSERT INTO meta_account_daily
      (account_id, date, amount_spent, impressions, reach, frequency, ctr, cpm,
       purchase_roas, omni_purchase, omni_purchase_value,
       purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view,
       post_save, comment, link_click, shares, post_reaction,
       messaging_first_reply, messaging_started, updated_at)
    SELECT $1, * , NOW() FROM UNNEST(
      $2::date[], $3::numeric[], $4::bigint[], $5::bigint[], $6::numeric[],
      $7::numeric[], $8::numeric[], $9::numeric[], $10::integer[], $11::numeric[],
      $12::integer[], $13::numeric[], $14::integer[], $15::integer[], $16::integer[], $17::integer[],
      $18::integer[], $19::integer[], $20::integer[], $21::integer[], $22::integer[],
      $23::integer[], $24::integer[]
    ) AS t(date, amount_spent, impressions, reach, frequency, ctr, cpm,
           purchase_roas, omni_purchase, omni_purchase_value,
           purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view,
           post_save, comment, link_click, shares, post_reaction,
           messaging_first_reply, messaging_started)
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
      purchase = EXCLUDED.purchase,
      purchase_value = EXCLUDED.purchase_value,
      add_to_cart = EXCLUDED.add_to_cart,
      initiate_checkout = EXCLUDED.initiate_checkout,
      view_content = EXCLUDED.view_content,
      landing_page_view = EXCLUDED.landing_page_view,
      post_save = EXCLUDED.post_save,
      comment = EXCLUDED.comment,
      link_click = EXCLUDED.link_click,
      shares = EXCLUDED.shares,
      post_reaction = EXCLUDED.post_reaction,
      messaging_first_reply = EXCLUDED.messaging_first_reply,
      messaging_started = EXCLUDED.messaging_started,
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
      m.map((x) => x.omni_purchase),
      m.map((x) => x.omni_purchase_value),
      m.map((x) => x.purchase),
      m.map((x) => x.purchase_value),
      m.map((x) => x.add_to_cart),
      m.map((x) => x.initiate_checkout),
      m.map((x) => x.view_content),
      m.map((x) => x.landing_page_view),
      m.map((x) => x.post_save),
      m.map((x) => x.comment),
      m.map((x) => x.link_click),
      m.map((x) => x.shares),
      m.map((x) => x.post_reaction),
      m.map((x) => x.messaging_first_reply),
      m.map((x) => x.messaging_started),
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
    const x = extractMetrics(r);

    await pool.query(
      `
      INSERT INTO meta_account_totals
        (account_id, window_label, period_from, period_to, amount_spent, reach, impressions,
         frequency, ctr, cpm, purchase_roas, omni_purchase, omni_purchase_value,
         purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view,
         post_save, comment, link_click, shares, post_reaction,
         messaging_first_reply, messaging_started, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW())
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
        purchase = EXCLUDED.purchase,
        purchase_value = EXCLUDED.purchase_value,
        add_to_cart = EXCLUDED.add_to_cart,
        initiate_checkout = EXCLUDED.initiate_checkout,
        view_content = EXCLUDED.view_content,
        landing_page_view = EXCLUDED.landing_page_view,
        post_save = EXCLUDED.post_save,
        comment = EXCLUDED.comment,
        link_click = EXCLUDED.link_click,
        shares = EXCLUDED.shares,
        post_reaction = EXCLUDED.post_reaction,
        messaging_first_reply = EXCLUDED.messaging_first_reply,
        messaging_started = EXCLUDED.messaging_started,
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
        x.omni_purchase,
        x.omni_purchase_value,
        x.purchase,
        x.purchase_value,
        x.add_to_cart,
        x.initiate_checkout,
        x.view_content,
        x.landing_page_view,
        x.post_save,
        x.comment,
        x.link_click,
        x.shares,
        x.post_reaction,
        x.messaging_first_reply,
        x.messaging_started,
      ]
    );
    console.log(`[meta] upserted account totals: ${w.label} (${w.from}..${w.to})`);
  }
}
