export type CompiledQuery = {
  sql: string;
  paramOrder: string[];
};

// Cada dashboard tiene un SQL con una o más queries separadas por `-- @query <nombre>`, que el
// HTML pide a /api/q/<slug>/<nombre>. Los parámetros van con nombre (`:from`) y salen del query string.
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

export function parseSqlFile(raw: string): Record<string, CompiledQuery> {
  const out: Record<string, CompiledQuery> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current && buf.join("").trim()) out[current] = compile(buf.join("\n"));
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
  return out;
}

export function buildValues(q: CompiledQuery, params: Record<string, string | undefined>): unknown[] {
  return q.paramOrder.map((name) => params[name]);
}
