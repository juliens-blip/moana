-- ============================================================
-- MOANA YACHTING - OPENSANCTIONS SCREENING
-- Execute once in Supabase SQL Editor.
--
-- Purpose:
--   1. Keep every sanctions/PEP screening attempt linked to a CRM lead.
--   2. Store the raw candidate matches returned by the OpenSanctions
--      Screening API (POST /match/default), synchronously called from
--      the Next.js app right after a lead is created.
--   3. Keep this data server-only, same lockdown as lead_kyc_reports.
--
-- Unlike KYC, there is no queue/trigger here: the API call is fast and
-- happens synchronously in application code (see lib/supabase/sanctions.ts).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_sanctions_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  status TEXT NOT NULL
    CHECK (status IN (
      'no_match',
      'possible_match',
      'insufficient_data',
      'error'
    )),

  -- Query actually sent to the OpenSanctions API.
  query_name TEXT,
  query_country TEXT,
  api_dataset TEXT NOT NULL DEFAULT 'default',

  -- Candidate matches: [{entity_id, caption, schema, score, match, target,
  -- topics, datasets, countries, source_url}, ...]
  matches JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(matches) = 'array'),

  -- Operational diagnostics only. Never store secrets or full stack traces.
  error_message TEXT,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_sanctions_screenings IS
  'OpenSanctions Screening API attempts for CRM leads; server-side access only';
COMMENT ON COLUMN public.lead_sanctions_screenings.matches IS
  'Raw candidate matches from OpenSanctions /match/default; name-matching confidence, not a risk assessment';
COMMENT ON COLUMN public.lead_sanctions_screenings.error_message IS
  'Short operational error without credentials or stack trace';

CREATE INDEX IF NOT EXISTS idx_lead_sanctions_screenings_lead_created
  ON public.lead_sanctions_screenings (lead_id, created_at DESC);

-- Latest attempt per lead for server-side CRM reads.
CREATE OR REPLACE VIEW public.lead_sanctions_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (s.lead_id)
  s.id,
  s.lead_id,
  s.status,
  s.query_name,
  s.query_country,
  s.api_dataset,
  s.matches,
  s.error_message,
  s.requested_at,
  s.completed_at,
  s.created_at
FROM public.lead_sanctions_screenings AS s
ORDER BY s.lead_id, s.created_at DESC, s.id DESC;

COMMENT ON VIEW public.lead_sanctions_latest IS
  'Latest OpenSanctions screening attempt per CRM lead; server-side access only';

-- Sanctions/PEP data is sensitive. Deny direct browser roles, same as KYC.
ALTER TABLE public.lead_sanctions_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sanctions_screenings FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.lead_sanctions_screenings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.lead_sanctions_latest FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.lead_sanctions_screenings TO service_role;
GRANT SELECT ON TABLE public.lead_sanctions_latest TO service_role;

COMMIT;
