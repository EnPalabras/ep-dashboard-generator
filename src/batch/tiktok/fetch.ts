import pool from "../../server/db/pool.ts";
import { tiktokCredsFromEnv, getBasicAdReport } from "./client.ts";

const DIMENSIONS = ["ad_id", "stat_time_day"];
const METRICS = [
  "spend", "impressions", "clicks", "ctr", "cpc", "cpm",
  "conversion", "conversion_rate_v2", "reach",
  "likes", "comments", "shares", "profile_visits",
  "ad_name", "campaign_name", "adgroup_name",
];

const fmt = (d: Date) => d.toISOString().slice(0, 10);
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); }

/** Trocea [from,to] en ventanas de <= maxDays (TikTok limita el rango por request). */
function windows(from: string, to: string, maxDays = 30): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let s = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (s <= end) {
    const e = new Date(s); e.setUTCDate(e.getUTCDate() + maxDays - 1);
    out.push({ from: fmt(s), to: fmt(e < end ? e : end) });
    s = new Date(e); s.setUTCDate(s.getUTCDate() + 1);
  }
  return out;
}

export interface FetchOptions { lookbackDays?: number; from?: string; to?: string; }

export async function fetchAndStoreTikTok(opts: FetchOptions = {}) {
  const creds = tiktokCredsFromEnv();
  if (!creds) throw new Error("TIKTOK_ACCESS_TOKEN y TIKTOK_ADVERTISER_ID son requeridas para TikTok");

  const to = opts.to ?? daysAgo(1); // TikTok: hasta ayer (día cerrado)
  const from = opts.from ?? daysAgo((opts.lookbackDays ?? 3) + 1);

  const num = (s?: string) => Number(s) || 0;
  const int = (s?: string) => parseInt(s ?? "0", 10) || 0;
  let total = 0;

  for (const w of windows(from, to)) {
    console.log(`[tiktok] fetching ${w.from}..${w.to}`);
    const rows = await getBasicAdReport(creds, DIMENSIONS, METRICS, w.from, w.to);
    if (rows.length === 0) continue;

    const flat = rows.map((r) => ({
      date: (r.dimensions.stat_time_day ?? "").slice(0, 10),
      ad_id: r.dimensions.ad_id ?? "",
      ad_name: r.metrics.ad_name ?? null,
      campaign_name: r.metrics.campaign_name ?? null,
      adgroup_name: r.metrics.adgroup_name ?? null,
      spend: num(r.metrics.spend),
      impressions: int(r.metrics.impressions),
      clicks: int(r.metrics.clicks),
      ctr: num(r.metrics.ctr),
      cpc: num(r.metrics.cpc),
      cpm: num(r.metrics.cpm),
      conversion: num(r.metrics.conversion),
      conversion_rate: num(r.metrics.conversion_rate_v2),
      reach: int(r.metrics.reach),
      likes: int(r.metrics.likes),
      comments: int(r.metrics.comments),
      shares: int(r.metrics.shares),
      profile_visits: int(r.metrics.profile_visits),
    })).filter((x) => x.ad_id && x.date);

    const cols = ["date", "ad_id", "ad_name", "campaign_name", "adgroup_name", "spend", "impressions",
      "clicks", "ctr", "cpc", "cpm", "conversion", "conversion_rate", "reach", "likes", "comments", "shares", "profile_visits"];
    const per = Math.floor(60000 / cols.length);
    for (let i = 0; i < flat.length; i += per) {
      const batch = flat.slice(i, i + per);
      const ph = batch.map((_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(",")})`).join(",");
      const vals = batch.flatMap((row: any) => cols.map((c) => row[c]));
      await pool.query(
        `INSERT INTO analytics.tiktok_ads_daily (${cols.join(",")}) VALUES ${ph}
         ON CONFLICT (ad_id, date) DO UPDATE SET
           ad_name=EXCLUDED.ad_name, campaign_name=EXCLUDED.campaign_name, adgroup_name=EXCLUDED.adgroup_name,
           spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, ctr=EXCLUDED.ctr,
           cpc=EXCLUDED.cpc, cpm=EXCLUDED.cpm, conversion=EXCLUDED.conversion, conversion_rate=EXCLUDED.conversion_rate,
           reach=EXCLUDED.reach, likes=EXCLUDED.likes, comments=EXCLUDED.comments, shares=EXCLUDED.shares,
           profile_visits=EXCLUDED.profile_visits`,
        vals
      );
    }
    total += flat.length;
  }
  console.log(`[tiktok] tiktok_ads_daily: ${total} filas upserted`);
}
