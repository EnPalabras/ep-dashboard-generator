import pool from "../db/pool.ts";
import { parseSqlFile, buildValues, type CompiledQuery } from "../queries/index.ts";
import { readOnly } from "../mcp/readonly.ts";

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Dashboard {
  slug: string;
  title: string;
  author: string;
  description: string | null;
  html: string | null;
  sql: string | null;
  version: number;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
}


export async function listDashboards(): Promise<Omit<Dashboard, "html" | "sql">[]> {
  const { rows } = await pool.query(
    `SELECT slug, title, author, description, version, created_at, updated_at, updated_by
     FROM analytics.dashboards WHERE html IS NOT NULL ORDER BY coalesce(updated_at, created_at) DESC`
  );
  return rows;
}

export async function getDashboard(slug: string): Promise<Dashboard | null> {
  const { rows } = await pool.query("SELECT * FROM analytics.dashboards WHERE slug = $1 AND html IS NOT NULL", [slug]);
  return rows[0] ?? null;
}

const queryCache = new Map<string, { at: number; version: number; queries: Record<string, CompiledQuery> }>();

// Las queries se compilan una vez por versión; la versión vigente se re-chequea cada 10 s.
export async function getQuery(slug: string, name: string): Promise<CompiledQuery | null> {
  let hit = queryCache.get(slug);
  if (!hit || Date.now() - hit.at > 10_000) {
    const { rows } = await pool.query("SELECT version, sql FROM analytics.dashboards WHERE slug = $1", [slug]);
    const row = rows[0];
    if (!row?.sql) return null;
    hit = hit && hit.version === row.version ? { ...hit, at: Date.now() } : { at: Date.now(), version: row.version, queries: parseSqlFile(row.sql) };
    queryCache.set(slug, hit);
  }
  return hit.queries[name] ?? null;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export interface QueryCheck {
  name: string;
  ok: boolean;
  rows?: number;
  ms?: number;
  fields?: string[];
  sample?: unknown[][];
  error?: string;
}

export async function checkSql(sql: string, params: Record<string, string> = {}) {
  const values = { from: daysAgo(30), to: daysAgo(0), ...params };
  const results: QueryCheck[] = [];
  for (const [name, q] of Object.entries(parseSqlFile(sql))) {
    try {
      const r = await readOnly(q.sql, buildValues(q, values));
      results.push({ name, ok: true, rows: r.rows.length, ms: r.ms, fields: r.fields, sample: r.rows.slice(0, 5) });
    } catch (e: any) {
      results.push({ name, ok: false, error: e.message });
    }
  }
  return { values, results };
}

export function validate(slug: string, html: string, sql: string): string[] {
  const problems: string[] = [];
  if (!SLUG_RE.test(slug)) problems.push("slug inválido: sólo minúsculas, números y guiones");
  if (!/<html[\s>]/i.test(html)) problems.push("el HTML no es una página completa (falta <html>)");
  if (!html.includes("/assets/dashboard-base.css")) problems.push('falta <link rel="stylesheet" href="/assets/dashboard-base.css">');
  if (!html.includes('class="back"')) problems.push('falta el link de vuelta <nav class="back"><a href="/">…</a></nav>');
  const queries = parseSqlFile(sql);
  if (Object.keys(queries).length === 0) problems.push("el SQL no tiene queries: cada una va precedida por `-- @query <nombre>`");
  const used = [...html.matchAll(/\/api\/q\/([a-z0-9-]+)\/([a-zA-Z0-9_-]*)/g)];
  if (!used.some(([, s]) => s === slug)) problems.push(`el HTML no pide datos a /api/q/${slug}/<query>`);
  for (const [, s, q] of used) {
    if (s !== slug) problems.push(`el HTML pide /api/q/${s}/… pero el dashboard es ${slug}`);
    else if (q && !queries[q]) problems.push(`el HTML usa la query "${q}" que no está en el SQL`);
  }
  return problems;
}

export class VersionConflict extends Error {}

export interface PublishInput {
  slug: string;
  title: string;
  description: string;
  html: string;
  sql: string;
  author: string;
  baseVersion: number;
  note?: string;
}

// Publica en una transacción. `baseVersion` es la versión sobre la que se trabajó (0 si es nuevo):
// si en el medio alguien publicó otra, se rechaza en vez de pisarla.
export async function publishDashboard(input: PublishInput): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT version FROM analytics.dashboards WHERE slug = $1 FOR UPDATE", [input.slug]);
    const current: number = rows[0]?.version ?? 0;
    if (current !== input.baseVersion) {
      throw new VersionConflict(
        input.baseVersion === 0
          ? `Ya existe un dashboard "${input.slug}" (versión ${current}). Traelo con ver_dashboard y publicá sobre esa versión, o usá otro slug.`
          : `El dashboard "${input.slug}" cambió: estás sobre la versión ${input.baseVersion} y la vigente es la ${current}. Traé la vigente con ver_dashboard y aplicá tus cambios encima.`
      );
    }
    const version = current + 1;
    await client.query(
      `INSERT INTO analytics.dashboards (slug, title, author, description, html, sql, version, updated_at, updated_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $3, CURRENT_DATE)
       ON CONFLICT (slug) DO UPDATE SET title = $2, description = $4, html = $5, sql = $6, version = $7,
         updated_at = now(), updated_by = $3`,
      [input.slug, input.title, input.author, input.description, input.html, input.sql, version]
    );
    await client.query(
      `INSERT INTO analytics.dashboard_versions (slug, version, title, description, html, sql, author, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [input.slug, version, input.title, input.description, input.html, input.sql, input.author, input.note ?? null]
    );
    await client.query("COMMIT");
    queryCache.delete(input.slug);
    return version;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function history(slug: string) {
  const { rows } = await pool.query(
    "SELECT version, title, author, note, created_at FROM analytics.dashboard_versions WHERE slug = $1 ORDER BY version DESC",
    [slug]
  );
  return rows as { version: number; title: string; author: string; note: string | null; created_at: Date }[];
}

export async function restore(slug: string, version: number, author: string): Promise<number> {
  const { rows } = await pool.query("SELECT * FROM analytics.dashboard_versions WHERE slug = $1 AND version = $2", [slug, version]);
  const v = rows[0];
  if (!v) throw new Error(`No existe la versión ${version} de ${slug}`);
  const current = await getDashboard(slug);
  return publishDashboard({
    slug,
    title: v.title,
    description: v.description,
    html: v.html,
    sql: v.sql,
    author,
    baseVersion: current?.version ?? 0,
    note: `Vuelta a la versión ${version}`,
  });
}
