export type KycJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'insufficient_data'
  | 'failed'
  | 'cancelled';

export type IdentityStatus = 'confirmed' | 'probable' | 'ambiguous' | 'unresolved';
export type RiskLevel = 'low' | 'medium' | 'high' | 'undetermined';
export type ReviewLevel =
  | 'standard'
  | 'enhanced_due_diligence'
  | 'manual_review'
  | 'insufficient_data';

export interface KycQueryInput {
  full_name: string;
  email: string;
  company_name: string;
  country: string;
  city: string;
}

export interface KycSource {
  type:
    | 'official_registry'
    | 'company_website'
    | 'linkedin'
    | 'sanctions_db'
    | 'pep_db'
    | 'news'
    | 'court_record'
    | 'maritime_db'
    | 'other';
  url: string;
  note: string;
}

export interface KycReport {
  query_input: KycQueryInput;
  identity_resolution: {
    status: IdentityStatus;
    confidence_score: number;
    matched_persons: Array<{
      name: string;
      headline: string;
      location: string;
      company: string;
      evidence: string[];
    }>;
    selected_profile_rationale: string;
  };
  person_profile: {
    full_name: string;
    aliases: string[];
    current_title: string;
    current_company: string;
    location: string;
    country: string;
    emails: string[];
    phones: string[];
    websites: string[];
    profiles: {
      linkedin: string;
      company_profile: string;
      other: string[];
    };
  };
  company_profile: {
    company_name: string;
    legal_form: string;
    status: string;
    jurisdiction: string;
    registration_number: string;
    vat_number: string;
    lei: string;
    incorporation_date: string;
    address: string;
    industry: string;
    directors: string[];
    shareholders: string[];
    ubo: string[];
    subsidiaries: string[];
    financials: {
      revenue: string;
      net_income: string;
      employees: string;
      share_capital: string;
      currency: string;
      year: string;
    };
    website: string;
  };
  risk_screening: Record<
    'sanctions' | 'pep' | 'watchlists' | 'offshore_leaks',
    {
      status: 'clear' | 'possible_homonym' | 'hit' | 'not_enough_data';
      details: string[];
    }
  >;
  adverse_media: Array<Record<string, string>>;
  maritime_screening: {
    status: 'none_found' | 'possible_link' | 'confirmed_link' | 'non_determinable';
    assets: Array<Record<string, string>>;
  };
  economic_coherence: {
    level: 'low' | 'medium' | 'high' | 'undetermined';
    indicators: string[];
  };
  kyc_assessment: {
    overall_risk: RiskLevel;
    recommended_review: ReviewLevel;
    executive_summary?: string[];
    key_reasons: string[];
    missing_critical_items: string[];
  };
  sources: KycSource[];
}

export interface KycSummary {
  id: string;
  status: KycJobStatus;
  identity_status: IdentityStatus | null;
  confidence_score: number | null;
  overall_risk: RiskLevel | null;
  recommended_review: ReviewLevel | null;
  sanctions_status: string | null;
  pep_status: string | null;
  key_reasons: string[];
  source_count: number;
  completed_at: string | null;
  error_message: string | null;
}
