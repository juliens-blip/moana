---
description: Execute EPCT workflow (Explore, Plan, Code, Test) pour Moana Yachting SaaS avec integration Supabase (MCP)
allowed-tools: [WebSearch, WebFetch, Task, Grep, Glob, Read, Write, Edit, TodoWrite, Bash]
argument-hint: <feature description>
model: sonnet
---

# EPCT Workflow: Moana Yachting Edition

Workflow specialise pour le developpement de fonctionnalites du SaaS Moana Yachting.

**Projet:** SaaS de gestion de listings de bateaux pour Moana Yachting
**Stack:** Next.js 14, React 19, TypeScript, Supabase, NextAuth.js, Tailwind CSS

---

## Phase 1: EXPLORE

### Contexte Projet Moana

#### Backend Supabase
- Env vars requises (server/MCP) : `NEXT_PUBLIC_SUPABASE_URL` (ou `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY` (service role, ne jamais exposer cote client). Voir `.env.local` (non committe).
- MCP Server : `supabase-moana-mcp` (chemin `mcp/supabase-moana-mcp`, commande `node dist/index.js` ; charge les env vars ci-dessus). Tools MCP : `list_listings`, `get_listing`, `create_listing`, `update_listing`, `delete_listing`, `list_brokers`, `authenticate_broker`.
- Schema : tables `brokers`, `listings`, vue `listings_with_broker`. Les requetes MCP utilisent la service role key (RLS contourne pour ops backoffice).

#### Architecture Actuelle
- `lib/supabase/` - Client Supabase (si present) et types associes
- `app/api/` - API Routes Next.js
- `components/` - Composants React reutilisables
- `app/` - Pages et layouts Next.js 14 App Router

### Step 1.1: Recherche Externe
Rechercher:
- Bonnes pratiques Supabase (RLS, service role) avec Next.js 14 / MCP
- Patterns d'authentification NextAuth.js avec providers custom
- UI/UX pour dashboards de gestion de listings
- Performance sur requetes Supabase (filtres, indexes)
- Gestion d'etat React pour CRUD operations

### Step 1.2: Exploration Codebase
Utiliser Task agent (Explore) pour analyser:
- Structure actuelle des composants
- Patterns de gestion d'etat existants
- Integrations Supabase/MCP existantes
- Architecture des API routes
- Composants UI reutilisables disponibles

### Step 1.3: Resume de Contexte
Fournir:
- Patterns Supabase/MCP decouverts
- Composants UI disponibles
- API routes existantes
- Contraintes techniques identifiees
- Recommandations d'implementation

---

## Phase 2: PLAN

### Step 2.1: TodoWrite Plan

Creer un plan detaille incluant:

**Backend/API:**
- Nouvelles API routes si necessaires
- Integrations Supabase/MCP (CRUD listings/brokers)
- Validation (Zod) et gestion des erreurs Supabase
- Tests API

**Frontend:**
- Nouveaux composants UI
- Modifications de pages existantes
- Integration d'etat (React hooks)
- Gestion des formulaires (react-hook-form)
- Toast notifications (react-hot-toast)

**Integration:**
- Connexion frontend-backend ou via MCP
- Gestion du cache
- Loading states
- Error handling

**Tests:**
- Tests unitaires des composants
- Tests d'integration API
- Tests E2E des flows utilisateur

### Step 2.2: Revue du Plan

Presenter:
- Architecture proposee
- Choix techniques et justifications
- Impacts sur le code existant
- Risques identifies

**ATTENDRE APPROBATION UTILISATEUR**

---

## Phase 3: CODE

### Guidelines Specifiques Moana

#### Backend (API Routes)
```typescript
// Toujours verifier l'authentification
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ success: false, error: 'Non authentifie' }, { status: 401 });
}

// Toujours valider avec Zod
const validation = schema.safeParse(body);
if (!validation.success) {
  return NextResponse.json({ success: false, error: 'Donnees invalides' }, { status: 400 });
}

// Toujours gerer les erreurs Supabase
try {
  // Operation Supabase (via client ou MCP)
} catch (error) {
  console.error('Supabase error:', error);
  return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
}
```

#### Frontend (Composants)
```typescript
'use client'; // Pour les composants interactifs

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

// Toujours gerer loading states
const [loading, setLoading] = useState(false);

// Toujours afficher feedback utilisateur
toast.success('Operation reussie');
toast.error('Une erreur est survenue');

// Toujours typer avec TypeScript
interface Props {
  listing: Listing;
  onUpdate: (listing: Listing) => void;
}
```

#### Styles Tailwind
```typescript
// Utiliser les couleurs du theme
className="bg-primary-600 hover:bg-primary-700"
className="text-secondary-500"

// Responsive design
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// States
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

### Step 3.1: Implementation

1. Suivre strictement le plan TodoWrite
2. Marquer chaque tache as in_progress puis completed
3. Utiliser les patterns existants du projet
4. Commenter le code complexe uniquement
5. Valider avec TypeScript (pas d'any)

### Step 3.2: Quality Checks

- [ ] TypeScript compile sans erreurs
- [ ] Pas de console.log en production
- [ ] Gestion d'erreurs complete
- [ ] Loading states sur toutes les actions async
- [ ] Feedback utilisateur (toasts) sur succes/erreur
- [ ] Responsive design mobile-first
- [ ] Accessibilite (labels, ARIA)

---

## Phase 4: TEST

### Step 4.1: Tests Disponibles

Verifier dans package.json:
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
- [ ] Pas de fuites de donnees sensibles (API keys, passwords)

**Checklist Supabase:**
- [ ] Donnees correctement formattees
- [ ] Champs requis valides
- [ ] Erreurs Supabase gerees gracieusement (code/message)
- [ ] Service role key jamais exposee cote client

### Step 4.3: Validation Finale

**Resume:**
- ?? Tous les todos completes
- ?? TypeScript compile
- ?? Pas d'erreurs console
- ?? Tests manuels passes
- ?? Performance acceptable (<3s load time)

**Fichiers Modifies:**
- Liste des fichiers avec liens (file:line)

**Instructions Utilisateur:**
```bash
# Installer les dependances
npm install

# Configurer .env.local (Supabase URL + service role key)

# Lancer le dev server
npm run dev

# Acceder a http://localhost:3000
```

---

## Regles Specifiques Moana

1. **Securite:**
   - Ne JAMAIS exposer SUPABASE_SERVICE_ROLE_KEY cote client
   - Toujours verifier session avant operations sensibles
   - Verifier ownership des listings (broker match) si necessaire

2. **Performance:**
   - Debounce les recherches (300ms)
   - Lazy load les composants lourds
   - Optimiser les images

3. **UX:**
   - Loading states sur toutes actions
   - Toasts pour feedback utilisateur
   - Modales de confirmation pour delete
   - Messages d'erreur en francais
   - Design coherent avec charte yacht de luxe

4. **Code:**
   - Types TypeScript stricts (no any)
   - Composants reutilisables dans components/
   - API routes suivent pattern REST
   - Validation Zod systematique
   - Error handling complet

---

**Pret a developper des fonctionnalites de qualite pour Moana Yachting !**
