import type { Lead } from '@/lib/types';
import type { SanctionsMatch, SanctionsReport, SanctionsStatus, SanctionsSummary } from '@/lib/sanctions/types';
import { createAdminClient } from './admin';

const API_URL = 'https://api.opensanctions.org/match/default';
const DATASET = 'default';

interface OpenSanctionsCandidate {
  id: string;
  caption: string;
  schema: string;
  score: number;
  match: boolean;
  target: boolean;
  datasets?: string[];
  properties?: {
    topics?: string[];
    country?: string[];
  };
}

interface OpenSanctionsMatchResponse {
  responses: {
    q?: {
      status: number;
      results: OpenSanctionsCandidate[];
    };
  };
}

interface ScreeningRow {
  id: string;
  lead_id: string;
  status: SanctionsStatus;
  query_name: string | null;
  query_country: string | null;
  api_dataset: string;
  matches: SanctionsMatch[];
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

function toSummary(row: ScreeningRow): SanctionsSummary {
  const scores = row.matches.map((m) => m.score).filter((s) => Number.isFinite(s));
  return {
    id: row.id,
    status: row.status,
    match_count: row.matches.length,
    top_score: scores.length > 0 ? Math.max(...scores) : null,
    checked_at: row.completed_at,
    error_message: row.error_message,
  };
}

function toReport(row: ScreeningRow): SanctionsReport {
  return {
    status: row.status,
    query_name: row.query_name,
    query_country: row.query_country,
    api_dataset: row.api_dataset,
    matches: row.matches,
    error_message: row.error_message,
    requested_at: row.requested_at,
    completed_at: row.completed_at,
  };
}

async function insertScreening(
  leadId: string,
  fields: {
    status: SanctionsStatus;
    query_name?: string | null;
    query_country?: string | null;
    matches?: SanctionsMatch[];
    error_message?: string | null;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('lead_sanctions_screenings').insert({
    lead_id: leadId,
    status: fields.status,
    query_name: fields.query_name ?? null,
    query_country: fields.query_country ?? null,
    api_dataset: DATASET,
    matches: fields.matches ?? [],
    error_message: fields.error_message ?? null,
    completed_at: new Date().toISOString(),
  });
  if (error) console.warn('[Sanctions] Failed to store screening result:', error.message);
}

/**
 * Screens a lead against the OpenSanctions Screening API (sanctions + PEP +
 * watchlists) and stores the result. Never throws: any failure (missing key,
 * network error, HTTP error) is stored as an 'error' row so lead creation is
 * never blocked, mirroring the KYC invariant in wiki/KYC-OSINT.md.
 */
export async function screenLeadForSanctions(lead: Lead): Promise<void> {
  const firstName = lead.contact_first_name?.trim();
  const lastName = lead.contact_last_name?.trim();
  const fallbackName = lead.contact_display_name?.trim();
  const queryName = [firstName, lastName].filter(Boolean).join(' ').trim() || fallbackName || '';
  const country = lead.contact_country?.trim() || undefined;

  if (!queryName) {
    await insertScreening(lead.id, { status: 'insufficient_data', query_name: null, query_country: country ?? null });
    return;
  }

  const apiKey = process.env.OPENSANCTIONS_API_KEY;
  if (!apiKey) {
    await insertScreening(lead.id, {
      status: 'error',
      query_name: queryName,
      query_country: country ?? null,
      error_message: 'OPENSANCTIONS_API_KEY missing',
    });
    return;
  }

  try {
    const properties: Record<string, string[]> = {
      name: [queryName],
    };
    if (firstName) properties.firstName = [firstName];
    if (lastName) properties.lastName = [lastName];
    if (country) properties.country = [country];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: {
          q: { schema: 'Person', properties },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      await insertScreening(lead.id, {
        status: 'error',
        query_name: queryName,
        query_country: country ?? null,
        error_message: `OpenSanctions API ${response.status}: ${body.slice(0, 200)}`,
      });
      return;
    }

    const data = (await response.json()) as OpenSanctionsMatchResponse;
    const candidates = data.responses?.q?.results ?? [];

    const matches: SanctionsMatch[] = candidates.map((c) => ({
      entity_id: c.id,
      caption: c.caption,
      schema: c.schema,
      score: c.score,
      match: c.match,
      target: c.target,
      topics: c.properties?.topics ?? [],
      datasets: c.datasets ?? [],
      countries: c.properties?.country ?? [],
      source_url: `https://www.opensanctions.org/entities/${c.id}/`,
    }));

    const hasMatch = matches.some((m) => m.match);
    await insertScreening(lead.id, {
      status: hasMatch ? 'possible_match' : 'no_match',
      query_name: queryName,
      query_country: country ?? null,
      matches,
    });
  } catch (error) {
    await insertScreening(lead.id, {
      status: 'error',
      query_name: queryName,
      query_country: country ?? null,
      error_message: error instanceof Error ? error.message.slice(0, 200) : 'Unknown error',
    });
  }
}

export async function getLatestSanctionsSummaries(leadIds: string[]): Promise<Map<string, SanctionsSummary>> {
  const summaries = new Map<string, SanctionsSummary>();
  if (leadIds.length === 0) return summaries;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_sanctions_latest')
    .select('*')
    .in('lead_id', leadIds);

  if (error) {
    console.warn('[Sanctions] Latest summaries unavailable:', error.message);
    return summaries;
  }

  for (const row of (data ?? []) as ScreeningRow[]) summaries.set(row.lead_id, toSummary(row));
  return summaries;
}

export async function getLatestSanctionsReport(leadId: string): Promise<{
  summary: SanctionsSummary;
  report: SanctionsReport;
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_sanctions_latest')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw new Error(`Sanctions read failed: ${error.message}`);
  if (!data) return null;
  const row = data as ScreeningRow;
  return { summary: toSummary(row), report: toReport(row) };
}
