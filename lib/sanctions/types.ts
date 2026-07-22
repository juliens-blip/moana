export type SanctionsStatus = 'no_match' | 'possible_match' | 'insufficient_data' | 'error';

export interface SanctionsMatch {
  entity_id: string;
  caption: string;
  schema: string;
  score: number;
  match: boolean;
  target: boolean;
  topics: string[];
  datasets: string[];
  countries: string[];
  source_url: string;
}

export interface SanctionsSummary {
  id: string;
  status: SanctionsStatus;
  match_count: number;
  top_score: number | null;
  checked_at: string | null;
  error_message: string | null;
}

export interface SanctionsReport {
  status: SanctionsStatus;
  query_name: string | null;
  query_country: string | null;
  api_dataset: string;
  matches: SanctionsMatch[];
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}
