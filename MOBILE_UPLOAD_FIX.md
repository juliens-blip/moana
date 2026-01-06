# Guide de Test - Upload d'Images Mobile

## ✅ Corrections Appliquées

### 1. **Input File caché → Accessible**
**Problème :** Safari iOS bloque les clicks programmatiques sur les inputs `hidden`
**Solution :** Utilisation de la classe `sr-only` (screen-reader only) qui rend l'input invisible mais accessible

### 2. **Accès direct à la caméra**
**Problème :** Aucun moyen d'ouvrir directement la caméra
**Solution :** Ajout de l'attribut `capture="environment"` + bouton dédié

### 3. **Validation côté client**
**Problème :** Validation uniquement côté serveur
**Solution :** Ajout de validations immédiates (type de fichier, taille max 5 Mo)

### 4. **Logs de debug complets**
**Problème :** Impossible de diagnostiquer les erreurs mobile
**Solution :** Ajout de logs détaillés côté client ET serveur avec préfixe `[Mobile Upload]` et `[API Upload]`

### 5. **Gestion améliorée des events**
**Problème :** Reset de la value avant traitement complet
**Solution :** Reset uniquement après succès dans le bloc `finally`

---

## 📱 Comment Tester sur Mobile

### Option 1 : Tester avec Chrome DevTools (Desktop)

1. **Ouvrir Chrome DevTools** : F12 ou Ctrl+Shift+I
2. **Activer le mode mobile** : Cliquer sur l'icône "Toggle device toolbar" (Ctrl+Shift+M)
3. **Sélectionner un appareil** : iPhone 12 Pro, Samsung Galaxy, etc.
4. **Tester l'upload** :
   - Cliquer sur un bateau pour ouvrir le modal
   - Cliquer sur "📷 Prendre une photo" ou "🖼️ Galerie"
   - Sélectionner une image
5. **Vérifier les logs** :
   - Ouvrir l'onglet "Console" dans DevTools
   - Chercher les messages avec `[Mobile Upload]` et `[API Upload]`

### Option 2 : Tester sur un Vrai Appareil Mobile

#### A. Via tunnel ngrok/localhost.run

1. **Démarrer ngrok** :
   ```bash
   npm run dev  # Démarrer Next.js (port 3000)
   ngrok http 3000  # Dans un autre terminal
   ```

2. **Copier l'URL** : `https://xxxxx.ngrok.io`

3. **Ouvrir sur mobile** : Scanner le QR code ou entrer l'URL

4. **Tester l'upload** :
   - Se connecter avec un broker
   - Cliquer sur un bateau
   - Tester les deux boutons :
     - **📷 Prendre une photo** → Ouvre la caméra
     - **🖼️ Galerie** → Ouvre la galerie de photos

#### B. Via le réseau local (plus simple)

1. **Trouver votre IP locale** :
   ```bash
   # Windows
   ipconfig
   # Chercher "IPv4 Address" (ex: 192.168.1.100)

   # Mac/Linux
   ifconfig | grep inet
   ```

2. **Démarrer Next.js sur toutes les interfaces** :
   ```bash
   npm run dev -- -H 0.0.0.0
   ```

3. **Accéder depuis mobile** :
   - Assurez-vous que mobile et PC sont sur le même réseau WiFi
   - Ouvrir `http://192.168.1.100:3000` (remplacer par votre IP)

4. **Tester l'upload**

---

## 🐛 Diagnostic des Erreurs

### Étape 1 : Vérifier les Logs Console

**Sur Desktop :**
- Ouvrir DevTools → Console
- Filtrer par `Mobile Upload` ou `API Upload`

**Sur Mobile :**

#### iPhone (Safari)
1. Sur Mac : Safari → Préférences → Avancées → Activer "Afficher le menu Développement"
2. Connecter iPhone via USB
3. Sur Mac : Développement → [Nom iPhone] → [Page web]
4. Console s'ouvre avec les logs

#### Android (Chrome)
1. Sur téléphone : Paramètres → À propos → Taper 7× sur "Numéro de build"
2. Paramètres → Système → Options développeur → Activer "Débogage USB"
3. Connecter via USB
4. Sur PC : Ouvrir `chrome://inspect` dans Chrome
5. Cliquer sur "Inspect" sous votre appareil

### Étape 2 : Interpréter les Logs

#### Logs Client (Frontend)

```javascript
// ✅ Bouton cliqué avec succès
[Mobile Upload] Camera button clicked

// ✅ Input file déclenché
[Mobile Upload] Camera input triggered

// ✅ Fichier sélectionné
[Mobile Upload] Starting upload: {
  source: 'camera',
  fileName: 'IMG_1234.jpg',
  fileSize: 2458123,
  fileType: 'image/jpeg',
  listingId: 'abc123'
}

// ✅ Requête envoyée
[Mobile Upload] Sending request to: /api/listings/abc123/image

// ✅ Réponse reçue
[Mobile Upload] Response status: 200
[Mobile Upload] Response data: { success: true, ... }
[Mobile Upload] Upload successful
```

#### Logs Serveur (Backend)

```bash
# ✅ Requête reçue
[API Upload] Request received for listing: abc123
[API Upload] Session validated: user-id-123

# ✅ Fichier reçu
[API Upload] File received: {
  hasFile: true,
  isFileInstance: true,
  fileName: 'IMG_1234.jpg',
  fileSize: 2458123,
  fileType: 'image/jpeg'
}

# ✅ Upload Supabase
[API Upload] Uploading to Supabase Storage...
[API Upload] File uploaded successfully to Supabase

# ✅ Processus complet
[API Upload] Upload process completed successfully
```

### Étape 3 : Erreurs Courantes

| Erreur | Cause Probable | Solution |
|--------|---------------|----------|
| `No file selected` | Input non déclenché | Vérifier que le bouton appelle bien `.click()` |
| `Format image invalide` | Type MIME non supporté | Vérifier que le fichier est bien une image |
| `Image trop lourde (max 5 Mo)` | Fichier > 5 MB | Réduire la taille ou augmenter la limite |
| `Non authentifie` | Session expirée | Se reconnecter |
| `Erreur de connexion` | Réseau ou CORS | Vérifier la connexion et les headers |
| `Failed to fetch` | HTTPS/HTTP mixte | Utiliser HTTPS en prod, ou HTTP partout en dev |

---

## 🧪 Tests à Effectuer

### Test 1 : Upload depuis Galerie
1. Ouvrir modal d'un bateau
2. Cliquer "🖼️ Galerie"
3. Sélectionner une photo de la galerie
4. Vérifier :
   - [ ] Toast "Image ajoutée" apparaît
   - [ ] Aperçu de l'image s'affiche
   - [ ] Logs `[Mobile Upload]` dans console
   - [ ] Image visible sur la carte du bateau après fermeture

### Test 2 : Prendre une Photo
1. Ouvrir modal d'un bateau
2. Cliquer "📷 Prendre une photo"
3. Prendre une photo (caméra arrière)
4. Vérifier les mêmes points que Test 1

### Test 3 : Upload d'un Gros Fichier
1. Cliquer "🖼️ Galerie"
2. Sélectionner une image > 5 Mo
3. Vérifier :
   - [ ] Toast "Image trop lourde (max 5 Mo)" apparaît
   - [ ] Upload ne se lance pas
   - [ ] Log d'erreur dans console

### Test 4 : Upload d'un Fichier Non-Image
1. Essayer d'uploader un PDF/document
2. Vérifier :
   - [ ] Le sélecteur de fichiers filtre automatiquement (selon browser)
   - [ ] Si un non-image passe, toast "Format image invalide"

### Test 5 : Supprimer une Image
1. Sur un bateau avec image
2. Cliquer "Supprimer"
3. Vérifier :
   - [ ] Toast "Image supprimée"
   - [ ] Aperçu devient "Aucune image pour ce bateau"
   - [ ] Image disparaît de la carte du bateau

### Test 6 : Upload Successifs
1. Uploader une image
2. Attendre succès
3. Uploader une autre image (remplacer)
4. Vérifier :
   - [ ] Ancienne image supprimée de Supabase
   - [ ] Nouvelle image s'affiche
   - [ ] Logs montrent "Removing old image"

---

## 🔍 Vérifier les Logs Serveur

### Via Terminal Next.js

Quand vous exécutez `npm run dev`, les logs serveur s'affichent dans le terminal :

```bash
$ npm run dev

> moana@0.1.0 dev
> next dev

 ✓ Ready in 1234ms
 ○ Compiling /api/listings/[id]/image ...
 ✓ Compiled in 567ms

[API Upload] Request received for listing: abc123
[API Upload] Session validated: user-id-123
[API Upload] Parsing FormData...
[API Upload] File received: { hasFile: true, ... }
...
```

### Via Logs de Production (Vercel/autre)

Si déployé sur Vercel :
1. Aller sur vercel.com
2. Projet → Logs
3. Filtrer par `/api/listings` ou `[API Upload]`

---

## 📊 Checklist de Validation Finale

Avant de considérer le fix comme terminé :

- [ ] Upload depuis galerie fonctionne sur **iPhone Safari**
- [ ] Upload depuis galerie fonctionne sur **Android Chrome**
- [ ] Prendre une photo fonctionne sur **iPhone Safari**
- [ ] Prendre une photo fonctionne sur **Android Chrome**
- [ ] Validation taille fichier fonctionne
- [ ] Validation type fichier fonctionne
- [ ] Suppression d'image fonctionne
- [ ] Logs de debug sont clairs et utiles
- [ ] Aucune régression sur desktop
- [ ] UI responsive sur toutes tailles d'écran

---

## 🚀 Prochaines Étapes (Optionnel)

### Améliorations Futures

1. **Compression d'images côté client** :
   ```bash
   npm install browser-image-compression
   ```

2. **Preview avant upload** :
   - Afficher miniature avant d'envoyer
   - Permettre recadrage/rotation

3. **Upload progressif** :
   - Barre de progression
   - Annulation possible

4. **Cache des images** :
   - PWA avec service worker
   - Cache Supabase URLs

5. **Support multi-images** :
   - Galerie de photos par bateau
   - Carousel dans le modal

---

## 📞 Support

Si les problèmes persistent :

1. **Collecter les informations** :
   - Screenshot de la console (avec logs)
   - Appareil et navigateur (ex: iPhone 13, Safari 17.2)
   - Message d'erreur exact

2. **Vérifier Supabase** :
   - Bucket `listing-images` existe ?
   - Policies RLS correctes ?
   - Quota storage pas dépassé ?

3. **Vérifier NextAuth** :
   - Session valide et non expirée ?
   - Cookies autorisés dans le navigateur ?

---

**Date de création :** 2026-01-06
**Auteur :** Claude Code (Assistant IA)
**Version :** 1.0.0
