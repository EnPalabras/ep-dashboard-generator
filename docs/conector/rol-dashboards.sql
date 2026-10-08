-- Rol del server web (DATABASE_URL del servicio): sólo lee y publica dashboards. Las consultas de
-- los dashboards y del conector van por ep_readonly. Se corre como postgres con \set pw '...'.
CREATE ROLE ep_dashboards LOGIN PASSWORD :'pw';
ALTER ROLE ep_dashboards SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE railway TO ep_dashboards;
GRANT USAGE ON SCHEMA analytics TO ep_dashboards;
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.dashboards, analytics.dashboard_versions TO ep_dashboards;
