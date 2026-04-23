const META_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

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
}

interface MetaApiResponse {
  data: MetaInsight[];
  paging?: {
    cursors: { after: string };
    next?: string;
  };
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
  ].join(",");

  const allInsights: MetaInsight[] = [];
  let url: string | null =
    `${BASE_URL}/act_${adAccountId}/insights?` +
    new URLSearchParams({
      fields,
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      time_increment: "1",
      level: "ad",
      limit: "500",
      access_token: accessToken,
    }).toString();

  let page = 1;
  while (url) {
    console.log("fetching page", page);
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta API error ${response.status}: ${body}`);
    }

    const json = await response.json() as MetaApiResponse;
    allInsights.push(...json.data);

    url = json.paging?.next ?? null;
    page++;
  }

  return allInsights;
}
