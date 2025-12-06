# Guide d'Intégration PWA - Action Immédiate

## Ce qu'il faut faire maintenant

### 1. Intégrer le Manifest dans app/layout.tsx

Ajoutez cette configuration dans votre fichier `app/layout.tsx` :

```typescript
// app/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Moana Yachting - Gestion de Listings',
  description: 'Système de gestion des listings de bateaux pour Moana Yachting',
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
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        {/* PWA Meta Tags additionnels (optionnel si metadata est utilisé) */}
        <meta name="application-name" content="Moana Yachting" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Moana Yachting" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#0284c7" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

### 2. Générer les Icônes (URGENT)

Les fichiers actuels sont des placeholders. Générez les vraies icônes :

**Méthode Rapide** :
1. Allez sur https://www.pwabuilder.com/imageGenerator
2. Uploadez votre logo (512x512px minimum)
3. Couleur de fond : `#0284c7`
4. Téléchargez les icônes
5. Remplacez dans `c:\Users\beatr\Documents\projets\moana\public\icons\` :
   - icon-192x192.png
   - icon-512x512.png
   - apple-touch-icon.png
6. Supprimez les fichiers `.placeholder`

### 3. Tester

```bash
# Build de production
npm run build

# Lancer en mode production
npm run start
```

Ouvrez http://localhost:3000 et vérifiez :
- Icône d'installation dans la barre d'adresse (Chrome/Edge)
- Console : pas d'erreurs sur manifest.json
- DevTools > Application > Manifest : toutes les infos affichées

## Structure Finale Attendue

```
moana/
├── app/
│   └── layout.tsx                ← MODIFIER ICI
├── public/
│   ├── manifest.json             ✅
│   ├── favicon.ico               ⚠️ À CRÉER
│   └── icons/
│       ├── icon.svg              ✅
│       ├── icon-192x192.png      ⚠️ À GÉNÉRER
│       ├── icon-512x512.png      ⚠️ À GÉNÉRER
│       └── apple-touch-icon.png  ⚠️ À GÉNÉRER
└── next.config.js                ✅
```

## Checklist Rapide

- [ ] Modifier `app/layout.tsx` avec metadata PWA
- [ ] Générer icon-192x192.png
- [ ] Générer icon-512x512.png
- [ ] Générer apple-touch-icon.png
- [ ] (Optionnel) Générer favicon.ico
- [ ] Tester en production locale
- [ ] Vérifier installation desktop
- [ ] Vérifier installation mobile

## Ressources

- **Documentation complète** : `c:\Users\beatr\Documents\projets\moana\PWA-SETUP-COMPLETE.md`
- **Instructions icônes** : `c:\Users\beatr\Documents\projets\moana\public\icons\README.md`
- **Instructions favicon** : `c:\Users\beatr\Documents\projets\moana\public\favicon-instructions.md`

## Troubleshooting Rapide

**Erreur : Manifest not found**
→ Vérifiez que manifest.json est accessible : http://localhost:3000/manifest.json

**Erreur : Icons not loading**
→ Générez les vraies icônes PNG (pas les .placeholder)

**Pas de bouton d'installation**
→ Testez en mode production, pas en dev

**Service Worker désactivé en dev**
→ C'est normal ! Configuré comme ça pour la performance en développement

---

**Temps estimé** : 15 minutes (avec génération d'icônes)
**Priorité** : Haute (requis pour PWA fonctionnelle)
