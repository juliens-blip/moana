# Airtable Moana MCP Server

MCP (Model Context Protocol) Server pour l'intégration Airtable de Moana Yachting.

## Installation

```bash
cd mcp/airtable-moana-mcp
npm install
npm run build
```

## Configuration

Créez un fichier `.env` avec:

```env
AIRTABLE_API_KEY=your_airtable_personal_access_token_here
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
AIRTABLE_LISTINGS_TABLE_ID=tblxxQhUvQd2Haztz
AIRTABLE_BROKER_TABLE_ID=tbl9dTwK6RfutmqVY
```

## Outils disponibles

### `list_listings`
Liste tous les bateaux avec filtres optionnels.

**Paramètres:**
- `broker` (optionnel): Filtrer par broker
- `localisation` (optionnel): Filtrer par localisation
- `search` (optionnel): Rechercher dans le nom

### `get_listing`
Récupère un bateau spécifique.

**Paramètres:**
- `id` (requis): ID Airtable du bateau

### `create_listing`
Crée un nouveau bateau.

**Paramètres obligatoires:**
- `nomBateau`: Nom du bateau
- `constructeur`: Constructeur
- `longueur`: Longueur en m/pieds
- `annee`: Année de construction
- `proprietaire`: Nom du propriétaire
- `capitaine`: Nom du capitaine
- `broker`: Nom du broker
- `localisation`: Localisation

**Paramètres optionnels:**
- `prix`: Prix en EUR (Number)
- `prixPrecedent`: Prix précédent en EUR (Number)
- `dernierMessage`: Dernier message/note (max 500 caractères)
- `commentaire`: Commentaire/remarques (max 2000 caractères)

### `update_listing`
Met à jour un bateau existant.

**Paramètres:**
- `id` (requis): ID Airtable du bateau
- Tous les autres champs sont optionnels (incluant les 4 nouveaux champs optionnels)

### `delete_listing`
Supprime un bateau.

**Paramètres:**
- `id` (requis): ID Airtable du bateau

### `list_brokers`
Liste tous les brokers.

### `authenticate_broker`
Authentifie un broker.

**Paramètres:**
- `broker` (requis): Nom d'utilisateur
- `password` (requis): Mot de passe

## Champs des Listings

### Champs obligatoires
- **Nom du Bateau**: Nom du bateau (Long text)
- **Constructeur**: Constructeur (Long text)
- **Longueur (M/pieds)**: Longueur (Number)
- **Année**: Année (Number)
- **Propriétaire**: Propriétaire (Text)
- **Capitaine**: Capitaine (Text)
- **Broker**: Broker (Text)
- **Localisation**: Localisation (Single line text - texte libre)

### Champs optionnels
- **Prix**: Prix en EUR (Number)
- **Prix précédent**: Prix précédent en EUR (Number)
- **Dernier message**: Dernier message/note (Single line text, max 500 caractères)
- **Commentaire**: Commentaire/remarques (Long text, max 2000 caractères)

## Utilisation avec Claude Desktop

Ajoutez dans votre configuration Claude Desktop:

```json
{
  "mcpServers": {
    "airtable-moana": {
      "command": "node",
      "args": ["C:\\Users\\beatr\\Documents\\projets\\moana\\mcp\\airtable-moana-mcp\\dist\\index.js"],
      "env": {
        "AIRTABLE_API_KEY": "your_airtable_personal_access_token_here",
        "AIRTABLE_BASE_ID": "appNyZVynxa8shk4c",
        "AIRTABLE_LISTINGS_TABLE_ID": "tblxxQhUvQd2Haztz",
        "AIRTABLE_BROKER_TABLE_ID": "tbl9dTwK6RfutmqVY"
      }
    }
  }
}
```

## Développement

```bash
# Mode watch
npm run dev

# Build
npm run build

# Run
npm start
```
