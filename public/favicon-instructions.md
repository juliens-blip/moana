# Instructions pour favicon.ico

## Qu'est-ce qu'un favicon?

Le favicon est la petite icône qui apparaît dans l'onglet du navigateur. C'est un fichier `.ico` spécial.

## Comment générer favicon.ico

### Option 1: Utiliser un service en ligne (Le plus simple)

**RealFaviconGenerator** (Recommandé)
1. Allez sur: https://realfavicongenerator.net/
2. Uploadez votre logo (minimum 260x260px)
3. Configurez les options:
   - Theme color: #0284c7
   - Background: #ffffff ou #0284c7
4. Cliquez sur "Generate your Favicons and HTML code"
5. Téléchargez le package
6. Copiez `favicon.ico` dans `c:\Users\beatr\Documents\projets\moana\public\`

**Favicon.io**
1. Allez sur: https://favicon.io/favicon-converter/
2. Uploadez votre logo PNG (minimum 256x256px)
3. Téléchargez le favicon généré
4. Renommez en `favicon.ico`
5. Placez dans le dossier `public`

### Option 2: Utiliser ImageMagick

Si vous avez déjà un logo PNG:

```bash
# Installer ImageMagick: https://imagemagick.org/

# À partir d'un logo 512x512px
magick logo.png -define icon:auto-resize=16,32,48,64,256 favicon.ico
```

### Option 3: Utiliser GIMP

1. Ouvrez votre logo dans GIMP
2. Redimensionnez à 64x64px (Image → Scale Image)
3. Exportez: File → Export As
4. Nom: `favicon.ico`
5. Format: Microsoft Windows Icon (*.ico)
6. Sauvegardez dans le dossier `public`

## Où placer le fichier

```
moana/
└── public/
    └── favicon.ico  ← ICI
```

## Vérification

Une fois `favicon.ico` créé et placé dans `public/`, Next.js le détectera automatiquement. Pas besoin de configuration supplémentaire!

Pour tester:
1. Lancez `npm run dev`
2. Ouvrez http://localhost:3000
3. Vérifiez l'onglet du navigateur - vous devriez voir votre favicon

## Tailles Recommandées

Le fichier `.ico` devrait contenir plusieurs tailles:
- 16x16px (onglets navigateur)
- 32x32px (barre de favoris)
- 48x48px (raccourcis Windows)
- 64x64px (haute résolution)

Les outils en ligne génèrent automatiquement toutes ces tailles.

## Design du Favicon

Recommandations:
- Design simple et reconnaissable
- Éviter les détails trop fins (illisibles à 16x16px)
- Contraste élevé
- Fond uni de préférence
- Test sur fond clair ET fond sombre

Suggestions pour Moana Yachting:
- Version simplifiée du logo
- Ancre stylisée
- Initiales "M" ou "MY"
- Symbole nautique simple

## Troubleshooting

**Le favicon ne s'affiche pas?**
1. Videz le cache du navigateur (Ctrl+Shift+Delete)
2. Rechargez la page avec Ctrl+F5
3. Vérifiez que le fichier existe: `public/favicon.ico`
4. Redémarrez le serveur Next.js

**L'image est floue?**
- Utilisez un logo plus haute résolution (minimum 256x256px)
- Assurez-vous que le fichier .ico contient plusieurs tailles

---

**Note**: Ce fichier peut être supprimé une fois que vous avez généré et placé votre `favicon.ico`.
