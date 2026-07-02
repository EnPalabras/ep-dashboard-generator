-- Tráfico GA4 agrupado por canal para un rango de fechas.
-- Sirve para comparar tráfico gratis (Organic Search/Direct) vs pago (Paid Social/Search).
SELECT
  channel,
  SUM(sessions)                                            AS sessions,
  SUM(total_users)                                         AS total_users,
  SUM(new_users)                                           AS new_users,
  SUM(engaged_sessions)                                    AS engaged_sessions,
  SUM(conversions)                                         AS conversions,
  SUM(total_revenue)                                       AS total_revenue,
  CASE WHEN SUM(sessions) > 0
       THEN ROUND(SUM(engaged_sessions)::numeric / SUM(sessions) * 100, 1)
       ELSE 0 END                                          AS engagement_rate_pct
FROM ga4_traffic_daily
WHERE date BETWEEN :from AND :to
GROUP BY channel
ORDER BY sessions DESC;
