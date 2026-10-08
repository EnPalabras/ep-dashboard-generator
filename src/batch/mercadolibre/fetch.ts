import pool from "../../server/db/pool.ts";
import type { FetchOptions } from "../ga4/fetch.ts";

const API = "https://api.mercadolibre.com/advertising";
const METRICS = "cost,prints,clicks,direct_amount,indirect_amount,total_amount,units_quantity";
// La API rechaza con 400 los rangos que empiezan antes de ~90 días.
const MAX_LOOKBACK_DAYS = 89;

type Campaign = { id: number; name: string };
type DailyMetrics = {
  date: string;
  cost?: number;
  prints?: number;
  clicks?: number;
  direct_amount?: number;
  indirect_amount?: number;
  total_amount?: number;
  units_quantity?: number;
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function get<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "api-version": "2" },
  });
  if (!response.ok) throw new Error(`${response.status} en ${path}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as T;
}

export async function fetchAndStoreMercadoLibreAds(opts: FetchOptions = {}) {
  const token = process.env.MERCADOLIBRE_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOLIBRE_ACCESS_TOKEN es requerida para Mercado Libre Ads");

  const oldest = daysAgo(MAX_LOOKBACK_DAYS);
  const to = opts.to ?? daysAgo(0);
  const requested = opts.from ?? daysAgo(opts.lookbackDays ?? 3);
  const from = requested < oldest ? oldest : requested;

  const { advertisers } = await get<{ advertisers: { advertiser_id: number; site_id: string }[] }>(
    "/advertisers?product_id=PADS",
    token,
  );
  const advertiser = advertisers[0];
  if (!advertiser) throw new Error("la cuenta no tiene anunciante de Product Ads");

  const campaigns: Campaign[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await get<{ results: Campaign[]; paging: { total: number } }>(
      `/${advertiser.site_id}/advertisers/${advertiser.advertiser_id}/product_ads/campaigns/search?limit=50&offset=${offset}`,
      token,
    );
    campaigns.push(...page.results);
    if (offset + 50 >= page.paging.total) break;
  }

  console.log(`[mercadolibre] ${campaigns.length} campañas, ${from}..${to}`);
  let total = 0;
  for (const campaign of campaigns) {
    const { results } = await get<{ results: DailyMetrics[] }>(
      `/${advertiser.site_id}/product_ads/campaigns/${campaign.id}?date_from=${from}&date_to=${to}&metrics=${METRICS}&aggregation_type=DAILY`,
      token,
    );
    for (const day of results) {
      await pool.query(
        `INSERT INTO mercadolibre_ads_daily
           (date, campaign_id, campaign_name, cost, prints, clicks, direct_amount, indirect_amount, total_amount, units_quantity, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (date, campaign_id) DO UPDATE SET
           campaign_name = EXCLUDED.campaign_name, cost = EXCLUDED.cost, prints = EXCLUDED.prints,
           clicks = EXCLUDED.clicks, direct_amount = EXCLUDED.direct_amount,
           indirect_amount = EXCLUDED.indirect_amount, total_amount = EXCLUDED.total_amount,
           units_quantity = EXCLUDED.units_quantity, updated_at = now()`,
        [
          day.date,
          campaign.id,
          campaign.name,
          day.cost ?? 0,
          day.prints ?? 0,
          day.clicks ?? 0,
          day.direct_amount ?? 0,
          day.indirect_amount ?? 0,
          day.total_amount ?? 0,
          day.units_quantity ?? 0,
        ],
      );
      total++;
    }
  }
  console.log(`[mercadolibre] mercadolibre_ads_daily: ${total} filas upserted`);
}
