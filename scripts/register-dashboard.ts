import "dotenv/config";
import pool from "../src/server/db/pool.ts";

function usage(): never {
  console.error("Uso: bun run dashboard:register <slug> <title> <author> <description> [file]");
  console.error("");
  console.error("Ejemplo:");
  console.error('  bun run dashboard:register meta-weekly "Gasto Semanal Meta" "Tomás" "Spend semanal de los últimos 3 meses"');
  console.error("");
  console.error("Si no se pasa <file>, se usa <slug>.html");
  process.exit(1);
}

async function main() {
  const [slug, title, author, description, fileArg] = process.argv.slice(2);

  if (!slug || !title || !author || !description) usage();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error(`[register-dashboard] slug inválido: "${slug}" (sólo a-z, 0-9 y guiones)`);
    process.exit(1);
  }

  const file = fileArg ?? `${slug}.html`;

  const result = await pool.query(
    `INSERT INTO dashboards (slug, title, author, description, file, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
     ON CONFLICT (slug) DO UPDATE
       SET title = EXCLUDED.title,
           author = EXCLUDED.author,
           description = EXCLUDED.description,
           file = EXCLUDED.file
     RETURNING (xmax = 0) AS inserted`,
    [slug, title, author, description, file]
  );

  const inserted = result.rows[0]?.inserted;
  console.log(`[register-dashboard] ${inserted ? "creado" : "actualizado"}: ${slug} → ${file}`);

  await pool.end();
}

main().catch((err) => {
  console.error("[register-dashboard] error:", err.message);
  process.exit(1);
});
