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
