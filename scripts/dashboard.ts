import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import pool from "../src/server/db/pool.ts";
import { checkSql, getDashboard, publishDashboard, validate, SLUG_RE } from "../src/server/dashboards/store.ts";

// Los dashboards viven en la base. Este script es el camino desde el repo (el otro es el conector de Claude):
//   bun run dashboard pull <slug>                                  -> dashboards/<slug>.html + .sql para editar
//   bun run dashboard check <slug> [from=.. to=..]                 -> prueba las queries del .sql local
//   bun run dashboard publish <slug> "<título>" "<descripción>" [nota] [--autor=Nombre]
// dashboards/ está en .gitignore: es una copia de trabajo, no la fuente.

const DIR = path.resolve(import.meta.dir, "../dashboards");
const [cmd, slug, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const args = rest.filter((a) => !a.startsWith("--"));
const file = (ext: string) => path.join(DIR, `${slug}.${ext}`);
const versionFile = () => path.join(DIR, `.${slug}.version`);

function usage(): never {
  console.error("Uso: bun run dashboard <pull|check|publish> <slug> …  (ver scripts/dashboard.ts)");
  process.exit(1);
}

async function main() {
  if (!cmd || !slug || !SLUG_RE.test(slug)) usage();
  mkdirSync(DIR, { recursive: true });

  if (cmd === "pull") {
    const d = await getDashboard(slug);
    if (!d) throw new Error(`No existe el dashboard ${slug}`);
    writeFileSync(file("html"), d.html!);
    writeFileSync(file("sql"), d.sql!);
    writeFileSync(versionFile(), String(d.version));
    console.log(`✓ ${slug} versión ${d.version} en dashboards/ («${d.title}»: ${d.description ?? ""})`);
    return;
  }

  const sql = readFileSync(file("sql"), "utf8");
  if (cmd === "check") {
    const params = Object.fromEntries(args.map((kv) => kv.split("=")));
    const run = await checkSql(sql, params);
    for (const r of run.results) console.log(r.ok ? `✓ ${r.name}: ${r.rows} filas en ${r.ms} ms` : `✗ ${r.name}: ${r.error}`);
    if (run.results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }

  if (cmd === "publish") {
    const [title, description, note] = args;
    if (!title || !description) usage();
    const html = readFileSync(file("html"), "utf8");
    const problems = validate(slug, html, sql);
    const run = await checkSql(sql);
    for (const r of run.results) if (!r.ok) problems.push(`la query ${r.name} falla: ${r.error}`);
    if (problems.length) throw new Error(`No se publicó:\n- ${problems.join("\n- ")}`);
    const baseVersion = existsSync(versionFile()) ? Number(readFileSync(versionFile(), "utf8")) : 0;
    const author = flags.autor || execSync("git config user.name").toString().trim();
    const version = await publishDashboard({ slug, title, description, html, sql, author, baseVersion, note });
    writeFileSync(versionFile(), String(version));
    console.log(`✓ publicado ${slug} versión ${version}`);
    return;
  }
  usage();
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
