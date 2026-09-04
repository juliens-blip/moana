export type MovableListingTable = 'listings' | 'bateaux_a_suivre';

export class MoveListingValidationError extends Error {}

const MOVABLE_FIELDS = [
  'nom_bateau',
  'constructeur',
  'longueur_m',
  'annee',
  'proprietaire',
  'capitaine',
  'broker_id',
  'localisation',
  'etoile',
  'nombre_cabines',
  'prix_actuel',
  'prix_precedent',
  'dernier_message',
  'commentaire',
  'image_url',
] as const;

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Build the row to insert into `target` from a `source` row (as returned by
 * `select('*')`), carrying over only the shared columns and dropping
 * identity columns (id/created_at/updated_at/airtable_id) so the
 * destination table assigns its own.
 *
 * `listings` enforces NOT NULL + CHECK constraints (constructeur,
 * longueur_m > 0, annee in range, localisation) that `bateaux_a_suivre`
 * doesn't, so a tracked boat with incomplete data is rejected here — with a
 * message naming the missing fields — rather than failing opaquely at the
 * database.
 */
export function buildMovePayload(
  source: Record<string, unknown>,
  target: MovableListingTable
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of MOVABLE_FIELDS) {
    if (field in source) payload[field] = source[field];
  }

  if (target === 'listings') {
    const missing: string[] = [];
    if (!payload.constructeur) missing.push('constructeur');
    const longueur = payload.longueur_m != null ? Number(payload.longueur_m) : null;
    if (!longueur || longueur <= 0) missing.push('longueur');
    const annee = payload.annee != null ? Number(payload.annee) : null;
    if (!annee || annee < 1900 || annee > CURRENT_YEAR + 2) missing.push('année');
    if (!payload.localisation || payload.localisation === 'N/A') missing.push('localisation');

    if (missing.length > 0) {
      throw new MoveListingValidationError(
        `Complétez d'abord ces champs avant de déplacer vers le listing principal : ${missing.join(', ')}.`
      );
    }

    payload.proprietaire = payload.proprietaire || 'N/A';
    payload.capitaine = payload.capitaine || 'N/A';
  }

  return payload;
}
