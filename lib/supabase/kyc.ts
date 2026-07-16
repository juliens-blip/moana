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

export async function enqueueKycRecheck(
  leadId: string,
  input: KycQueryInput,
): Promise<KycSummary | null> {
  const supabase = createAdminClient();
  const { data: active, error: activeError } = await supabase
    .from('lead_kyc_reports')
    .select('id')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'running'])
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error(`KYC active check failed: ${activeError.message}`);
  if (active) return (await getLatestKycReport(leadId))?.summary ?? null;

  const { error } = await supabase.from('lead_kyc_reports').insert({
    lead_id: leadId,
    status: 'pending',
    trigger_source: 'recheck',
    engine: 'crawl4ai_worker_osint',
    query_input: input,
  });
  if (error) throw new Error(`KYC enqueue failed: ${error.message}`);
  return (await getLatestKycReport(leadId))?.summary ?? null;
}
