import { createSign } from "node:crypto";

// Cliente GA4 (Google Analytics Data API v1beta, método runReport).
// Auth: firmamos un JWT con la private key de la service account y lo canjeamos
// por un access token en el endpoint OAuth de Google. Sin dependencias nuevas
// (mismo espíritu "fetch puro" que el cliente de Meta).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface GA4Credentials {
  clientEmail: string;
  privateKey: string;
  propertyId: string;
}

/** Lee credenciales del entorno (mismos nombres que el otro repo). */
export function ga4CredsFromEnv(): GA4Credentials | null {
  const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL;
  const propertyId = process.env.GA_PROPERTY_ID;
  // Las private keys en .env suelen venir con "\n" literales: los volvemos saltos reales.
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey || !propertyId) return null;
  return { clientEmail, privateKey, propertyId };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Firma un JWT y lo canjea por un access token de corta vida (~1h). */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`GA4 token error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("GA4 token response sin access_token");
  return json.access_token;
}

interface RunReportRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface RunReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: RunReportRow[];
  rowCount?: number;
}

export interface ReportRequest {
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  /** Filtro de dimensión GA4 crudo (ej. eventName inListFilter). */
  dimensionFilter?: unknown;
}

/**
 * Una fila aplanada: { date, sessionSource, ..., sessions, ... } con los nombres
 * de dimensión/métrica tal cual GA4. Los valores vienen siempre como string.
 */
export type FlatRow = Record<string, string>;

/** Corre un runReport y devuelve filas aplanadas, paginando por offset. */
export async function runReport(creds: GA4Credentials, req: ReportRequest): Promise<FlatRow[]> {
  const token = await getAccessToken(creds.clientEmail, creds.privateKey);
  const url = `${DATA_API}/properties/${creds.propertyId}:runReport`;
  const pageSize = 100000; // máx permitido: 250k; 100k sobra para datos a nivel cuenta/día
  const out: FlatRow[] = [];
  let offset = 0;

  for (;;) {
    const body = {
      dateRanges: [{ startDate: req.startDate, endDate: req.endDate }],
      dimensions: req.dimensions.map((name) => ({ name })),
      metrics: req.metrics.map((name) => ({ name })),
      limit: String(pageSize),
      offset: String(offset),
      keepEmptyRows: false,
      ...(req.dimensionFilter ? { dimensionFilter: req.dimensionFilter } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`GA4 runReport error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as RunReportResponse;
    const dimNames = json.dimensionHeaders?.map((h) => h.name) ?? [];
    const metNames = json.metricHeaders?.map((h) => h.name) ?? [];

    for (const row of json.rows ?? []) {
      const flat: FlatRow = {};
      dimNames.forEach((n, i) => (flat[n] = row.dimensionValues?.[i]?.value ?? ""));
      metNames.forEach((n, i) => (flat[n] = row.metricValues?.[i]?.value ?? "0"));
      out.push(flat);
    }

    const total = json.rowCount ?? out.length;
    offset += pageSize;
    if (offset >= total || (json.rows?.length ?? 0) === 0) break;
  }

  return out;
}

/** GA4 devuelve `date` como "YYYYMMDD" (sin guiones). Lo pasamos a "YYYY-MM-DD". */
export function ga4DateToISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export interface FunnelStep {
  step_order: number;
  step_name: string;
  active_users: number;
  completion_rate: number;
  abandonments: number;
  abandonment_rate: number;
}

interface FunnelResponse {
  funnelTable?: { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
}

/**
 * runFunnelReport (v1alpha) para un embudo de pasos. `steps` es el array de pasos
 * en formato GA4 (funnelEventFilter). Devuelve una fila por paso, en orden.
 */
export async function runFunnelReport(
  creds: GA4Credentials,
  startDate: string,
  endDate: string,
  steps: unknown[]
): Promise<FunnelStep[]> {
  const token = await getAccessToken(creds.clientEmail, creds.privateKey);
  const url = `https://analyticsdata.googleapis.com/v1alpha/properties/${creds.propertyId}:runFunnelReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dateRanges: [{ startDate, endDate }], funnel: { steps } }),
  });
  if (!res.ok) throw new Error(`GA4 runFunnelReport error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as FunnelResponse;
  const rows = json.funnelTable?.rows ?? [];
  return rows.map((row, i) => {
    const stepName = (row.dimensionValues?.[0]?.value ?? "").replace(/^\d+\.\s*/, "");
    const mv = (row.metricValues ?? []).map((m) => m.value);
    return {
      step_order: i + 1,
      step_name: stepName,
      active_users: parseInt(mv[0] ?? "0", 10) || 0,
      completion_rate: mv[1] != null ? parseFloat(mv[1]) : 0,
      abandonments: parseInt(mv[2] ?? "0", 10) || 0,
      abandonment_rate: mv[3] != null ? parseFloat(mv[3]) : 0,
    };
  });
}
