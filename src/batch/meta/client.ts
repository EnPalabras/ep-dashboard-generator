const META_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start: string;
  spend: string;
  impressions: string;
  clicks: string;
  conversions?: { action_type: string; value: number }[];
  reach: string;
  cpm: string;
  cpp: string;
  ctr: string;
  cpc: string;
  objective: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
}

export interface MetaAccountInsight {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  purchase_roas?: MetaAction[];
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

export interface MetaAdEntity {
  id: string;
  name?: string;
  campaign_id?: string;
  adset_id?: string;
  effective_status?: string;
  campaign?: { name?: string };
}

export function pickAction(arr: MetaAction[] | undefined, type: string): number {
  return Number(arr?.find((a) => a.action_type === type)?.value) || 0;
}

/** ROAS de compra: preferimos omni_purchase, si no el primer elemento disponible. */
export function pickRoas(arr: MetaAction[] | undefined): number {
  if (!arr || arr.length === 0) return 0;
  const entry = arr.find((a) => a.action_type === "omni_purchase") ?? arr[0];
  return Number(entry?.value) || 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRANSIENT_CODES = new Set([4, 17, 32, 613, 80000, 80004]);

async function fetchPage(url: string, maxRetries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();

    const body = await response.text();
    let code: number | undefined;
    let transient = false;
    try {
      const err = JSON.parse(body)?.error;
      code = err?.code;
      transient = err?.is_transient === true || (code !== undefined && TRANSIENT_CODES.has(code));
    } catch {
      // body no-JSON: tratamos 429/5xx como transitorios
      transient = response.status === 429 || response.status >= 500;
    }

    if (!transient || attempt >= maxRetries) {
      throw new Error(`Meta API error ${response.status}: ${body}`);
    }

    const waitMs = 5000 * 2 ** attempt; // 5s, 10s, 20s, 40s
    console.log(`[meta] transient error (code ${code}); retry ${attempt + 1}/${maxRetries} in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  let page = 1;
  while (next) {
    console.log("fetching page", page);
    const json = (await fetchPage(next)) as { data?: T[]; paging?: { next?: string } };
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
    page++;
  }
  return out;
}

export async function fetchCampaignInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<MetaInsight[]> {
  const fields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "clicks",
    "conversions",
    "reach",
    "cpm",
    "cpp",
    "ctr",
    "cpc",
    "objective",
    "frequency",
    "actions",
    "action_values",
    "purchase_roas",
  ].join(",");

  const url =
    `${BASE_URL}/act_${adAccountId}/insights?` +
    new URLSearchParams({
      fields,
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      time_increment: "1",
      level: "ad",
      limit: "500",
      access_token: accessToken,
    }).toString();

  return fetchAllPages<MetaInsight>(url);
}

/**
 * Insights a nivel CUENTA.
 * - daily=true  -> una fila por día (time_increment=1), para meta_account_daily.
 * - daily=false -> una sola fila agregada del período, para meta_account_totals
 *   (reach/frequency desduplicados sobre toda la ventana).
 */
export async function fetchAccountInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
  daily: boolean
): Promise<MetaAccountInsight[]> {
  const fields = [
    "spend",
    "impressions",
    "reach",
    "frequency",
    "ctr",
    "cpm",
    "purchase_roas",
    "actions",
    "action_values",
  ].join(",");

  const params: Record<string, string> = {
    fields,
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    level: "account",
    limit: "500",
    access_token: accessToken,
  };
  if (daily) params.time_increment = "1";

  const url = `${BASE_URL}/act_${adAccountId}/insights?` + new URLSearchParams(params).toString();
  return fetchAllPages<MetaAccountInsight>(url);
}

/** Lista de anuncios con su effective_status (endpoint /ads, no /insights). */
export async function fetchAdEntities(
  adAccountId: string,
  accessToken: string
): Promise<MetaAdEntity[]> {
  const url =
    `${BASE_URL}/act_${adAccountId}/ads?` +
    new URLSearchParams({
      fields: "id,name,campaign_id,campaign{name},adset_id,effective_status",
      limit: "500",
      access_token: accessToken,
    }).toString();

  return fetchAllPages<MetaAdEntity>(url);
}
