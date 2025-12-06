# Moana Yachting - SaaS de Gestion de Listings

Application SaaS moderne pour gérer les listings de bateaux de l'entreprise Moana Yachting avec intégration complète Airtable.

## 🚀 Fonctionnalités

- ✅ **Authentification Broker** - Connexion sécurisée pour chaque broker
- ✅ **CRUD Complet** - Créer, lire, modifier, supprimer des bateaux
- ✅ **Recherche & Filtres** - Recherche par nom, filtre par localisation
- ✅ **Interface Moderne** - UI responsive avec Tailwind CSS
- ✅ **Intégration Airtable** - Synchronisation temps réel avec votre base Airtable
- ✅ **MCP Server** - Intégration Claude AI pour gestion intelligente

## 🛠️ Stack Technique

- **Frontend**: Next.js 14 (App Router), React 19, TypeScript
- **Backend**: Next.js API Routes
- **Base de Données**: Airtable
- **Authentification**: NextAuth.js
- **Styling**: Tailwind CSS
- **Validation**: Zod
- **Forms**: React Hook Form

## 📋 Prérequis

- Node.js 18+
- npm ou yarn
- Compte Airtable avec API key

## 🚀 Installation

### 1. Cloner le projet

```bash
cd C:\Users\beatr\Documents\projets\moana
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configuration des variables d'environnement

Le fichier `.env.local` est déjà configuré avec vos credentials Airtable:

```env
# Airtable Configuration
AIRTABLE_API_KEY=patAaKdqjhnL6GJoq...
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
AIRTABLE_LISTINGS_TABLE_ID=tblxxQhUvQd2Haztz
AIRTABLE_BROKER_TABLE_ID=tbl9dTwK6RfutmqVY

# NextAuth Configuration
NEXTAUTH_SECRET=moana-yachting-super-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3000
```

⚠️ **IMPORTANT**: Changez `NEXTAUTH_SECRET` en production avec une clé sécurisée.

### 4. Lancer le serveur de développement

```bash
npm run dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## 📱 Utilisation

### Connexion

1. Accédez à [http://localhost:3000](http://localhost:3000)
2. Vous serez redirigé vers la page de connexion
3. Entrez vos identifiants broker (depuis la table Broker d'Airtable)
4. Cliquez sur "Se connecter"

### Gestion des Bateaux

#### Voir la liste des bateaux
- Le dashboard affiche tous vos bateaux
- Utilisez les filtres pour rechercher ou filtrer par localisation

#### Ajouter un bateau
1. Cliquez sur "Ajouter un bateau"
2. Remplissez le formulaire
3. Cliquez sur "Créer le bateau"

#### Modifier un bateau
1. Sur une carte de bateau, cliquez sur "Modifier"
2. Modifiez les informations
3. Cliquez sur "Mettre à jour"

#### Supprimer un bateau
1. Sur une carte de bateau, cliquez sur "Supprimer"
2. Confirmez la suppression dans la modale

## 🤖 MCP Server (Claude AI Integration)

Le projet inclut un serveur MCP pour permettre à Claude AI d'interagir directement avec votre base Airtable.

### Installation du MCP Server

```bash
cd mcp/airtable-moana-mcp
npm install
npm run build
```

### Configuration dans Claude Desktop

Ajoutez dans votre fichier de configuration Claude Desktop:

```json
{
  "mcpServers": {
    "moana-yachting": {
      "command": "node",
      "args": ["C:\\Users\\beatr\\Documents\\projets\\moana\\mcp\\airtable-moana-mcp\\dist\\index.js"],
      "env": {
        "AIRTABLE_API_KEY": "patAaKdqjhnL6GJoq...",
        "AIRTABLE_BASE_ID": "appNyZVynxa8shk4c",
        "AIRTABLE_LISTINGS_TABLE_ID": "tblxxQhUvQd2Haztz",
        "AIRTABLE_BROKER_TABLE_ID": "tbl9dTwK6RfutmqVY"
      }
    }
  }
}
```

### Commandes Claude Disponibles

Une fois le MCP Server configuré, vous pouvez utiliser ces commandes dans Claude:

- `/add-boat` - Ajouter rapidement un bateau
- `/find-boat` - Rechercher des bateaux avec filtres

## 🏗️ Structure du Projet

```
moana/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── auth/                 # NextAuth
│   │   └── listings/             # CRUD Listings
│   ├── dashboard/                # Pages protégées
│   │   ├── listings/
│   │   │   ├── create/          # Créer un bateau
│   │   │   └── [id]/edit/       # Modifier un bateau
│   │   └── page.tsx             # Liste des bateaux
│   ├── login/                    # Page de connexion
│   └── layout.tsx                # Layout racine
├── components/                   # Composants React
│   ├── ui/                       # Composants UI réutilisables
│   ├── listings/                 # Composants listings
│   ├── layout/                   # Layout components
│   └── auth/                     # Composants auth
├── lib/                          # Utilitaires & Logic
│   ├── airtable/                 # Client & opérations Airtable
│   ├── types.ts                  # Types TypeScript
│   ├── validations.ts            # Schémas Zod
│   └── utils.ts                  # Fonctions utilitaires
├── mcp/                          # MCP Server
│   └── airtable-moana-mcp/
├── .claude/                      # Configuration Claude
│   ├── agents/                   # Agents spécialisés
│   └── commands/                 # Commandes slash
└── public/                       # Assets statiques
```

## 📊 Structure Airtable

### Table Listings

| Champ | Type | Description |
|-------|------|-------------|
| Nom du Bateau | Text | Nom du yacht |
| Constructeur | Text | Marque du constructeur |
| Longueur (M/pieds) | Number | Longueur en mètres |
| Année | Number | Année de construction |
| Propriétaire | Text | Nom du propriétaire |
| Capitaine | Text | Nom du capitaine |
| Broker | Text | Broker assigné |
| Localisation | Single Select | Port/Marina |

### Table Broker

| Champ | Type | Description |
|-------|------|-------------|
| broker | Text | Nom d'utilisateur |
| password | Text | Mot de passe |
| Date de création | Created Time | Date de création |

## 🔒 Sécurité

- ✅ Authentification obligatoire pour toutes les routes protégées
- ✅ Vérification d'ownership des listings avant modification/suppression
- ✅ API keys Airtable jamais exposées côté client
- ✅ Validation des entrées avec Zod côté serveur
- ✅ Sessions sécurisées avec NextAuth.js

## 🚀 Déploiement

### Vercel (Recommandé)

1. Push votre code sur GitHub
2. Connectez votre repo à Vercel
3. Configurez les variables d'environnement
4. Déployez!

### Variables d'environnement de production

N'oubliez pas de configurer:
- `NEXTAUTH_SECRET` - Clé secrète unique
- `NEXTAUTH_URL` - URL de production
- Toutes les variables Airtable

## 📝 Scripts Disponibles

```bash
# Développement
npm run dev              # Lance le serveur de dev

# Production
npm run build            # Build l'application
npm start                # Lance le serveur de prod

# Qualité
npm run lint             # Lint le code
npm run type-check       # Vérifie les types TypeScript
```

## 🐛 Debugging

### Problèmes courants

**Erreur de connexion Airtable**
- Vérifiez votre API key
- Vérifiez les IDs de base et tables

**Erreur d'authentification**
- Vérifiez que le broker existe dans la table Broker d'Airtable
- Vérifiez que le mot de passe correspond

**Erreur TypeScript**
- Lancez `npm run type-check` pour voir les erreurs détaillées

## 📞 Support

Pour toute question ou problème:
- Consultez la documentation dans `CLAUDE.md`
- Vérifiez les agents Claude dans `.claude/agents/`
- Utilisez les commandes slash: `/add-boat`, `/find-boat`

## 📄 Licence

Propriétaire - Moana Yachting

---

**Développé avec ❤️ pour Moana Yachting**
