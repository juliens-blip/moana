import { createHash } from 'node:crypto';
import type { KycQueryInput, KycReport, KycSummary } from '@/lib/kyc/types';
import { createAdminClient } from './admin';

interface KycRow {
  id: string;
  lead_id: string;
  status: KycSummary['status'];
  query_input: Partial<KycQueryInput>;
  report: KycReport | null;
  identity_status: KycSummary['identity_status'];
  confidence_score: string | number | null;
  overall_risk: KycSummary['overall_risk'];
  recommended_review: KycSummary['recommended_review'];
  sanctions_status: string | null;
  pep_status: string | null;
  completed_at: string | null;
  error_message: string | null;
}

function toSummary(row: KycRow): KycSummary {
  const confidence = row.confidence_score === null ? null : Number(row.confidence_score);
  return {
    id: row.id,
    status: row.status,
    identity_status: row.identity_status,
    confidence_score: Number.isFinite(confidence) ? confidence : null,
    overall_risk: row.overall_risk,
    recommended_review: row.recommended_review,
    sanctions_status: row.sanctions_status,
    pep_status: row.pep_status,
    key_reasons: row.report?.kyc_assessment?.key_reasons ?? [],
    source_count: row.report?.sources?.length ?? 0,
    completed_at: row.completed_at,
    error_message: row.error_message,
  };
}

export async function getLatestKycSummaries(leadIds: string[]): Promise<Map<string, KycSummary>> {
  const summaries = new Map<string, KycSummary>();
  if (leadIds.length === 0) return summaries;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_kyc_latest')
    .select('*')
    .in('lead_id', leadIds);

  if (error) {
    console.warn('[KYC] Latest summaries unavailable:', error.message);
    return summaries;
  }

  for (const row of (data ?? []) as KycRow[]) summaries.set(row.lead_id, toSummary(row));
  return summaries;
}

export async function getLatestKycReport(leadId: string): Promise<{
  summary: KycSummary;
  report: KycReport | null;
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_kyc_latest')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw new Error(`KYC read failed: ${error.message}`);
  if (!data) return null;
  const row = data as KycRow;
  return { summary: toSummary(row), report: row.report };
}

async function claimPendingKyc(leadId: string): Promise<KycRow | null> {
  const supabase = createAdminClient();
  const { data: pending, error: pendingError } = await supabase
    .from('lead_kyc_reports')
    .select('id, lead_id, status, query_input, report')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw new Error(`KYC queue read failed: ${pendingError.message}`);
  if (!pending) return null;

  const { data: claimed, error: claimError } = await supabase
    .from('lead_kyc_reports')
    .update({ status: 'running', started_at: new Date().toISOString(), error_code: null, error_message: null })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id, lead_id, status, query_input, report')
    .maybeSingle();

  if (claimError) throw new Error(`KYC claim failed: ${claimError.message}`);
  return claimed as KycRow | null;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown KYC error';
  return message.replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 300);
}

function crawl4AiEndpoint(): string {
  const configured = process.env.KYC_CRAWL_URL?.trim();
  if (configured) return configured;

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) return `https://${host.replace(/^https?:\/\//, '')}/api/kyc-crawl`;
  return 'http://127.0.0.1:3000/api/kyc-crawl';
}

function isKycReport(value: unknown): value is KycReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<KycReport>;
  return Boolean(
    report.query_input
    && report.identity_resolution
    && report.kyc_assessment
    && Array.isArray(report.sources),
  );
}

async function buildCrawl4AiReport(input: Partial<KycQueryInput>): Promise<KycReport> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('Missing Supabase service credential');

  const response = await fetch(crawl4AiEndpoint(), {
    method: 'POST',
    headers: {
      'X-Moana-KYC-Token': createHash('sha256')
        .update('moana-kyc-worker-v1\0')
        .update(serviceKey)
        .digest('hex'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_input: input }),
    cache: 'no-store',
    signal: AbortSignal.timeout(245_000),
  });
  if (!response.ok) throw new Error(`Crawl4AI HTTP ${response.status}`);

  const payload = await response.json() as { success?: boolean; report?: unknown };
  if (!payload.success || !isKycReport(payload.report)) {
    throw new Error('Crawl4AI returned an invalid report');
  }
  return payload.report;
}

export async function processLeadKyc(leadId: string): Promise<KycSummary | null> {
  const job = await claimPendingKyc(leadId);
  if (!job) return (await getLatestKycReport(leadId))?.summary ?? null;

  const supabase = createAdminClient();
  try {
    const report = await buildCrawl4AiReport(job.query_input);
    const now = new Date().toISOString();
    const status = report.sources.length > 0 ? 'completed' : 'insufficient_data';
    const { error } = await supabase
      .from('lead_kyc_reports')
      .update({
        status,
        engine: 'vercel_crawl4ai_http_osint',
        report,
        checked_at: now,
        completed_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'running');

    if (error) throw new Error(`KYC save failed: ${error.message}`);
    return (await getLatestKycReport(leadId))?.summary ?? null;
  } catch (error) {
    const message = safeErrorMessage(error);
    await supabase
      .from('lead_kyc_reports')
      .update({
        status: 'failed',
        error_code: 'CRAWL4AI_KYC_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'running');
    throw new Error(message);
  }
}

export async function enqueueKycRecheck(leadId: string, input: KycQueryInput): Promise<void> {
  const supabase = createAdminClient();
  const { data: active, error: activeError } = await supabase
    .from('lead_kyc_reports')
    .select('id')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'running'])
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error(`KYC active check failed: ${activeError.message}`);
  if (active) return;

  const { error } = await supabase.from('lead_kyc_reports').insert({
    lead_id: leadId,
    status: 'pending',
    trigger_source: 'recheck',
    engine: 'vercel_crawl4ai_http_osint',
    query_input: input,
  });
  if (error) throw new Error(`KYC enqueue failed: ${error.message}`);
}

export async function processLeadKycSafely(leadId: string): Promise<KycSummary | null> {
  try {
    return await processLeadKyc(leadId);
  } catch (error) {
    console.warn('[KYC] Lead enrichment failed without blocking CRM ingestion:', safeErrorMessage(error));
    return null;
  }
}
