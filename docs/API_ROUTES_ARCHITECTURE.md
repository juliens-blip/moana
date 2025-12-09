# Architecture des Routes API Next.js 14 - Moana Yachting

## Problème Résolu

Next.js 14 essaie par défaut de rendre les routes statiquement pour optimiser les performances. Cependant, les routes utilisant des fonctionnalités dynamiques comme `cookies()`, `headers()`, ou `searchParams` nécessitent un rendu dynamique côté serveur.

**Erreur typique sans configuration:**
```
Error: Route /api/auth/login used "cookies" without "export const dynamic = 'force-dynamic'"
```

## Solution Implémentée

### Pattern Standard pour Toutes les Routes API

Toutes les routes API du projet utilisent maintenant ce pattern cohérent:

```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET/POST/PUT/DELETE(...) {
  // Route handler logic
}
```

### Configuration Expliquée

#### 1. `export const dynamic = 'force-dynamic'`

**Objectif:** Force Next.js à rendre la route dynamiquement à chaque requête.

**Valeurs possibles:**
- `'auto'` (défaut) - Next.js décide automatiquement
- `'force-dynamic'` - Force le rendu dynamique (requis pour cookies)
- `'force-static'` - Force le rendu statique
- `'error'` - Génère une erreur si dynamique détecté

**Quand utiliser:**
- Routes utilisant `cookies()`
- Routes utilisant `headers()`
- Routes avec `searchParams` dynamiques
- Routes d'authentification
- Routes nécessitant des données en temps réel

#### 2. `export const runtime = 'nodejs'`

**Objectif:** Spécifie l'environnement d'exécution de la route.

**Valeurs possibles:**
- `'nodejs'` (défaut) - Runtime Node.js complet avec toutes les APIs
- `'edge'` - Edge Runtime (plus rapide, APIs limitées)

**Pourquoi 'nodejs' pour ce projet:**
- Support complet de `cookies()` avec httpOnly, secure, etc.
- Compatibilité avec les APIs Airtable
- Pas de limitations sur les packages npm
- Meilleure compatibilité Vercel pour notre use case

**Note:** Edge Runtime ne supporte pas actuellement `cookies()` avec les mêmes fonctionnalités.

## Routes API du Projet

### Tableau Récapitulatif

| Route | Méthodes | Dynamic Features | Status |
|-------|----------|------------------|--------|
| `/api/auth/login` | POST | `cookies()` | Configuré |
| `/api/auth/logout` | POST | `cookies()` | Configuré |
| `/api/auth/me` | GET | `cookies()` | Configuré |
| `/api/listings` | GET, POST | `cookies()`, `searchParams` | Configuré |
| `/api/listings/[id]` | GET, PUT, DELETE | `cookies()` | Configuré |

### Détails des Routes

#### 1. Authentication Routes

**C:\Users\beatr\Documents\projets\moana\app\api\auth\login\route.ts**
```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Utilise setSessionCookie() -> cookies()
}
```

**C:\Users\beatr\Documents\projets\moana\app\api\auth\logout\route.ts**
```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  // Utilise logout() -> cookies()
}
```

**C:\Users\beatr\Documents\projets\moana\app\api\auth\me\route.ts**
```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  // Utilise getSession() -> cookies()
}
```

#### 2. Listings Routes

**C:\Users\beatr\Documents\projets\moana\app\api\listings\route.ts**
```typescript
// Force dynamic rendering - required for cookies() and searchParams
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Utilise getSession() -> cookies()
  // Utilise request.nextUrl.searchParams
}

export async function POST(request: NextRequest) {
  // Utilise getSession() -> cookies()
}
```

**C:\Users\beatr\Documents\projets\moana\app\api\listings\[id]\route.ts**
```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // Utilise getSession() -> cookies()
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  // Utilise getSession() -> cookies()
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // Utilise getSession() -> cookies()
}
```

## Fonctions Utilisant cookies()

**Fichier: C:\Users\beatr\Documents\projets\moana\lib\auth.ts**

```typescript
export async function getSession(): Promise<Session | null> {
  const cookieStore = cookies(); // DYNAMIC!
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  // ...
}

export async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = cookies(); // DYNAMIC!
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function logout(): Promise<void> {
  const cookieStore = cookies(); // DYNAMIC!
  cookieStore.delete(SESSION_COOKIE_NAME);
}
```

**Toute route appelant ces fonctions DOIT être dynamique.**

## Compatibilité Vercel

### Configuration Vercel Optimale

**vercel.json** (optionnel, Next.js configure automatiquement):
```json
{
  "version": 2,
  "regions": ["iad1"],
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ]
}
```

### Variables d'Environnement Vercel

Configurées dans le dashboard Vercel:
```env
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
AIRTABLE_LISTINGS_TABLE_ID=tblxxQhUvQd2Haztz
AIRTABLE_BROKER_TABLE_ID=tbl9dTwK6RfutmqVY
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://your-domain.vercel.app
NODE_ENV=production
```

### Vérification Build Vercel

Les routes avec `export const dynamic = 'force-dynamic'` apparaîtront comme:
```
Route (app)                              Size     First Load JS
┌ λ /api/auth/login                      0 B            87 kB
├ λ /api/auth/logout                     0 B            87 kB
├ λ /api/auth/me                         0 B            87 kB
├ λ /api/listings                        0 B            90 kB
└ λ /api/listings/[id]                   0 B            90 kB

λ (Server)  server-side renders at runtime
```

Le symbole `λ` confirme que les routes sont rendues dynamiquement.

## Best Practices

### 1. Toujours Déclarer en Haut de Fichier

```typescript
// CORRECT
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { ... } from '...';

export async function GET() { ... }
```

```typescript
// INCORRECT - Après les imports
import { ... } from '...';

export const dynamic = 'force-dynamic'; // Trop tard!
```

### 2. Commenter la Raison

```typescript
// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
```

Aide les développeurs à comprendre pourquoi cette configuration est nécessaire.

### 3. Validation en Développement

Avant chaque déploiement:
```bash
npm run build
```

Vérifier qu'il n'y a pas d'erreurs du type:
```
Error: Route ... used "cookies" without "export const dynamic = 'force-dynamic'"
```

### 4. Template pour Nouvelles Routes API

Utilisez toujours ce template pour créer de nouvelles routes API:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { ApiResponse } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/your-route
 * Description of the endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Your logic here

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { /* your data */ },
    });
  } catch (error) {
    console.error('Error in GET /api/your-route:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
```

## Alternatives Considérées

### 1. Middleware pour Authentification

**Problème:** Middleware s'exécute sur toutes les requêtes, pas optimal pour notre cas.

**Notre choix:** Vérification par route pour plus de contrôle granulaire.

### 2. Edge Runtime

**Problème:** Limitations sur `cookies()` et certaines APIs Node.js.

**Notre choix:** Node.js Runtime pour fonctionnalités complètes.

### 3. Route Handlers Statiques avec ISR

**Problème:** Authentication nécessite dynamisme complet.

**Notre choix:** Routes 100% dynamiques pour sécurité.

## Monitoring & Debugging

### Logs de Production

Vérifier les logs Vercel pour confirmer le rendu dynamique:
```
[GET] /api/listings - 200 - 234ms (dynamic)
```

### Performance Metrics

Routes dynamiques seront légèrement plus lentes que statiques, mais:
- Authentication nécessite dynamisme
- Airtable API est le bottleneck principal
- Caching client-side compense

### Common Errors

#### Error: Dynamic Server Usage
```
Error: Dynamic server usage: Route /api/... couldn't be rendered statically because it used cookies
```

**Solution:** Ajouter `export const dynamic = 'force-dynamic';`

#### Error: Edge Runtime
```
Error: cookies() is not supported in Edge Runtime
```

**Solution:** Utiliser `export const runtime = 'nodejs';`

## Changelog

**2025-12-07:**
- Configuration initiale de toutes les routes API
- Ajout de `dynamic = 'force-dynamic'` sur toutes les routes
- Ajout de `runtime = 'nodejs'` pour compatibilité cookies
- Documentation complète créée

## Ressources

- [Next.js Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [Next.js Dynamic Rendering](https://nextjs.org/docs/app/building-your-application/rendering/server-components#dynamic-rendering)
- [Next.js cookies() API](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Vercel Edge Runtime](https://vercel.com/docs/functions/edge-functions/edge-runtime)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)

---

**Document maintenu par:** Architecture Backend Team
**Dernière mise à jour:** 2025-12-07
**Version:** 1.0.0
