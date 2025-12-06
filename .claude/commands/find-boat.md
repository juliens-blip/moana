---
description: Rechercher un bateau dans le catalogue Moana Yachting avec filtres avancés
---

# Rechercher un Bateau

Aidez l'utilisateur à trouver un ou plusieurs bateaux dans le catalogue Moana Yachting en utilisant différents critères de recherche.

## Instructions

1. **Comprendre la recherche** - Identifier ce que l'utilisateur cherche:
   - Par nom de bateau
   - Par broker
   - Par localisation
   - Par constructeur
   - Combinaison de critères

2. **Utiliser le MCP Tool** `list_listings` avec les filtres appropriés:
   ```
   list_listings({
     search: "Sunseeker",      // Recherche dans nom et constructeur
     broker: "john.doe",         // Filtrer par broker
     localisation: "Monaco"      // Filtrer par localisation
   })
   ```

3. **Présenter les résultats**:
   - Si 0 résultats: suggérer d'élargir la recherche
   - Si 1-10 résultats: afficher les détails complets
   - Si >10 résultats: afficher résumé et suggérer filtres

4. **Format d'affichage**:
   ```
   🛥️ [Nom du Bateau]
   📍 Localisation
   🏗️ Constructeur
   📏 Longueur: X.X m
   📅 Année: XXXX
   👤 Broker: xxx
   🔗 ID: recXXXXXXXXX
   ```

## Exemples

### Recherche Simple
**User**: Trouve les bateaux à Monaco

**Assistant**: [Utilise list_listings avec localisation: "Monaco"]

J'ai trouvé 5 bateaux à Monaco:

🛥️ Sunseeker 76
📍 Monaco
🏗️ Sunseeker
📏 23.2 m
📅 2020
👤 john.doe

[...autres résultats...]

### Recherche par Nom
**User**: Y a-t-il un bateau qui s'appelle "Princess"?

**Assistant**: [Utilise list_listings avec search: "Princess"]

Oui! J'ai trouvé 2 bateaux avec "Princess" dans le nom:
[...résultats...]

### Recherche Multi-Critères
**User**: Montre-moi les bateaux de john.doe à Saint-Tropez

**Assistant**: [Utilise list_listings avec broker: "john.doe", localisation: "Saint-Tropez"]

Voici les bateaux de john.doe à Saint-Tropez:
[...résultats...]

## Tips

- Utiliser `search` pour recherche textuelle large
- Utiliser `broker` pour voir les bateaux d'un broker spécifique
- Utiliser `localisation` pour filtrer par port
- Combiner les filtres pour recherches précises
- Toujours afficher le nombre total de résultats
