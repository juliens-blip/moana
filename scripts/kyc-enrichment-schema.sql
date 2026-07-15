-- ============================================================
-- MOANA YACHTING - KYC / OSINT ENRICHMENT
-- Execute once in Supabase SQL Editor.
--
-- Purpose:
--   1. Keep every KYC attempt linked to a CRM lead.
--   2. Queue a KYC attempt when a new lead is created.
--   3. Store the versioned JSON report and its sources.
--   4. Keep sensitive KYC data server-only.
--
-- This script does not perform the crawl. The Vercel backend or an optional
-- worker must claim rows with status = 'pending', enrich, then update them.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_kyc_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  -- Job lifecycle. Completed/failed rows are retained as audit history.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'running',
      'completed',
      'insufficient_data',
      'failed',
      'cancelled'
    )),
  trigger_source TEXT NOT NULL DEFAULT 'new_lead'
    CHECK (trigger_source IN ('new_lead', 'manual', 'recheck')),
  engine TEXT NOT NULL DEFAULT 'crawl4ai_osint',
  schema_version TEXT NOT NULL DEFAULT '1.0',

  -- Minimal input snapshot used for this attempt.
  query_input JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(query_input) = 'object'),

  -- Exact contract documented in wiki/KYC-OSINT.md.
  report JSONB
    CHECK (report IS NULL OR jsonb_typeof(report) = 'object'),

  -- Operational diagnostics only. Never store secrets or full stack traces.
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

COMMENT ON TABLE public.lead_kyc_reports IS
  'Versioned KYC/OSINT attempts for CRM leads; server-side access only';
COMMENT ON COLUMN public.lead_kyc_reports.query_input IS
  'Minimal input snapshot: full_name, email and optional company/country/city';
COMMENT ON COLUMN public.lead_kyc_reports.report IS
  'Sourced KYC JSON report following wiki/KYC-OSINT.md schema version';
COMMENT ON COLUMN public.lead_kyc_reports.error_message IS
  'Short operational error without credentials, personal data dump or stack trace';

-- Queue and history indexes.
CREATE INDEX IF NOT EXISTS idx_lead_kyc_reports_lead_created
  ON public.lead_kyc_reports (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_kyc_reports_pending
  ON public.lead_kyc_reports (requested_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lead_kyc_reports_risk
  ON public.lead_kyc_reports ((report #>> '{kyc_assessment,overall_risk}'))
  WHERE report IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_kyc_reports_review
  ON public.lead_kyc_reports ((report #>> '{kyc_assessment,recommended_review}'))
  WHERE report IS NOT NULL;

-- Prevent two workers from processing concurrent active attempts for one lead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_kyc_reports_one_active
  ON public.lead_kyc_reports (lead_id)
  WHERE status IN ('pending', 'running');

-- Keep updated_at reliable without depending on another schema script.
CREATE OR REPLACE FUNCTION public.update_lead_kyc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_lead_kyc_updated_at
  ON public.lead_kyc_reports;

CREATE TRIGGER update_lead_kyc_updated_at
  BEFORE UPDATE ON public.lead_kyc_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_kyc_updated_at();

-- Automatically create one KYC queue row for every new CRM lead.
-- A missing name or email is recorded silently as insufficient_data.
CREATE OR REPLACE FUNCTION public.enqueue_lead_kyc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  has_required_input BOOLEAN;
BEGIN
  has_required_input :=
    NULLIF(pg_catalog.btrim(NEW.contact_display_name), '') IS NOT NULL
    AND NULLIF(pg_catalog.btrim(NEW.contact_email), '') IS NOT NULL;

  INSERT INTO public.lead_kyc_reports (
    lead_id,
    status,
    trigger_source,
    query_input,
    completed_at
  )
  VALUES (
    NEW.id,
    CASE WHEN has_required_input THEN 'pending' ELSE 'insufficient_data' END,
    'new_lead',
    pg_catalog.jsonb_build_object(
      'full_name', COALESCE(NEW.contact_display_name, ''),
      'email', COALESCE(NEW.contact_email, ''),
      'company_name', '',
      'country', COALESCE(NEW.contact_country, ''),
      'city', ''
    ),
    CASE WHEN has_required_input THEN NULL ELSE pg_catalog.now() END
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lead_kyc() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_kyc_after_lead_insert ON public.leads;

CREATE TRIGGER enqueue_kyc_after_lead_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_lead_kyc();

-- Latest attempt per lead for server-side CRM reads.
CREATE OR REPLACE VIEW public.lead_kyc_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (r.lead_id)
  r.id,
  r.lead_id,
  r.status,
  r.trigger_source,
  r.engine,
  r.schema_version,
  r.query_input,
  r.report,
  r.report #>> '{identity_resolution,status}' AS identity_status,
  r.report #>> '{identity_resolution,confidence_score}' AS confidence_score,
  r.report #>> '{kyc_assessment,overall_risk}' AS overall_risk,
  r.report #>> '{kyc_assessment,recommended_review}' AS recommended_review,
  r.report #>> '{risk_screening,sanctions,status}' AS sanctions_status,
  r.report #>> '{risk_screening,pep,status}' AS pep_status,
  r.error_code,
  r.error_message,
  r.retry_count,
  r.requested_at,
  r.started_at,
  r.completed_at,
  r.checked_at,
  r.created_at,
  r.updated_at
FROM public.lead_kyc_reports AS r
ORDER BY r.lead_id, r.created_at DESC, r.id DESC;

COMMENT ON VIEW public.lead_kyc_latest IS
  'Latest KYC/OSINT attempt per CRM lead; server-side access only';

-- KYC contains sensitive personal and risk data. Deny direct browser roles.
ALTER TABLE public.lead_kyc_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_kyc_reports FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.lead_kyc_reports FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.lead_kyc_latest FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.lead_kyc_reports TO service_role;
GRANT SELECT ON TABLE public.lead_kyc_latest TO service_role;

COMMIT;

-- ============================================================
-- OPTIONAL ONE-TIME BACKFILL
-- Run separately only if historical leads must also be screened.
-- ============================================================
-- INSERT INTO public.lead_kyc_reports (
--   lead_id, status, trigger_source, query_input, completed_at
-- )
-- SELECT
--   l.id,
--   CASE
--     WHEN nullif(btrim(l.contact_display_name), '') IS NOT NULL
--      AND nullif(btrim(l.contact_email), '') IS NOT NULL
--     THEN 'pending'
--     ELSE 'insufficient_data'
--   END,
--   'manual',
--   jsonb_build_object(
--     'full_name', coalesce(l.contact_display_name, ''),
--     'email', coalesce(l.contact_email, ''),
--     'company_name', '',
--     'country', coalesce(l.contact_country, ''),
--     'city', ''
--   ),
--   CASE
--     WHEN nullif(btrim(l.contact_display_name), '') IS NOT NULL
--      AND nullif(btrim(l.contact_email), '') IS NOT NULL
--     THEN NULL
--     ELSE now()
--   END
-- FROM public.leads AS l
-- WHERE NOT EXISTS (
--   SELECT 1
--   FROM public.lead_kyc_reports AS r
--   WHERE r.lead_id = l.id
-- );
