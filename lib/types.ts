// Airtable Record Types

export interface ListingFields {
  'Nom du Bateau': string;
  'Constructeur': string;
  'Longueur (M/pieds)': number;
  'Année': number;
  'Propriétaire': string;
  'Capitaine': string;
  'Broker': string;
  'Localisation': string;
  'Prix Actuel (€/$)'?: string; // Optional - current price as text (e.g., "1,850,000 €")
  'Prix Précédent (€/$)'?: string; // Optional - previous price as text
  'Dernier message'?: string; // Optional - last message/note (max 500 chars)
  'Commentaire'?: string; // Optional - comment/remarks (max 2000 chars)
}

export interface Listing {
  id: string;
  fields: ListingFields;
  createdTime: string;
}

export interface BrokerFields {
  broker: string;
  password: string;
  'Date de création'?: string;
}

export interface Broker {
  id: string;
  fields: BrokerFields;
  createdTime: string;
}

// API Response Types

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

// Form Types

export interface ListingFormData {
  nomBateau: string;
  constructeur: string;
  longueur: number;
  annee: number;
  proprietaire: string;
  capitaine: string;
  broker: string;
  localisation: string;
}

export interface LoginFormData {
  broker: string;
  password: string;
}

// Session Types

export interface BrokerSession {
  id: string;
  broker: string;
  createdAt: string;
}

// Filter Types

export interface ListingFilters {
  search?: string;           // Search in boat name and constructor
  broker?: string;           // Exact match on broker name
  localisation?: string;     // Exact match on location
  minLength?: number;        // Minimum length in meters
  maxLength?: number;        // Maximum length in meters
  // Note: minPrix and maxPrix removed
  // Prix Actuel field is formatted text (e.g., "1,850,000 €"), not a number
  // Would require Airtable schema change to add numeric price field for filtering
}

// UI Component Types

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

// Note: Localisation is now a free text field, no longer a predefined list
