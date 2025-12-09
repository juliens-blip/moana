# Guide de Test : Fix Broker Resolution

## Objectif
Vérifier que le système de résolution des brokers (nom vs UUID) fonctionne correctement.

## Pré-requis
- Application démarrée : `npm run dev`
- Utilisateur connecté avec session valide
- Au moins un broker dans la base de données (ex: "Charles")

## Tests à Effectuer

### Test 1 : Filtre par Nom de Broker
**URL à tester** :
```
http://localhost:3000/api/listings?broker=Charles
```

**Résultat attendu** :
- ✅ Status Code : 200
- ✅ Response : `{ "success": true, "data": [...] }`
- ✅ Données : Liste des bateaux de Charles uniquement
- ❌ PAS d'erreur 500

**Logs serveur attendus** :
```
[resolveBrokerNameToId] Resolving: Charles
[resolveBrokerNameToId] Found UUID: 550e8400-e29b-41d4-a716-446655440000
```

### Test 2 : Filtre par UUID de Broker
**Prérequis** : Obtenir l'UUID d'un broker existant

**URL à tester** :
```
http://localhost:3000/api/listings?broker=550e8400-e29b-41d4-a716-446655440000
```

**Résultat attendu** :
- ✅ Status Code : 200
- ✅ Response : `{ "success": true, "data": [...] }`
- ✅ Données : Liste des bateaux du broker
- ✅ PAS de requête DB pour résoudre (déjà un UUID)

**Logs serveur attendus** :
```
[resolveBrokerNameToId] Already UUID: 550e8400-e29b-41d4-a716-446655440000
```

### Test 3 : Filtre avec Broker Inexistant
**URL à tester** :
```
http://localhost:3000/api/listings?broker=NonExistentBroker
```

**Résultat attendu** :
- ✅ Status Code : 200
- ✅ Response : `{ "success": true, "data": [] }`
- ✅ Données : Tableau vide
- ❌ PAS d'erreur 500

**Logs serveur attendus** :
```
[resolveBrokerNameToId] Broker not found: NonExistentBroker
[getListings] Broker not found: NonExistentBroker
```

### Test 4 : Création de Bateau sans Broker
**Action** :
1. Se connecter en tant que broker (ex: Charles)
2. Aller sur `/dashboard/listings/create`
3. Remplir le formulaire SANS sélectionner de broker
4. Soumettre

**Résultat attendu** :
- ✅ Bateau créé avec succès
- ✅ `broker_id` = UUID du broker connecté (Charles)
- ✅ Message de succès affiché
- ✅ Redirection vers dashboard

**Vérification DB** :
```sql
SELECT id, nom_bateau, broker_id FROM listings ORDER BY created_at DESC LIMIT 1;
-- broker_id doit être l'UUID de Charles, pas "Charles"
```

### Test 5 : Création de Bateau avec Broker Spécifié
**Action** :
1. Modifier le formulaire pour accepter un champ broker (temporaire pour test)
2. Créer un bateau avec `broker: "Marie"`

**Résultat attendu** :
- ✅ Bateau créé avec succès
- ✅ `broker_id` = UUID de Marie (résolu depuis le nom)
- ✅ Listing affiché avec le nom "Marie" (jointure)

**Code de test API direct** :
```bash
curl -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -H "Cookie: moana_session=..." \
  -d '{
    "nomBateau": "Test Yacht",
    "constructeur": "Test Builder",
    "longueur": 25.5,
    "annee": 2024,
    "proprietaire": "Test Owner",
    "capitaine": "Test Captain",
    "broker": "Marie",
    "localisation": "Monaco"
  }'
```

### Test 6 : Modification de Bateau (Changement de Broker)
**Action** :
1. Aller sur `/dashboard/listings/[id]/edit`
2. Le broker actuel est affiché (UUID dans le champ caché)
3. Modifier d'autres champs
4. Soumettre

**Résultat attendu** :
- ✅ Bateau mis à jour avec succès
- ✅ `broker_id` reste inchangé
- ✅ Message de succès affiché

**Test avancé (API directe)** :
```bash
curl -X PUT http://localhost:3000/api/listings/LISTING_ID \
  -H "Content-Type: application/json" \
  -H "Cookie: moana_session=..." \
  -d '{
    "nomBateau": "Updated Name",
    "broker": "Charles"
  }'
```

### Test 7 : Combinaison de Filtres
**URL à tester** :
```
http://localhost:3000/api/listings?broker=Charles&localisation=Monaco&minLength=20
```

**Résultat attendu** :
- ✅ Status Code : 200
- ✅ Données : Bateaux de Charles, à Monaco, >20m seulement
- ✅ Tous les filtres appliqués correctement

### Test 8 : Recherche + Filtre Broker
**URL à tester** :
```
http://localhost:3000/api/listings?broker=Charles&search=Sunseeker
```

**Résultat attendu** :
- ✅ Status Code : 200
- ✅ Données : Bateaux de Charles dont le nom contient "Sunseeker"
- ✅ Filtres combinés fonctionnent

## Tests Automatisés (Optionnel)

### Jest Test Suite
```typescript
// tests/lib/supabase/listings.test.ts
import { resolveBrokerNameToId } from '@/lib/supabase/listings';

describe('resolveBrokerNameToId', () => {
  it('should return UUID as-is', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = await resolveBrokerNameToId(uuid);
    expect(result).toBe(uuid);
  });

  it('should resolve broker name to UUID', async () => {
    const result = await resolveBrokerNameToId('Charles');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should return null for non-existent broker', async () => {
    const result = await resolveBrokerNameToId('NonExistent');
    expect(result).toBeNull();
  });
});
```

## Vérification des Logs

### Logs de Succès
```
[resolveBrokerNameToId] Resolving: Charles
[resolveBrokerNameToId] Found UUID: 550e8400-...
[getListings] Filtering by broker_id: 550e8400-...
[getListings] Returned 5 listings
```

### Logs d'Erreur (OK)
```
[resolveBrokerNameToId] Broker not found: NonExistent
[getListings] Broker not found: NonExistent
[getListings] Returned 0 listings (by design)
```

### Logs d'Erreur (NOT OK - à investiguer)
```
[createListing] Error: invalid input syntax for type uuid
[updateListing] Error: Broker not found: ...
```

## Checklist Finale

Avant de considérer le fix comme validé :

- [ ] Test 1 réussi (Filtre par nom)
- [ ] Test 2 réussi (Filtre par UUID)
- [ ] Test 3 réussi (Broker inexistant)
- [ ] Test 4 réussi (Création sans broker)
- [ ] Test 5 réussi (Création avec broker)
- [ ] Test 6 réussi (Modification)
- [ ] Test 7 réussi (Combinaison filtres)
- [ ] Test 8 réussi (Recherche + broker)
- [ ] Aucune erreur 500 dans les logs
- [ ] Build successful (`npm run build`)
- [ ] Types TypeScript valides
- [ ] Documentation mise à jour

## Rollback Plan

Si le fix cause des problèmes :

1. **Restaurer l'ancien code** :
```bash
git checkout HEAD~1 -- lib/supabase/listings.ts
git checkout HEAD~1 -- app/api/listings/route.ts
git checkout HEAD~1 -- lib/types.ts
```

2. **Ou désactiver temporairement** :
```typescript
// Dans getListings, commenter la résolution :
if (filters?.broker) {
  // TEMPORAIRE : UUID seulement
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.broker)) {
    console.warn('Broker must be UUID for now');
    return [];
  }
  query = query.eq('broker_id', filters.broker);
}
```

## Support

En cas de problème :
1. Vérifier les logs serveur (`npm run dev`)
2. Vérifier les requêtes DB (Supabase Dashboard)
3. Vérifier les cookies de session
4. Consulter `BROKER_RESOLUTION_SOLUTION.md` pour les détails

---

**Date** : 2025-12-09
**Status** : Prêt pour tests
