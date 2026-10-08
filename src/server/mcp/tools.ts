import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readOnly, TIMEOUT_MS } from "./readonly.ts";
import {
  checkSql, getDashboard, history, listDashboards, publishDashboard, restore, validate, VersionConflict, SLUG_RE,
} from "../dashboards/store.ts";

const ROOT = path.resolve(import.meta.dir, "../../..");
const PUBLIC_URL = process.env.PUBLIC_URL || "https://dash.enpalabras.com.ar";
const MAX_ROWS = Number(process.env.MCP_MAX_ROWS) || 50_000;
const MAX_CHARS = Number(process.env.MCP_MAX_CHARS) || 200_000;

const doc = (name: string) => readFileSync(path.join(ROOT, "docs/conector", name), "utf8");

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });
const fail = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }], isError: true });

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV en vez de JSON: entra el triple de filas en la misma respuesta.
function toCsv(fields: string[], rows: unknown[][], maxRows: number): { csv: string; shown: number } {
  const lines = [fields.map(cell).join(",")];
  let size = lines[0]!.length;
  let shown = 0;
  for (const r of rows) {
    if (shown >= maxRows) break;
    const line = r.map(cell).join(",");
    if (size + line.length + 1 > MAX_CHARS) break;
    lines.push(line);
    size += line.length + 1;
    shown++;
  }
  return { csv: lines.join("\n"), shown };
}

function report(run: Awaited<ReturnType<typeof checkSql>>): string {
  return [
    `Parámetros de prueba: ${JSON.stringify(run.values)}`,
    ...run.results.map((r) =>
      r.ok
        ? `\n✓ ${r.name}: ${r.rows} filas en ${r.ms} ms\n${toCsv(r.fields!, r.sample!, 5).csv}`
        : `\n✗ ${r.name}: ${r.error}`
    ),
  ].join("\n");
}

export function createMcpServer(user: { email: string; name: string }): McpServer {
  const server = new McpServer(
    { name: "en-palabras-datos", version: "1.0.0" },
    {
      instructions:
        "Datos de En Palabras (ventas, pagos, envíos, stock, marketing) en sólo lectura, y publicación de " +
        "dashboards del generador. Antes de consultar llamá a describir_base; antes de armar un dashboard, " +
        "a guia_dashboards. Hablá en castellano.",
    }
  );

  server.registerTool(
    "describir_base",
    {
      title: "Describir la base",
      description:
        "Guía de la base de En Palabras: qué tabla tiene qué, cómo se define una venta y trampas conocidas. " +
        "Sin `tabla` devuelve la guía y la lista de tablas con sus columnas; con `tabla` (ej. 'orders' o " +
        "'analytics.ga4_landing_daily') devuelve tipos de columnas y 5 filas de ejemplo.",
      inputSchema: { tabla: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ tabla }) => {
      if (!tabla) {
        const cols = await readOnly(
          `SELECT table_schema || '.' || table_name, string_agg(column_name, ', ' ORDER BY ordinal_position)
           FROM information_schema.columns WHERE table_schema IN ('public', 'analytics')
           GROUP BY table_schema, table_name ORDER BY 1`
        );
        return text(`${doc("base.md")}\n\n## Tablas y columnas\n\n${cols.rows.map((r) => `- ${r[0]}: ${r[1]}`).join("\n")}`);
      }
      const [schema, table] = tabla.includes(".") ? tabla.split(".") : [null, tabla];
      const cols = await readOnly(
        `SELECT table_schema, column_name, data_type, udt_name, is_nullable FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = coalesce($2, table_schema) AND table_schema IN ('public', 'analytics')
         ORDER BY table_schema, ordinal_position`,
        [table, schema]
      );
      if (cols.rows.length === 0) return fail(`No existe la tabla ${tabla}`);
      const s = String(cols.rows[0]![0]);
      const ident = (x: string) => `"${x.replace(/"/g, '""')}"`;
      const sample = await readOnly(`SELECT * FROM ${ident(s)}.${ident(table!)} LIMIT 5`);
      const desc = cols.rows
        .filter((r) => r[0] === s)
        .map((r) => `- ${r[1]}: ${r[2] === "USER-DEFINED" ? `enum ${r[3]}` : r[2]}${r[4] === "NO" ? " (not null)" : ""}`)
        .join("\n");
      return text(`## ${s}.${table}\n\n${desc}\n\n### Ejemplo\n\n${toCsv(sample.fields, sample.rows, 5).csv}`);
    }
  );

  server.registerTool(
    "consultar",
    {
      title: "Consultar la base",
      description:
        "Corre una consulta SQL (Postgres, una sola sentencia) en sólo lectura sobre la base de v2 y devuelve CSV. " +
        `Corta a los ${TIMEOUT_MS / 1000} s. Devuelve hasta ${MAX_ROWS} filas o ${MAX_CHARS / 1000} mil caracteres: ` +
        "agregá en SQL (por día, semana, canal) en vez de traer filas sueltas.",
      inputSchema: {
        sql: z.string().describe("Una sola sentencia SELECT/WITH"),
        max_filas: z.number().int().positive().optional().describe(`Tope de filas a devolver (máx. ${MAX_ROWS})`),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ sql, max_filas }) => {
      try {
        const r = await readOnly(sql);
        const { csv, shown } = toCsv(r.fields, r.rows, Math.min(max_filas ?? MAX_ROWS, MAX_ROWS));
        const note =
          shown < r.rows.length
            ? `\n\n(Se muestran ${shown} de ${r.rows.length} filas. Agregá en SQL o filtrá para ver el resto.)`
            : "";
        return text(`${r.rows.length} filas en ${r.ms} ms\n\n${csv}${note}`);
      } catch (e: any) {
        return fail(`Error: ${e.message}`);
      }
    }
  );

  server.registerTool(
    "guia_dashboards",
    {
      title: "Guía para armar dashboards",
      description: "Reglas y pasos para armar y publicar un dashboard. Leela antes de escribir uno.",
      annotations: { readOnlyHint: true },
    },
    async () => text(doc("dashboards.md"))
  );

  server.registerTool(
    "listar_dashboards",
    {
      title: "Listar dashboards",
      description: "Dashboards publicados, con autor, versión, última edición y link.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const list = await listDashboards();
      return text(
        list
          .map((d) => {
            const when = (d.updated_at ?? d.created_at) as unknown;
            const day = when instanceof Date ? when.toISOString().slice(0, 10) : String(when).slice(0, 10);
            return `- ${d.title} (${d.slug}, versión ${d.version}), de ${d.author}, ${day}: ${d.description ?? ""}\n  ${PUBLIC_URL}/d/${d.slug}`;
          })
          .join("\n") || "Todavía no hay dashboards."
      );
    }
  );

  server.registerTool(
    "ver_dashboard",
    {
      title: "Ver un dashboard",
      description:
        "Devuelve el HTML, el SQL y la versión vigente de un dashboard, para modificarlo o copiar su estructura. " +
        "Para publicar un cambio, pasá esa versión como `version_base`.",
      inputSchema: { slug: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => {
      const d = SLUG_RE.test(slug) ? await getDashboard(slug) : null;
      if (!d) return fail(`No existe el dashboard ${slug}`);
      return text(
        `# ${d.title} (${d.slug}), versión ${d.version}\n${d.description ?? ""}\n` +
          `Autor: ${d.author}${d.updated_by ? `, última edición de ${d.updated_by}` : ""}\n\n` +
          `## SQL\n\n${d.sql}\n\n## HTML\n\n${d.html}`
      );
    }
  );

  server.registerTool(
    "probar_sql",
    {
      title: "Probar el SQL de un dashboard",
      description:
        "Corre todas las queries (`-- @query <nombre>`) del SQL de un dashboard en sólo lectura y devuelve " +
        "cuántas filas da cada una y las primeras 5. `parametros` reemplaza a :from/:to (últimos 30 días por defecto) y otros.",
      inputSchema: { sql: z.string(), parametros: z.record(z.string(), z.string()).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ sql, parametros }) => {
      const run = await checkSql(sql, parametros ?? {});
      if (run.results.length === 0) return fail("No hay ninguna query: cada una va precedida por `-- @query <nombre>`.");
      return text(report(run));
    }
  );

  server.registerTool(
    "publicar_dashboard",
    {
      title: "Publicar un dashboard",
      description:
        "Valida el dashboard, prueba sus queries y lo publica al instante en " +
        `${PUBLIC_URL}/d/<slug>. Para uno nuevo, version_base = 0. Para cambiar uno existente, ` +
        "version_base = la versión que devolvió ver_dashboard: si alguien publicó otra en el medio, se rechaza para no pisarla.",
      inputSchema: {
        slug: z.string().describe("kebab-case, ej. gasto-semanal-meta"),
        titulo: z.string(),
        descripcion: z.string().describe("Una o dos oraciones: qué muestra y para qué sirve"),
        html: z.string(),
        sql: z.string(),
        version_base: z.number().int().min(0),
        nota: z.string().optional().describe("Qué cambió, para el historial"),
        parametros_prueba: z.record(z.string(), z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ slug, titulo, descripcion, html, sql, version_base, nota, parametros_prueba }) => {
      const problems = validate(slug, html, sql);
      const run = await checkSql(sql, parametros_prueba ?? {});
      for (const r of run.results) if (!r.ok) problems.push(`la query ${r.name} falla: ${r.error}`);
      if (problems.length) return fail(`No se publicó:\n- ${problems.join("\n- ")}`);
      try {
        const version = await publishDashboard({
          slug,
          title: titulo,
          description: descripcion,
          html,
          sql,
          author: user.name || user.email,
          baseVersion: version_base,
          note: nota,
        });
        return text(`Publicado (versión ${version}): ${PUBLIC_URL}/d/${slug}\n\n${report(run)}`);
      } catch (e: any) {
        return fail(e instanceof VersionConflict ? e.message : `No se pudo publicar: ${e.message}`);
      }
    }
  );

  server.registerTool(
    "historial_dashboard",
    {
      title: "Historial de un dashboard",
      description: "Versiones publicadas de un dashboard: quién, cuándo y qué cambió.",
      inputSchema: { slug: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => {
      const rows = await history(slug);
      if (rows.length === 0) return fail(`No hay versiones de ${slug}`);
      return text(rows.map((r) => `- v${r.version} · ${r.created_at.toISOString().slice(0, 16).replace("T", " ")} UTC · ${r.author}${r.note ? ` · ${r.note}` : ""}`).join("\n"));
    }
  );

  server.registerTool(
    "restaurar_version",
    {
      title: "Volver a una versión anterior",
      description: "Vuelve un dashboard a una versión anterior, publicándola como versión nueva (no se pierde nada).",
      inputSchema: { slug: z.string(), version: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ slug, version }) => {
      try {
        const v = await restore(slug, version, user.name || user.email);
        return text(`Listo: ${slug} quedó como la versión ${version} (publicada como versión ${v}). ${PUBLIC_URL}/d/${slug}`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  return server;
}
