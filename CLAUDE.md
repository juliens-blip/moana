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

**Dernière mise à jour**: 2025-12-03
**Version**: 1.0.0
**Statut**: En développement
