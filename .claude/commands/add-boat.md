---
description: Ajouter rapidement un nouveau bateau au catalogue Moana Yachting via Airtable
---

# Ajouter un Bateau au Catalogue

Vous allez aider l'utilisateur à ajouter un nouveau bateau au catalogue Moana Yachting.

## Instructions

1. **Collecter les informations** - Demander à l'utilisateur de fournir les détails du bateau:
   - Nom du bateau (requis)
   - Constructeur (requis)
   - Longueur en mètres (requis)
   - Année de construction (requis)
   - Propriétaire (requis)
   - Capitaine (requis)
   - Broker assigné (requis)
   - Localisation (Monaco, Saint-Tropez, Cannes, etc.)

2. **Valider les données**:
   - Nom: 1-100 caractères
   - Longueur: nombre positif
   - Année: entre 1900 et 2027
   - Tous les champs texte: non vides

3. **Utiliser le MCP Tool** `create_listing` pour ajouter le bateau:
   ```
   create_listing({
     nomBateau: "...",
     constructeur: "...",
     longueur: 25.5,
     annee: 2020,
     proprietaire: "...",
     capitaine: "...",
     broker: "...",
     localisation: "Monaco"
   })
   ```

4. **Confirmer** - Afficher un résumé du bateau ajouté avec son ID Airtable.

## Exemple de Dialogue

**User**: Je veux ajouter un nouveau bateau

**Assistant**: Parfait! Je vais vous aider à ajouter un nouveau bateau au catalogue. Donnez-moi les informations suivantes:

- Nom du bateau
- Constructeur
- Longueur (en mètres)
- Année de construction
- Nom du propriétaire
- Nom du capitaine
- Broker assigné
- Localisation

**User**: Sunseeker 76, Sunseeker, 23.2m, 2020, John Smith, Captain Jack, john.doe, Monaco

**Assistant**: [Utilise MCP tool create_listing]

Parfait! Le bateau "Sunseeker 76" a été ajouté avec succès au catalogue:
- ID: recXXXXXXXXX
- Constructeur: Sunseeker
- Longueur: 23.2 mètres
- Année: 2020
- Localisation: Monaco
- Broker: john.doe

Le bateau est maintenant visible dans le dashboard!
