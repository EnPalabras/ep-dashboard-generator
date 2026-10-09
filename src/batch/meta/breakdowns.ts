import pool from "../../server/db/pool.ts";
import { fetchAdInsightsBy, pickAction, type MetaAction, type MetaAdRow } from "./client.ts";

const VIDEO_FIELDS = [
  "video_play_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_thruplay_watched_actions",
  "video_30_sec_watched_actions",
  "video_avg_time_watched_actions",
];

const BREAKDOWN_FIELDS = ["spend", "impressions", "clicks", "reach", "actions", "action_values"];

const video = (r: MetaAdRow, field: string) => pickAction(r[field] as MetaAction[] | undefined, "video_view");
const num = (v: unknown) => Number(v) || 0;

export async function storeAdVideo(adAccountId: string, accessToken: string, from: string, to: string) {
  const rows = (await fetchAdInsightsBy(adAccountId, accessToken, from, to, ["impressions", "actions", ...VIDEO_FIELDS]))
    .filter((r) => r.video_play_actions);
  console.log(`[meta] ${rows.length} ad video rows`);
  if (rows.length === 0) return;
  await pool.query(
    `INSERT INTO meta_ad_video_daily
       (ad_id, date, campaign_id, adset_id, impressions, video_plays, video_3s_views, video_p25, video_p50,
        video_p75, video_p95, video_p100, thruplays, video_30s, avg_watch_seconds, updated_at)
     SELECT *, now() FROM UNNEST(
       $1::text[], $2::date[], $3::text[], $4::text[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[],
       $9::bigint[], $10::bigint[], $11::bigint[], $12::bigint[], $13::bigint[], $14::bigint[], $15::numeric[])
     ON CONFLICT (ad_id, date) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id, adset_id = EXCLUDED.adset_id, impressions = EXCLUDED.impressions,
       video_plays = EXCLUDED.video_plays, video_3s_views = EXCLUDED.video_3s_views,
       video_p25 = EXCLUDED.video_p25, video_p50 = EXCLUDED.video_p50, video_p75 = EXCLUDED.video_p75,
       video_p95 = EXCLUDED.video_p95, video_p100 = EXCLUDED.video_p100, thruplays = EXCLUDED.thruplays,
       video_30s = EXCLUDED.video_30s, avg_watch_seconds = EXCLUDED.avg_watch_seconds, updated_at = now()`,
    [
      rows.map((r) => r.ad_id),
      rows.map((r) => r.date_start),
      rows.map((r) => r.campaign_id ?? null),
      rows.map((r) => r.adset_id ?? null),
      rows.map((r) => num(r.impressions)),
      rows.map((r) => video(r, "video_play_actions")),
      rows.map((r) => pickAction(r.actions, "video_view")),
      rows.map((r) => video(r, "video_p25_watched_actions")),
      rows.map((r) => video(r, "video_p50_watched_actions")),
      rows.map((r) => video(r, "video_p75_watched_actions")),
      rows.map((r) => video(r, "video_p95_watched_actions")),
      rows.map((r) => video(r, "video_p100_watched_actions")),
      rows.map((r) => video(r, "video_thruplay_watched_actions")),
      rows.map((r) => video(r, "video_30_sec_watched_actions")),
      rows.map((r) => video(r, "video_avg_time_watched_actions")),
    ],
  );
}

type Breakdown = { table: string; breakdowns: string; keys: string[] };

const DEMOGRAPHICS: Breakdown = { table: "meta_ad_demographics", breakdowns: "age,gender", keys: ["age", "gender"] };
const REGIONS: Breakdown = { table: "meta_ad_regions", breakdowns: "region", keys: ["region"] };

async function storeBreakdown(b: Breakdown, adAccountId: string, accessToken: string, from: string, to: string) {
  const rows = await fetchAdInsightsBy(adAccountId, accessToken, from, to, BREAKDOWN_FIELDS, b.breakdowns);
  console.log(`[meta] ${rows.length} ${b.table} rows`);
  const keyCols = b.keys.join(", ");
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const keyArrays = b.keys.map((k) => part.map((r) => String(r[k] ?? "unknown")));
    const n = b.keys.length;
    const p = (j: number) => `$${n + j}`;
    await pool.query(
      `INSERT INTO ${b.table}
         (ad_id, date, campaign_id, adset_id, ${keyCols}, spend, impressions, clicks, reach, link_click,
          add_to_cart, initiate_checkout, purchase, purchase_value, omni_purchase, omni_purchase_value, updated_at)
       SELECT *, now() FROM UNNEST(
         ${p(1)}::text[], ${p(2)}::date[], ${p(3)}::text[], ${p(4)}::text[],
         ${b.keys.map((_, k) => `$${k + 1}::text[]`).join(", ")},
         ${p(5)}::numeric[], ${p(6)}::bigint[], ${p(7)}::bigint[], ${p(8)}::bigint[], ${p(9)}::bigint[],
         ${p(10)}::bigint[], ${p(11)}::bigint[], ${p(12)}::bigint[], ${p(13)}::numeric[], ${p(14)}::bigint[],
         ${p(15)}::numeric[])
       ON CONFLICT (ad_id, date, ${keyCols}) DO UPDATE SET
         campaign_id = EXCLUDED.campaign_id, adset_id = EXCLUDED.adset_id, spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, reach = EXCLUDED.reach,
         link_click = EXCLUDED.link_click, add_to_cart = EXCLUDED.add_to_cart,
         initiate_checkout = EXCLUDED.initiate_checkout, purchase = EXCLUDED.purchase,
         purchase_value = EXCLUDED.purchase_value, omni_purchase = EXCLUDED.omni_purchase,
         omni_purchase_value = EXCLUDED.omni_purchase_value, updated_at = now()`,
      [
        ...keyArrays,
        part.map((r) => r.ad_id),
        part.map((r) => r.date_start),
        part.map((r) => r.campaign_id ?? null),
        part.map((r) => r.adset_id ?? null),
        part.map((r) => num(r.spend)),
        part.map((r) => num(r.impressions)),
        part.map((r) => num(r.clicks)),
        part.map((r) => num(r.reach)),
        part.map((r) => pickAction(r.actions, "link_click")),
        part.map((r) => pickAction(r.actions, "add_to_cart")),
        part.map((r) => pickAction(r.actions, "initiate_checkout")),
        part.map((r) => pickAction(r.actions, "purchase")),
        part.map((r) => pickAction(r.action_values, "purchase")),
        part.map((r) => pickAction(r.actions, "omni_purchase")),
        part.map((r) => pickAction(r.action_values, "omni_purchase")),
      ],
    );
  }
}

export const storeAdDemographics = (id: string, token: string, from: string, to: string) =>
  storeBreakdown(DEMOGRAPHICS, id, token, from, to);

export const storeAdRegions = (id: string, token: string, from: string, to: string) =>
  storeBreakdown(REGIONS, id, token, from, to);
