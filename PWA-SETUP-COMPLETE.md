# Configuration PWA - Moana Yachting

## Status: CONFIGURATION COMPLETE - ICONES À GÉNÉRER

La configuration PWA (Progressive Web App) est maintenant complète. Votre application peut être installée sur mobile et desktop, avec support offline.

## Fichiers Créés

### 1. Structure de Dossiers
```
c:\Users\beatr\Documents\projets\moana\
├── public/
│   ├── manifest.json                          ✅ CRÉÉ
│   ├── favicon-instructions.md                ✅ CRÉÉ
│   └── icons/
│       ├── README.md                          ✅ CRÉÉ
│       ├── icon.svg                           ✅ CRÉÉ (Template SVG)
│       ├── icon-192x192.png.placeholder       ⚠️ À REMPLACER
│       ├── icon-512x512.png.placeholder       ⚠️ À REMPLACER
│       └── apple-touch-icon.png.placeholder   ⚠️ À REMPLACER
└── next.config.js                             ✅ MIS À JOUR
```

### 2. Manifest PWA (`c:\Users\beatr\Documents\projets\moana\public\manifest.json`)

Configuration complète avec:
- Nom de l'application: "Moana Yachting - Gestion de Listings"
- Nom court: "Moana Yachting"
- Couleur thème: #0284c7 (bleu Moana)
- Mode standalone (plein écran sans barre d'URL)
- Orientation portrait
- Catégories: business, productivity

### 3. Configuration Next.js (`c:\Users\beatr\Documents\projets\moana\next.config.js`)

Mise à jour complète avec:

#### PWA Features
- Service Worker avec cache intelligent
- Désactivé en développement (performance)
- Auto-registration et skip waiting

#### Cache Strategies
- **Airtable API** (`api.airtable.com`): NetworkFirst
  - Cache: 1 heure
  - 200 entrées max
  - Timeout: 10 secondes
  - Avantage: Données fraîches prioritaires, fallback cache offline

- **Airtable Images** (`dl.airtable.com`): CacheFirst
  - Cache: 7 jours
  - 100 entrées max
  - Avantage: Images chargées instantanément depuis le cache

#### Image Optimization
- Format WebP automatique
- Multiples tailles responsive
- Domain whitelist: dl.airtable.com

#### Security Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

#### Compression
- Compression Gzip/Brotli activée
- Minification SWC activée

### 4. Icône Template SVG (`c:\Users\beatr\Documents\projets\moana\public\icons\icon.svg`)

Template vectoriel avec:
- Ancre marine stylisée (thème nautique)
- Couleur Moana (#0284c7)
- Design simple et reconnaissable
- Éditable avec Inkscape/Illustrator

## Actions Requises

### ÉTAPE 1: Générer les Icônes PNG (OBLIGATOIRE)

Vous devez créer 3 fichiers PNG à partir de votre logo:

1. **icon-192x192.png** (192x192px)
2. **icon-512x512.png** (512x512px)
3. **apple-touch-icon.png** (180x180px)

#### Méthode Rapide (Recommandée)

Utilisez **PWA Builder Image Generator**:
1. Allez sur: https://www.pwabuilder.com/imageGenerator
2. Uploadez votre logo (minimum 512x512px)
3. Couleur de fond: #0284c7
4. Téléchargez les icônes
5. Placez-les dans `c:\Users\beatr\Documents\projets\moana\public\icons\`
6. Supprimez les fichiers `.placeholder`

Ou **RealFaviconGenerator**:
1. Allez sur: https://realfavicongenerator.net/
2. Uploadez votre logo
3. Theme color: #0284c7
4. Téléchargez et extrayez
5. Copiez les PNG nécessaires dans `public/icons/`

#### Instructions Détaillées

Consultez: `c:\Users\beatr\Documents\projets\moana\public\icons\README.md`

### ÉTAPE 2: Générer le Favicon (RECOMMANDÉ)

Créez `favicon.ico` pour l'icône d'onglet du navigateur:
1. Utilisez https://realfavicongenerator.net/ ou https://favicon.io/
2. Uploadez votre logo
3. Téléchargez `favicon.ico`
4. Placez dans `c:\Users\beatr\Documents\projets\moana\public\`

Instructions détaillées: `c:\Users\beatr\Documents\projets\moana\public\favicon-instructions.md`

### ÉTAPE 3: Intégrer le Manifest dans le Layout

Ajoutez ces balises `<link>` dans `app/layout.tsx`:

```tsx
// Dans le <head> ou metadata
export const metadata = {
  manifest: '/manifest.json',
  themeColor: '#0284c7',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Moana Yachting',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};
```

Ou si vous utilisez une approche traditionnelle, ajoutez dans le `<head>`:

```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0284c7" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
```

### ÉTAPE 4: Tester la PWA

#### En Développement
```bash
npm run dev
```

Ouvrez http://localhost:3000
- Le Service Worker est désactivé en dev (normal)
- Les icônes et manifest sont accessibles

#### En Production
```bash
npm run build
npm run start
```

**Test sur Desktop (Chrome/Edge)**:
1. Ouvrez http://localhost:3000
2. Barre d'adresse: icône d'installation devrait apparaître
3. Menu > "Installer Moana Yachting"
4. Vérifiez l'installation

**Test sur Android**:
1. Ouvrez l'URL sur Chrome Android
2. Menu > "Ajouter à l'écran d'accueil"
3. Vérifiez l'icône sur l'écran d'accueil
4. Ouvrez l'app - devrait être plein écran

**Test sur iOS (Safari)**:
1. Ouvrez l'URL sur Safari iOS
2. Bouton Partage > "Sur l'écran d'accueil"
3. Vérifiez l'icône
4. Ouvrez l'app

**Test Offline**:
1. Ouvrez l'app
2. Naviguez dans quelques pages
3. DevTools > Network > "Offline"
4. Rechargez - devrait fonctionner grâce au cache

## Fonctionnalités PWA Activées

### 1. Installation
- Installable sur tous les appareils (desktop, mobile, tablette)
- Icône personnalisée sur l'écran d'accueil
- Splash screen automatique (Android)

### 2. Mode Standalone
- Lance comme une app native
- Pas de barre d'URL du navigateur
- Plein écran

### 3. Cache Intelligent
- **API Airtable**: NetworkFirst avec fallback cache
  - Données fraîches en priorité
  - Fallback cache si offline
  - 1 heure de cache
- **Images**: CacheFirst
  - Chargement instantané depuis cache
  - 7 jours de cache

### 4. Performance
- Images optimisées (WebP)
- Compression Gzip/Brotli
- Code splitting automatique
- Lazy loading

### 5. Sécurité
- Headers de sécurité configurés
- HTTPS requis en production
- CSP compatible

### 6. SEO
- Metadata optimisé
- Open Graph compatible
- Crawlable par les moteurs de recherche

## Vérification de Configuration

### Checklist Avant Production

- [ ] Icônes PNG générées (192x192, 512x512, 180x180)
- [ ] Favicon.ico généré
- [ ] Manifest.json intégré dans layout.tsx
- [ ] Build de production testé (`npm run build`)
- [ ] Test d'installation desktop
- [ ] Test d'installation Android
- [ ] Test d'installation iOS
- [ ] Test mode offline
- [ ] Cache Airtable fonctionnel
- [ ] Lighthouse PWA score > 90

### Outils de Test

**Lighthouse (Chrome DevTools)**:
1. F12 > Lighthouse tab
2. Sélectionnez "Progressive Web App"
3. "Analyze page load"
4. Score cible: 90+

**Chrome DevTools > Application**:
- Manifest: Vérifiez les infos
- Service Workers: Vérifiez l'enregistrement
- Cache Storage: Vérifiez les caches

**PWA Builder**:
- https://www.pwabuilder.com/
- Entrez votre URL de production
- Vérifiez le rapport

## Troubleshooting

### Le Service Worker ne se charge pas
- Normal en dev (désactivé pour performance)
- Testez en production: `npm run build && npm run start`

### Les icônes ne s'affichent pas
- Vérifiez les fichiers PNG existent (pas les .placeholder)
- Vérifiez les chemins dans manifest.json
- Videz le cache navigateur (Ctrl+Shift+Delete)

### L'installation n'est pas proposée
- Vérifiez que manifest.json est accessible: http://localhost:3000/manifest.json
- Vérifiez les icônes sont accessibles
- Chrome: besoin de HTTPS en production

### Le cache ne fonctionne pas
- Vérifiez le Service Worker est enregistré (DevTools > Application)
- Vérifiez les patterns d'URL dans next.config.js
- Testez en production (désactivé en dev)

## Resources

### Documentation
- Next PWA: https://ducanh-next-pwa.vercel.app/
- PWA Builder: https://www.pwabuilder.com/
- Web.dev PWA: https://web.dev/progressive-web-apps/

### Générateurs d'Icônes
- PWA Builder: https://www.pwabuilder.com/imageGenerator
- RealFaviconGenerator: https://realfavicongenerator.net/
- Favicon.io: https://favicon.io/

### Test et Validation
- Lighthouse: Chrome DevTools
- PWA Builder Validator: https://www.pwabuilder.com/
- Manifest Validator: https://manifest-validator.appspot.com/

## Prochaines Étapes

1. **Générer les icônes** (voir ÉTAPE 1 ci-dessus)
2. **Intégrer dans layout.tsx** (voir ÉTAPE 3 ci-dessus)
3. **Tester en production** (voir ÉTAPE 4 ci-dessus)
4. **Déployer** sur Vercel/Netlify avec HTTPS

## Support

Pour toute question sur la configuration PWA:
- Consultez les README dans `public/icons/` et `public/`
- Testez avec Lighthouse pour diagnostics
- Vérifiez les logs du Service Worker dans DevTools

---

**Configuration créée le**: 2025-12-04
**Status**: Configuration complète - Icônes à générer
**Prêt pour**: Développement et test (après génération des icônes)
