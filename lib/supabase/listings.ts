import { createClient } from './server';
import { createAdminClient } from './admin';
import type { Listing, ListingFilters } from '@/lib/types';
import type { ListingInput } from '@/lib/validations';

/**
 * Resolve broker name to broker ID
 * Returns null if broker not found
 */
async function resolveBrokerNameToId(brokerNameOrId: string): Promise<string | null> {
  const supabase = createAdminClient();

  // Check if it's already a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(brokerNameOrId)) {
    return brokerNameOrId;
  }

  // Otherwise, treat it as a broker name and look it up
  const { data, error } = await supabase
    .from('brokers')
    .select('id')
    .eq('broker_name', brokerNameOrId)
    .single();

  if (error || !data) {
    console.warn(`[resolveBrokerNameToId] Broker not found: ${brokerNameOrId}`);
    return null;
  }

  return data.id;
}

/**
 * Get all listings with optional filters
 * Uses admin client to bypass RLS
 */
export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  // Use admin client to bypass RLS policies
  const supabase = createAdminClient();

  let query = supabase
    .from('listings')
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `)
    .order('nom_bateau', { ascending: true });

  // Appliquer les filtres
  if (filters?.search) {
    query = query.or(`nom_bateau.ilike.%${filters.search}%,constructeur.ilike.%${filters.search}%`);
  }

  if (filters?.broker) {
    // Resolve broker name to ID if needed
    const brokerId = await resolveBrokerNameToId(filters.broker);
    if (brokerId) {
      query = query.eq('broker_id', brokerId);
    } else {
      // If broker not found, return empty array
      console.warn(`[getListings] Broker not found: ${filters.broker}`);
      return [];
    }
  }

  if (filters?.localisation) {
    query = query.ilike('localisation', `%${filters.localisation}%`);
  }

  if (filters?.minLength) {
    query = query.gte('longueur_m', filters.minLength);
  }

  if (filters?.maxLength) {
    query = query.lte('longueur_m', filters.maxLength);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getListings] Error:', error);
    throw new Error(`Failed to fetch listings: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single listing by ID
 * Uses admin client to bypass RLS
 */
export async function getListing(id: string): Promise<Listing | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listings')
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getListing] Error:', error);
    return null;
  }

  return data;
}

/**
 * Create a new listing
 * Uses admin client to bypass RLS
 */
export async function createListing(data: ListingInput): Promise<Listing> {
  const supabase = createAdminClient();

  // Resolve broker name/ID to ID if provided
  let brokerId: string | undefined = undefined;
  if (data.broker) {
    const resolved = await resolveBrokerNameToId(data.broker);
    if (!resolved) {
      throw new Error(`Broker not found: ${data.broker}`);
    }
    brokerId = resolved;
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      nom_bateau: data.nomBateau,
      constructeur: data.constructeur,
      longueur_m: data.longueur,
      annee: data.annee,
      proprietaire: data.proprietaire,
      capitaine: data.capitaine,
      broker_id: brokerId,
      localisation: data.localisation,
      prix_actuel: data.prix,
      prix_precedent: data.prixPrecedent,
      dernier_message: data.dernierMessage,
      commentaire: data.commentaire,
    })
    .select()
    .single();

  if (error) {
    console.error('[createListing] Error:', error);
    throw new Error(`Failed to create listing: ${error.message}`);
  }

  return listing;
}

/**
 * Update a listing
 * Uses admin client to bypass RLS
 */
export async function updateListing(
  id: string,
  data: Partial<ListingInput>
): Promise<Listing> {
  const supabase = createAdminClient();

  const updates: Record<string, any> = {};

  if (data.nomBateau !== undefined) updates.nom_bateau = data.nomBateau;
  if (data.constructeur !== undefined) updates.constructeur = data.constructeur;
  if (data.longueur !== undefined) updates.longueur_m = data.longueur;
  if (data.annee !== undefined) updates.annee = data.annee;
  if (data.proprietaire !== undefined) updates.proprietaire = data.proprietaire;
  if (data.capitaine !== undefined) updates.capitaine = data.capitaine;

  // Resolve broker name/ID to ID if provided
  if (data.broker !== undefined) {
    if (data.broker) {
      const brokerId = await resolveBrokerNameToId(data.broker);
      if (!brokerId) {
        throw new Error(`Broker not found: ${data.broker}`);
      }
      updates.broker_id = brokerId;
    } else {
      updates.broker_id = null;
    }
  }

  if (data.localisation !== undefined) updates.localisation = data.localisation;
  if (data.prix !== undefined) updates.prix_actuel = data.prix;
  if (data.prixPrecedent !== undefined) updates.prix_precedent = data.prixPrecedent;
  if (data.dernierMessage !== undefined) updates.dernier_message = data.dernierMessage;
  if (data.commentaire !== undefined) updates.commentaire = data.commentaire;

  const { data: listing, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[updateListing] Error:', error);
    throw new Error(`Failed to update listing: ${error.message}`);
  }

  return listing;
}

/**
 * Delete a listing
 * Uses admin client to bypass RLS
 */
export async function deleteListing(id: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteListing] Error:', error);
    throw new Error(`Failed to delete listing: ${error.message}`);
  }
}

/**
 * Get unique localisations from all listings
 * Uses admin client to bypass RLS
 */
export async function getLocalisations(): Promise<string[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listings')
    .select('localisation')
    .not('localisation', 'is', null);

  if (error) {
    console.error('[getLocalisations] Error:', error);
    return [];
  }

  const localisations = Array.from(
    new Set(data.map((item) => item.localisation).filter(Boolean))
  ).sort();

  return localisations;
}
