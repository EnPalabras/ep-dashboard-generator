-- Rol de sólo lectura para el conector y los dashboards que leen de v2 (DATABASE_URL_READONLY).
-- Se corre como postgres. La contraseña se pasa con \set pw '...' (psql) o se reemplaza a mano.
CREATE ROLE ep_readonly LOGIN PASSWORD :'pw';
ALTER ROLE ep_readonly SET default_transaction_read_only = on;
ALTER ROLE ep_readonly SET statement_timeout = '300s';
GRANT CONNECT ON DATABASE railway TO ep_readonly;
GRANT USAGE ON SCHEMA public, analytics TO ep_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public, analytics TO ep_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO ep_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE ep_analytics IN SCHEMA analytics GRANT SELECT ON TABLES TO ep_readonly;
