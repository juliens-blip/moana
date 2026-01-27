# Moana Yachting - SaaS de Gestion de Listings de Bateaux

## Vue d'ensemble du projet

Application SaaS pour gérer les listings de bateaux de l'entreprise Moana Yachting, avec intégration complète à Airtable pour la gestion des données.

## Stack Technique

- **Frontend**: Next.js 14 App Router, React 19, TypeScript
- **Backend**: Next.js API Routes
- **Database**: Airtable (via REST API)
- **Authentication**: NextAuth.js avec Airtable Broker table
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion pour animations interactives
- **MCP Server**: Airtable MCP pour intégration Claude

## Informations Airtable

### Credentials
- **API Key**: `YOUR_AIRTABLE_API_KEY` (stored in `.env.local`)
- **Base ID**: `appNyZVynxa8shk4c`

### Tables

#### 1. Listings Table (`tblxxQhUvQd2Haztz`)

Stocke tous les bateaux et leurs informations.

**Champs:**
- `Nom du Bateau` (fld6d7lSBboRKmnuj) - Long text
- `Constructeur` (fldc7YcGLAfQi6qhr) - Long text
- `Longueur (M/pieds)` (fldg1Sj70TTkAsGqr) - Number (decimal, 1 digit)
- `Année` (fldL3ig1rDH70lbis) - Number (decimal, 1 digit)
- `Propriétaire` (fldAoxfgKKeEHeD9S) - Text
- `Capitaine` (fldY9RXNPnV5xLgcg) - Text
- `Broker` (fldgftA1xTZBnMuPZ) - Text
- `Localisation` (fldlys06AjtMRcOmB) - Single line text (free text input)
- `Prix` (optional) - Number (in EUR)
- `Prix précédent` (optional) - Number (previous price in EUR)
- `Dernier message` (optional) - Single line text (max 500 characters)
- `Commentaire` (optional) - Long text (max 2000 characters)

#### 2. Broker Table (`tbl9dTwK6RfutmqVY`)

Stocke les informations des brokers avec authentification.

**Champs:**
- `broker` (fldpNFluYa2REobQ4) - Text (nom d'utilisateur)
- `password` (fldVywv2BOOvz0ubQ) - Text (mot de passe)
- `Date de création` (fldZldLW4fp8aFSu5) - Created time

## Fonctionnalités

### 1. Authentification Broker
- Page de connexion pour chaque broker
- Session management avec NextAuth.js
- Authentification contre la table Broker d'Airtable

### 2. CRUD Listings
- **Create**: Ajouter un nouveau bateau au catalogue
- **Read**: Afficher la liste complète des bateaux
- **Update**: Modifier les informations d'un bateau existant
- **Delete**: Supprimer un bateau du catalogue

### 3. Filtrage et Recherche
- Recherche par nom de bateau et constructeur
- Filtrage par broker (texte libre)
- Filtrage par localisation (texte libre)
- Filtrage par longueur (min/max)
- Filtrage par prix (min/max)

### 4. Interface Utilisateur
- Dashboard avec vue d'ensemble des listings
- Cartes de bateaux cliquables avec animations Framer Motion
- Modal détaillé affichant tous les champs au clic
- Formulaire de création/modification
- Confirmation de suppression
- Navigation intuitive
- Animations fluides sur scroll et interactions

## Architecture de l'Application

```
moana/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx          # Page de connexion broker
│   │   └── layout.tsx             # Layout auth
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx          # Dashboard principal
│   │   ├── listings/
│   │   │   ├── page.tsx          # Liste des bateaux
│   │   │   ├── create/
│   │   │   │   └── page.tsx      # Créer un bateau
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx      # Détails bateau
│   │   │   │   └── edit/
│   │   │   │       └── page.tsx  # Modifier bateau
│   │   │   └── layout.tsx
│   │   └── layout.tsx             # Layout dashboard
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts      # NextAuth configuration
│   │   ├── listings/
│   │   │   ├── route.ts          # GET (all), POST (create)
│   │   │   └── [id]/
│   │   │       └── route.ts      # GET, PUT, DELETE (single)
│   │   └── brokers/
│   │       └── route.ts          # Broker operations
│   ├── layout.tsx
│   └── page.tsx                   # Landing page
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── ProtectedRoute.tsx
│   ├── listings/
│   │   ├── ListingCard.tsx
│   │   ├── ListingForm.tsx
│   │   ├── ListingTable.tsx
│   │   ├── DeleteConfirmModal.tsx
│   │   └── ListingFilters.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   └── Loading.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── airtable/
│   │   ├── client.ts             # Airtable client setup
│   │   ├── listings.ts           # Listings operations
│   │   └── brokers.ts            # Brokers operations
│   ├── types.ts                  # TypeScript types
│   ├── utils.ts                  # Utility functions
│   └── validations.ts            # Zod schemas
├── mcp/
│   └── airtable-moana-mcp/       # MCP Server Airtable
│       ├── src/
│       │   ├── index.ts
│       │   ├── tools/
│       │   │   ├── listings.ts
│       │   │   └── brokers.ts
│       │   └── types.ts
│       ├── package.json
│       └── README.md
├── .env.local                     # Variables d'environnement
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Types TypeScript

```typescript
// lib/types.ts

export interface Listing {
  id: string;
  fields: {
    "Nom du Bateau": string;
    "Constructeur": string;
    "Longueur (M/pieds)": number;
    "Année": number;
    "Propriétaire": string;
    "Capitaine": string;
    "Broker": string;
    "Localisation": string;
    "Prix"?: number;
    "Prix précédent"?: number;
    "Dernier message"?: string;
    "Commentaire"?: string;
  };
  createdTime: string;
}

export interface ListingFields {
  "Nom du Bateau": string;
  "Constructeur": string;
  "Longueur (M/pieds)": number;
  "Année": number;
  "Propriétaire": string;
  "Capitaine": string;
  "Broker": string;
  "Localisation": string;
  "Prix"?: number;
  "Prix précédent"?: number;
  "Dernier message"?: string;
  "Commentaire"?: string;
}

export interface Broker {
  id: string;
  fields: {
    broker: string;
    password: string;
    "Date de création": string;
  };
  createdTime: string;
}

export interface BrokerSession {
  id: string;
  broker: string;
  createdAt: string;
}
```

## Variables d'Environnement

```env
# Airtable Configuration
AIRTABLE_API_KEY=your_airtable_personal_access_token_here
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
AIRTABLE_LISTINGS_TABLE_ID=tblxxQhUvQd2Haztz
AIRTABLE_BROKER_TABLE_ID=tbl9dTwK6RfutmqVY

# NextAuth Configuration
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000

# Application Configuration
NODE_ENV=development
```

## API Routes

### Authentication

#### POST `/api/auth/login`
Authentifier un broker.

**Request Body:**
```json
{
  "broker": "john.doe",
  "password": "secure-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "recXXXXXXXXX",
    "broker": "john.doe",
    "token": "jwt-token"
  }
}
```

### Listings

#### GET `/api/listings`
Récupérer tous les listings.

**Query Parameters:**
- `broker` (optional): Filtrer par broker
- `localisation` (optional): Filtrer par localisation
- `search` (optional): Rechercher par nom

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "recXXXXXXXXX",
      "fields": {
        "Nom du Bateau": "Sunseeker 76",
        "Constructeur": "Sunseeker",
        "Longueur (M/pieds)": 23.2,
        "Année": 2020,
        "Propriétaire": "John Smith",
        "Capitaine": "Captain Jack",
        "Broker": "john.doe",
        "Localisation": "Monaco"
      },
      "createdTime": "2025-01-01T12:00:00.000Z"
    }
  ]
}
```

#### POST `/api/listings`
Créer un nouveau listing.

**Request Body:**
```json
{
  "fields": {
    "Nom du Bateau": "Sunseeker 76",
    "Constructeur": "Sunseeker",
    "Longueur (M/pieds)": 23.2,
    "Année": 2020,
    "Propriétaire": "John Smith",
    "Capitaine": "Captain Jack",
    "Broker": "john.doe",
    "Localisation": "Monaco"
  }
}
```

#### GET `/api/listings/[id]`
Récupérer un listing spécifique.

#### PUT `/api/listings/[id]`
Mettre à jour un listing.

#### DELETE `/api/listings/[id]`
Supprimer un listing.

## Sécurité

### Authentication
- Mots de passe hashés (bcrypt) avant stockage dans Airtable
- Sessions sécurisées avec NextAuth.js
- Tokens JWT avec expiration

### Authorization
- Chaque broker ne peut modifier que ses propres listings
- Vérification du broker sur chaque opération
- Middleware de protection des routes

### Validation
- Validation côté client avec React Hook Form
- Validation côté serveur avec Zod
- Sanitization des entrées utilisateur

### Rate Limiting
- Limitation des appels API Airtable
- Cache pour réduire les requêtes
- Debouncing sur les recherches

## Workflow de Développement

### Phase 1: Configuration (Explore)
1. ✅ Créer CLAUDE.md avec documentation complète
2. Créer le MCP Server Airtable
3. Configurer Next.js 14 avec TypeScript
4. Configurer Tailwind CSS
5. Configurer NextAuth.js

### Phase 2: Backend (Code)
1. Créer client Airtable
2. Implémenter API routes
3. Implémenter authentification
4. Implémenter CRUD operations
5. Ajouter validation et error handling

### Phase 3: Frontend (Code)
1. Créer composants UI de base
2. Créer page de connexion
3. Créer dashboard
4. Créer liste des listings
5. Créer formulaires création/modification
6. Créer modal de suppression

### Phase 4: Test (Test)
1. Tests unitaires (Jest)
2. Tests d'intégration API
3. Tests E2E (Playwright)
4. Tests MCP Server
5. Validation manuelle

### Phase 5: Deployment
1. Configuration environnement production
2. Optimisation des performances
3. Configuration Vercel/autre hosting
4. Documentation utilisateur

## MCP Server Airtable

Le MCP Server permet à Claude d'interagir directement avec Airtable pour:
- Lister les bateaux
- Créer des bateaux
- Modifier des bateaux
- Supprimer des bateaux
- Gérer les brokers

**Tools disponibles:**
- `list_listings` - Liste tous les bateaux
- `get_listing` - Récupère un bateau spécifique
- `create_listing` - Crée un nouveau bateau
- `update_listing` - Modifie un bateau
- `delete_listing` - Supprime un bateau
- `list_brokers` - Liste tous les brokers
- `authenticate_broker` - Authentifie un broker

## Notes de Développement

### Airtable API
- Base URL: `https://api.airtable.com/v0/appNyZVynxa8shk4c`
- Rate limit: 5 requêtes par seconde
- Authentification: Bearer token dans header

### Best Practices
- Toujours valider les entrées utilisateur
- Utiliser des types TypeScript stricts
- Gérer les erreurs gracieusement
- Logger les opérations importantes
- Optimiser les requêtes Airtable (utiliser filterByFormula)
- Implémenter du caching côté client

### Localisations Disponibles
À récupérer depuis Airtable (single select field options)

### Sécurité des Mots de Passe
Les mots de passe dans Airtable devraient être hashés. Si ce n'est pas le cas, implémenter:
1. Hash des nouveaux mots de passe
2. Migration progressive des anciens mots de passe
3. Politique de sécurité des mots de passe

## Ressources

- [Airtable API Documentation](https://airtable.com/developers/web/api/introduction)
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Dernière mise à jour**: 2026-01-16
**Version**: 1.1.0
**Statut**: En développement

---

## LLM Orchestration

### 🚀 Commandes de Démarrage Orchestrateur

#### Démarrer l'orchestrateur (terminal vierge)
```bash
cd /home/julien/Documents/moana/moana
bash orchestratoragent/scripts/start-orchestrator.sh
```

#### Attacher à la session tmux (voir les LLMs)
```bash
tmux attach -t moana-orchestration
```

#### Navigation tmux
- `Ctrl+B` puis `w` → Liste des fenêtres
- `Ctrl+B` puis `0-5` → Basculer entre fenêtres (0=main, 1=claude, 2=amp, 3=antigravity-proxy, 4=antigravity, 5=codex)
- `Ctrl+B` puis `d` → Détacher (sans arrêter les LLMs)

#### Soumettre une tâche (dans un autre terminal pendant que l'orchestrateur tourne)
```bash
cd /home/julien/Documents/moana/moana
amp @agents_library/universal-orchestrator.md /start "Implémenter notifications temps réel pour nouveaux leads Yatco"
```

#### Arrêter l'orchestrateur
```bash
bash orchestratoragent/scripts/stop-orchestrator.sh
```

#### Vérifier l'état
```bash
tmux ls  # Lister les sessions tmux
tmux list-windows -t moana-orchestration  # Lister les fenêtres/LLMs
```

#### Voir les logs d'un LLM spécifique
```bash
tmux capture-pane -t moana-orchestration:claude -p  # Logs Claude
tmux capture-pane -t moana-orchestration:amp -p     # Logs Amp
tmux capture-pane -t moana-orchestration:antigravity -p  # Logs Antigravity
tmux capture-pane -t moana-orchestration:codex -p   # Logs Codex
```

---

### Active Session
- **Session Started**: 2026-01-19 17:44:34
- **Status**: ACTIVE
- **Orchestrator**: Claude

### Task Assignment Queue

| ID | Task | Assigned To | Priority | Status | Created |
|----|------|-------------|----------|--------|---------|
| TASK-001 | Design CRM Architecture for Yatco LeadFlow | Antigravity | HIGH | PENDING | 2026-01-16 17:55 |
| TASK-002 | Create API endpoint POST /api/leads/yatco | AMP | HIGH | PENDING | 2026-01-16 17:55 |
| TASK-003 | Create Leads table schema (Airtable/Supabase) | AMP | HIGH | PENDING | 2026-01-16 17:55 |
| TASK-004 | Create CRM UI components for brokers | AMP | MEDIUM | PENDING | 2026-01-16 17:55 |
| TASK-005 | Generate TypeScript types for Yatco Lead | Codex | MEDIUM | PENDING | 2026-01-16 17:55 |
| TASK-006 | Generate Zod validation schemas for leads | Codex | MEDIUM | PENDING | 2026-01-16 17:55 |

---

### [TASK-001] Design CRM Architecture for Yatco LeadFlow
- **Assigned To**: Antigravity
- **Priority**: HIGH
- **Status**: ACTIVE
- **Description**: Analyser l'API Yatco LeadFlow et concevoir l'architecture CRM complète. Définir le routage des leads vers les brokers, la structure de données, et le flux d'intégration.
- **Files Involved**:
  - Documentation API: /home/julien/Téléchargements/LeadFlow_Receiver_Guidelines-1.pdf
  - Types existants: /lib/types.ts
  - Brokers: Table Airtable tbl9dTwK6RfutmqVY
- **Acceptance Criteria**:
  - [ ] Schéma de la table Leads
  - [ ] Mapping recipient.officeId/contactName → Broker
  - [ ] Flux de réception et stockage des leads
  - [ ] Stratégie de déduplication par lead.id
- **Date**: 2026-01-16 17:55

---

### [TASK-002] Create API endpoint POST /api/leads/yatco ✅ COMPLETED
- **Assigned To**: AMP
- **Priority**: HIGH
- **Status**: ACTIVE
- **Completed At**: 2026-01-16 18:25
- **Duration**: 65 minutes
- **Description**: Créer l'endpoint API pour recevoir les leads Yatco. L'endpoint doit accepter le JSON LeadFlow, valider les données, stocker dans la base, et router vers le bon broker.
- **Files Created**:
  - /app/api/leads/yatco/route.ts (165 lines)
  - /lib/supabase/leads.ts (197 lines)
- **Files Modified**:
  - /lib/types.ts (added YatcoLeadPayload, Lead, LeadWithBroker)
  - /lib/validations.ts (added yatcoLeadPayloadSchema, leadUpdateSchema)
- **Acceptance Criteria**:
  - [x] Endpoint POST /api/leads/yatco fonctionnel
  - [x] Validation du payload JSON (Zod schema)
  - [x] Retourne 201 sur succès, 200 si duplicate
  - [x] Gestion des doublons par yatco_lead_id
  - [x] IP whitelist: 35.171.79.77, 52.2.114.120 (skip in dev)
  - [x] Auto-routing vers broker via recipient.contactName
  - [x] GET endpoint pour health check
- **Notes**: 
  - IP whitelist bypassed en NODE_ENV=development
  - Broker matching case-insensitive (ilike)
  - Raw payload stocké en JSONB pour audit
- **Date**: 2026-01-16 17:55

---

### [TASK-003] Create Leads table schema
- **Assigned To**: AMP
- **Priority**: HIGH
- **Status**: ACTIVE
- **Description**: Créer la table Leads dans Airtable ou Supabase pour stocker les leads Yatco.
- **Schema suggéré**:
  - lead_id (unique, from Yatco)
  - date_received
  - source, detailed_source
  - contact_name, contact_email, contact_phone, contact_country
  - boat_make, boat_model, boat_year, boat_price
  - customer_comments, lead_comments
  - broker_id (linked to Broker table)
  - status (NEW, CONTACTED, QUALIFIED, CONVERTED, LOST)
- **Date**: 2026-01-16 17:55

---

### [TASK-005] Generate TypeScript types for Yatco Lead
- **Assigned To**: Codex
- **Priority**: MEDIUM
- **Status**: ACTIVE
- **Description**: Générer les types TypeScript pour le payload Yatco LeadFlow basé sur la documentation API.
- **Files Involved**:
  - Modifier: /lib/types.ts
- **Date**: 2026-01-16 17:55

---

### Current LLM Status

| LLM | Role | Status | Current Task | Last Update |
|-----|------|--------|--------------|-------------|
| Claude | Orchestrator | ACTIVE | Planning CRM | 2026-01-16 17:55 |
| AMP | Implementation | IDLE | - | 2026-01-18 13:15 |
| Antigravity | Deep Thinking | IDLE | TASK-010 COMPLETED | 2026-01-19 |
| Codex | Code Generation | IDLE | - | 2026-01-19 18:14 |

### Task Completion Log

| Date | LLM | Task ID | Duration | Status | Notes |
|------|-----|---------|----------|--------|-------|
| 2026-01-16 17:55 | Claude | INIT | - | COMPLETED | CRM tasks planned |
| 2026-01-18 12:32 | Codex | TASK-004 | 20 min | COMPLETED | components/leads/LeadTable.tsx, components/leads/LeadFilters.tsx, components/leads/index.ts |
| 2026-01-18 12:37 | Codex | TASK-005 | 5 min | COMPLETED | lib/types.ts |
| 2026-01-18 13:15 | AMP | API-LEADS | 15 min | COMPLETED | Created app/api/leads/route.ts, app/api/leads/[id]/route.ts, tests/api/leads.test.ts, test-leads-api.js |
| 2026-01-18 13:45 | AMP | BUGFIX-AUTH | 20 min | COMPLETED | Fixed createAdminClient() imports in leads.ts, restored .env.local with Supabase credentials, server running on port 3002 |
| 2026-01-19 18:14 | Codex | TASK-006 | 5 min | COMPLETED | Verified Zod lead schemas in lib/validations.ts |
| 2026-01-18 13:00 | Antigravity | PHASE1-MVP | 30 min | COMPLETED | Filtres date, Toggle Cards/Table, Badge sidebar, Quick Actions modal. Fichiers: LeadFilters.tsx, leads/page.tsx, Header.tsx, LeadDetailModal.tsx, lib/hooks/useNewLeadsCount.ts |

### Inter-LLM Messages

| From | To | Message | Time |
|------|----|---------|------|
| Claude | All | Tâche principale: Intégration CRM Yatco LeadFlow | 2026-01-16 17:55 |
| Codex | Claude | Vérif types leads vs SQL: tout aligné, seul ajustement: Lead.raw_payload -> Record<string, unknown>. | 2026-01-18 12:37 |
| Antigravity | AMP/Codex | Prochaines tâches Phase 1 MVP à implémenter: 1) Filtre date, 2) Toggle vue Cards/Table, 3) Badge sidebar, 4) Quick Actions modal | 2026-01-18 12:45 |
| AMP | All | ✅ API routes leads terminées: GET /api/leads, GET /api/leads/[id], PUT /api/leads/[id] avec tests complets. Prêt pour intégration frontend. | 2026-01-18 13:15 |
| Antigravity | All | TASK-007 COMPLETED: UX Flow Analysis documentée. Recommandations: Vue hybride Cards/Table, filtre date prioritaire, Quick Actions, badge sidebar | 2026-01-18 12:25 |
| Antigravity | AMP/Codex | Prochaines tâches Phase 1 MVP à implémenter: 1) Filtre date, 2) Toggle vue Cards/Table, 3) Badge sidebar, 4) Quick Actions modal | 2026-01-18 12:45 |
| Antigravity | All | ✅ PHASE 1 MVP TERMINÉE: Filtres date intégrés, Toggle Cards/Table fonctionnel, Badge nouveaux leads avec polling 30s, Quick Actions contextuelle. Prêt pour tests. | 2026-01-18 13:00 |

---

## Yatco LeadFlow API Reference

### Transport
- **Method**: HTTP POST (HTTPS)
- **Format**: JSON body (pas de form params)
- **Auth**: Pas d'authentification - utiliser IP whitelist
- **IPs à whitelister**: 35.171.79.77, 52.2.114.120
- **Réponse**: 2xx sur succès (200/201)

### Payload Structure
```json
{
  "lead": {
    "id": "10000001",
    "date": "2022-01-20T12:36:22.000Z",
    "source": "Boats Group",
    "detailedSource": "YachtWorld-Broker SRP",
    "detailedSourceSummary": "YachtWorld",
    "requestType": "Contact Broker"
  },
  "contact": {
    "name": { "display": "Jane Doe", "first": "Jane", "last": "Doe" },
    "phone": "+33123456789",
    "email": "jane@doe.test",
    "country": "US"
  },
  "customerComments": "Message du client",
  "leadComments": "Infos additionnelles",
  "boat": {
    "make": "Dean",
    "model": "440 44XL",
    "year": "2000",
    "condition": "Used",
    "length": { "measure": "44", "units": "feet" },
    "price": { "amount": "44000", "currency": "CAD" },
    "url": "https://www.yachtworld.com/yacht/..."
  },
  "recipient": {
    "officeName": "Moana Yachting",
    "officeId": "389841",
    "contactName": "Broker Name"
  }
}
```

### Routing des Leads
Les leads sont routés vers le broker correspondant via:
- `recipient.contactName` → match avec `Broker.broker`
- `recipient.officeId` → ID Yatco du bureau

---

## [TASK-007] CRM UX Architecture Analysis by Antigravity

**Date**: 2026-01-18 12:15
**Status**: ACTIVE
**Analyst**: Antigravity (Extended Thinking Mode)

### Contexte

L'objectif est de concevoir le parcours utilisateur (UX) optimal pour la gestion des leads CRM dans l'application Moana Yachting. Les brokers doivent pouvoir consulter, filtrer, et gérer efficacement les leads Yatco reçus automatiquement.

### État Actuel de l'Implémentation

Après analyse du code existant, les composants suivants sont déjà implémentés:

| Composant | Fichier | Status |
|-----------|---------|--------|
| LeadCard | `components/leads/LeadCard.tsx` | ✅ Fonctionnel |
| LeadFilters | `components/leads/LeadFilters.tsx` | ✅ Fonctionnel |
| LeadDetailModal | `components/leads/LeadDetailModal.tsx` | ✅ Fonctionnel |
| LeadStats | `components/leads/LeadStats.tsx` | ✅ Fonctionnel |
| LeadStatusBadge | `components/leads/LeadStatusBadge.tsx` | ✅ Fonctionnel |
| Page /leads | `app/dashboard/leads/page.tsx` | ✅ Vue Cards |

**Points forts actuels:**
- Interface cohérente avec les Listings (Cards avec Framer Motion)
- Filtres par status, source et recherche texte
- Modal détaillé avec changement de status
- Stats agrégées avec taux de conversion
- Responsive design

---

### Question 1: Table vs Cards - Analyse Approfondie

#### Option A: Vue Cards (Implémentation Actuelle)

**Avantages:**
- Cohérence visuelle avec la page Listings
- Plus engageant visuellement
- Excellent sur mobile (responsive natif)
- Animations fluides avec Framer Motion
- Informations clés visibles au premier coup d'œil

**Inconvénients:**
- Moins efficace pour scanner 50+ leads rapidement
- Pas de tri par colonne
- Prend plus d'espace vertical

#### Option B: Vue Table

**Avantages:**
- Vue dense, plus d'infos par écran
- Tri par colonnes (date, status, source)
- Sélection en batch possible
- Familier pour les utilisateurs B2B/CRM

**Inconvénients:**
- Moins visuel
- Problématique sur mobile
- Rupture de cohérence avec Listings

#### Option C: Vue Kanban (Drag & Drop)

**Avantages:**
- Visualisation intuitive du pipeline
- Transition de status par glisser-déposer
- Vue d'ensemble du funnel commercial

**Inconvénients:**
- Complexe à implémenter (react-beautiful-dnd ou @dnd-kit)
- Pas adapté pour 100+ leads par colonne
- Requiert espace horizontal

#### Recommandation: Vue Hybride avec Toggle

```
┌──────────────────────────────────────────────────────────┐
│ [Cards ▼] [Table] [Kanban]      Leads CRM    [+ Ajouter] │
├──────────────────────────────────────────────────────────┤
│ Filtres: Status | Date | Source | Recherche              │
├──────────────────────────────────────────────────────────┤
│ Vue sélectionnée (Cards par défaut, Table recommandée    │
│ pour volume > 20 leads, Kanban pour suivi pipeline)      │
└──────────────────────────────────────────────────────────┘
```

**Implémentation suggérée:**
1. Garder Cards comme vue par défaut (cohérence)
2. Ajouter un toggle Vue Table pour gros volumes
3. Vue Kanban en Phase 2 (optionnel)

---

### Question 2: Stratégie de Filtrage

#### Filtres Actuels (Implémentés)
- ✅ Recherche texte (nom contact, email)
- ✅ Status (NEW, CONTACTED, QUALIFIED, CONVERTED, LOST)
- ✅ Source (dynamique depuis les données)

#### Filtres Recommandés (À Ajouter)

| Filtre | Type | Priorité | Justification |
|--------|------|----------|---------------|
| Date de réception | Date range | HAUTE | Filtrer leads récents vs anciens |
| Broker assigné | Dropdown | HAUTE | Admin voit tous les leads |
| Pays du contact | Dropdown | MOYENNE | Segmentation géographique |
| Prix bateau | Range slider | BASSE | Qualification rapide |
| Non assignés | Toggle | HAUTE | Leads orphelins |

#### Architecture Suggérée des Filtres

```tsx
// LeadFilters.tsx - Version étendue
interface ExtendedLeadFiltersProps {
  // Filtres principaux (toujours visibles)
  search: string;
  status: string;
  source: string;
  dateFrom?: string;
  dateTo?: string;

  // Filtres avancés (collapsed par défaut)
  showAdvanced: boolean;
  broker?: string;        // Si admin
  country?: string;
  unassigned?: boolean;   // Leads sans broker
}
```

---

### Question 3: Transitions de Status - Flow Machine

#### Diagramme d'État

```
                    ┌─────────────┐
                    │    NEW      │ ← Entrée (réception Yatco)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  CONTACTED  │ ← Premier contact établi
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐          ┌───────▼──────┐
       │  QUALIFIED  │          │     LOST     │
       └──────┬──────┘          └──────────────┘
              │                        ▲
       ┌──────▼──────┐                 │
       │  CONVERTED  │─────────────────┘
       └─────────────┘   (peut être annulé)
```

#### Règles de Transition

| De | Vers | Autorisé | Action Requise |
|----|------|----------|----------------|
| NEW | CONTACTED | ✅ | - |
| NEW | LOST | ✅ | Raison obligatoire |
| CONTACTED | QUALIFIED | ✅ | - |
| CONTACTED | LOST | ✅ | Raison obligatoire |
| QUALIFIED | CONVERTED | ✅ | Montant/Bateau (optionnel) |
| QUALIFIED | LOST | ✅ | Raison obligatoire |
| CONVERTED | LOST | ⚠️ | Confirmation double |
| LOST | * | ❌ | Verrouillé (sauf LOST → NEW pour réactiver) |

#### Implémentation UX

**Option 1: Dropdown Inline (Implémenté)**
```tsx
// Actuel dans LeadDetailModal.tsx
<LeadStatusSelect value={status} onChange={handleStatusChange} />
```

**Option 2: Quick Actions (Recommandé)**
```tsx
// Boutons d'action contextuelle
<div className="flex gap-2">
  {status === 'NEW' && (
    <>
      <Button onClick={() => setStatus('CONTACTED')}>
        Marquer Contacté
      </Button>
      <Button variant="danger" onClick={() => openLostModal()}>
        Perdu
      </Button>
    </>
  )}
</div>
```

**Option 3: Transition avec Notes**
```tsx
interface StatusTransition {
  from: LeadStatus;
  to: LeadStatus;
  note?: string;          // Note optionnelle
  reason?: string;        // Obligatoire si LOST
  amount?: number;        // Si CONVERTED
  timestamp: string;
}
```

---

### Question 4: Stratégie de Notifications

#### Analyse des Besoins

Les leads sont **time-sensitive**. Un délai de réponse court (< 1h) augmente significativement les chances de conversion. Les notifications sont donc **critiques**.

#### Types de Notifications Recommandées

| Type | Canal | Priorité | Implémentation |
|------|-------|----------|----------------|
| Nouveau lead | In-app (badge) | HAUTE | Phase 1 |
| Nouveau lead | Toast | HAUTE | Phase 1 |
| Nouveau lead | Email | HAUTE | Phase 2 |
| Lead inactif (48h) | In-app | MOYENNE | Phase 3 |
| Conversion réussie | In-app | BASSE | Phase 3 |

#### Phase 1: Notifications In-App (MVP)

**1. Badge Counter dans la Sidebar**
```tsx
// components/layout/Sidebar.tsx
const newLeadsCount = useNewLeadsCount(); // Hook SWR/React Query

<NavLink href="/dashboard/leads">
  Leads CRM
  {newLeadsCount > 0 && (
    <Badge variant="destructive">{newLeadsCount}</Badge>
  )}
</NavLink>
```

**2. Toast sur Nouvelle Arrivée (Polling)**
```tsx
// Polling toutes les 30s pour nouveaux leads
useEffect(() => {
  const interval = setInterval(async () => {
    const newLeads = await checkNewLeads(lastCheckTime);
    if (newLeads.length > 0) {
      toast(`${newLeads.length} nouveau(x) lead(s) reçu(s)!`);
    }
  }, 30000);
  return () => clearInterval(interval);
}, []);
```

**3. Alternative WebSocket (Phase 2)**
```tsx
// Real-time via Supabase Realtime
const supabase = createClient();
supabase
  .channel('leads')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' },
    (payload) => toast.success(`Nouveau lead: ${payload.new.contact_display_name}`)
  )
  .subscribe();
```

#### Phase 2: Email Notifications

**Service Recommandé**: Resend (gratuit jusqu'à 3000 emails/mois)

```tsx
// lib/notifications/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function notifyNewLead(lead: Lead, broker: Broker) {
  await resend.emails.send({
    from: 'Moana Yachting <leads@moana-yachting.com>',
    to: broker.email,
    subject: `🚤 Nouveau lead: ${lead.contact_display_name}`,
    react: NewLeadEmail({ lead }),
  });
}
```

---

### Plan d'Implémentation Recommandé

#### Phase 1: Améliorations MVP (Priorité HAUTE)

| Tâche | Effort | Impact |
|-------|--------|--------|
| Ajouter filtre date | 2h | Haut |
| Badge nouveaux leads sidebar | 2h | Haut |
| Quick actions status (boutons) | 3h | Moyen |
| Pagination leads (> 50) | 2h | Moyen |

#### Phase 2: UX Avancée (Priorité MOYENNE)

| Tâche | Effort | Impact |
|-------|--------|--------|
| Vue Table alternative | 4h | Moyen |
| Email notifications (Resend) | 4h | Haut |
| Historique des transitions | 3h | Moyen |
| Notes sur les leads | 2h | Moyen |

#### Phase 3: Features Premium (Priorité BASSE)

| Tâche | Effort | Impact |
|-------|--------|--------|
| Vue Kanban drag & drop | 8h | Moyen |
| Supabase Realtime | 4h | Moyen |
| Lead scoring automatique | 6h | Bas |
| Export CSV/Excel | 2h | Bas |

---

### Composants À Créer

```
components/leads/
├── LeadCard.tsx          ✅ Existe
├── LeadFilters.tsx       ✅ Existe (à étendre)
├── LeadDetailModal.tsx   ✅ Existe
├── LeadStats.tsx         ✅ Existe
├── LeadStatusBadge.tsx   ✅ Existe
├── LeadTable.tsx         📝 À créer (Phase 2)
├── LeadKanban.tsx        📝 À créer (Phase 3)
├── LeadQuickActions.tsx  📝 À créer (Phase 1)
├── LeadDateFilter.tsx    📝 À créer (Phase 1)
└── LeadNotification.tsx  📝 À créer (Phase 1)
```

---

### Wireframes UX

#### Page Leads - Desktop (Vue Cards)

```
┌────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  🚤 Leads CRM                    [Cards][Table]   │
│            │  142 leads Yatco                                  │
│            ├────────────────────────────────────────────────────┤
│ Dashboard  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│            │  │ 24 New │ │12 Cont.│ │8 Qualif│ │5 Conv. │      │
│ Listings   │  └────────┘ └────────┘ └────────┘ └────────┘      │
│            │  Taux de conversion: 3.5%                         │
│ Leads (24) │ ───────────────────────────────────────────────── │
│            │  [🔍 Rechercher...] [Status ▼] [Source ▼] [Date ▼]│
│            │ ───────────────────────────────────────────────── │
│            │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐│
│            │  │ Jean Dupont  │ │ Marie Martin │ │ John Smith  ││
│            │  │ 🏷️ NEW       │ │ 🏷️ CONTACTED│ │ 🏷️ QUALIFIED││
│            │  │ YachtWorld   │ │ Boats.com    │ │ YachtWorld  ││
│            │  │ Sunseeker 76 │ │ Beneteau 40  │ │ Lagoon 52   ││
│            │  │ il y a 2h    │ │ il y a 1j    │ │ il y a 3j   ││
│            │  └──────────────┘ └──────────────┘ └─────────────┘│
└────────────┴────────────────────────────────────────────────────┘
```

#### Modal Lead Detail (avec Quick Actions)

```
┌────────────────────────────────────────────────────────────────┐
│ Jean Dupont                                              [X]   │
│ YachtWorld                                                     │
├────────────────────────────────────────────────────────────────┤
│ Status: 🔵 Nouveau                                             │
│                                                                │
│ ┌────────────────┐ ┌─────────────────┐                         │
│ │ ✓ Marquer      │ │ ✗ Marquer Perdu │                         │
│ │   Contacté     │ │                 │                         │
│ └────────────────┘ └─────────────────┘                         │
│                                                                │
│ ─── CONTACT ───────────────────────────────────────────────    │
│ 📧 jean.dupont@email.com                                       │
│ 📱 +33 6 12 34 56 78                                           │
│ 🌍 France                                                      │
│                                                                │
│ ─── BATEAU RECHERCHÉ ──────────────────────────────────────    │
│ ⚓ Sunseeker Manhattan 76                                      │
│ 📅 2020  |  23m  |  1,500,000 EUR                              │
│ 🔗 Voir l'annonce                                              │
│                                                                │
│ ─── MESSAGE ───────────────────────────────────────────────    │
│ "Je suis intéressé par ce bateau. Pouvez-vous me contacter?"  │
│                                                                │
│ ─── MÉTADONNÉES ───────────────────────────────────────────    │
│ Reçu il y a 2 heures • 18 janvier 2026 • ID: 10000042         │
└────────────────────────────────────────────────────────────────┘
```

---

### Conclusion et Recommandations Finales

1. **Garder l'approche Cards** comme vue principale pour la cohérence UX
2. **Ajouter le filtre par date** en priorité (quick win)
3. **Implémenter les Quick Actions** pour fluidifier les transitions
4. **Badge de notification** dans la sidebar (critique pour réactivité)
5. **Vue Table en option** pour les utilisateurs avec beaucoup de leads

L'implémentation actuelle est une bonne base. Les améliorations recommandées sont incrémentales et ne nécessitent pas de refactoring majeur.

---

### Task Completion Log Update

| Date | LLM | Task ID | Duration | Status | Notes |
|------|-----|---------|----------|--------|-------|
| 2026-01-18 12:25 | Antigravity | TASK-007 | 15 min | COMPLETED | UX Flow Analysis - Vue hybride recommandée, notifications in-app prioritaires |
| 2026-01-18 12:30 | AMP | TASK-002 | 30 min | COMPLETED | API routes leads: GET, PUT avec tests |
| 2026-01-18 12:32 | Codex | TASK-005 | 20 min | COMPLETED | Types Lead/LeadWithBroker/YatcoLeadPayload vérifiés et alignés avec SQL |
| 2026-01-18 12:33 | Codex | TASK-008 | 15 min | COMPLETED | LeadTable.tsx créé - Vue table dense avec Framer Motion |
| 2026-01-18 12:35 | AMP | TASK-009 | 10 min | COMPLETED | Hook useNewLeadsCount créé - Polling 30s pour badge notifications |
| 2026-01-18 12:38 | Antigravity | TASK-010 | 15 min | COMPLETED | Quick Actions dans LeadDetailModal - Boutons contextuels (NEW→CONTACTED/LOST, etc.) |
| 2026-01-18 12:40 | Claude | ORCHESTRATION | - | COMPLETED | Coordination CRM - Toggle Cards/Table, filtres dates intégrés |
| 2026-01-19 17:50 | AMP | SYSTEM-AUDIT | 15 min | COMPLETED | Audit système: ✅ Table leads (9 leads), ✅ 7 brokers, ✅ 86 listings, ✅ API routes. Guide SETUP_SUPABASE_LEADS.md créé |

---

## Inter-LLM Communication Log

| Time | From | To | Message |
|------|------|----|---------|
| 12:15 | Claude | All | Distribution tâches CRM via tmux |
| 12:25 | Antigravity | Claude | TASK-007 terminé - Analyse UX complète |
| 12:30 | AMP | All | "✅ API routes leads terminées: GET /api/leads, GET /api/leads/[id], PUT /api/leads/[id]" |
| 12:32 | Codex | Claude | Types vérifiés, Lead.raw_payload → Record<string, unknown> |
| 12:35 | Claude | All | Validation globale - Serveur lancé sur port 3001 |

---

## CRM Implementation Status

### Composants Créés

| Composant | Fichier | Créé par | Status |
|-----------|---------|----------|--------|
| LeadCard | components/leads/LeadCard.tsx | Claude | ✅ |
| LeadTable | components/leads/LeadTable.tsx | Codex | ✅ |
| LeadFilters | components/leads/LeadFilters.tsx | Claude + Codex | ✅ (avec dates) |
| LeadDetailModal | components/leads/LeadDetailModal.tsx | Claude + Antigravity | ✅ (Quick Actions terminées) |
| LeadStats | components/leads/LeadStats.tsx | Claude | ✅ |
| LeadStatusBadge | components/leads/LeadStatusBadge.tsx | Claude | ✅ |
| useNewLeadsCount | lib/hooks/useNewLeadsCount.ts | AMP | ✅ |

### API Routes

| Route | Méthode | Créé par | Status |
|-------|---------|----------|--------|
| /api/leads | GET | Claude + AMP | ✅ |
| /api/leads/[id] | GET, PUT | AMP | ✅ |
| /api/leads/yatco | POST, GET | Claude | ✅ |

### Prochaines Étapes

1. [x] Exécuter `scripts/leads-schema.sql` dans Supabase - ✅ FAIT
2. [x] Configurer variables d'environnement Supabase - ✅ FAIT
3. [ ] Tester webhook avec payload Yatco réel (IPs: 35.171.79.77, 52.2.114.120)
4. [ ] Ajouter notifications email (Resend) - Phase 2
5. [ ] Corriger routing des 4 leads sans broker

---

# Mémoire Projet - Moana Yachting (fusion)

## 📋 État Global
- **Tâche principale:** Webhook Yatco — tests temporaires sans whitelist IP
- **Progression:** 85%
- **Orchestrateur actuel:** Claude
- **Tokens Claude:** 0/200000 (0%)

## 🔄 Discussions LLM-to-LLM
- 2026-01-22 10:35 — agent_controle: sélection agents (backend-architect + explore-code). apex-workflow réservé pour tâche complexe (récepteur email LeadFlow).

## 📊 TODOs par LLM
### Amp (Complexe)
- [ ] TODO-A1: Récepteur email LeadFlow + parsing JSON (APEX: /analyze, /plan, /implement) (1) définir pipeline mail->stockage (2) parser attachment lead_attachment.json (3) déduplication par lead.id (4) journaliser erreurs/retours

### Antigravity (Moyen)
- [ ] TODO-G1: Sécurisation webhook sans auth (1) rate limit (2) header allowlist optionnelle (3) logging structuré (4) alerting sur erreurs 4xx/5xx

### Codex (Simple)
- [x] TODO-C1: Test end-to-end webhook sans whitelist (1) activer flag env (2) POST lead valide (3) vérifier insert + dédup (4) réactiver whitelist après test

## 🔍 Code Reviews (explore-code)
- 2026-01-22 — route webhook Yatco inspectée (validation Zod, dédup lead.id, mapping broker).

## ✅ Ralph Rounds
[Rounds test/debug/fix jusqu'à critères atteints]

## 📝 Tâches Restantes (pour handoff)
[Section remplie quand Claude atteint 95% tokens]

## 🧠 Connaissances Accumulées
- LeadFlow ne supporte pas l'auth: whitelist IP recommandée, HTTP POST préféré, email possible (pièce jointe JSON).
- Webhook Yatco: validation Zod, déduplication via yatco_lead_id, mapping brokers via email.
- Vercel: ajouter `YATCO_IP_WHITELIST_DISABLED=true` pour tests temporaires sans whitelist.
- Supabase/PostgREST: après ajout colonne `nombre_cabines`, exécuter `NOTIFY pgrst, 'reload schema';` pour rafraîchir le cache et permettre l'enregistrement/affichage.
- Skill ajoutée: `feature-stability-guard` pour encadrer les ajouts/modifs de features et limiter les régressions.
- Skill `feature-stability-guard` créée dans `/home/julien/.codex/skills/feature-stability-guard/SKILL.md`.
