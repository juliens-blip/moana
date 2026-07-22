-- Secure RLS posture for the brokers table.
--
-- Authentication uses the server-side Supabase service-role client. The
-- browser must never be able to enumerate brokers or password hashes, so the
-- old anonymous SELECT policy is intentionally removed.

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous login queries" ON public.brokers;
DROP POLICY IF EXISTS "Authenticated brokers can view their own profile" ON public.brokers;
DROP POLICY IF EXISTS "Brokers can view their own profile" ON public.brokers;

REVOKE ALL PRIVILEGES ON TABLE public.brokers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brokers TO service_role;

COMMENT ON TABLE public.brokers IS
  'Broker credentials and profiles; access is server-only through service_role.';
