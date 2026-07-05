import pool from "../../server/db/pool.ts";
import { ga4CredsFromEnv, runReport, runFunnelReport, ga4DateToISO, type GA4Credentials } from "../ga4/client.ts";

// Portado de server_en_palabras (crons/analytics + lib/google-analytics/ga4-sync).
// Alimenta las tablas EXISTENTES del schema analytics que consume Metabase:
//   sessions_per_month, events_per_month_page, users_cr_by_product, checkout_dropoff_funnel.
// (ep_analytics necesita INSERT/UPDATE en esas tablas — ver grant en CLAUDE.md.)

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function getMonday(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}
function currentMonth() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth(), 1);
  return { startDate: fmt(start), endDate: fmt(n), monthDate: start };
}
function previousMonth() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const end = new Date(n.getFullYear(), n.getMonth(), 0);
  return { startDate: fmt(start), endDate: fmt(end), monthDate: start };
}
function currentWeek() {
  const monday = getMonday(new Date());
  return { startDate: fmt(monday), endDate: fmt(new Date()), weekStart: monday };
}
function previousWeek() {
  const thisMon = getMonday(new Date());
  const prevMon = new Date(thisMon);
  prevMon.setDate(prevMon.getDate() - 7);
  const prevSun = new Date(prevMon);
  prevSun.setDate(prevSun.getDate() + 6);
  return { startDate: fmt(prevMon), endDate: fmt(prevSun), weekStart: prevMon };
}
function last3Days() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 2);
  return { startDate: fmt(start), endDate: fmt(end) };
}

const DROPOFF_FUNNEL_STEPS = [
  { name: "Begin Checkout", isDirectlyFollowedBy: false, filterExpression: { funnelEventFilter: { eventName: "begin_checkout" } } },
  { name: "Add Shipping Info", isDirectlyFollowedBy: false, filterExpression: { funnelEventFilter: { eventName: "add_shipping_info" } } },
  { name: "Add Payment Info", isDirectlyFollowedBy: false, filterExpression: { funnelEventFilter: { eventName: "add_payment_info" } } },
  { name: "Purchase", isDirectlyFollowedBy: false, filterExpression: { funnelEventFilter: { eventName: "purchase" } } },
];

// Combos: su itemId se reparte a los product_ids componentes.
const comboToProducts: Record<string, string[]> = {
  "1347648867": ["1327904777", "402591340"],
  "1347643601": ["1327904777", "338910912"],
  "1332794005": ["955474606", "1072005648"],
  "1041464813": ["402591340", "338910912"],
  "1347651034": ["1327904777", "402591340", "338910912"],
  "1042122704": ["338910912", "779165785"],
  "1219178918": ["402591340", "1202482306"],
  "1042075783": ["1327904777", "338910912", "955474606"],
  "1042120673": ["338910912", "955474606"],
  "773765046": ["779165785"],
};

const CVR_EVENTS = ["view_item", "add_to_cart", "purchase"];

export async function fetchAndStoreGA4Reports() {
  const creds = ga4CredsFromEnv();
  if (!creds) throw new Error("GA_* (service account) requeridas para GA4 reports");

  await storeSessions(creds, currentMonth());
  if (new Date().getDate() === 1) await storeSessions(creds, previousMonth()); // cerrar mes

  try {
    await storeFunnel(creds, currentWeek());
    if (new Date().getDay() === 1) await storeFunnel(creds, previousWeek()); // cerrar semana
  } catch (e: any) { console.error("[ga4-reports] funnel failed:", e.message); }

  try { await storeCRByProduct(creds); } catch (e: any) { console.error("[ga4-reports] cr-by-product failed:", e.message); }
  try { await storeEventsPerMonthPage(creds, previousMonth()); } catch (e: any) { console.error("[ga4-reports] events-per-page failed:", e.message); }
}

async function storeSessions(creds: GA4Credentials, r: { startDate: string; endDate: string; monthDate: Date }) {
  const rows = await runReport(creds, { dimensions: [], metrics: ["sessions", "totalUsers", "activeUsers"], startDate: r.startDate, endDate: r.endDate });
  const row = rows[0] ?? {};
  const num = (s?: string) => Number(s) || 0;
  await pool.query(
    `INSERT INTO analytics.sessions_per_month (month, sessions, total_users, active_users, synced_at)
     VALUES ($1::date, $2, $3, $4, now())
     ON CONFLICT (month) DO UPDATE SET
       sessions = EXCLUDED.sessions, total_users = EXCLUDED.total_users,
       active_users = EXCLUDED.active_users, synced_at = EXCLUDED.synced_at`,
    [fmt(r.monthDate), num(row.sessions), num(row.totalUsers), num(row.activeUsers)]
  );
  console.log(`[ga4-reports] sessions_per_month ${fmt(r.monthDate).slice(0, 7)}: ${num(row.sessions)} sesiones`);
}

async function storeEventsPerMonthPage(creds: GA4Credentials, r: { startDate: string; endDate: string; monthDate: Date }) {
  const rows = await runReport(creds, { dimensions: ["eventName", "pageTitle"], metrics: ["eventCount"], startDate: r.startDate, endDate: r.endDate });
  if (rows.length === 0) return;
  const month = fmt(new Date(r.monthDate.getFullYear(), r.monthDate.getMonth(), 1));
  const B = 1000;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    const ph = batch.map((_, j) => `($${j * 4 + 1}::date, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}::int, now())`).join(", ");
    const vals = batch.flatMap((x) => [month, x.eventName || "", x.pageTitle || "", Number(x.eventCount) || 0]);
    await pool.query(
      `INSERT INTO analytics.events_per_month_page (month, event_name, page_title, event_count, synced_at)
       VALUES ${ph}
       ON CONFLICT (month, event_name, page_title) DO UPDATE SET
         event_count = EXCLUDED.event_count, synced_at = EXCLUDED.synced_at`,
      vals
    );
  }
  console.log(`[ga4-reports] events_per_month_page ${month.slice(0, 7)}: ${rows.length} filas`);
}

async function storeFunnel(creds: GA4Credentials, w: { startDate: string; endDate: string; weekStart: Date }) {
  const steps = await runFunnelReport(creds, w.startDate, w.endDate, DROPOFF_FUNNEL_STEPS);
  for (const s of steps) {
    await pool.query(
      `INSERT INTO analytics.checkout_dropoff_funnel
         (week_start_date, step_order, step_name, active_users, completion_rate, abandonments, abandonment_rate, synced_at)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (week_start_date, step_order) DO UPDATE SET
         step_name = EXCLUDED.step_name, active_users = EXCLUDED.active_users,
         completion_rate = EXCLUDED.completion_rate, abandonments = EXCLUDED.abandonments,
         abandonment_rate = EXCLUDED.abandonment_rate, synced_at = EXCLUDED.synced_at`,
      [fmt(w.weekStart), s.step_order, s.step_name, s.active_users, s.completion_rate, s.abandonments, s.abandonment_rate]
    );
  }
  console.log(`[ga4-reports] checkout_dropoff_funnel semana ${fmt(w.weekStart)}: ${steps.length} pasos`);
}

async function storeCRByProduct(creds: GA4Credentials) {
  const { startDate, endDate } = last3Days();
  const parsed = await pool.query(`SELECT variant, producto FROM public.productsparsed WHERE producto IS NOT NULL`);
  const nameMap = new Map<string, string>(parsed.rows.map((r: any) => [r.variant, r.producto]));
  const resolve = (id: string): string[] => comboToProducts[id] ?? (nameMap.has(id) ? [id] : []);
  const filter = { filter: { fieldName: "eventName", inListFilter: { values: CVR_EVENTS } } };

  const ev = await runReport(creds, { dimensions: ["itemId", "eventName", "date"], metrics: ["activeUsers"], startDate, endDate, dimensionFilter: filter });
  const tot = await runReport(creds, { dimensions: ["itemId", "date"], metrics: ["activeUsers"], startDate, endDate, dimensionFilter: filter });

  type Row = { view_item: number; add_to_cart: number; purchase: number; active_users: number };
  const map = new Map<string, Row>();
  const get = (pid: string, date: string) => {
    const k = `${pid}_${date}`;
    if (!map.has(k)) map.set(k, { view_item: 0, add_to_cart: 0, purchase: 0, active_users: 0 });
    return map.get(k)!;
  };
  for (const r of ev) {
    const date = ga4DateToISO(r.date ?? "");
    const users = Number(r.activeUsers) || 0;
    for (const pid of resolve(r.itemId ?? "")) {
      const e = get(pid, date);
      if (r.eventName === "view_item") e.view_item += users;
      else if (r.eventName === "add_to_cart") e.add_to_cart += users;
      else if (r.eventName === "purchase") e.purchase += users;
    }
  }
  for (const r of tot) {
    const date = ga4DateToISO(r.date ?? "");
    for (const pid of resolve(r.itemId ?? "")) get(pid, date).active_users += Number(r.activeUsers) || 0;
  }
  if (map.size === 0) return;

  const entries = [...map.entries()];
  const ph = entries.map((_, j) => `($${j * 7 + 1}, $${j * 7 + 2}::date, $${j * 7 + 3}, $${j * 7 + 4}, $${j * 7 + 5}, $${j * 7 + 6}, $${j * 7 + 7})`).join(", ");
  const vals = entries.flatMap(([k, v]) => {
    const [product_id, date] = k.split("_");
    const cr = v.active_users > 0 ? v.purchase / v.active_users : 0;
    return [product_id, date, v.view_item, v.add_to_cart, v.purchase, v.active_users, cr];
  });
  await pool.query(
    `INSERT INTO analytics.users_cr_by_product (product_id, date, view_item, add_to_cart, purchase, active_users, cr)
     VALUES ${ph}
     ON CONFLICT (product_id, date) DO UPDATE SET
       view_item = EXCLUDED.view_item, add_to_cart = EXCLUDED.add_to_cart,
       purchase = EXCLUDED.purchase, active_users = EXCLUDED.active_users, cr = EXCLUDED.cr`,
    vals
  );
  console.log(`[ga4-reports] users_cr_by_product ${startDate}..${endDate}: ${entries.length} filas`);
}
