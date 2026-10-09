import pool from "../../server/db/pool.ts";
import { runReport, ga4DateToISO, type GA4Credentials } from "./client.ts";

const num = (s: string | undefined) => Number(s) || 0;

export async function storeSiteDaily(creds: GA4Credentials, from: string, to: string) {
  const rows = await runReport(creds, {
    dimensions: ["date"],
    metrics: [
      "totalUsers",
      "newUsers",
      "sessions",
      "engagedSessions",
      "screenPageViews",
      "averageSessionDuration",
      "bounceRate",
      "screenPageViewsPerSession",
    ],
    startDate: from,
    endDate: to,
  });
  console.log(`[ga4] ${rows.length} site rows`);
  if (rows.length === 0) return;
  await pool.query(
    `INSERT INTO ga4_site_daily
       (date, total_users, new_users, sessions, engaged_sessions, page_views,
        avg_session_duration, bounce_rate, pages_per_session, updated_at)
     SELECT *, now() FROM UNNEST($1::date[], $2::integer[], $3::integer[], $4::integer[], $5::integer[],
       $6::integer[], $7::numeric[], $8::numeric[], $9::numeric[])
     ON CONFLICT (date) DO UPDATE SET
       total_users = EXCLUDED.total_users, new_users = EXCLUDED.new_users, sessions = EXCLUDED.sessions,
       engaged_sessions = EXCLUDED.engaged_sessions, page_views = EXCLUDED.page_views,
       avg_session_duration = EXCLUDED.avg_session_duration, bounce_rate = EXCLUDED.bounce_rate,
       pages_per_session = EXCLUDED.pages_per_session, updated_at = now()`,
    [
      rows.map((r) => ga4DateToISO(r.date ?? "")),
      rows.map((r) => num(r.totalUsers)),
      rows.map((r) => num(r.newUsers)),
      rows.map((r) => num(r.sessions)),
      rows.map((r) => num(r.engagedSessions)),
      rows.map((r) => num(r.screenPageViews)),
      rows.map((r) => num(r.averageSessionDuration)),
      rows.map((r) => num(r.bounceRate)),
      rows.map((r) => num(r.screenPageViewsPerSession)),
    ],
  );
}

export async function storeDeviceRegionDaily(creds: GA4Credentials, from: string, to: string) {
  const rows = await runReport(creds, {
    dimensions: ["date", "deviceCategory", "country", "region"],
    metrics: ["totalUsers", "sessions", "engagedSessions", "screenPageViews", "averageSessionDuration", "bounceRate"],
    startDate: from,
    endDate: to,
  });
  console.log(`[ga4] ${rows.length} device/region rows`);
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await pool.query(
      `INSERT INTO ga4_device_region_daily
         (date, device_category, country, region, total_users, sessions, engaged_sessions, page_views,
          avg_session_duration, bounce_rate, updated_at)
       SELECT *, now() FROM UNNEST($1::date[], $2::text[], $3::text[], $4::text[], $5::integer[], $6::integer[],
         $7::integer[], $8::integer[], $9::numeric[], $10::numeric[])
       ON CONFLICT (date, device_category, country, region) DO UPDATE SET
         total_users = EXCLUDED.total_users, sessions = EXCLUDED.sessions,
         engaged_sessions = EXCLUDED.engaged_sessions, page_views = EXCLUDED.page_views,
         avg_session_duration = EXCLUDED.avg_session_duration, bounce_rate = EXCLUDED.bounce_rate,
         updated_at = now()`,
      [
        part.map((r) => ga4DateToISO(r.date ?? "")),
        part.map((r) => r.deviceCategory || "(not set)"),
        part.map((r) => r.country || "(not set)"),
        part.map((r) => r.region || "(not set)"),
        part.map((r) => num(r.totalUsers)),
        part.map((r) => num(r.sessions)),
        part.map((r) => num(r.engagedSessions)),
        part.map((r) => num(r.screenPageViews)),
        part.map((r) => num(r.averageSessionDuration)),
        part.map((r) => num(r.bounceRate)),
      ],
    );
  }
}
