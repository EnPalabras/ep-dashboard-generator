-- Arregla combined_report_full para que el gasto de Google Ads salga de
-- analytics.google_ads_daily (batch google-ads, fuente GA4) en vez de las dos
-- fuentes viejas, que se cortaron el 2026-04-06 y el 2026-05-31.
--
-- CORRERLO COMO `postgres`: la vista es de postgres y ep_analytics sólo tiene
-- SELECT sobre public.
--
-- Verificado antes de escribir esto: en los 453 días en que las dos fuentes se
-- solapan (2025-01-01 → 2026-04-06) NO hay un solo día con diferencia >= $1
-- (máximo $0,02, redondeo). Contra la carga manual de abril y mayo: 61 de 61
-- días iguales. O sea que la fuente nueva reproduce a la vieja, no la estima.

CREATE OR REPLACE VIEW public.combined_report_full AS
  SELECT date, channel, spend, impressions, clicks, total_revenue, keyevents
    FROM public.combined_report_by_day
   WHERE channel <> 'Google Ads'
  UNION ALL
  SELECT date, channel, spend, 0, 0, 0, 0
    FROM public.marketing_spend_manual
   WHERE channel <> 'Google Ads'
  UNION ALL
  SELECT date,
         'Google Ads'::text,
         cost,
         impressions,
         clicks,
         total_revenue,
         key_events::integer
    FROM analytics.google_ads_daily;

-- Control posterior: estas dos tienen que dar el mismo número por mes hasta
-- 2026-03, y la segunda tiene que dejar de dar 0 de junio en adelante.
--
--   SELECT to_char(date,'YYYY-MM'), round(sum(spend))
--     FROM public.combined_report_full WHERE channel = 'Google Ads' GROUP BY 1 ORDER BY 1;
