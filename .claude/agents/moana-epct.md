---
description: Execute EPCT workflow (Explore, Plan, Code, Test) pour Moana Yachting SaaS avec intégration Airtable
allowed-tools: [WebSearch, WebFetch, Task, Grep, Glob, Read, Write, Edit, TodoWrite, Bash]
argument-hint: <feature description>
model: sonnet
---

# EPCT Workflow: Moana Yachting Edition

Workflow spécialisé pour le développement de fonctionnalités du SaaS Moana Yachting.

**Projet:** SaaS de gestion de listings de bateaux pour Moana Yachting
**Stack:** Next.js 14, React 19, TypeScript, Airtable, NextAuth.js, Tailwind CSS

---

## Phase 1: EXPLORE

### Contexte Projet Moana

#### Base Airtable
- **Base ID**: `appNyZVynxa8shk4c`
- **Listings Table**: `tblxxQhUvQd2Haztz`
- **Broker Table**: `tbl9dTwK6RfutmqVY`

#### Champs Listings
- Nom du Bateau (fld6d7lSBboRKmnuj)
- Constructeur (fldc7YcGLAfQi6qhr)
- Longueur M/pieds (fldg1Sj70TTkAsGqr)
- Année (fldL3ig1rDH70lbis)
- Propriétaire (fldAoxfgKKeEHeD9S)
- Capitaine (fldY9RXNPnV5xLgcg)
- Broker (fldgftA1xTZBnMuPZ)
- Localisation (fldlys06AjtMRcOmB)

#### Architecture Actuelle
- `lib/airtable/` - Client et opérations Airtable
- `app/api/` - API Routes Next.js
- `components/` - Composants React réutilisables
- `app/` - Pages et layouts Next.js 14 App Router

### Step 1.1: Recherche Externe
Rechercher:
- Best practices Airtable API avec Next.js 14
- Patterns d'authentification NextAuth.js avec providers custom
- UI/UX pour dashboards de gestion de listings
- Performance optimization pour requêtes Airtable
- Gestion d'état React pour CRUD operations

### Step 1.2: Exploration Codebase
Utiliser Task agent (Explore) pour analyser:
- Structure actuelle des composants
- Patterns de gestion d'état existants
- Intégrations Airtable existantes
- Architecture des API routes
- Composants UI réutilisables disponibles

### Step 1.3: Résumé de Contexte
Fournir:
- Patterns Airtable découverts
- Composants UI disponibles
- API routes existantes
- Contraintes techniques identifiées
- Recommandations d'implémentation

---

## Phase 2: PLAN

### Step 2.1: TodoWrite Plan

Créer un plan détaillé incluant:

**Backend/API:**
- Nouvelles API routes si nécessaires
- Modifications des opérations Airtable
- Gestion des erreurs et validation
- Tests API

**Frontend:**
- Nouveaux composants UI
- Modifications de pages existantes
- Intégration d'état (React hooks)
- Gestion des formulaires (react-hook-form)
- Toast notifications (react-hot-toast)

**Intégration:**
- Connexion frontend-backend
- Gestion du cache
- Loading states
- Error handling

**Tests:**
- Tests unitaires des composants
- Tests d'intégration API
- Tests E2E des flows utilisateur

### Step 2.2: Revue du Plan

Présenter:
- Architecture proposée
- Choix techniques et justifications
- Impacts sur le code existant
- Risques identifiés

**ATTENDRE APPROBATION UTILISATEUR**

---

## Phase 3: CODE

### Guidelines Spécifiques Moana

#### Backend (API Routes)
```typescript
// Toujours vérifier l'authentification
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
}

// Toujours valider avec Zod
const validation = schema.safeParse(body);
if (!validation.success) {
  return NextResponse.json({ success: false, error: 'Données invalides' }, { status: 400 });
}

// Toujours gérer les erreurs Airtable
try {
  // Opération Airtable
} catch (error) {
  console.error('Airtable error:', error);
  return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
}
```

#### Frontend (Composants)
```typescript
'use client'; // Pour les composants interactifs

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

// Toujours gérer loading states
const [loading, setLoading] = useState(false);

// Toujours afficher feedback utilisateur
toast.success('Opération réussie');
toast.error('Une erreur est survenue');

// Toujours typer avec TypeScript
interface Props {
  listing: Listing;
  onUpdate: (listing: Listing) => void;
}
```

#### Styles Tailwind
```typescript
// Utiliser les couleurs du thème
className="bg-primary-600 hover:bg-primary-700"
className="text-secondary-500"

// Responsive design
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// States
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

### Step 3.1: Implémentation

1. Suivre strictement le plan TodoWrite
2. Marquer chaque tâche as in_progress puis completed
3. Utiliser les patterns existants du projet
4. Commenter le code complexe uniquement
5. Valider avec TypeScript (pas d'any)

### Step 3.2: Quality Checks

- [ ] TypeScript compile sans erreurs
- [ ] Pas de console.log en production
- [ ] Gestion d'erreurs complète
- [ ] Loading states sur toutes les actions async
- [ ] Feedback utilisateur (toasts) sur succès/erreur
- [ ] Responsive design mobile-first
- [ ] Accessibilité (labels, ARIA)

---

## Phase 4: TEST

### Step 4.1: Tests Disponibles

Vérifier dans package.json:
```bash
npm run type-check  # TypeScript
npm run lint        # ESLint
npm run build       # Production build
npm run dev         # Dev server
```

### Step 4.2: Tests Manuels

**Checklist Fonctionnelle:**
- [ ] Authentification broker fonctionne
- [ ] CRUD listings fonctionne (Create, Read, Update, Delete)
- [ ] Filtres et recherche fonctionnent
- [ ] Messages d'erreur clairs
- [ ] Loading states visibles
- [ ] Responsive sur mobile/tablet/desktop
- [ ] Pas de fuites de données sensibles (API keys, passwords)

**Checklist Airtable:**
- [ ] Données correctement formatées
- [ ] Champs requis validés
- [ ] Rate limiting respecté (5 req/s)
- [ ] Erreurs Airtable gérées gracieusement

### Step 4.3: Validation Finale

**Résumé:**
- ✅ Tous les todos complétés
- ✅ TypeScript compile
- ✅ Pas d'erreurs console
- ✅ Tests manuels passés
- ✅ Performance acceptable (<3s load time)

**Fichiers Modifiés:**
- Liste des fichiers avec liens (file:line)

**Instructions Utilisateur:**
```bash
# Installer les dépendances
npm install

# Configurer .env.local (déjà fait)

# Lancer le dev server
npm run dev

# Accéder à http://localhost:3000
```

---

## Règles Spécifiques Moana

1. **Sécurité:**
   - Ne JAMAIS exposer AIRTABLE_API_KEY côté client
   - Toujours vérifier session avant opérations sensibles
   - Vérifier ownership des listings (broker match)

2. **Performance:**
   - Cache les données Airtable côté client
   - Debounce les recherches (300ms)
   - Lazy load les composants lourds
   - Optimiser les images

3. **UX:**
   - Loading states sur toutes actions
   - Toasts pour feedback utilisateur
   - Modales de confirmation pour delete
   - Messages d'erreur en français
   - Design cohérent avec charte yacht de luxe

4. **Code:**
   - Types TypeScript stricts (no any)
   - Composants réutilisables dans components/
   - API routes suivent pattern REST
   - Validation Zod systématique
   - Error handling complet

---

**Prêt à développer des fonctionnalités de qualité pour Moana Yachting! ⛵**
