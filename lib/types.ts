// ============================================
// SUPABASE DATABASE TYPES
// ============================================

export interface Broker {
  id: string;
  email: string;
  broker_name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  nom_bateau: string;
  constructeur: string;
  longueur_m: number;
  annee: number;
  proprietaire: string;
  capitaine: string;
  broker_id: string;
  localisation: string;
  etoile?: boolean;
  nombre_cabines?: number;
  prix_actuel?: string;
  prix_precedent?: string;
  dernier_message?: string;
  commentaire?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
  airtable_id?: string; // Pour référence migration
}

export interface ListingWithBroker extends Listing {
  broker_name: string;
  broker_email: string;
}

// ============================================
// YATCO BOSS FLEET CONTENT AUDIT TYPES
// ============================================

export interface YatcoFleetListing {
  id: string;
  vid: string;
  mls_id?: string;
  vessel_name: string;
  status?: string;
  agreement_type?: string;
  builder?: string;
  model_year?: number;
  asking_price_text?: string;
  loa_text?: string;
  broker_name?: string;
  photo_count: number;
  has_description: boolean;
  has_broker_message: boolean;
  has_hull_deck_specs: boolean;
  has_engine_specs: boolean;
  has_dimensions: boolean;
  has_speed_capacity_specs: boolean;
  days_on_market?: number;
  linked_listing_id?: string;
  last_synced_at: string;
  created_at: string;
}

// ============================================
// YATCO MLS MARKET PULSE TYPES (comps + price drops)
// ============================================

export interface YatcoMarketPulseEntry {
  id: string;
  feed_type: 'new' | 'modified' | 'sold';
  vid: string;
  mls_id?: string;
  vessel_name: string;
  builder?: string;
  model_year?: number;
  category?: string;
  loa_text?: string;
  price_text?: string;
  location?: string;
  broker_name?: string;
  history_text?: string;
  is_price_drop: boolean;
  price_before_text?: string;
  price_after_text?: string;
  sold_date?: string;
  scraped_at: string;
  created_at: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// FORM TYPES
// ============================================

export interface ListingFormData {
  nomBateau: string;
  constructeur: string;
  longueur: number;
  annee: number;
  proprietaire: string;
  capitaine: string;
  broker: string; // broker_id
  localisation: string;
  etoile?: boolean;
  nombreCabines?: number;
  prix?: string;
  prixPrecedent?: string;
  dernierMessage?: string;
  commentaire?: string;
}

export interface LoginFormData {
  broker: string;
  password: string;
}

// ============================================
// SESSION TYPES
// ============================================

export interface BrokerSession {
  id: string;
  broker: string;
  createdAt: string;
}

// ============================================
// FILTER TYPES
// ============================================

export interface ListingFilters {
  search?: string;           // Search in boat name and constructor
  broker?: string;           // Broker name or Broker ID (UUID) - will be resolved automatically
  localisation?: string;     // Free text localisation
  minLength?: number;        // Minimum length in meters
  maxLength?: number;        // Maximum length in meters
  etoile?: boolean;          // Only starred listings (bateaux à pousser)
}

// ============================================
// UI COMPONENT TYPES
// ============================================

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

// ============================================
// BOats group LEADFLOW TYPES
// ============================================

// Conforme à la documentation LeadFlow de BOats group
// Note: La plupart des champs sont optionnels selon la doc
export interface YatcoLeadPayload {
  lead: {
    id: string;
    date?: string; // ISO 8601, optionnel selon doc
    source: string;
    detailedSource?: string;
    detailedSourceSummary?: string;
    requestType?: string;
  };
  contact: {
    name?: {
      display?: string; // Peut être vide dans leads minimaux
      first?: string;
      last?: string;
    };
    phone?: string;
    email?: string;
    country?: string;
    postalCode?: string; // US leads only
  };
  customerComments?: string;
  leadComments?: string;
  boat?: {
    make?: string;
    model?: string;
    year?: string;
    hin?: string;
    condition?: string;
    classCode?: string;
    name?: string;
    stockNumber?: string;
    imtId?: string;
    length?: {
      measure?: string;
      units?: string;
    };
    location?: {
      city?: string;
      stateProvince?: string;
      country?: string;
      postalCode?: string;
    };
    price?: {
      amount?: string;
      currency?: string;
    };
    url?: string;
  };
  recipient: {
    officeName: string;
    officeId: string;
    contactName?: string; // Optionnel selon l'exemple minimal de la doc
  };
  // LeadSmart: historique des leads du contact
  leadSmart?: {
    leadHistory?: Array<{
      make?: string;
      model?: string;
      year?: string;
      dateOfLead?: string;
      portalName?: string;
      location?: {
        city?: string;
        country?: string;
        stateProvince?: string;
      };
    }>;
  };
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';

export interface Lead {
  id: string;
  yatco_lead_id: string;
  lead_date: string;
  source: string;
  detailed_source?: string;
  detailed_source_summary?: string;
  request_type?: string;
  contact_display_name: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_country?: string;
  boat_make?: string;
  boat_model?: string;
  boat_year?: string;
  boat_condition?: string;
  boat_length_value?: string;
  boat_length_units?: string;
  boat_price_amount?: string;
  boat_price_currency?: string;
  boat_url?: string;
  customer_comments?: string;
  lead_comments?: string;
  recipient_office_name?: string;
  recipient_office_id?: string;
  recipient_contact_name?: string;
  broker_id?: string;
  status: LeadStatus;
  raw_payload?: Record<string, unknown>;
  received_at: string;
  updated_at: string;
  processed_at?: string;
}

export interface LeadWithBroker extends Lead {
  broker_name?: string;
  broker_email?: string;
  kyc?: import('@/lib/kyc/types').KycSummary;
}

// ============================================
// LEGACY AIRTABLE TYPES (pour migration)
// ============================================

export interface LegacyListingFields {
  'Nom du Bateau': string;
  'Constructeur': string;
  'Longueur (M/pieds)': number;
  'Année': number;
  'Propriétaire': string;
  'Capitaine': string;
  'Broker': string;
  'Localisation': string;
  'Prix Actuel (€/$)'?: string;
  'Prix Précédent (€/$)'?: string;
  'Dernier message'?: string;
  'Commentaire'?: string;
}

export interface LegacyListing {
  id: string;
  fields: LegacyListingFields;
  createdTime: string;
}
