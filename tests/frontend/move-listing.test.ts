/**
 * Move Listing Tests
 *
 * Tests:
 * - buildMovePayload carries the shared columns and drops identity columns
 *   (id/created_at/updated_at/airtable_id/brokers) when moving either way
 * - buildMovePayload rejects a move into `listings` when required fields
 *   (constructeur, longueur, annee, localisation) are missing or invalid,
 *   naming the missing fields
 * - buildMovePayload defaults proprietaire/capitaine to 'N/A' when moving
 *   into `listings` if the tracked row never set them
 *
 * Run: npx tsx tests/frontend/move-listing.test.ts
 */

import assert from 'node:assert/strict';
import { buildMovePayload, MoveListingValidationError } from '@/lib/move-listing';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function run(name: string, fn: () => void) {
  try {
    fn();
    results.push({ test: name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: name, passed: false, error: message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${message}`);
  }
}

const CURRENT_YEAR = new Date().getFullYear();

run('buildMovePayload carries shared columns and drops identity columns (listings -> bateaux_a_suivre)', () => {
  const source = {
    id: 'listing-1',
    nom_bateau: 'Eclat',
    constructeur: 'Sunseeker',
    longueur_m: 18.5,
    annee: 2015,
    proprietaire: 'M. Dupont',
    capitaine: 'Cap. Martin',
    broker_id: 'broker-1',
    localisation: 'Cannes',
    etoile: true,
    nombre_cabines: 4,
    prix_actuel: '1,850,000 €',
    prix_precedent: '1,950,000 €',
    dernier_message: 'Offre en cours',
    commentaire: 'Bateau bien entretenu',
    image_url: 'https://example.com/eclat.jpg',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    airtable_id: 'rec123',
    brokers: { broker_name: 'Martin', email: 'martin@example.com' },
  };

  const payload = buildMovePayload(source, 'bateaux_a_suivre');

  assert.equal(payload.nom_bateau, 'Eclat');
  assert.equal(payload.constructeur, 'Sunseeker');
  assert.equal(payload.longueur_m, 18.5);
  assert.equal(payload.prix_actuel, '1,850,000 €');
  assert.equal(payload.id, undefined);
  assert.equal(payload.created_at, undefined);
  assert.equal(payload.updated_at, undefined);
  assert.equal(payload.airtable_id, undefined);
  assert.equal(payload.brokers, undefined);
});

run('buildMovePayload accepts a complete tracked boat moving into listings', () => {
  const source = {
    id: 'tracked-1',
    nom_bateau: 'Friday',
    constructeur: 'Azimut',
    longueur_m: 15,
    annee: 2018,
    proprietaire: 'N/A',
    capitaine: 'N/A',
    broker_id: null,
    localisation: 'Antibes',
    etoile: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  };

  const payload = buildMovePayload(source, 'listings');

  assert.equal(payload.constructeur, 'Azimut');
  assert.equal(payload.proprietaire, 'N/A');
  assert.equal(payload.capitaine, 'N/A');
});

run('buildMovePayload defaults missing proprietaire/capitaine to N/A when moving into listings', () => {
  const source = {
    id: 'tracked-2',
    nom_bateau: 'Milena',
    constructeur: 'Riva',
    longueur_m: 12,
    annee: 2020,
    localisation: 'Monaco',
  };

  const payload = buildMovePayload(source, 'listings');

  assert.equal(payload.proprietaire, 'N/A');
  assert.equal(payload.capitaine, 'N/A');
});

run('buildMovePayload rejects a move into listings missing constructeur/longueur/annee/localisation', () => {
  const source = {
    id: 'tracked-3',
    nom_bateau: 'Deramor',
    constructeur: null,
    longueur_m: null,
    annee: null,
    localisation: 'N/A',
  };

  assert.throws(
    () => buildMovePayload(source, 'listings'),
    (error: unknown) => {
      assert.ok(error instanceof MoveListingValidationError);
      const message = (error as Error).message;
      assert.match(message, /constructeur/);
      assert.match(message, /longueur/);
      assert.match(message, /année/);
      assert.match(message, /localisation/);
      return true;
    }
  );
});

run('buildMovePayload rejects longueur_m <= 0 and an out-of-range annee moving into listings', () => {
  const source = {
    id: 'tracked-4',
    nom_bateau: 'Loyh',
    constructeur: 'Beneteau',
    longueur_m: 0,
    annee: CURRENT_YEAR + 10,
    localisation: 'Toulon',
  };

  assert.throws(
    () => buildMovePayload(source, 'listings'),
    (error: unknown) => {
      assert.ok(error instanceof MoveListingValidationError);
      const message = (error as Error).message;
      assert.match(message, /longueur/);
      assert.match(message, /année/);
      return true;
    }
  );
});

// Summary
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
