import { createAdminClient } from './admin';
import type { Listing } from '@/lib/types';
import { buildMovePayload, type MovableListingTable } from '@/lib/move-listing';

export { MoveListingValidationError } from '@/lib/move-listing';

/**
 * Move a boat from `from` to `to`: insert the shared columns into the
 * destination table first, then delete the source row only once that
 * insert succeeded. If the delete fails, the just-inserted row is removed
 * again so the boat doesn't end up duplicated across both tables.
 */
export async function moveListing(
  from: MovableListingTable,
  to: MovableListingTable,
  id: string
): Promise<Listing> {
  const supabase = createAdminClient();

  const { data: source, error: fetchError } = await supabase
    .from(from)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !source) {
    throw new Error(fetchError?.message || 'Bateau non trouvé');
  }

  const payload = buildMovePayload(source, to);

  const { data: inserted, error: insertError } = await supabase
    .from(to)
    .insert(payload)
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || `Échec de la création dans ${to}`);
  }

  const { error: deleteError } = await supabase.from(from).delete().eq('id', id);
  if (deleteError) {
    await supabase.from(to).delete().eq('id', inserted.id);
    throw new Error(deleteError.message || `Échec de la suppression dans ${from}`);
  }

  return inserted as Listing;
}
