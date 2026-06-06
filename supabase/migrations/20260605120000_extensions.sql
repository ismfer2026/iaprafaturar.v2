-- Extensions necessárias. IF NOT EXISTS: seguro para reaplicar.
CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron   WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS vector    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent  WITH SCHEMA extensions;
