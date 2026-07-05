import pool from "../../server/db/pool.ts";

// Portado de server_en_palabras (lib/meta/instagram-by-day + crons/meta).
// Alimenta la tabla EXISTENTE analytics.instagram_by_day (Metabase la consume).
// (ep_analytics necesita INSERT/UPDATE en esa tabla — ver grant en CLAUDE.md.)
// Env: META_INSTAGRAM_ACCOUNT_ID + META_ACCESS_TOKEN (token con permisos instagram_*).

const BASE = "https://graph.facebook.com/v25.0";
const METRICS = ["views", "reach", "total_interactions", "accounts_engaged", "likes", "comments", "saves", "shares", "replies", "profile_views", "website_clicks"];

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function lastNDays(n: number): { date: string; since: string; until: string }[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    return { date: fmt(d), since: fmt(d), until: fmt(next) };
  });
}

interface Datum { name: string; total_value?: { value: string }; values?: { value: string; end_time?: string }[] }

export async function fetchAndStoreInstagram(days = 10) {
  const igId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!igId || !token) throw new Error("META_INSTAGRAM_ACCOUNT_ID y META_ACCESS_TOKEN son requeridas para Instagram");

  const ranges = lastNDays(days);
  const rows = new Map<string, Record<string, number>>();
  for (const r of ranges) rows.set(r.date, {});

  // Insights diarios (metric_type=total_value, un request por día)
  for (const range of ranges) {
    const url = `${BASE}/${igId}/insights?metric=${METRICS.join(",")}&period=day&since=${range.since}&until=${range.until}&metric_type=total_value&access_token=${token}`;
    try {
      const res = await fetch(url);
      const json = (await res.json().catch(() => ({}))) as { data?: Datum[]; error?: { message?: string } };
      if (!res.ok) { console.log(`[instagram] ${range.date} status=${res.status} error=${json.error?.message}`); continue; }
      const get = (name: string) => {
        const d = (json.data ?? []).find((x) => x.name === name);
        const v = d?.total_value?.value ?? d?.values?.[0]?.value;
        return v != null ? parseInt(v, 10) || 0 : 0;
      };
      rows.set(range.date, {
        impressions: get("views"), // meta renombró 'impressions' a 'views'
        reach: get("reach"),
        total_interactions: get("total_interactions"),
        accounts_engaged: get("accounts_engaged"),
        likes: get("likes"),
        comments: get("comments"),
        saves: get("saves"),
        shares: get("shares"),
        replies: get("replies"),
        profile_views: get("profile_views"),
        website_clicks: get("website_clicks"),
      });
    } catch (e) { console.error(`[instagram] ${range.date} fetch failed`, e); }
  }

  // follower_count por día (un solo request de rango)
  try {
    const since = ranges[0]!.since, until = ranges[ranges.length - 1]!.until;
    const url = `${BASE}/${igId}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${token}`;
    const res = await fetch(url);
    const json = (await res.json().catch(() => ({}))) as { data?: Datum[] };
    const values = json.data?.find((x) => x.name === "follower_count")?.values ?? [];
    for (const v of values) {
      if (!v.end_time) continue;
      const d = v.end_time.slice(0, 10);
      if (rows.has(d)) rows.get(d)!.follower_count = parseInt(v.value, 10) || 0;
    }
  } catch (e) { console.error("[instagram] follower_count failed", e); }

  // upsert por día
  const cols = ["impressions", "reach", "total_interactions", "accounts_engaged", "likes", "comments", "saves", "shares", "replies", "profile_views", "website_clicks", "follower_count"];
  for (const [date, r] of rows) {
    const vals = [date, ...cols.map((c) => r[c] ?? 0)];
    const ph = vals.map((_, i) => (i === 0 ? "$1::date" : `$${i + 1}`)).join(", ");
    const set = cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    await pool.query(
      `INSERT INTO analytics.instagram_by_day (date, ${cols.join(", ")}) VALUES (${ph})
       ON CONFLICT (date) DO UPDATE SET ${set}`,
      vals
    );
  }

  // total de seguidores actual → all_followers en el día más reciente
  try {
    const res = await fetch(`${BASE}/${igId}/?fields=followers_count&access_token=${token}`);
    const json = (await res.json().catch(() => ({}))) as { followers_count?: number };
    if (json.followers_count != null) {
      const maxDate = [...rows.keys()].sort().pop()!;
      await pool.query(`UPDATE analytics.instagram_by_day SET all_followers = $2 WHERE date = $1::date`, [maxDate, json.followers_count]);
    }
  } catch (e) { console.error("[instagram] total followers failed", e); }

  console.log(`[instagram] instagram_by_day: ${rows.size} días upserted`);
}
