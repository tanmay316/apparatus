"""
Locks the Postgres `public` schema away from Supabase's auto-generated REST API.

The app never talks to Supabase directly: only this backend connects, as the table
owner, which bypasses RLS. So we enable RLS with no policies (deny-all for the
`anon` / `authenticated` API roles) and revoke their grants. Idempotent; safe on
plain Postgres where those roles don't exist.
"""
import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

HARDEN_SQL = """
DO $$
DECLARE
  t record;
  r text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    BEGIN
      EXECUTE 'ALTER TABLE public.' || quote_ident(t.tablename) || ' ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skip RLS on a table not owned by this role';
    END;
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ' || quote_ident(r);
      EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ' || quote_ident(r);
      EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ' || quote_ident(r);
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ' || quote_ident(r);
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ' || quote_ident(r);
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ' || quote_ident(r);
    END IF;
  END LOOP;
END $$;
"""


def harden_postgres(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    try:
        with engine.begin() as conn:
            conn.execute(text(HARDEN_SQL))
        logger.info("Postgres public schema locked down (RLS on, API roles revoked).")
    except Exception as exc:
        logger.error("Could not harden Postgres public schema: %s", exc)
