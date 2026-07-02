import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type CompiledQuery = {
  sql: string;
  paramOrder: string[];
  /** Fuente de datos: "analytics" = pool read-only a server_en_palabras; si no, pool primario. */
  datasource: "primary" | "analytics";
};

const QUERIES_DIR = import.meta.dir;
const NAMED_PARAM_RE = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;
// Directiva opcional en la 1ra línea del .sql: `-- @db analytics`
const DATASOURCE_RE = /--\s*@db\s+(analytics|primary)\b/i;

function compile(rawSql: string): CompiledQuery {
  const positions = new Map<string, number>();
  const paramOrder: string[] = [];
  const datasource: "primary" | "analytics" =
    rawSql.match(DATASOURCE_RE)?.[1]?.toLowerCase() === "analytics" ? "analytics" : "primary";
  const sql = rawSql.replace(NAMED_PARAM_RE, (_, name: string) => {
    let pos = positions.get(name);
    if (pos === undefined) {
      paramOrder.push(name);
      pos = paramOrder.length;
      positions.set(name, pos);
    }
    return `$${pos}`;
  });
  return { sql, paramOrder, datasource };
}

function loadAll(): Record<string, CompiledQuery> {
  const out: Record<string, CompiledQuery> = {};
  for (const file of readdirSync(QUERIES_DIR)) {
    if (!file.endsWith(".sql")) continue;
    const name = file.slice(0, -4);
    const raw = readFileSync(path.join(QUERIES_DIR, file), "utf8");
    out[name] = compile(raw);
  }
  return out;
}

export const queries = loadAll();

export function buildValues(q: CompiledQuery, params: Record<string, string | undefined>): unknown[] {
  return q.paramOrder.map((name) => params[name]);
}
