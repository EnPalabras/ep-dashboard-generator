const META_API_VERSION = "v25.0";
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
  // Rankings (solo nivel anuncio; suelen venir "UNKNOWN" en anuncios de bajo volumen)
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  buying_type?: string;
  cost_per_action_type?: MetaAction[];
  website_purchase_roas?: MetaAction[];
}

/** Insight con breakdown por plataforma/posición (publisher_platform × platform_position). */
export interface MetaPlatformInsight {
  campaign_id: string;
  adset_id?: string;
  ad_id?: string;
  date_start: string;
  publisher_platform?: string;
  platform_position?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
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

/**
 * Métricas derivadas de los arrays actions/action_values/cost_per_action_type.
 * Strings de action_type validados contra la API (ver probe jun 2026).
 * `purchase` (web/pixel) se guarda SEPARADO de `omni_purchase` (todas las superficies)
 * para no mezclar dos números distintos.
 */
export interface ExtractedMetrics {
  omni_purchase: number;
  omni_purchase_value: number;
  purchase: number;
  purchase_value: number;
  add_to_cart: number;
  initiate_checkout: number;
  view_content: number;
  landing_page_view: number;
  post_save: number;
  comment: number;
  link_click: number;
  shares: number;
  post_reaction: number;
  messaging_first_reply: number;
  messaging_started: number;
  cpa_purchase: number;
  website_purchase_roas: number;
}

export function extractMetrics(row: {
  actions?: MetaAction[];
  action_values?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  website_purchase_roas?: MetaAction[];
}): ExtractedMetrics {
  const a = row.actions;
  const v = row.action_values;
  const c = row.cost_per_action_type;
  return {
    omni_purchase: pickAction(a, "omni_purchase"),
    omni_purchase_value: pickAction(v, "omni_purchase"),
    purchase: pickAction(a, "purchase"),
    purchase_value: pickAction(v, "purchase"),
    add_to_cart: pickAction(a, "add_to_cart"),
    initiate_checkout: pickAction(a, "initiate_checkout"),
    view_content: pickAction(a, "view_content"),
    landing_page_view: pickAction(a, "landing_page_view"),
    post_save: pickAction(a, "onsite_conversion.post_save"),
    comment: pickAction(a, "comment"),
    link_click: pickAction(a, "link_click"),
    shares: pickAction(a, "post"),
    post_reaction: pickAction(a, "post_reaction"),
    messaging_first_reply: pickAction(a, "onsite_conversion.messaging_first_reply"),
    messaging_started: pickAction(a, "onsite_conversion.messaging_conversation_started_7d"),
    cpa_purchase: pickAction(c, "omni_purchase") || pickAction(c, "purchase"),
    website_purchase_roas: pickRoas(row.website_purchase_roas),
  };
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
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
    "buying_type",
    "cost_per_action_type",
    "website_purchase_roas",
    // OJO: NO agregar "attribution_setting" — Meta deja de devolver impressions/clicks/actions
    // si se pide junto a las métricas. Validado contra la API (jun 2026).
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
 * Insights a nivel anuncio CON breakdown por plataforma y posición.
 * Tabla aparte (meta_platform_insights): el reach NO se puede sumar entre
 * plataformas (Meta lo deduplica), por eso no va en la tabla de totales.
 */
export async function fetchPlatformInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<MetaPlatformInsight[]> {
  const fields = [
    "campaign_id",
    "adset_id",
    "ad_id",
    "spend",
    "impressions",
    "clicks",
    "reach",
    "frequency",
    "ctr",
    "cpm",
    "cpc",
    "actions",
    "action_values",
  ].join(",");

  const url =
    `${BASE_URL}/act_${adAccountId}/insights?` +
    new URLSearchParams({
      fields,
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      time_increment: "1",
      level: "ad",
      breakdowns: "publisher_platform,platform_position",
      limit: "500",
      access_token: accessToken,
    }).toString();

  return fetchAllPages<MetaPlatformInsight>(url);
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
