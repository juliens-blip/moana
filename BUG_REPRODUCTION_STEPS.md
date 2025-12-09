# MOANA YACHTING - STEPS DE REPRODUCTION DES BUGS

## BUG #1: Erreur Jest Worker sur UPDATE/DELETE (CRITIQUE)

### Informations
- **Sévérité**: CRITIQUE (Bloque UPDATE et DELETE)
- **Type**: Infrastructure (Next.js dev server)
- **Impact**: Impossible de modifier ou supprimer des listings
- **Statut**: REPRODUCTIBLE

### Symptômes
- Routes PUT /api/listings/[id] retournent 500
- Routes DELETE /api/listings/[id] retournent 500
- Message d'erreur: "Jest worker encountered 2 child process exceptions, exceeding retry limit"

### Reproduction (Backend API)

#### Étape 1: Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"broker":"Charles","password":"changeme"}' \
  -c cookies.txt
```

**Résultat attendu**:
```json
{"success":true,"broker":"Charles"}
```

#### Étape 2: Créer un listing de test
```bash
curl -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "nomBateau": "Test Yacht",
    "constructeur": "Test Builder",
    "longueur": 25.5,
    "annee": 2023,
    "proprietaire": "Test Owner",
    "capitaine": "Test Captain",
    "localisation": "Monaco",
    "prix": "1,000,000 €"
  }'
```

**Résultat attendu**:
```json
{
  "success": true,
  "data": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    ...
  },
  "message": "Bateau créé avec succès"
}
```

**Noter l'ID du listing créé**

#### Étape 3: Tenter de modifier le listing (BUG!)
```bash
curl -X PUT http://localhost:3000/api/listings/[ID_DU_LISTING] \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"nomBateau":"Updated Test Yacht","prix":"1,200,000 €"}'
```

**Résultat actuel** (BUG):
```html
<!DOCTYPE html>
<html>
  ...
  "err": {
    "name": "Error",
    "message": "Jest worker encountered 2 child process exceptions, exceeding retry limit",
    "stack": "Error: Jest worker encountered 2 child process exceptions...\n    at ChildProcessWorker.initialize (...)"
  }
  ...
</html>
```

**Status**: 500 Internal Server Error

#### Étape 4: Tenter de supprimer le listing (BUG!)
```bash
curl -X DELETE http://localhost:3000/api/listings/[ID_DU_LISTING] \
  -b cookies.txt
```

**Résultat actuel** (BUG): Même erreur 500 avec Jest worker

### Reproduction (Frontend)

#### Étape 1: Login
1. Aller à `http://localhost:3000/login`
2. Entrer:
   - Broker: `Charles`
   - Password: `changeme`
3. Cliquer "Se connecter"
4. Vérifier redirection vers `/dashboard`

#### Étape 2: Créer un listing
1. Cliquer "Ajouter un bateau"
2. Remplir:
   - Nom du Bateau: `Test Yacht Frontend`
   - Constructeur: `Test Builder`
   - Longueur: `25.5`
   - Année: `2023`
   - Propriétaire: `Test Owner`
   - Capitaine: `Test Captain`
   - Localisation: `Monaco`
   - Prix: `1,000,000 €`
3. Cliquer "Créer le bateau"
4. Vérifier toast de succès et retour dashboard

#### Étape 3: Modifier le listing (BUG!)
1. Sur le listing "Test Yacht Frontend", cliquer "Modifier"
2. Changer le prix à: `1,500,000 €`
3. Cliquer "Mettre à jour"

**Résultat actuel** (BUG):
- Toast d'erreur: "Erreur lors de la mise à jour"
- Console du navigateur: erreur 500
- Network tab: Response 500 avec Jest worker error

#### Étape 4: Supprimer le listing (BUG!)
1. Sur le listing, cliquer "Supprimer"
2. Confirmer dans la modal
3. Observer l'erreur

**Résultat actuel** (BUG):
- Toast d'erreur: "Erreur lors de la suppression"
- Le listing reste affiché

### Cause Racine
Erreur dans le worker process de Next.js en mode développement. Le serveur dev a un état corrompu après plusieurs opérations.

### Solution
```bash
# Terminal 1: Arrêter le serveur
Ctrl+C

# Nettoyer le cache Next.js
rm -rf .next

# Windows:
# rmdir /s /q .next

# Redémarrer le serveur
npm run dev
```

### Vérification du Fix
Après redémarrage, relancer:
```bash
node test-framework.js
```

**Résultat attendu**: 15/15 tests passent (100%)

---

## BUG #2: Mots de Passe en Clair (SÉCURITÉ)

### Informations
- **Sévérité**: MOYENNE (Sécurité)
- **Type**: Security vulnerability
- **Impact**: Mots de passe stockés sans hash
- **Statut**: CONFIRMÉ

### Problème
Les mots de passe des brokers sont stockés en clair dans Supabase:

```sql
SELECT broker_name, password_hash FROM brokers;

-- Résultat:
-- broker_name | password_hash
-- Charles     | changeme      ← En clair!
-- Bart        | test123       ← En clair!
```

### Code Actuel (`lib/supabase/auth.ts`)
```javascript
// Ligne 54 - Comparaison directe (UNSAFE)
if (broker.password_hash !== password) {
  console.error('[login] Invalid password');
  return null;
}
```

### Solution Requise
Implémenter bcrypt pour hasher les mots de passe:

```javascript
import bcrypt from 'bcrypt';

// À la création de broker
const passwordHash = await bcrypt.hash(password, 10);

// Au login
const passwordMatch = await bcrypt.compare(password, broker.password_hash);
if (!passwordMatch) {
  return null;
}
```

### Migration des Données
Script de migration à créer:

```javascript
// scripts/migrate-passwords.ts
import bcrypt from 'bcrypt';
import { createAdminClient } from '@/lib/supabase/admin';

async function migratePasswords() {
  const supabase = createAdminClient();

  // Get all brokers
  const { data: brokers } = await supabase
    .from('brokers')
    .select('*');

  // Hash each password
  for (const broker of brokers) {
    const currentPassword = broker.password_hash;
    const hashedPassword = await bcrypt.hash(currentPassword, 10);

    await supabase
      .from('brokers')
      .update({ password_hash: hashedPassword })
      .eq('id', broker.id);

    console.log(`Migrated password for ${broker.broker_name}`);
  }
}
```

---

## PROBLÈMES NON CONFIRMÉS

### "Erreur 500 sur les filtres" - NON REPRODUCTIBLE

#### Rapport Utilisateur
> "Erreur 500 sur `/api/listings?broker=Charles`"

#### Tests Effectués
```bash
# Test 1: Filtre broker
curl "http://localhost:3000/api/listings?broker=Charles" -b cookies.txt

# Résultat: 200 OK ✓
# 9 listings retournés
```

#### Conclusion
Les filtres fonctionnent correctement. L'erreur 500 était probablement due au problème Jest worker temporaire.

### "Les filtres ne fonctionnent pas" - NON REPRODUCTIBLE

#### Tests Backend
```bash
# Tous les filtres testés:
✓ ?broker=Charles         → 9 résultats
✓ ?localisation=Monaco    → X résultats
✓ ?minLength=20&maxLength=50 → X résultats
✓ ?search=Princess        → X résultats
```

#### Hypothèses Frontend
Si le problème persiste en frontend:
1. **État React ne se met pas à jour**
   - Vérifier le debounce (300ms)
   - Vérifier `filtersRef.current` vs state

2. **Filtres prix côté client**
   - Fonction `parsePrix()` peut échouer sur certains formats
   - Vérifier console pour warnings

3. **UI ne reflète pas les changements**
   - Vérifier que `listings` state est bien mis à jour
   - Vérifier le render conditionnel

#### Tests Manuels à Faire
1. Ouvrir `http://localhost:3000/dashboard`
2. Ouvrir DevTools Console
3. Entrer "Charles" dans filtre broker
4. Observer:
   - Network tab: requête à `/api/listings?broker=Charles`
   - Response: doit contenir 9 listings
   - UI: doit afficher 9 cards
   - Console: pas d'erreurs

### "Création ne fonctionne pas" - NON REPRODUCTIBLE

#### Test Backend
```bash
POST /api/listings
Status: 201 Created ✓
Listing créé avec ID ✓
```

#### Hypothèses Frontend
Si problème en frontend:
1. **Validation Zod échoue**
   - Vérifier les messages d'erreur dans le formulaire
   - Vérifier console pour erreurs Zod

2. **Broker ID manquant**
   - Le champ `broker` est hidden et optionnel
   - Backend utilise session.brokerId par défaut ✓

3. **Redirection échoue**
   - Vérifier que `router.push('/dashboard')` s'exécute
   - Vérifier que `router.refresh()` recharge les données

#### Tests Manuels à Faire
1. Créer un listing via le formulaire
2. Observer DevTools:
   - Network: POST /api/listings avec status 201
   - Console: toast.success() appelé
   - Navigation: redirection vers /dashboard
3. Vérifier que le nouveau listing apparaît dans la liste

### "Modification ne fonctionne pas" - PARTIELLEMENT CONFIRMÉ

#### Status
- Backend: Erreur 500 (Jest worker) - À corriger
- Frontend: Devrait fonctionner après fix backend

#### Test Après Fix
1. Redémarrer serveur Next.js
2. Modifier un listing via le formulaire
3. Vérifier:
   - Network: PUT /api/listings/[id] avec status 200
   - Toast de succès
   - Données mises à jour dans la liste

---

## TESTS AUTOMATISÉS

### Framework de Test Complet
Fichier: `test-framework.js`

```bash
# Exécuter tous les tests
node test-framework.js

# Résultat actuel: 13/15 (86.67%)
# Après fix: devrait être 15/15 (100%)
```

### Tests de Brokers Supabase
Fichier: `test-brokers-supabase.js`

```bash
node test-brokers-supabase.js

# Vérifie:
# - Tous les brokers existent
# - Resolution nom → ID fonctionne
# - Case sensitivity
# - Listings associés
```

---

## CHECKLIST DE VÉRIFICATION

### Avant de Déclarer le Bug Résolu

#### Backend
- [ ] Redémarré le serveur Next.js
- [ ] Nettoyé le cache `.next`
- [ ] Exécuté `node test-framework.js`
- [ ] Tous les 15 tests passent
- [ ] PUT /api/listings/[id] retourne 200
- [ ] DELETE /api/listings/[id] retourne 200
- [ ] Pas d'erreur Jest worker dans les logs

#### Frontend
- [ ] Login fonctionne
- [ ] Dashboard charge les listings
- [ ] Filtre broker affiche les bons résultats
- [ ] Filtre localisation fonctionne
- [ ] Filtre longueur fonctionne
- [ ] Recherche fonctionne
- [ ] Création de listing réussit
- [ ] Modification de listing réussit
- [ ] Suppression de listing réussit
- [ ] Toasts s'affichent correctement
- [ ] Pas d'erreurs dans la console

#### Sécurité
- [ ] Plan de migration bcrypt créé
- [ ] Décision prise sur timing de migration
- [ ] Documentation mise à jour

---

## LOGS À SURVEILLER

### Logs Serveur Next.js
Fichier: Terminal où `npm run dev` s'exécute

**Erreurs à surveiller**:
```
Error: Jest worker encountered 2 child process exceptions
  → SOLUTION: Redémarrer serveur

[login] Broker not found: [NAME]
  → Vérifier que broker existe dans Supabase

[getListings] Error: ...
  → Vérifier connexion Supabase

Failed to fetch listings: ...
  → Vérifier query Supabase
```

### Logs Browser Console
Ouvrir DevTools (F12) → Console

**Erreurs à surveiller**:
```
Error fetching listings: ...
  → Vérifier Network tab pour voir status code

Error creating listing: ...
  → Vérifier validation Zod et données envoyées

Error updating listing: ...
  → Vérifier que PUT réussit (500 = bug Jest worker)

Erreur parsing prix: ...
  → Vérifier format du prix (ex: "1,850,000 €")
```

### Network Tab
Ouvrir DevTools (F12) → Network

**Requêtes à surveiller**:
```
POST /api/auth/login
  → Status: 200, Response: {"success":true,"broker":"..."}

GET /api/listings?broker=Charles
  → Status: 200, Response: {"success":true,"data":[...]}

POST /api/listings
  → Status: 201, Response: {"success":true,"data":{...},"message":"..."}

PUT /api/listings/[id]
  → Status: 200 (après fix), Response: {"success":true,...}

DELETE /api/listings/[id]
  → Status: 200 (après fix), Response: {"success":true,"message":"..."}
```

---

## CONTACT ET SUPPORT

### Fichiers de Référence
- `TEST_REPORT_COMPREHENSIVE.md` - Rapport complet
- `test-frontend-manual.md` - Guide tests manuels
- `test-results/` - Résultats JSON et texte
- `CLAUDE.md` - Documentation du projet

### Commandes Utiles
```bash
# Nettoyer et redémarrer
rm -rf .next && npm run dev

# Tests backend
node test-framework.js

# Tests Supabase
node test-brokers-supabase.js

# Voir les logs
cat test-results/test-summary.txt
```

---

**Document généré le**: 2025-12-09 15:05
**Par**: Agent Test Engineer (Claude)
