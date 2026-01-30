import { createAdminClient } from './admin';
import type { Listing, ListingFilters } from '@/lib/types';
import type { TrackedListingInput } from '@/lib/validations';
import { resolveBrokerNameToId } from './listings';

type TrackedTable = 'bateaux_a_suivre' | 'bateaux_chantier';

function getTrackedTable(table: TrackedTable) {
  if (table !== 'bateaux_a_suivre' && table !== 'bateaux_chantier') {
    throw new Error('Invalid tracked listings table');
  }
  return table;
}

export async function getTrackedListings(table: TrackedTable, filters?: ListingFilters): Promise<Listing[]> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  let query = supabase
    .from(targetTable)
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `)
    .order('nom_bateau', { ascending: true });

  if (filters?.search) {
    query = query.or(`nom_bateau.ilike.%${filters.search}%,constructeur.ilike.%${filters.search}%`);
  }

  if (filters?.broker) {
    const brokerId = await resolveBrokerNameToId(filters.broker);
    if (brokerId) {
      query = query.eq('broker_id', brokerId);
    } else {
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

  if (filters?.etoile) {
    query = query.eq('etoile', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getTrackedListings] Error:', error);
    throw new Error(`Failed to fetch tracked listings: ${error.message}`);
  }

  return data || [];
}

export async function getTrackedListing(table: TrackedTable, id: string): Promise<Listing | null> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  const { data, error } = await supabase
    .from(targetTable)
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
    console.error('[getTrackedListing] Error:', error);
    return null;
  }

  return data as Listing;
}

export async function updateTrackedListing(
  table: TrackedTable,
  id: string,
  data: Partial<TrackedListingInput>
): Promise<Listing> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  let brokerId: string | null | undefined = undefined;
  if (data.broker !== undefined) {
    brokerId = data.broker ? await resolveBrokerNameToId(data.broker) : null;
  }

  const updates: Record<string, unknown> = {};

  if (data.nomBateau !== undefined) updates.nom_bateau = data.nomBateau;
  if (data.constructeur !== undefined) updates.constructeur = data.constructeur ?? null;
  if (data.longueur !== undefined) updates.longueur_m = data.longueur ?? null;
  if (data.annee !== undefined) updates.annee = data.annee ?? null;
  if (data.localisation !== undefined) updates.localisation = data.localisation ?? 'N/A';
  if (data.etoile !== undefined) updates.etoile = data.etoile ?? false;
  if (data.commentaire !== undefined) updates.commentaire = data.commentaire ?? null;
  if (brokerId !== undefined) updates.broker_id = brokerId;

  const { data: listing, error } = await supabase
    .from(targetTable)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !listing) {
    console.error('[updateTrackedListing] Error:', error);
    throw new Error(error?.message || 'Failed to update tracked listing');
  }

  return listing as Listing;
}

export async function deleteTrackedListing(table: TrackedTable, id: string): Promise<void> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  const { error } = await supabase
    .from(targetTable)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteTrackedListing] Error:', error);
    throw new Error(error.message);
  }
}

export async function updateTrackedListingImage(
  table: TrackedTable,
  id: string,
  imageUrl: string | null
): Promise<Listing> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  const { data: listing, error } = await supabase
    .from(targetTable)
    .update({ image_url: imageUrl })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !listing) {
    console.error('[updateTrackedListingImage] Error:', error);
    throw new Error(error?.message || 'Failed to update tracked listing image');
  }

  return listing as Listing;
}

export async function createTrackedListing(table: TrackedTable, data: TrackedListingInput, fallbackBrokerId?: string | null): Promise<Listing> {
  const supabase = createAdminClient();
  const targetTable = getTrackedTable(table);

  let brokerId = fallbackBrokerId || null;
  if (data.broker) {
    const resolved = await resolveBrokerNameToId(data.broker);
    brokerId = resolved || brokerId;
  }

  const payload = {
    nom_bateau: data.nomBateau,
    constructeur: data.constructeur ?? null,
    longueur_m: data.longueur ?? null,
    annee: data.annee ?? null,
    proprietaire: 'N/A',
    capitaine: 'N/A',
    broker_id: brokerId,
    localisation: data.localisation ?? 'N/A',
    etoile: data.etoile ?? false,
    commentaire: data.commentaire ?? null,
  };

  const { data: listing, error } = await supabase
    .from(targetTable)
    .insert(payload)
    .select('*')
    .single();

  if (error || !listing) {
    console.error('[createTrackedListing] Error:', error);
    throw new Error(error?.message || 'Failed to create tracked listing');
  }

  return listing as Listing;
}
