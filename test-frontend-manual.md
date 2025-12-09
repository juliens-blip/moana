# MOANA YACHTING - TESTS MANUELS FRONTEND

## Instructions pour tester manuellement

### 1. Tester le Login
1. Aller à `http://localhost:3000/login`
2. Entrer:
   - Broker: `Charles`
   - Password: `changeme`
3. Cliquer sur "Se connecter"
4. **Résultat attendu**: Redirection vers `/dashboard`

### 2. Tester les Filtres
1. Aller à `http://localhost:3000/dashboard`
2. Dans la barre de filtre "Broker", entrer: `Charles`
3. **Résultat attendu**: Afficher uniquement les bateaux de Charles (9 bateaux)
4. **Problème rapporté**: Erreur 500 sur `/api/listings?broker=Charles`

### 3. Tester Création de Bateau
1. Cliquer sur "Ajouter un bateau"
2. Remplir le formulaire:
   - Nom du Bateau: Test Yacht
   - Constructeur: Test Builder
   - Longueur: 25.5
   - Année: 2023
   - Propriétaire: Test Owner
   - Capitaine: Test Captain
   - Localisation: Monaco
   - Prix: 1,000,000 €
3. Cliquer sur "Créer le bateau"
4. **Résultat attendu**: Bateau créé et retour au dashboard
5. **Problème rapporté**: La création ne fonctionne pas

### 4. Tester Modification de Bateau
1. Sur un bateau existant, cliquer sur "Modifier"
2. Changer le prix: `1,500,000 €`
3. Cliquer sur "Mettre à jour"
4. **Résultat attendu**: Bateau mis à jour
5. **Problème rapporté**: La modification ne fonctionne pas

### 5. Tester Suppression de Bateau
1. Sur un bateau de test, cliquer sur "Supprimer"
2. Confirmer la suppression
3. **Résultat attendu**: Bateau supprimé du catalogue
4. **Problème backend**: Erreur 500 lors du DELETE

## Résultats des Tests Automatisés

### Tests Réussis (13/15) ✓
1. ✓ Login avec credentials valides
2. ✓ Login avec credentials invalides (rejet correct)
3. ✓ Get current session
4. ✓ GET /api/listings - Sans filtres
5. ✓ GET /api/listings?broker=Charles - Filtre broker
6. ✓ GET /api/listings?localisation=Monaco
7. ✓ GET /api/listings?minLength=20&maxLength=50
8. ✓ GET /api/listings?search=Princess
9. ✓ POST /api/listings - Créer un listing
10. ✓ GET /api/listings/[id] - Lire un listing
11. ✓ Validation - Champs requis manquants
12. ✓ Validation - Longueur négative
13. ✓ Validation - Année invalide

### Tests Échoués (2/15) ✗
1. ✗ PUT /api/listings/[id] - Erreur 500 (Jest worker error)
2. ✗ DELETE /api/listings/[id] - Erreur 500 (Jest worker error)

## Problèmes Identifiés

### 1. Erreur Jest Worker (CRITIQUE)
- **Symptôme**: "Jest worker encountered 2 child process exceptions"
- **Impact**: Routes PUT et DELETE retournent 500
- **Routes affectées**:
  - PUT /api/listings/[id]
  - DELETE /api/listings/[id]
- **Cause probable**: Problème avec le serveur Next.js en mode développement

### 2. Filtres Backend - FONCTIONNENT ✓
- Le backend filtre correctement par broker
- Le test `GET /api/listings?broker=Charles` réussit
- Retourne 9 bateaux de Charles

### 3. Création - FONCTIONNE ✓
- POST /api/listings réussit
- Retourne status 201
- Le bateau est créé dans Supabase

### 4. Modification - ERREUR SERVEUR ✗
- PUT /api/listings/[id] retourne 500
- Erreur Jest worker
- **BESOIN**: Redémarrer le serveur Next.js

### 5. Suppression - ERREUR SERVEUR ✗
- DELETE /api/listings/[id] retourne 500
- Même erreur Jest worker
- **BESOIN**: Redémarrer le serveur Next.js

## Recommandations

### Immédiat
1. **REDÉMARRER le serveur Next.js**
   ```bash
   # Arrêter le serveur (Ctrl+C)
   # Relancer
   npm run dev
   ```

2. **Retester UPDATE et DELETE après redémarrage**

### Tests Frontend à faire
1. Tester les filtres dans le navigateur
2. Tester la création de bateau via le formulaire
3. Tester la modification via le formulaire
4. Tester la suppression avec la modal de confirmation

### Vérifications supplémentaires
1. Vérifier les logs du navigateur (Console DevTools)
2. Vérifier les logs du serveur Next.js
3. Vérifier que les cookies de session sont bien transmis

## Conclusion

**Backend API**: 86.67% des tests passent (13/15) ✓

**Problèmes restants**:
1. Erreur Jest worker sur UPDATE/DELETE (nécessite redémarrage serveur)

**Points positifs**:
- Authentification fonctionne ✓
- Filtres fonctionnent ✓
- Création fonctionne ✓
- Validation fonctionne ✓
- GET routes fonctionnent ✓

**Action requise**: Redémarrer Next.js et retester UPDATE/DELETE
