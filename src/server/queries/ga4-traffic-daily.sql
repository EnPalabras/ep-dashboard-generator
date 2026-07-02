-- Serie diaria de sesiones GA4 (todas las fuentes sumadas) para un rango.
SELECT
  date,
  SUM(sessions)      AS sessions,
  SUM(total_users)   AS total_users,
  SUM(new_users)     AS new_users,
  SUM(conversions)   AS conversions,
  SUM(total_revenue) AS total_revenue
FROM ga4_traffic_daily
WHERE date BETWEEN :from AND :to
GROUP BY date
ORDER BY date;
