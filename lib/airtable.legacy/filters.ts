import type { ListingFilters } from '../types';

/**
 * Escapes single quotes for Airtable formula safety
 */
function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Validates and sanitizes filter parameters from query strings
 */
export function validateFilters(params: Record<string, string | null>): ListingFilters {
  const validated: ListingFilters = {};

  // Text filters: trim and limit length
  if (params.search) {
    validated.search = params.search.trim().slice(0, 100);
  }

  if (params.broker) {
    validated.broker = params.broker.trim().slice(0, 100);
  }

  if (params.localisation) {
    validated.localisation = params.localisation.trim().slice(0, 100);
  }

  // Number filters: parse and validate
  if (params.minLength) {
    const num = parseFloat(params.minLength);
    if (!isNaN(num) && num >= 0 && num <= 1000) {
      validated.minLength = num;
    }
  }

  if (params.maxLength) {
    const num = parseFloat(params.maxLength);
    if (!isNaN(num) && num >= 0 && num <= 1000) {
      validated.maxLength = num;
    }
  }

  // Note: Prix filters removed - field is stored as formatted text, not numbers
  // Would require complex parsing (remove €/$, commas, spaces) to filter properly

  // Validation: min <= max for length
  if (validated.minLength !== undefined && validated.maxLength !== undefined) {
    if (validated.minLength > validated.maxLength) {
      delete validated.minLength;
      delete validated.maxLength;
    }
  }

  return validated;
}

/**
 * Builds Airtable filterByFormula string from validated filters
 * Handles multiple filter combinations with AND logic
 */
export function buildFilterFormula(filters: ListingFilters): string {
  const conditions: string[] = [];

  // Text search: case-insensitive match on boat name or constructor
  if (filters.search) {
    const searchTerm = escapeSingleQuotes(filters.search.toLowerCase());
    conditions.push(
      `OR(FIND(LOWER("${searchTerm}"), LOWER({Nom du Bateau})), FIND(LOWER("${searchTerm}"), LOWER({Constructeur})))`
    );
  }

  // Broker exact match
  if (filters.broker) {
    conditions.push(`{Broker} = "${escapeSingleQuotes(filters.broker)}"`);
  }

  // Localisation exact match
  if (filters.localisation) {
    conditions.push(`{Localisation} = "${escapeSingleQuotes(filters.localisation)}"`);
  }

  // Length range filters
  if (filters.minLength !== undefined) {
    conditions.push(`{Longueur (M/pieds)} >= ${filters.minLength}`);
  }
  if (filters.maxLength !== undefined) {
    conditions.push(`{Longueur (M/pieds)} <= ${filters.maxLength}`);
  }

  // Note: Price filters removed
  // Prix Actuel (€/$) is stored as formatted text (e.g., "1,850,000 €")
  // Cannot reliably filter without parsing logic in Airtable formula
  // Consider adding separate numeric price field in Airtable for filtering

  // Combine all conditions with AND
  if (conditions.length === 0) {
    return ''; // No filters = return all
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return `AND(${conditions.join(', ')})`;
}
