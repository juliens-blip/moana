import { listingsTable } from './client';
import type { Listing, ListingFields, ListingFilters } from '@/lib/types';
import type { ListingInput } from '@/lib/validations';
import { buildFilterFormula } from './filters';
import { cleanListingFields, parseAirtableError } from '@/lib/utils';

/**
 * Get all listings with optional filters
 */
export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  try {
    const formula = filters ? buildFilterFormula(filters) : '';

    console.log('[getListings] Fetching with filters:', { filters, formula });

    const records = await listingsTable
      .select({
        ...(formula && { filterByFormula: formula }),
        sort: [{ field: 'Nom du Bateau', direction: 'asc' }],
      })
      .all();

    console.log(`[getListings] Fetched ${records.length} records`);

    return records.map((record) => {
      try {
        return {
          id: record.id,
          fields: {
            'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
            'Constructeur': (record.get('Constructeur') || '') as string,
            'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
            'Année': (record.get('Année') || 0) as number,
            'Propriétaire': (record.get('Propriétaire') || '') as string,
            'Capitaine': (record.get('Capitaine') || '') as string,
            'Broker': (record.get('Broker') || '') as string,
            'Localisation': (record.get('Localisation') || '') as string,
            'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
            'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
            'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
            'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
          },
          createdTime: record._rawJson?.createdTime || new Date().toISOString(),
        };
      } catch (mappingError) {
        console.error('[getListings] Error mapping record:', record.id, mappingError);
        throw mappingError;
      }
    });
  } catch (error: any) {
    console.error('[getListings] Error fetching listings:', {
      message: error?.message,
      statusCode: error?.statusCode,
      error: error,
    });
    throw new Error(`Failed to fetch listings: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Get a single listing by ID
 */
export async function getListing(id: string): Promise<Listing | null> {
  try {
    const record = await listingsTable.find(id);

    return {
      id: record.id,
      fields: {
        'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
        'Constructeur': (record.get('Constructeur') || '') as string,
        'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
        'Année': (record.get('Année') || 0) as number,
        'Propriétaire': (record.get('Propriétaire') || '') as string,
        'Capitaine': (record.get('Capitaine') || '') as string,
        'Broker': (record.get('Broker') || '') as string,
        'Localisation': (record.get('Localisation') || '') as string,
        'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
        'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
        'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
        'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
      },
      createdTime: record._rawJson?.createdTime || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching listing:', error);
    return null;
  }
}

/**
 * Create a new listing
 */
export async function createListing(data: ListingInput): Promise<Listing> {
  try {
    // Build fields object with all data (including optional fields)
    const rawFields: Record<string, any> = {
      'Nom du Bateau': data.nomBateau,
      'Constructeur': data.constructeur,
      'Longueur (M/pieds)': data.longueur,
      'Année': data.annee,
      'Propriétaire': data.proprietaire,
      'Capitaine': data.capitaine,
      'Broker': data.broker,
      'Localisation': data.localisation,
      'Prix Actuel (€/$)': data.prix,
      'Prix Précédent (€/$)': data.prixPrecedent,
      'Dernier message': data.dernierMessage,
      'Commentaire': data.commentaire,
    };

    // Clean fields: remove empty strings, null, undefined
    // This prevents Airtable INVALID_MULTIPLE_CHOICE_OPTIONS errors
    const fields = cleanListingFields(rawFields);

    console.log('[createListing] Raw fields:', rawFields);
    console.log('[createListing] Cleaned fields:', fields);

    const record: any = await listingsTable.create(fields);

    console.log('[createListing] Successfully created record:', record.id);

    return {
      id: record.id,
      fields: {
        'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
        'Constructeur': (record.get('Constructeur') || '') as string,
        'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
        'Année': (record.get('Année') || 0) as number,
        'Propriétaire': (record.get('Propriétaire') || '') as string,
        'Capitaine': (record.get('Capitaine') || '') as string,
        'Broker': (record.get('Broker') || '') as string,
        'Localisation': (record.get('Localisation') || '') as string,
        'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
        'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
        'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
        'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
      },
      createdTime: record._rawJson?.createdTime || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[createListing] Error creating listing:', {
      message: error?.message,
      statusCode: error?.statusCode,
      error: error,
    });

    // Parse Airtable error to user-friendly message
    const friendlyMessage = parseAirtableError(error);
    throw new Error(friendlyMessage);
  }
}

/**
 * Update a listing
 */
export async function updateListing(
  id: string,
  data: Partial<ListingInput>
): Promise<Listing> {
  try {
    // Build updates object with all provided data
    const rawUpdates: Record<string, any> = {};

    if (data.nomBateau !== undefined) rawUpdates['Nom du Bateau'] = data.nomBateau;
    if (data.constructeur !== undefined) rawUpdates['Constructeur'] = data.constructeur;
    if (data.longueur !== undefined) rawUpdates['Longueur (M/pieds)'] = data.longueur;
    if (data.annee !== undefined) rawUpdates['Année'] = data.annee;
    if (data.proprietaire !== undefined) rawUpdates['Propriétaire'] = data.proprietaire;
    if (data.capitaine !== undefined) rawUpdates['Capitaine'] = data.capitaine;
    if (data.broker !== undefined) rawUpdates['Broker'] = data.broker;
    if (data.localisation !== undefined) rawUpdates['Localisation'] = data.localisation;
    if (data.prix !== undefined) rawUpdates['Prix Actuel (€/$)'] = data.prix;
    if (data.prixPrecedent !== undefined) rawUpdates['Prix Précédent (€/$)'] = data.prixPrecedent;
    if (data.dernierMessage !== undefined) rawUpdates['Dernier message'] = data.dernierMessage;
    if (data.commentaire !== undefined) rawUpdates['Commentaire'] = data.commentaire;

    // Clean updates: remove empty strings, null, undefined
    const updates = cleanListingFields(rawUpdates);

    console.log('[updateListing] Raw updates:', rawUpdates);
    console.log('[updateListing] Cleaned updates:', updates);

    const record: any = await listingsTable.update(id, updates);

    return {
      id: record.id,
      fields: {
        'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
        'Constructeur': (record.get('Constructeur') || '') as string,
        'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
        'Année': (record.get('Année') || 0) as number,
        'Propriétaire': (record.get('Propriétaire') || '') as string,
        'Capitaine': (record.get('Capitaine') || '') as string,
        'Broker': (record.get('Broker') || '') as string,
        'Localisation': (record.get('Localisation') || '') as string,
        'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
        'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
        'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
        'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
      },
      createdTime: record._rawJson?.createdTime || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[updateListing] Error updating listing:', {
      message: error?.message,
      statusCode: error?.statusCode,
      error: error,
    });

    // Parse Airtable error to user-friendly message
    const friendlyMessage = parseAirtableError(error);
    throw new Error(friendlyMessage);
  }
}

/**
 * Delete a listing
 */
export async function deleteListing(id: string): Promise<void> {
  try {
    await listingsTable.destroy(id);
  } catch (error) {
    console.error('Error deleting listing:', error);
    throw new Error('Failed to delete listing');
  }
}

/**
 * Get unique localisations from all listings
 */
export async function getLocalisations(): Promise<string[]> {
  try {
    const records = await listingsTable
      .select({
        fields: ['Localisation'],
      })
      .all();

    const localisations = records
      .map((record) => record.get('Localisation') as string)
      .filter((loc) => loc && loc.trim() !== '');

    return Array.from(new Set(localisations)).sort();
  } catch (error) {
    console.error('Error fetching localisations:', error);
    return [];
  }
}
