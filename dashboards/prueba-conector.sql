-- @db v2
-- @title Prueba del conector
-- @author Dev User
-- @description Segunda versión.

-- @query por-canal
SELECT channel, count(*)::int AS pedidos, min((placed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS desde
FROM orders WHERE deleted_at IS NULL AND placed_at >= :from::date AND placed_at < :to::date + 1
GROUP BY 1 ORDER BY 2 DESC;
