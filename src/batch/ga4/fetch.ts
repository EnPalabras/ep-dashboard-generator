import pool from "../../server/db/pool.ts";
import { ga4CredsFromEnv, runReport, ga4DateToISO, type GA4Credentials } from "./client.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
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

export async function fetchAndStoreGA4Data(opts: FetchOptions = {}) {
  const creds = ga4CredsFromEnv();
  if (!creds) {
    throw new Error(
      "GA_SERVICE_ACCOUNT_EMAIL, GA_PRIVATE_KEY y GA_PROPERTY_ID son requeridas para GA4"
    );
  }

  const to = opts.to ?? daysAgo(0);
  const from = opts.from ?? daysAgo(opts.lookbackDays ?? 3);

  await storeTraffic(creds, from, to);

  try {
    await storeEvents(creds, from, to);
  } catch (err: any) {
    console.error("[ga4] events failed:", err.message);
  }
}

async function storeTraffic(creds: GA4Credentials, from: string, to: string) {
  console.log(`[ga4] fetching traffic from ${from} to ${to}`);
  const rows = await runReport(creds, {
    dimensions: ["date", "sessionDefaultChannelGroup", "sessionSource", "sessionMedium"],
    metrics: [
      "sessions",
      "totalUsers",
      "newUsers",
      "engagedSessions",
      "engagementRate",
      "averageSessionDuration",
      "conversions",
      "totalRevenue",
    ],
    startDate: from,
    endDate: to,
  });
  console.log(`[ga4] received ${rows.length} traffic rows`);
  if (rows.length === 0) return;

  const num = (s: string | undefined) => Number(s) || 0;

  // GA4 puede devolver tuplas que, normalizadas, colapsan a la misma clave
  // (date, channel, source, medium). Postgres rechaza un ON CONFLICT que toque
  // la misma fila dos veces en un solo comando, así que agregamos en memoria.
  // Conteos: suma. engagement_rate y avg_session_duration: promedio ponderado por sesiones.
  type Agg = {
    date: string; channel: string; source: string; medium: string;
    sessions: number; total_users: number; new_users: number; engaged_sessions: number;
    er_weighted: number; dur_weighted: number; conversions: number; total_revenue: number;
  };
  const acc = new Map<string, Agg>();
  for (const r of rows) {
    const date = ga4DateToISO(r.date ?? "");
    const channel = r.sessionDefaultChannelGroup || "(not set)";
    const source = r.sessionSource || "(not set)";
    const medium = r.sessionMedium || "(not set)";
    const key = `${date}|${channel}|${source}|${medium}`;
    const sessions = num(r.sessions);
    const cur = acc.get(key);
    if (cur) {
      cur.sessions += sessions;
      cur.total_users += num(r.totalUsers);
      cur.new_users += num(r.newUsers);
      cur.engaged_sessions += num(r.engagedSessions);
      cur.er_weighted += num(r.engagementRate) * sessions;
      cur.dur_weighted += num(r.averageSessionDuration) * sessions;
      cur.conversions += num(r.conversions);
      cur.total_revenue += num(r.totalRevenue);
    } else {
      acc.set(key, {
        date, channel, source, medium,
        sessions, total_users: num(r.totalUsers), new_users: num(r.newUsers),
        engaged_sessions: num(r.engagedSessions),
        er_weighted: num(r.engagementRate) * sessions,
        dur_weighted: num(r.averageSessionDuration) * sessions,
        conversions: num(r.conversions), total_revenue: num(r.totalRevenue),
      });
    }
  }
  const agg = [...acc.values()];
  console.log(`[ga4] ${agg.length} traffic rows tras agregar duplicados`);

  await pool.query(
    `
    INSERT INTO ga4_traffic_daily
      (date, channel, source, medium, sessions, total_users, new_users,
       engaged_sessions, engagement_rate, avg_session_duration, conversions, total_revenue)
    SELECT * FROM UNNEST(
      $1::date[], $2::text[], $3::text[], $4::text[], $5::integer[], $6::integer[],
      $7::integer[], $8::integer[], $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[]
    ) AS t(date, channel, source, medium, sessions, total_users, new_users,
           engaged_sessions, engagement_rate, avg_session_duration, conversions, total_revenue)
    ON CONFLICT (date, channel, source, medium)
    DO UPDATE SET
      sessions = EXCLUDED.sessions,
      total_users = EXCLUDED.total_users,
      new_users = EXCLUDED.new_users,
      engaged_sessions = EXCLUDED.engaged_sessions,
      engagement_rate = EXCLUDED.engagement_rate,
      avg_session_duration = EXCLUDED.avg_session_duration,
      conversions = EXCLUDED.conversions,
      total_revenue = EXCLUDED.total_revenue
    `,
    [
      agg.map((r) => r.date),
      agg.map((r) => r.channel),
      agg.map((r) => r.source),
      agg.map((r) => r.medium),
      agg.map((r) => r.sessions),
      agg.map((r) => r.total_users),
      agg.map((r) => r.new_users),
      agg.map((r) => r.engaged_sessions),
      agg.map((r) => (r.sessions > 0 ? r.er_weighted / r.sessions : 0)),
      agg.map((r) => (r.sessions > 0 ? r.dur_weighted / r.sessions : 0)),
      agg.map((r) => r.conversions),
      agg.map((r) => r.total_revenue),
    ]
  );
}

async function storeEvents(creds: GA4Credentials, from: string, to: string) {
  console.log(`[ga4] fetching events from ${from} to ${to}`);
  const rows = await runReport(creds, {
    dimensions: ["date", "eventName"],
    metrics: ["eventCount", "conversions"],
    startDate: from,
    endDate: to,
  });
  console.log(`[ga4] received ${rows.length} event rows`);
  if (rows.length === 0) return;

  const num = (s: string | undefined) => Number(s) || 0;

  // Mismo motivo que en tráfico: agregamos por (date, event_name) para evitar
  // claves duplicadas dentro del mismo INSERT. Aquí ambos campos son aditivos.
  const acc = new Map<string, { date: string; event_name: string; event_count: number; conversions: number }>();
  for (const r of rows) {
    const date = ga4DateToISO(r.date ?? "");
    const event_name = r.eventName || "(not set)";
    const key = `${date}|${event_name}`;
    const cur = acc.get(key);
    if (cur) {
      cur.event_count += num(r.eventCount);
      cur.conversions += num(r.conversions);
    } else {
      acc.set(key, { date, event_name, event_count: num(r.eventCount), conversions: num(r.conversions) });
    }
  }
  const agg = [...acc.values()];

  await pool.query(
    `
    INSERT INTO ga4_events_daily (date, event_name, event_count, conversions)
    SELECT * FROM UNNEST(
      $1::date[], $2::text[], $3::integer[], $4::numeric[]
    ) AS t(date, event_name, event_count, conversions)
    ON CONFLICT (date, event_name)
    DO UPDATE SET
      event_count = EXCLUDED.event_count,
      conversions = EXCLUDED.conversions
    `,
    [
      agg.map((r) => r.date),
      agg.map((r) => r.event_name),
      agg.map((r) => r.event_count),
      agg.map((r) => r.conversions),
    ]
  );
}
