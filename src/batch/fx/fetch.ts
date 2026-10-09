import pool from "../../server/db/pool.ts";

const URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/";
const CASAS: Record<string, string> = { bolsa: "mep", contadoconliqui: "ccl" };

type Cotizacion = { casa: string; compra: number | null; venta: number | null; fecha: string };

export async function fetchAndStoreFxRates() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`argentinadatos ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = ((await res.json()) as Cotizacion[]).map((r) => ({ ...r, casa: CASAS[r.casa] ?? r.casa }));

  const CHUNK = 10000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await pool.query(
      `INSERT INTO fx_rates_daily (date, casa, compra, venta)
       SELECT * FROM UNNEST($1::date[], $2::text[], $3::numeric[], $4::numeric[])
       ON CONFLICT (date, casa) DO UPDATE SET
         compra = EXCLUDED.compra, venta = EXCLUDED.venta, updated_at = now()
       WHERE fx_rates_daily.compra IS DISTINCT FROM EXCLUDED.compra
          OR fx_rates_daily.venta IS DISTINCT FROM EXCLUDED.venta`,
      [part.map((r) => r.fecha), part.map((r) => r.casa), part.map((r) => r.compra), part.map((r) => r.venta)],
    );
  }
  console.log(`[fx] ${rows.length} cotizaciones upserted`);
}
