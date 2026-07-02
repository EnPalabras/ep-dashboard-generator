import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type CompiledQuery = {
  sql: string;
  paramOrder: string[];
};

// Las queries viven CO-LOCADAS con su dashboard: `dashboards/<slug>.sql`.
// Cada archivo tiene una o más queries separadas por `-- @query <nombre>`.
// La key (y el endpoint) es `<slug>/<nombre>` → /api/q/<slug>/<nombre>.
const DASHBOARDS_DIR = path.resolve(import.meta.dir, "../../../dashboards");
const NAMED_PARAM_RE = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;
const QUERY_MARKER_RE = /^\s*--\s*@query\s+([a-zA-Z0-9_-]+)\s*$/;

function compile(rawSql: string): CompiledQuery {
  const positions = new Map<string, number>();
  const paramOrder: string[] = [];
  const sql = rawSql.replace(NAMED_PARAM_RE, (_, name: string) => {
    let pos = positions.get(name);
    if (pos === undefined) {
      paramOrder.push(name);
      pos = paramOrder.length;
      positions.set(name, pos);
    }
    return `$${pos}`;
  });
  return { sql, paramOrder };
}

function loadAll(): Record<string, CompiledQuery> {
  const out: Record<string, CompiledQuery> = {};
  for (const file of readdirSync(DASHBOARDS_DIR)) {
    if (!file.endsWith(".sql")) continue;
    const slug = file.slice(0, -4);
    const raw = readFileSync(path.join(DASHBOARDS_DIR, file), "utf8");

    let current: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      if (current && buf.join("").trim()) out[`${slug}/${current}`] = compile(buf.join("\n"));
      buf = [];
    };
    for (const line of raw.split("\n")) {
      const m = line.match(QUERY_MARKER_RE);
      if (m) {
        flush();
        current = m[1] ?? null;
      } else {
        buf.push(line);
      }
    }
    flush();
  }
  return out;
}

export const queries = loadAll();

export function buildValues(q: CompiledQuery, params: Record<string, string | undefined>): unknown[] {
  return q.paramOrder.map((name) => params[name]);
}
