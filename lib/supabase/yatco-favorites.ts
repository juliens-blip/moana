import { createAdminClient } from './admin';
import type { YatcoFavoriteHistoryEntry } from '@/lib/types';

export async function getYatcoFavoriteKeys(brokerId: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from('yatco_global_favorites')
    .select('dedup_key')
    .eq('broker_id', brokerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch YATCO favorites: ${error.message}`);
  return (data ?? []).map((row) => row.dedup_key as string);
}

export async function setYatcoFavorite(
  brokerId: string,
  listingId: string,
  favorite: boolean,
  snapshot?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const listing = snapshot ? { id: snapshot.id as string | undefined, dedup_key: listingId } : (await supabase
    .from('yatco_global_listings')
    .select('id, dedup_key')
    .eq('id', listingId)
    .single()).data;
  if (!listing) throw new Error('Annonce YATCO introuvable');

  if (!favorite) {
    const { error } = await supabase.from('yatco_global_favorites').delete()
      .eq('broker_id', brokerId).eq('dedup_key', listing.dedup_key);
    if (error) throw new Error(`Failed to remove YATCO favorite: ${error.message}`);
    return;
  }

  const favoriteRow = {
    broker_id: brokerId,
    listing_id: listing.id?.match?.(/^[0-9a-f-]{36}$/i) ? listing.id : null,
    dedup_key: listing.dedup_key,
    listing_snapshot: snapshot ?? null,
  };
  const { data: inserted, error } = await supabase
    .from('yatco_global_favorites')
    .upsert(favoriteRow, { onConflict: 'broker_id,dedup_key' })
    .select('id')
    .single();
  if (error || !inserted) throw new Error(`Failed to save YATCO favorite: ${error?.message ?? 'unknown error'}`);

  // Initial snapshot: subsequent scraper upserts are captured by the DB trigger.
  const current = snapshot ?? (await supabase
    .from('yatco_global_listings').select('*').eq('dedup_key', listing.dedup_key).single()).data;
  if (!current) throw new Error('Impossible de créer le snapshot du favori');
  const { data: previous } = await supabase.from('yatco_global_favorite_history')
    .select('id').eq('favorite_id', inserted.id).limit(1);
  if (!previous?.length) {
    const { error: historyError } = await supabase.from('yatco_global_favorite_history').insert({
      favorite_id: inserted.id,
      listing_snapshot: current,
    });
    if (historyError) throw new Error(`Failed to create favorite snapshot: ${historyError.message}`);
  }
}

export async function getYatcoFavoriteHistory(
  brokerId: string,
  dedupKey: string
): Promise<YatcoFavoriteHistoryEntry[]> {
  const supabase = createAdminClient();
  const { data: favorite, error: favoriteError } = await supabase
    .from('yatco_global_favorites').select('id').eq('broker_id', brokerId).eq('dedup_key', dedupKey).maybeSingle();
  if (favoriteError) throw new Error(favoriteError.message);
  if (!favorite) return [];
  const { data, error } = await supabase.from('yatco_global_favorite_history')
    .select('observed_at, listing_snapshot').eq('favorite_id', favorite.id)
    .order('observed_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch favorite history: ${error.message}`);
  return (data ?? []) as YatcoFavoriteHistoryEntry[];
}
