import pool from "../../server/db/pool.ts";

// IG a nivel post (media insights). Trae reels/carruseles/imágenes con sus métricas propias.
// Env: META_INSTAGRAM_ACCOUNT_ID + META_ACCESS_TOKEN (permisos instagram_*). Tabla nuestra.

const BASE = "https://graph.facebook.com/v25.0";
const FIELDS =
  "id,media_type,caption,permalink,timestamp,like_count,comments_count," +
  "insights.metric(reach,total_interactions,saved,shares,views)";

const fmt = (d: Date) => d.toISOString().slice(0, 10);
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); }

export interface FetchOptions { lookbackDays?: number; from?: string; to?: string; }

interface Media {
  id: string; media_type?: string; caption?: string; permalink?: string; timestamp?: string;
  like_count?: number; comments_count?: number;
  insights?: { data?: { name: string; values?: { value: number }[] }[] };
}

export async function fetchAndStoreInstagramPosts(opts: FetchOptions = {}) {
  const igId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!igId || !token) throw new Error("META_INSTAGRAM_ACCOUNT_ID y META_ACCESS_TOKEN son requeridas para IG posts");

  // Traemos posts publicados desde `from` (default: lookback). Paginamos hasta pasar esa fecha.
  const cutoff = opts.from ?? daysAgo((opts.lookbackDays ?? 30));
  const rows: Media[] = [];
  let url: string | null =
    `${BASE}/${igId}/media?fields=${FIELDS}&limit=50&access_token=${token}`;
  let stop = false;

  while (url && !stop) {
    const res = await fetch(url);
    const json = (await res.json()) as { data?: Media[]; paging?: { next?: string }; error?: { message?: string } };
    if (json.error) throw new Error(`IG posts error: ${json.error.message}`);
    for (const m of json.data ?? []) {
      if (m.timestamp && m.timestamp.slice(0, 10) < cutoff) { stop = true; break; }
      rows.push(m);
    }
    url = stop ? null : (json.paging?.next ?? null);
  }
  if (rows.length === 0) { console.log("[instagram-posts] 0 posts en el rango"); return; }

  const ins = (m: Media, name: string) =>
    Number(m.insights?.data?.find((d) => d.name === name)?.values?.[0]?.value) || 0;

  const cols = ["media_id", "timestamp", "date", "media_type", "caption", "permalink",
    "reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
  const data = rows.map((m) => [
    m.id, m.timestamp ?? null, m.timestamp ? m.timestamp.slice(0, 10) : null,
    m.media_type ?? null, m.caption ?? null, m.permalink ?? null,
    ins(m, "reach"), ins(m, "views"), Number(m.like_count) || 0, Number(m.comments_count) || 0,
    ins(m, "saved"), ins(m, "shares"), ins(m, "total_interactions"),
  ]);

  const per = Math.floor(60000 / cols.length);
  for (let i = 0; i < data.length; i += per) {
    const batch = data.slice(i, i + per);
    const ph = batch.map((_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(",")})`).join(",");
    await pool.query(
      `INSERT INTO analytics.instagram_posts (media_id, timestamp, date, media_type, caption, permalink,
         reach, views, likes, comments, saved, shares, total_interactions)
       VALUES ${ph}
       ON CONFLICT (media_id) DO UPDATE SET
         reach=EXCLUDED.reach, views=EXCLUDED.views, likes=EXCLUDED.likes, comments=EXCLUDED.comments,
         saved=EXCLUDED.saved, shares=EXCLUDED.shares, total_interactions=EXCLUDED.total_interactions,
         caption=EXCLUDED.caption, updated_at=now()`,
      batch.flat()
    );
  }
  console.log(`[instagram-posts] instagram_posts: ${data.length} posts upserted (desde ${cutoff})`);
}
