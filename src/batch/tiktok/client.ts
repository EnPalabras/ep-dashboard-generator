// Cliente TikTok Business API (report/integrated/get). Fetch plano, sin SDK.
// Portado/adaptado del PoC de server_en_palabras (branch feat-TikTok-Ads-Integration).

const BASE = "https://business-api.tiktok.com/open_api/v1.3/";

export interface TikTokCreds {
  token: string;
  advertiserId: string;
}

export function tiktokCredsFromEnv(): TikTokCreds | null {
  const token = process.env.TIKTOK_ACCESS_TOKEN?.trim();
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  if (!token || !advertiserId) return null;
  return { token, advertiserId };
}

export type TikTokRow = { dimensions: Record<string, string>; metrics: Record<string, string> };

/**
 * Corre un BASIC report a nivel anuncio (AUCTION_AD) para un rango, paginando.
 * TikTok limita el rango por request; el caller debe trocear (<=30 días).
 * Devuelve filas crudas { dimensions, metrics }.
 */
export async function getBasicAdReport(
  creds: TikTokCreds,
  dimensions: string[],
  metrics: string[],
  startDate: string,
  endDate: string
): Promise<TikTokRow[]> {
  const out: TikTokRow[] = [];
  let page = 1;
  for (;;) {
    const params: Record<string, string | number> = {
      advertiser_id: creds.advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_AD",
      dimensions: JSON.stringify(dimensions),
      metrics: JSON.stringify(metrics),
      page,
      page_size: 1000,
      start_date: startDate,
      end_date: endDate,
    };
    // TikTok espera los arrays JSON sin URL-encode adicional (matchea el PoC que funcionó).
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&");
    const res = await fetch(BASE + "report/integrated/get/?" + qs, {
      headers: { "Access-Token": creds.token, "Content-Type": "application/json" },
    });
    const json = (await res.json()) as any;
    if (!res.ok || json.code !== 0) {
      throw new Error(`TikTok API error (http ${res.status}, code ${json.code}): ${json.message}`);
    }
    const list: TikTokRow[] = json.data?.list ?? [];
    out.push(...list);
    const totalPage = json.data?.page_info?.total_page ?? 1;
    if (page >= totalPage || list.length === 0) break;
    page++;
  }
  return out;
}
