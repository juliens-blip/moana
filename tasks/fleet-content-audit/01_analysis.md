# 01 — Analyse (EXPLORE) : fleet-content-audit

## Besoin
Repérer les listings Moana au contenu incomplet (pas de photos/vidéo, specs
manquantes) pour que l'équipe les complète → un listing complet se vend mieux.
Origine : audit BOSS 2026-07-16, ex. **FOUZ (Sanlorenzo SX88, ~€6M) sans aucune
photo ni vidéo** ([[moana-boss-business-data-tour]]).

## Recall RAG (QMD, BM25)
- `moana-boss-business-data-tour` : 59 listings Actifs (sur 173 historiques) ; FOUZ
  sans photos/vidéo (gap réel sur ~€6M) ; MOON GLIDER, BULL en échantillons specs.
- `yatco-boss-scraping-quirks` : les pages listing YATCO/BOSS sont **AJAX/lazy-load** →
  compter photos/vidéo demande le rendu JS (scrape-mcp `interact`/screenshot), pas un
  simple fetch HTML.

## Modèle de données (code)
- Table Supabase `listings` (type `Listing`, `lib/types.ts:14`) : champs de base
  (nom_bateau, constructeur, longueur_m, annee, nombre_cabines, prix_actuel,
  localisation, proprietaire, capitaine) + **`image_url?` (UNE seule image)** +
  `yatco_vessel_id?` (lien BOSS, souvent absent). Accès via `lib/supabase/listings.ts`.
- **La complétude « riche » du contenu (nb de photos, vidéo, fiche specs complète)
  n'est PAS dans la table Moana** — elle vit dans **YATCO BOSS** (système de référence).
- Existant connexe (WIP, non commité) : `yatco-stats` (impressions/gallery_views
  scrappés de BOSS) — montre qu'un pont BOSS→Supabase par listing existe déjà en cours.

## Deux périmètres possibles
- **A — Audit Supabase seul (sans scraping)** : signaler les listings sans `image_url`
  et aux champs de base vides (prix/année/longueur/cabines/propriétaire). Faisable
  tout de suite, zéro dépendance. Mais **audit superficiel** (limité aux données de l'app).
- **B — Audit YATCO BOSS profond (la vraie valeur)** : pour chaque listing Actif,
  ouvrir la page BOSS/YATCO et compter photos, détecter vidéo, vérifier la fiche specs.
  C'est ce qui reproduit le constat FOUZ. **Dépend de scrape-mcp** (rendu AJAX).

## Bloqueur identifié
- **scrape-mcp est DÉCONNECTÉ cette session** (`mcp__scrape-mcp__*` indisponible) →
  le périmètre B ne peut être ni construit ni testé live maintenant. Le tunnel exige
  un test live du nouvel outil : impossible pour B sans scrape-mcp.

## Décision utilisateur (2026-07-20) — périmètre RETENU
Reconnecter scrape-mcp ET **créer une nouvelle SECTION dans l'app « Listings YATCO »**
qui affiche la flotte Moana vue de YATCO BOSS + l'audit de contenu. Raison clé :
**seuls ~10 des 59 listings Actifs ont un `yatco_vessel_id`** dans Supabase → la table
`listings` actuelle ne suffit pas ; il faut ingérer la flotte complète depuis BOSS.

Portée confirmée = **B élargi** : (1) ingestion flotte YATCO BOSS → Supabase, (2)
nouvelle section app « Listings YATCO » (UI), (3) audit de contenu (photos/vidéo/specs)
affiché dans cette section. Touche `app/`/`components/`/`lib/` → **ordre code explicite
donné** par l'utilisateur (zones protégées levées pour cette feature).

## État scrape-mcp (prérequis bloquant)
- Enregistré dans `C:\Users\beatr\.claude.json`, **build présent** (`D:/dev/scrape-mcp/
  dist/index.js`), **auth présent** (`auth/yatcoboss.json`, 888B, du 2026-07-16, ~4 j).
- **Déconnecté cette session** (le sous-process MCP ne s'est pas lancé) → nécessite un
  **redémarrage de Claude Code** pour re-spawn. Si les cookies BOSS ont expiré (4 j),
  re-auth : `node D:/dev/scrape-mcp/scripts/login.mjs <login-url> auth/yatcoboss.json`
  (fenêtre Chromium, login manuel, puis Claude fait `touch auth/.login-done`).
- Voir [[scrape-mcp-setup]], [[yatco-boss-modules]], [[yatco-boss-scraping-quirks]].

## Suite
Le build (ingestion + section + audit) reprend **dès scrape-mcp reconnecté** : d'abord
inspecter la structure réelle des pages Fleet Manager / listing BOSS (rendu AJAX), puis
figer le schéma Supabase + le plan UI dans `02_plan.md`, puis CODE → TEST → DEPLOY.
