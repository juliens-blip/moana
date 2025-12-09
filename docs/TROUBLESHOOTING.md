# Guide de Dépannage - Airtable Field Handling

## Diagnostic Rapide

### Erreur: INVALID_MULTIPLE_CHOICE_OPTIONS

```
┌─────────────────────────────────────────────┐
│ Symptôme                                    │
├─────────────────────────────────────────────┤
│ Error: INVALID_MULTIPLE_CHOICE_OPTIONS      │
│ Message: Insufficient permissions to        │
│ create new select option """"               │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Cause Probable                              │
├─────────────────────────────────────────────┤
│ • Chaîne vide envoyée pour un champ        │
│   optionnel                                 │
│ • Champ non nettoyé avant envoi à Airtable │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Solution                                    │
├─────────────────────────────────────────────┤
│ 1. Vérifier que cleanListingFields() est   │
│    utilisé avant l'appel Airtable          │
│ 2. Vérifier les logs de développement      │
│ 3. S'assurer que les champs vides sont     │
│    filtrés                                  │
└─────────────────────────────────────────────┘
```

**Correction Immédiate**:
```typescript
// ❌ Mauvais
const fields = { 'Prix': '' };
await listingsTable.create(fields);

// ✅ Bon
const fields = cleanListingFields({ 'Prix': '' });
await listingsTable.create(fields);  // fields = {}
```

---

### Erreur: Données Non Sauvegardées

```
┌─────────────────────────────────────────────┐
│ Symptôme                                    │
├─────────────────────────────────────────────┤
│ • Formulaire soumis sans erreur             │
│ • Mais données non visibles dans Airtable   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Diagnostic                                  │
├─────────────────────────────────────────────┤
│ 1. Vérifier les logs console               │
│    console.log('[createListing] Raw:')      │
│    console.log('[createListing] Cleaned:')  │
│                                             │
│ 2. Vérifier que cleaned !== {}             │
│                                             │
│ 3. Vérifier la réponse API                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Causes Possibles                            │
├─────────────────────────────────────────────┤
│ • Tous les champs filtrés (tous vides)     │
│ • Erreur réseau non catchée                │
│ • Session expirée                           │
│ • Problème d'authentification              │
└─────────────────────────────────────────────┘
```

**Vérifications**:
```bash
# 1. Vérifier les logs
npm run dev
# Soumettre le formulaire
# Chercher dans la console:
# [createListing] Raw fields: { ... }
# [createListing] Cleaned fields: { ... }

# 2. Vérifier la session
curl http://localhost:3000/api/auth/me

# 3. Vérifier Airtable
# Aller sur airtable.com et vérifier la table manuellement
```

---

### Erreur: Type Validation Failed

```
┌─────────────────────────────────────────────┐
│ Symptôme                                    │
├─────────────────────────────────────────────┤
│ • "Invalid type" error                      │
│ • Zod validation fails                      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Cause Probable                              │
├─────────────────────────────────────────────┤
│ • String envoyé pour un champ Number        │
│ • Number envoyé pour un champ String        │
│ • Format de données incorrect               │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Solution                                    │
├─────────────────────────────────────────────┤
│ 1. Vérifier le schéma Zod (validations.ts) │
│ 2. Vérifier les types dans le formulaire   │
│ 3. Utiliser valueAsNumber pour inputs      │
│    numériques                               │
└─────────────────────────────────────────────┘
```

**Correction**:
```typescript
// ❌ Mauvais - longueur sera une string
<input type="number" {...register('longueur')} />

// ✅ Bon - longueur sera un number
<input
  type="number"
  {...register('longueur', { valueAsNumber: true })}
/>
```

---

## Arbres de Décision

### Décision 1: Quel Outil de Validation Utiliser?

```
Début
  │
  ▼
Validation nécessaire?
  │
  ├─ OUI ──▶ Côté client ou serveur?
  │          │
  │          ├─ Client ──▶ Utiliser Zod + React Hook Form
  │          │             (pour UX immédiate)
  │          │
  │          ├─ Serveur ──▶ Utiliser Zod safeParse
  │          │              (pour sécurité)
  │          │
  │          └─ Les deux ──▶ Utiliser les deux!
  │                         (recommandé)
  │
  └─ NON ──▶ Passer directement à la
             transformation Airtable
```

### Décision 2: Comment Gérer les Champs Optionnels?

```
Champ optionnel?
  │
  ├─ OUI ──▶ Peut être vide?
  │          │
  │          ├─ OUI ──▶ Utiliser cleanListingFields()
  │          │          avant envoi à Airtable
  │          │          │
  │          │          └─ Validation Zod:
  │          │             .optional().or(z.literal(''))
  │          │
  │          └─ NON ──▶ Validation normale
  │                     avec .optional()
  │
  └─ NON ──▶ Champ requis
             Validation: .min(1, 'Message')
```

### Décision 3: Quelle Fonction Utiliser?

```
Besoin?
  │
  ├─ Nettoyer des données ──▶ cleanListingFields()
  │                           (avant Airtable API)
  │
  ├─ Vérifier une valeur ──▶ isValidAirtableValue()
  │                          (validation unitaire)
  │
  ├─ Gérer une erreur ──▶ parseAirtableError()
  │                       (dans catch block)
  │
  └─ CRUD Listing ──▶ createListing(), updateListing()
                      (fonctions de haut niveau)
```

---

## Checklist de Débogage

### Niveau 1: Vérifications Rapides

```
[ ] La console affiche-t-elle des erreurs?
[ ] Les variables d'environnement sont-elles correctes?
[ ] L'utilisateur est-il authentifié?
[ ] Les champs requis sont-ils remplis?
[ ] Le serveur de développement fonctionne-t-il?
```

### Niveau 2: Vérifications Intermédiaires

```
[ ] Les logs [createListing] apparaissent-ils?
[ ] Les champs nettoyés sont-ils différents des champs bruts?
[ ] La validation Zod passe-t-elle?
[ ] La requête HTTP arrive-t-elle à l'API?
[ ] La réponse API contient-elle une erreur?
```

### Niveau 3: Vérifications Avancées

```
[ ] cleanListingFields() fonctionne-t-elle correctement?
[ ] Les types TypeScript sont-ils corrects?
[ ] Le schéma Airtable correspond-il au code?
[ ] Y a-t-il des problèmes de rate limiting?
[ ] Les permissions Airtable sont-elles correctes?
```

---

## Patterns de Logs

### Log Normal (Succès)

```
[createListing] Raw fields: {
  'Nom du Bateau': 'Sunseeker 76',
  'Prix Actuel (€/$)': '',
  'Commentaire': 'Excellent état'
}
[createListing] Cleaned fields: {
  'Nom du Bateau': 'Sunseeker 76',
  'Commentaire': 'Excellent état'
}
[createListing] Successfully created record: recXXXXXXXXXX
```

### Log d'Erreur (Échec)

```
[createListing] Raw fields: { ... }
[createListing] Cleaned fields: { ... }
[createListing] Error creating listing: {
  message: 'INVALID_MULTIPLE_CHOICE_OPTIONS',
  statusCode: 422,
  error: { ... }
}
```

**Interprétation**:
- Si "Raw" et "Cleaned" sont identiques → Problème de nettoyage
- Si "Cleaned" est vide {} → Tous les champs étaient vides
- Si erreur après "Successfully created" → Problème de mapping de retour

---

## Scénarios Courants

### Scénario 1: Champ Prix Vide

**Situation**: Utilisateur laisse le champ "Prix" vide

**Flux Attendu**:
```
1. Formulaire soumis avec prix: ""
2. Validation Zod: ✓ (champ optionnel)
3. API route reçoit: { prix: "" }
4. createListing appelé
5. cleanListingFields filtre prix: ""
6. Airtable reçoit: {} (sans le champ prix)
7. Succès ✓
```

**Flux Problématique**:
```
1. Formulaire soumis avec prix: ""
2. Validation Zod: ✓
3. API route reçoit: { prix: "" }
4. Envoi direct à Airtable (sans nettoyage)
5. Airtable rejette: INVALID_MULTIPLE_CHOICE_OPTIONS
6. Échec ✗
```

**Solution**: Vérifier que `cleanListingFields()` est bien appelé

### Scénario 2: Tous les Champs Optionnels Vides

**Situation**: Formulaire minimal (uniquement champs requis)

**Flux Attendu**:
```
1. Formulaire: { nomBateau: "X", ..., prix: "", commentaire: "" }
2. cleanListingFields filtre tous les champs vides
3. Airtable reçoit uniquement les champs requis
4. Succès ✓
```

**Vérification**:
```typescript
// Vérifier les logs
console.log('[createListing] Cleaned fields:', fields);
// Doit contenir uniquement les champs non-vides
```

### Scénario 3: Mise à Jour Partielle

**Situation**: Modifier uniquement le prix d'un listing

**Flux Attendu**:
```
1. updateListing({ prix: "1,500,000 €" })
2. cleanListingFields: { 'Prix Actuel (€/$)': "1,500,000 €" }
3. Airtable update avec uniquement le champ prix
4. Succès ✓
```

**Flux Problématique**:
```
1. updateListing({ prix: "" })  // Vider le prix
2. cleanListingFields: {}  // Filtré
3. Airtable update avec objet vide
4. Rien n'est modifié (comportement attendu)
```

**Note**: Pour supprimer un champ, utiliser `null` (si supporté par Airtable)

---

## Outils de Diagnostic

### 1. Console Logs

**Activer les logs détaillés**:
```typescript
// Dans lib/airtable/listings.ts
console.log('[createListing] Raw fields:', rawFields);
console.log('[createListing] Cleaned fields:', fields);
console.log('[createListing] Airtable response:', record);
```

**Interpréter les logs**:
- Comparer raw vs cleaned pour voir ce qui est filtré
- Vérifier que les types sont corrects
- Chercher les patterns d'erreur

### 2. Network Tab

**Dans Chrome DevTools**:
1. F12 → Network tab
2. Filtrer: XHR
3. Soumettre le formulaire
4. Inspecter la requête POST `/api/listings`
5. Vérifier Request Payload
6. Vérifier Response

**Ce qu'il faut vérifier**:
- Status code: 200 (succès) ou 4xx/5xx (erreur)
- Request body: données envoyées
- Response body: résultat ou erreur

### 3. React DevTools

**Inspecter le state du formulaire**:
1. Installer React DevTools
2. F12 → Components tab
3. Sélectionner le composant ListingForm
4. Vérifier les hooks → useForm
5. Voir les valeurs courantes

### 4. Airtable Interface

**Vérification manuelle**:
1. Aller sur airtable.com
2. Ouvrir la base Moana Yachting
3. Table Listings
4. Vérifier que le record existe
5. Comparer avec les données attendues

---

## FAQ Dépannage

### Q: cleanListingFields() filtre tout, même les champs valides

**A**: Vérifier que les valeurs ne sont pas des chaînes vides déguisées

```typescript
// Problème
const fields = {
  'Nom': '   ',  // Whitespace uniquement → filtré
  'Prix': 'null',  // String "null" → gardé (mais invalide)
};

// Solution: Trim avant
const fields = {
  'Nom': formData.nom.trim(),  // '' → filtré
  'Prix': formData.prix || undefined,  // undefined → filtré
};
```

### Q: Les erreurs Airtable ne sont pas traduites

**A**: Vérifier que `parseAirtableError()` est utilisé dans le catch

```typescript
// ❌ Mauvais
catch (error) {
  throw error;  // Message technique
}

// ✅ Bon
catch (error) {
  const message = parseAirtableError(error);
  throw new Error(message);  // Message FR
}
```

### Q: Les logs n'apparaissent pas

**A**: Vérifier que vous êtes en mode développement

```bash
# Vérifier NODE_ENV
echo $NODE_ENV  # Doit être 'development'

# Ou dans le code
if (process.env.NODE_ENV === 'development') {
  console.log('...');  // Logs uniquement en dev
}
```

### Q: Valeur 0 ou false est filtrée

**A**: Ce n'est pas normal, vérifier le code

```typescript
// cleanListingFields() devrait garder 0 et false
const result = cleanListingFields({ count: 0, active: false });
// Résultat attendu: { count: 0, active: false }
// Si filtré, il y a un bug dans cleanListingFields()
```

---

## Contact Support

### Niveau 1: Auto-Dépannage
1. Lire ce guide
2. Vérifier les logs
3. Consulter `docs/QUICK_REFERENCE.md`

### Niveau 2: Documentation
1. Consulter `docs/AIRTABLE_FIELD_HANDLING.md`
2. Consulter `docs/CODE_EXAMPLES.md`
3. Consulter `docs/ARCHITECTURE_DIAGRAM.md`

### Niveau 3: Debug Avancé
1. Activer tous les logs
2. Reproduire le problème
3. Capturer les logs
4. Analyser le flux de données

---

**Dernière mise à jour**: 2025-12-07
**Version**: 1.0.0
