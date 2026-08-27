# Audit du pipeline Brochure → Vidéo

Date de l’audit : 27 août 2026  
Périmètre : application Moana locale, API Next.js, exécution distante EC2,
Gemini Flash/Veo, FFmpeg et Supabase Storage.

## 1. Résumé exécutif

La Software Factory a produit une architecture globalement pertinente : upload
du PDF depuis le dashboard, lancement asynchrone d’un worker EC2, extraction des
images, classification, génération Veo, assemblage FFmpeg, stockage Supabase et
polling du résultat.

Cependant, le livrable n’était pas utilisable de bout en bout. Plusieurs tests
étaient verts alors que leurs mocks ne reproduisaient pas les contrats réels de
React, PDF, Gemini, Supabase, SSH et systemd. Le déploiement était également
incomplet. Dans l’état livré, le bouton pouvait ne rien afficher, l’API retournait
des erreurs 500/502, le service distant ne démarrait pas correctement et les
premiers appels réels échouaient successivement avant la génération ou le
montage.

Le pipeline fonctionne désormais de bout en bout. Une brochure réelle a produit
9 clips Veo de 6 secondes, assemblés en une vidéo finale de 6,49 Mo. Les clips et
la vidéo finale sont conservés dans Supabase Storage. La génération de nouveaux
PDF reste soumise au quota et à la facturation Gemini ; le dernier essai sur un
nouveau document a été refusé dès le premier clip par un HTTP 429, sans clip
persisté.

## 2. Architecture finalement opérationnelle

1. Le navigateur envoie le PDF à `POST /api/brochure-video`.
2. La route vérifie la session, le type et la signature PDF.
3. Le serveur Next.js transfère atomiquement le PDF et son manifeste sur EC2 par
   SSH.
4. La route lance une instance `moana-brochure-video@<jobId>.service` avec
   `systemctl --no-block` et renvoie immédiatement le `jobId`.
5. Le client affiche la progression puis interroge
   `/api/brochure-video/<jobId>/status` toutes les deux secondes.
6. Le worker extrait les images, classe les sections lorsque Gemini Flash est
   disponible, génère les clips manquants avec Veo et les checkpoint dans le
   bucket privé `veo-clips`.
7. FFmpeg assemble les clips, puis publie la vidéo finale dans le bucket public
   `videos`.
8. Le statut atomique passe à `done` et le lecteur vidéo reçoit l’URL publique.

## 3. Pourquoi le livrable Factory ne fonctionnait pas

### 3.1 Déploiement déclaré mais non finalisé

Le template `moana-brochure-video@.service` était généré localement, mais le plan
de déploiement ne le copiait pas dans `/etc/systemd/system` et n’exécutait pas la
finalisation systemd correspondante. Le script `workers/deploy/deploy.py`
référençait partiellement le template sans déployer tous les modules Python du
pipeline ni son environnement racine.

Conséquences observées :

- unité systemd absente au premier essai ;
- modules worker absents ou désynchronisés sur EC2 ;
- environnement virtuel Python non provisionné ;
- FFmpeg et variables d’environnement non garantis par le déploiement ;
- commandes proposées par la Factory (`--mode install --unit ...`) incompatibles
  avec l’interface réelle de `deploy.py`, qui accepte `--apply` ou `check`.

Correction appliquée : installation manuelle et vérifiée du template systemd,
création de l’environnement Python, installation des dépendances, présence de
FFmpeg, synchronisation des workers et configuration des variables requises sur
EC2. Les secrets n’ont pas été ajoutés au dépôt.

### 3.2 Configuration locale SSH incomplète

La route dépendait de `MOANA_SSH_HOST` et `MOANA_SSH_KEY`, mais la Factory avait
laissé une configuration partielle. L’absence de l’hôte provoquait une erreur
serveur. La procédure manuelle mélangeait en outre commandes locales et commandes
à exécuter après connexion SSH, ce qui a conduit à chercher les fichiers locaux
depuis `/home/ubuntu`.

Correction appliquée : hôte déclaré localement, clé privée temporairement écrite
en mode `0600` par la route, distinction claire entre terminal local et terminal
EC2, et réponses JSON explicites en cas de configuration ou lancement impossible.

### 3.3 Chemin d’upload incohérent entre SSH et systemd

Le transfert utilisait initialement un chemin relatif. Une session SSH démarre
dans `/home/ubuntu`, alors que systemd exécute le worker avec
`WorkingDirectory=/home/ubuntu/moana`. Le PDF était donc écrit dans un dossier que
le worker ne consultait pas.

Correction appliquée : racine distante absolue
`/home/ubuntu/moana/var/brochure-video-jobs` pour le PDF, le manifeste et les
snapshots de statut.

### 3.4 Lancement systemd traité comme une requête synchrone

La route attendait la fin de `systemctl start` sur une unité `Type=oneshot`.
L’appel HTTP restait ouvert pendant toute la génération et finissait en timeout ou
502 au lieu de rendre un identifiant de job.

Correction appliquée : `systemctl --no-block start`, réponse HTTP immédiate, puis
polling du fichier d’état distant. C’est ce changement qui rend la barre de
progression réellement asynchrone.

### 3.5 Parseur PDF trop limité pour une brochure valide

Les tests utilisaient des PDF minimaux. La brochure réelle utilisait des formes de
syntaxe non couvertes : chaînes littérales et hexadécimales, nombres comme `.00`,
object streams PDF 1.5 compressés et images imbriquées dans des Form XObjects.

Correction appliquée dans `workers/pdf_image_extractor.py` : prise en charge de
ces constructions, décompression des object streams, parcours récursif des Form
XObjects et conservation des octets JPEG dans le manifeste. La brochure réelle a
alors exposé 12 images exploitables.

### 3.6 Contrat Gemini/Veo obsolète ou incomplet

Le modèle configuré par la Factory n’était plus disponible. La durée de 5 secondes
était rejetée par le modèle Veo réellement accessible, et la requête ne transmettait
pas correctement l’image source.

Corrections appliquées :

- modèle `veo-3.1-lite-generate-preview` ;
- durée entière supportée de 6 secondes ;
- image JPEG envoyée inline avec son type MIME ;
- lecture détaillée du corps des erreurs HTTP ;
- distinction entre erreurs transitoires et définitives ;
- fallback déterministe lorsque Gemini Flash atteint son quota 429 ;
- conservation des clips déjà générés et montage partiel lorsque Veo atteint son
  quota après plusieurs succès.

### 3.7 Buckets Supabase absents

Le code supposait l’existence de `veo-clips` et `videos`, mais la Factory ne les
avait ni créés ni vérifiés.

Correction appliquée : création et validation du bucket privé `veo-clips` pour les
checkpoints et du bucket public `videos` pour les résultats assemblés.

### 3.8 Mock Supabase incompatible avec l’API réelle

Le mock de test de `object/info` renvoyait un champ SHA-256 `checksum`. La réponse
réelle Supabase contient notamment `name`, `etag` et `size`, mais pas ce champ. Au
second essai du même PDF, le worker croyait donc la vidéo absente, la réassemblait,
puis tentait de republier la même clé. Le refus du doublon était réduit à
`definitive:RuntimeError`.

Correction appliquée : lorsqu’un objet réel est identifié sans checksum
applicatif, téléchargement authentifié de ses octets et calcul local du SHA-256.
Le résultat final est désormais vérifié et réutilisé avant tout appel Gemini.
Cette pré-vérification évite aussi toute dépense lors d’un nouvel essai du même
PDF. Les erreurs génériques conservent maintenant un détail borné et exploitable.

### 3.9 Interface silencieuse sous React Strict Mode

Le contrôleur du hook était conservé dans un `useRef`. Le cleanup de `useEffect`
appelait `dispose()`. En développement, React Strict Mode exécute la séquence
`setup → cleanup → setup` au montage : le second setup réutilisait donc un
contrôleur définitivement marqué `disposed=true`.

Le POST pouvait partir, mais les changements `uploading`, `running`, `done` ou
`failed` n’étaient plus transmis à React. La barre restait invisible et le polling
s’arrêtait après l’upload. Les avertissements Firefox sur les fichiers `.woff2`
étaient concomitants mais sans rapport.

Correction appliquée : méthode `activate()` appelée à chaque setup, rejet explicite
d’un submit après un vrai démontage, et test de non-régression reproduisant le double
cycle Strict Mode.

### 3.10 Observabilité et messages d’erreur insuffisants

Plusieurs couches remplaçaient la cause utile par un message générique : 502 côté
API, `RuntimeError` côté worker ou absence totale de retour visible dans le client.

Correction appliquée : réponses API toujours JSON, état `failed` remonté au client,
cause Veo conservée, détail FFmpeg/Storage journalisé, barre de progression visible
pendant upload et traitement, et séparation claire entre avertissements de police,
panne applicative et quota fournisseur.

## 4. Améliorations éditoriales du prompt vidéo

Le prompt de production demande désormais :

- qualité premium et photoréaliste, colorimétrie naturelle, exposition équilibrée,
  matériaux réalistes et cohérence temporelle ;
- absence de flicker, morphing, texte déformé et effet diaporama bas de gamme ;
- logo de l’agence de brokerage uniquement comme petit filigrane statique,
  semi-transparent et discret, jamais comme image plein écran ;
- intérieurs traités en visite immersive : travelling lent, suivi latéral,
  parallaxe et révélation des volumes ;
- transition vers une pièce adjacente uniquement si elle est visible dans la source,
  sans inventer de pièce ni de trajectoire impossible ;
- interdiction de réduire une scène intérieure à un simple zoom/dézoom.

Limite connue : un prompt ne garantit pas une identité graphique pixel-perfect sur
tous les clips. Pour un filigrane strictement identique sur l’intégralité du montage,
le logo devra être identifié puis superposé par FFmpeg. De plus, la vidéo existante
d’un PDF identique reste volontairement réutilisée ; une évolution future devra
versionner le prompt dans la clé de cache si l’on souhaite régénérer le même document
après un changement créatif.

## 5. Preuves de validation

| Vérification | Résultat |
|---|---|
| TypeScript `tsc --noEmit` | succès |
| Contrôleur frontend brochure-vidéo | 11/11 tests passés |
| Routes et contrôleur frontend | 39/39 tests passés |
| Suite backend ciblée brochure-vidéo | 180/180 tests passés |
| Compilation Python des workers corrigés | succès local et EC2 |
| Parsing de la brochure réelle | 12 images extraites |
| Lancement API asynchrone | HTTP 200 avec `jobId` et URL de statut |
| Génération réelle | 9 clips Veo checkpointés |
| Montage FFmpeg réel | vidéo MP4 finale de 6,49 Mo |
| Stockage intermédiaire | 9 objets présents dans `veo-clips` |
| Stockage final | objet présent et téléchargeable dans `videos` |
| Rejeu du même PDF | artefact SHA-256 reconnu et réutilisé |
| Garde anti-coût | test sentinelle `NO_GEMINI_REUSE_OK` |
| Nouveau PDF sous quota épuisé | échec 429 au premier clip, 0 checkpoint créé |

## 6. État actuel et limites opérationnelles

### Fonctionnel

- navigation desktop et mobile vers la page brochure-vidéo ;
- validation et upload du PDF ;
- barre de progression et messages d’erreur ;
- lancement distant asynchrone ;
- extraction PDF réelle ;
- génération et checkpointing Veo ;
- montage et publication Supabase ;
- réutilisation sans coût d’un résultat déjà publié.

### Blocage externe actuel

Les nouveaux documents peuvent recevoir `429 RESOURCE_EXHAUSTED` tant que le
quota, le palier de facturation ou le solde prépayé Gemini du projet n’est pas
disponible. Redémarrer Next.js ou EC2 ne contourne pas cette limite. Les quotas
s’appliquent au projet Google, pas séparément à chaque clé du même projet.

### Risques résiduels

1. Le déploiement brochure n’est pas encore entièrement provisionné par
   `workers/deploy/deploy.py`; l’EC2 opérationnelle a été finalisée manuellement.
2. Les buckets Supabase sont créés, mais leur création n’est pas décrite par une
   migration Infrastructure as Code.
3. Le parseur PDF est volontairement spécialisé ; de nouveaux filtres ou codecs PDF
   peuvent nécessiter un fallback vers une bibliothèque PDF éprouvée.
4. Le filigrane logo reste une instruction générative, pas encore un overlay FFmpeg
   déterministe.
5. Le cache final est indexé par digest du PDF ; il ne tient pas encore compte d’une
   version du prompt.
6. La progression est indéterminée ; le worker ne publie pas encore un pourcentage
   exact par section.

## 7. Recommandations pour la Software Factory

1. Ajouter un gate de déploiement qui vérifie que tout artefact systemd transféré est
   réellement installé, suivi d’un `daemon-reload` et d’un `systemctl cat`.
2. Exiger un smoke test bout en bout sur un environnement de staging, avec API,
   SSH, systemd, PDF réaliste, FFmpeg et Storage réels, avant de déclarer la tâche
   terminée.
3. Construire les mocks à partir de réponses réelles assainies, notamment pour
   Supabase `object/info` et les erreurs Gemini.
4. Tester les hooks React sous Strict Mode ou avec un test d’intégration DOM qui
   rejoue le double cycle des effets.
5. Vérifier au moment du build la disponibilité du modèle et ses contraintes de
   durée, au lieu de figer un identifiant preview supposé stable.
6. Tester plusieurs PDF représentatifs : object streams, Form XObjects, images
   imbriquées et codecs différents.
7. Préserver systématiquement le message causal des erreurs derrière une
   redaction et une limite de taille, plutôt que le seul nom de classe.
8. Ajouter une garde coût/quota avant génération, afficher le nombre de clips prévu
   et demander une confirmation explicite pour un document non caché.
9. Versionner prompt, modèle et paramètres dans les clés de checkpoint afin de
   distinguer reprise identique et régénération créative volontaire.
10. Ajouter un overlay FFmpeg déterministe pour le logo et une progression structurée
    (`extraction`, `classification`, `clip n/N`, `assembly`, `publish`).

## 8. Conclusion

La Factory a fourni un squelette utile et une bonne séparation des responsabilités,
mais ses validations étaient trop déterministes et trop éloignées des contrats de
production. L’échec n’était pas dû à une seule variable manquante : il résultait
d’une chaîne de défauts de déploiement, d’intégration fournisseur, de parsing PDF,
d’idempotence Storage et de cycle de vie React.

Le système est maintenant fonctionnel sur une brochure réelle et son comportement
est observable. La prochaine priorité n’est pas de redémarrer les serveurs, mais de
rendre le déploiement reproductible, de lever le quota Gemini pour les nouveaux PDF
et de renforcer les garanties créatives (version de prompt et filigrane FFmpeg).
