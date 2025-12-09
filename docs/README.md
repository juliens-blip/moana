# Documentation - Moana Yachting SaaS

## Vue d'Ensemble

Ce dossier contient la documentation technique pour la gestion robuste des champs Airtable dans l'application Moana Yachting.

## Documents Disponibles

### 1. QUICK_REFERENCE.md
**Pour qui**: Développeurs cherchant une réponse rapide

**Contenu**:
- TL;DR de la solution
- Fonctions principales avec exemples
- Cheat sheet des champs Airtable
- Quick fixes pour problèmes courants
- Commandes de debug

**Utiliser quand**: Vous avez besoin d'une réponse rapide ou d'un rappel

### 2. AIRTABLE_FIELD_HANDLING.md
**Pour qui**: Développeurs voulant comprendre en profondeur

**Contenu**:
- Analyse du problème initial
- Solution architecturale complète
- Implémentation détaillée
- Pattern de validation multi-couches
- Tests recommandés
- Debugging avancé
- Bonnes pratiques

**Utiliser quand**: Vous devez modifier le système ou comprendre le "pourquoi"

### 3. CODE_EXAMPLES.md
**Pour qui**: Développeurs implémentant de nouvelles fonctionnalités

**Contenu**:
- Exemples de code pratiques
- Patterns de validation
- Gestion d'erreurs avancée
- Tests unitaires
- Exemples complets de formulaires et hooks

**Utiliser quand**: Vous écrivez du nouveau code et cherchez des patterns

### 4. ARCHITECTURE_DIAGRAM.md
**Pour qui**: Architectes, nouveaux développeurs sur le projet

**Contenu**:
- Diagrammes ASCII du flux de données
- Architecture des fichiers
- Stratégie de gestion d'erreurs
- Validation multi-couches
- Considérations de performance et sécurité

**Utiliser quand**: Vous devez comprendre le système dans son ensemble

## Problème Résolu

### Erreur Initiale
```
Error: INVALID_MULTIPLE_CHOICE_OPTIONS
Message: Insufficient permissions to create new select option """"
```

### Cause
Airtable rejette les requêtes contenant des chaînes vides (`""`) pour les champs optionnels, notamment les champs de type "Single select".

### Solution
Utilisation de `cleanListingFields()` pour filtrer automatiquement les valeurs vides avant l'envoi à Airtable.

## Utilisation Rapide

```typescript
// 1. Import
import { cleanListingFields, parseAirtableError } from '@/lib/utils';

// 2. Nettoyer les données
const rawFields = {
  'Nom du Bateau': 'Sunseeker 76',
  'Prix Actuel (€/$)': '',  // Vide
  'Commentaire': null,  // Null
};

const cleanedFields = cleanListingFields(rawFields);
// Résultat: { 'Nom du Bateau': 'Sunseeker 76' }

// 3. Envoyer à Airtable
const record = await listingsTable.create(cleanedFields);
```

## Fonctions Principales

### cleanListingFields(fields)
Supprime les valeurs vides (chaînes vides, null, undefined) d'un objet.

**Paramètres**:
- `fields`: Objet avec tous les champs (y compris vides)

**Retourne**:
- Objet nettoyé avec uniquement les champs valides

### isValidAirtableValue(value)
Vérifie si une valeur est acceptable pour Airtable.

**Paramètres**:
- `value`: Valeur à vérifier

**Retourne**:
- `true` si valide, `false` sinon

### parseAirtableError(error)
Convertit les erreurs Airtable en messages user-friendly en français.

**Paramètres**:
- `error`: Objet d'erreur Airtable

**Retourne**:
- Message en français compréhensible par l'utilisateur

## Fichiers Modifiés

```
lib/
  utils.ts                    # Nouvelles fonctions ajoutées
  airtable/
    listings.ts               # Intégration cleanListingFields()
```

## Architecture en 3 Couches

```
1. Frontend (React Hook Form + Zod)
   └─> Validation UX, feedback immédiat

2. API Route (Zod Server-side)
   └─> Validation sécurité, protection malicious data

3. Airtable Operations (cleanListingFields)
   └─> Compatibilité Airtable, prévention erreurs API
```

## Tests

```bash
# Lancer les tests
npm test

# Tests spécifiques
npm test -- cleanListingFields
npm test -- airtable
```

## Debugging

### Logs en Développement
```typescript
console.log('[createListing] Raw fields:', rawFields);
console.log('[createListing] Cleaned fields:', cleanedFields);
```

### Vérifier les Variables d'Environnement
```bash
cat .env.local | grep AIRTABLE
```

## Workflow de Résolution de Problèmes

1. **Lire Quick Reference** - Voir si c'est un problème connu
2. **Vérifier les logs** - Comparer raw vs cleaned fields
3. **Consulter Code Examples** - Chercher un pattern similaire
4. **Lire Airtable Field Handling** - Comprendre le contexte complet
5. **Vérifier Architecture Diagram** - Comprendre le flux de données

## Bonnes Pratiques

### ✅ À Faire
- Utiliser `cleanListingFields()` avant tout appel Airtable
- Logger les données en développement
- Utiliser `parseAirtableError()` pour les messages utilisateur
- Valider en multi-couches (frontend + backend + Airtable)
- Tester avec des champs vides

### ❌ À Éviter
- Envoyer des chaînes vides à Airtable
- Ignorer les erreurs Airtable
- Exposer les erreurs techniques aux utilisateurs
- Supposer que les champs optionnels sont toujours remplis

## Références Externes

- [Airtable API - Field Types](https://airtable.com/developers/web/api/field-model)
- [Airtable API - Error Codes](https://airtable.com/developers/web/api/errors)
- [Zod Documentation](https://zod.dev/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

## Support

Pour toute question sur cette documentation:

1. **Problème technique**: Consulter `AIRTABLE_FIELD_HANDLING.md`
2. **Besoin d'exemples**: Consulter `CODE_EXAMPLES.md`
3. **Référence rapide**: Consulter `QUICK_REFERENCE.md`
4. **Comprendre l'architecture**: Consulter `ARCHITECTURE_DIAGRAM.md`

## Changelog

### Version 1.0.0 (2025-12-07)
- Documentation initiale
- Implémentation de `cleanListingFields()`
- Implémentation de `parseAirtableError()`
- Intégration dans `createListing()` et `updateListing()`
- Guides complets et exemples de code

---

**Auteur**: Claude Sonnet 4.5
**Date de Création**: 2025-12-07
**Dernière Mise à Jour**: 2025-12-07
**Version**: 1.0.0
