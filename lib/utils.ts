import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to French locale
 */
export function formatDate(date: string | Date, formatStr: string = 'PP'): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, formatStr, { locale: fr });
  } catch (error) {
    return 'Date invalide';
  }
}

/**
 * Format date to relative time (e.g., "il y a 2 heures")
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(dateObj, { addSuffix: true, locale: fr });
  } catch (error) {
    return 'Date invalide';
  }
}

/**
 * Format number with French locale
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format number with flexible decimals (no forced rounding to fixed digits)
 */
export function formatNumberFlexible(num: number, maxDecimals: number = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

/**
 * Convert meters to feet
 */
export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

/**
 * Convert feet to meters
 */
export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Sleep function for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate string to specified length
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Clean listing fields for Airtable submission
 * Removes empty strings, null, undefined values
 * Only includes fields with actual data
 */
export function cleanListingFields<T extends Record<string, any>>(fields: T): Partial<T> {
  const cleaned: Partial<T> = {};

  for (const [key, value] of Object.entries(fields)) {
    // Skip if value is null or undefined
    if (value == null) {
      continue;
    }

    // Skip empty strings (but keep 0 and false)
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }

    // Skip empty arrays
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    // Include the value (it's valid)
    cleaned[key as keyof T] = value;
  }

  return cleaned;
}

/**
 * Validate Airtable field value
 * Returns true if the value is valid for Airtable
 */
export function isValidAirtableValue(value: any): boolean {
  // Null and undefined are invalid
  if (value == null) return false;

  // Empty strings are invalid
  if (typeof value === 'string' && value.trim() === '') return false;

  // Empty arrays are invalid
  if (Array.isArray(value) && value.length === 0) return false;

  // Numbers (including 0) are valid
  if (typeof value === 'number') return true;

  // Non-empty strings are valid
  if (typeof value === 'string') return true;

  // Booleans are valid
  if (typeof value === 'boolean') return true;

  // Objects with keys are valid
  if (typeof value === 'object' && Object.keys(value).length > 0) return true;

  return false;
}

/**
 * Parse Airtable error message to user-friendly French message
 */
export function parseAirtableError(error: any): string {
  const errorMessage = error?.message || error?.error || 'Erreur inconnue';

  // Handle common Airtable errors
  if (errorMessage.includes('INVALID_MULTIPLE_CHOICE_OPTIONS')) {
    return 'Valeur invalide pour un champ à choix multiples. Veuillez sélectionner une option valide.';
  }

  if (errorMessage.includes('INVALID_VALUE_FOR_COLUMN')) {
    return 'Valeur invalide pour un champ. Veuillez vérifier vos données.';
  }

  if (errorMessage.includes('NOT_FOUND')) {
    return 'Enregistrement non trouvé.';
  }

  if (errorMessage.includes('UNAUTHORIZED')) {
    return 'Accès non autorisé. Veuillez vérifier vos permissions.';
  }

  if (errorMessage.includes('INVALID_PERMISSIONS')) {
    return 'Permissions insuffisantes pour cette opération.';
  }

  if (errorMessage.includes('INVALID_REQUEST')) {
    return 'Requête invalide. Veuillez vérifier vos données.';
  }

  // Return original message for debugging in dev mode
  if (process.env.NODE_ENV === 'development') {
    return `Erreur Airtable: ${errorMessage}`;
  }

  return 'Une erreur est survenue. Veuillez réessayer.';
}
