import { getAccessToken } from "../ga4/client.ts";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ROW_LIMIT = 25000;

export interface GscCredentials {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
}

export function gscCredsFromEnv(): GscCredentials | null {
  const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey, siteUrl: process.env.GSC_SITE_URL || "sc-domain:enpalabras.com.ar" };
}

export type GscDimension = "date" | "query" | "page" | "country" | "device";
export type GscSearchType = "web" | "image";

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function querySearchAnalytics(
  creds: GscCredentials,
  req: { startDate: string; endDate: string; dimensions: GscDimension[]; type: GscSearchType },
): Promise<GscRow[]> {
  const token = await getAccessToken(creds.clientEmail, creds.privateKey, SCOPE);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(creds.siteUrl)}/searchAnalytics/query`;
  const out: GscRow[] = [];
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, rowLimit: ROW_LIMIT, startRow }),
    });
    if (!res.ok) throw new Error(`GSC error ${res.status}: ${await res.text()}`);
    const rows = ((await res.json()) as { rows?: GscRow[] }).rows ?? [];
    out.push(...rows);
    if (rows.length < ROW_LIMIT) return out;
  }
}
