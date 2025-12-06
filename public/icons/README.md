# Icônes PWA - Moana Yachting

## Status: PLACEHOLDERS À REMPLACER

Les fichiers PNG dans ce dossier sont des **placeholders temporaires**. Vous devez les remplacer par vos vraies icônes.

## Fichiers Requis

### 1. icon-192x192.png
- **Dimensions**: 192x192 pixels
- **Format**: PNG
- **Usage**: Icône principale PWA (Android)
- **Design**: Logo Moana Yachting sur fond bleu (#0284c7) ou transparent

### 2. icon-512x512.png
- **Dimensions**: 512x512 pixels
- **Format**: PNG
- **Usage**: Icône haute résolution PWA (Android)
- **Design**: Logo Moana Yachting sur fond bleu (#0284c7) ou transparent

### 3. apple-touch-icon.png
- **Dimensions**: 180x180 pixels
- **Format**: PNG
- **Usage**: Icône pour iOS (iPhone/iPad)
- **Design**: Logo Moana Yachting sur fond bleu (#0284c7)
- **Note**: iOS ajoute automatiquement des coins arrondis

## Comment Générer les Icônes

### Option 1: Utiliser un service en ligne (Recommandé)

**PWA Asset Generator**
1. Allez sur: https://www.pwabuilder.com/imageGenerator
2. Uploadez votre logo (minimum 512x512px, format PNG/SVG)
3. Couleur de fond: #0284c7 (bleu Moana)
4. Téléchargez les icônes générées
5. Remplacez les fichiers dans ce dossier

**RealFaviconGenerator**
1. Allez sur: https://realfavicongenerator.net/
2. Uploadez votre logo haute résolution
3. Configurez les couleurs (theme: #0284c7)
4. Générez et téléchargez
5. Remplacez les fichiers dans ce dossier

### Option 2: Utiliser un outil graphique

**Avec Photoshop/GIMP/Figma:**
1. Créez un nouveau document 512x512px
2. Fond bleu #0284c7
3. Ajoutez votre logo centré (marges de 10% recommandées)
4. Exportez en PNG
5. Redimensionnez pour créer les autres tailles:
   - 512x512 → icon-512x512.png
   - 192x192 → icon-192x192.png
   - 180x180 → apple-touch-icon.png

### Option 3: Utiliser ImageMagick (ligne de commande)

Si vous avez déjà un logo 512x512px nommé `logo.png`:

```bash
# Installer ImageMagick (https://imagemagick.org/)

# Créer icon-512x512.png (déjà à la bonne taille)
cp logo.png icon-512x512.png

# Créer icon-192x192.png
magick logo.png -resize 192x192 icon-192x192.png

# Créer apple-touch-icon.png
magick logo.png -resize 180x180 apple-touch-icon.png
```

## Recommandations de Design

### Couleurs
- **Primaire**: #0284c7 (bleu Moana)
- **Secondaire**: #ffffff (blanc pour le logo)
- **Alternative**: Dégradé bleu marine → bleu clair

### Composition
- Logo centré
- Marges minimales de 10% (safe zone)
- Design simple et reconnaissable
- Éviter les textes trop petits
- Contraste élevé pour la lisibilité

### Thème Nautique
Suggestions visuelles:
- Ancre marine (comme dans le SVG actuel)
- Voile de bateau
- Gouvernail
- Vagues stylisées
- Boussole marine
- Initiales "MY" avec élément nautique

## Vérification

Après avoir remplacé les icônes, vérifiez:

1. **Dimensions correctes**:
   ```bash
   file icon-192x192.png
   file icon-512x512.png
   file apple-touch-icon.png
   ```

2. **Taille de fichier raisonnable**:
   - icon-192x192.png: < 50 KB
   - icon-512x512.png: < 150 KB
   - apple-touch-icon.png: < 50 KB

3. **Format PNG avec transparence** (optionnel mais recommandé)

4. **Test sur appareils**:
   - Android: "Ajouter à l'écran d'accueil"
   - iOS: Safari → "Ajouter à l'écran d'accueil"

## Fichier Source

Le fichier `icon.svg` contient une version vectorielle de l'icône placeholder. Vous pouvez:
- L'éditer avec Inkscape/Illustrator
- L'utiliser comme template
- Le remplacer par votre propre SVG

## Support

Si vous avez besoin d'aide pour créer les icônes, contactez votre designer ou utilisez les services en ligne recommandés ci-dessus.

---

**Note**: N'oubliez pas de générer également `favicon.ico` pour la compatibilité navigateur (voir instructions dans le README principal).
