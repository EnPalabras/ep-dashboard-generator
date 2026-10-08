import pool from "../../server/db/pool.ts";
import type { FetchOptions } from "../ga4/fetch.ts";

// combined_report_by_day en v2: gasto y resultado por canal × campaña × anuncio × día,
// armado desde las tablas propias en vez de la planilla de Windsor.
// Cada canal se reescribe sólo en los días que su fuente tiene, así no se pisa la
// historia que vino copiada del legacy ni un día que la fuente no devolvió.
// En Meta el revenue es el purchase_value que atribuye Meta; Windsor reportaba ~2x,
// con otra ventana de atribución.
const CHANNELS = [
  {
    channel: "Meta Ads",
    source: "meta_campaign_insights",
    select: `SELECT date, campaign_name, 'Meta Ads', COALESCE(SUM(impressions), 0)::int, COALESCE(SUM(clicks), 0)::int,
                    COALESCE(SUM(spend), 0), COALESCE(SUM(purchase_value), 0), COALESCE(SUM(purchase), 0)::int, COALESCE(ad_name, '')
               FROM meta_campaign_insights WHERE date BETWEEN $1 AND $2 GROUP BY date, campaign_name, ad_name`,
  },
  {
    channel: "Google Ads",
    source: "google_ads_daily",
    select: `SELECT date, campaign_name, 'Google Ads', impressions, clicks, cost, total_revenue, key_events::int, ''
               FROM google_ads_daily WHERE date BETWEEN $1 AND $2`,
  },
  {
    channel: "Mercado Libre",
    source: "mercadolibre_ads_daily",
    select: `SELECT date, campaign_name, 'Mercado Libre', prints, clicks, cost, total_amount, units_quantity, ''
               FROM mercadolibre_ads_daily WHERE date BETWEEN $1 AND $2`,
  },
  {
    channel: "TikTok Ads",
    source: "tiktok_ads_daily",
    select: `SELECT date, campaign_name, 'TikTok Ads', COALESCE(SUM(impressions), 0)::int, COALESCE(SUM(clicks), 0)::int,
                    COALESCE(SUM(spend), 0), 0, COALESCE(SUM(conversion), 0)::int, COALESCE(ad_name, '')
               FROM tiktok_ads_daily WHERE date BETWEEN $1 AND $2 GROUP BY date, campaign_name, ad_name`,
  },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function buildCombinedReport(opts: FetchOptions = {}) {

  const to = opts.to ?? daysAgo(0);
  const requested = opts.from ?? daysAgo((opts.lookbackDays ?? 3) + 1);

  for (const c of CHANNELS) {
    const { rows } = await pool.query(`SELECT MIN(date)::text AS first FROM ${c.source}`);
    const first: string | null = rows[0]?.first ?? null;
    if (!first) {
      console.log(`[combined] ${c.channel}: ${c.source} vacía, se deja lo que haya`);
      continue;
    }
    const from = requested < first ? first : requested;
    if (from > to) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM combined_report_by_day
          WHERE channel = $1
            AND date IN (SELECT DISTINCT date FROM ${c.source} WHERE date BETWEEN $2 AND $3)`,
        [c.channel, from, to],
      );
      const inserted = await client.query(
        `INSERT INTO combined_report_by_day
           (date, campaign_name, channel, impressions, clicks, spend, total_revenue, keyevents, ad_name)
         ${c.select}`,
        [from, to],
      );
      await client.query("COMMIT");
      console.log(`[combined] ${c.channel}: ${inserted.rowCount} filas ${from}..${to}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
