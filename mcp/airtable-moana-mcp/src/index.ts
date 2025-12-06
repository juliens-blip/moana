#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Airtable from 'airtable';
import {
  AirtableConfig,
  CreateListingInputSchema,
  UpdateListingInputSchema,
  DeleteListingInputSchema,
  GetListingInputSchema,
  ListListingsInputSchema,
  AuthenticateBrokerInputSchema,
  Listing,
  Broker
} from './types/index.js';

// Configuration Airtable
const config: AirtableConfig = {
  apiKey: process.env.AIRTABLE_API_KEY || '',
  baseId: process.env.AIRTABLE_BASE_ID || 'appNyZVynxa8shk4c',
  listingsTableId: process.env.AIRTABLE_LISTINGS_TABLE_ID || 'tblxxQhUvQd2Haztz',
  brokerTableId: process.env.AIRTABLE_BROKER_TABLE_ID || 'tbl9dTwK6RfutmqVY'
};

// Initialize Airtable
Airtable.configure({ apiKey: config.apiKey });
const base = Airtable.base(config.baseId);

// Create MCP Server
const server = new Server(
  {
    name: 'airtable-moana-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_listings',
        description: 'Liste tous les bateaux avec filtres optionnels (broker, localisation, recherche)',
        inputSchema: {
          type: 'object',
          properties: {
            broker: {
              type: 'string',
              description: 'Filtrer par nom du broker'
            },
            localisation: {
              type: 'string',
              description: 'Filtrer par localisation'
            },
            search: {
              type: 'string',
              description: 'Rechercher dans le nom du bateau'
            }
          }
        }
      },
      {
        name: 'get_listing',
        description: 'Récupère les détails d\'un bateau spécifique par son ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID Airtable du bateau'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'create_listing',
        description: 'Crée un nouveau bateau dans le catalogue',
        inputSchema: {
          type: 'object',
          properties: {
            nomBateau: { type: 'string', description: 'Nom du bateau' },
            constructeur: { type: 'string', description: 'Constructeur du bateau' },
            longueur: { type: 'number', description: 'Longueur en mètres/pieds' },
            annee: { type: 'number', description: 'Année de construction' },
            proprietaire: { type: 'string', description: 'Nom du propriétaire' },
            capitaine: { type: 'string', description: 'Nom du capitaine' },
            broker: { type: 'string', description: 'Nom du broker' },
            localisation: { type: 'string', description: 'Localisation du bateau' },
            prix: { type: 'number', description: 'Prix en EUR (optionnel)' },
            prixPrecedent: { type: 'number', description: 'Prix précédent en EUR (optionnel)' },
            dernierMessage: { type: 'string', description: 'Dernier message/note - max 500 caractères (optionnel)' },
            commentaire: { type: 'string', description: 'Commentaire/remarques - max 2000 caractères (optionnel)' }
          },
          required: ['nomBateau', 'constructeur', 'longueur', 'annee', 'proprietaire', 'capitaine', 'broker', 'localisation']
        }
      },
      {
        name: 'update_listing',
        description: 'Met à jour les informations d\'un bateau existant',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID Airtable du bateau' },
            nomBateau: { type: 'string', description: 'Nom du bateau' },
            constructeur: { type: 'string', description: 'Constructeur du bateau' },
            longueur: { type: 'number', description: 'Longueur en mètres/pieds' },
            annee: { type: 'number', description: 'Année de construction' },
            proprietaire: { type: 'string', description: 'Nom du propriétaire' },
            capitaine: { type: 'string', description: 'Nom du capitaine' },
            broker: { type: 'string', description: 'Nom du broker' },
            localisation: { type: 'string', description: 'Localisation du bateau' },
            prix: { type: 'number', description: 'Prix en EUR (optionnel)' },
            prixPrecedent: { type: 'number', description: 'Prix précédent en EUR (optionnel)' },
            dernierMessage: { type: 'string', description: 'Dernier message/note - max 500 caractères (optionnel)' },
            commentaire: { type: 'string', description: 'Commentaire/remarques - max 2000 caractères (optionnel)' }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_listing',
        description: 'Supprime un bateau du catalogue',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID Airtable du bateau à supprimer'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'list_brokers',
        description: 'Liste tous les brokers enregistrés',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'authenticate_broker',
        description: 'Authentifie un broker avec son nom d\'utilisateur et mot de passe',
        inputSchema: {
          type: 'object',
          properties: {
            broker: {
              type: 'string',
              description: 'Nom d\'utilisateur du broker'
            },
            password: {
              type: 'string',
              description: 'Mot de passe du broker'
            }
          },
          required: ['broker', 'password']
        }
      }
    ]
  };
});

// Tool implementations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_listings': {
        const input = ListListingsInputSchema.parse(args);
        let formula = '';
        const conditions: string[] = [];

        if (input.broker) {
          conditions.push(`{Broker} = '${input.broker}'`);
        }
        if (input.localisation) {
          conditions.push(`{Localisation} = '${input.localisation}'`);
        }
        if (input.search) {
          conditions.push(`SEARCH(LOWER('${input.search}'), LOWER({Nom du Bateau})) > 0`);
        }

        if (conditions.length > 0) {
          formula = `AND(${conditions.join(', ')})`;
        }

        const records = await base(config.listingsTableId)
          .select({
            filterByFormula: formula || undefined,
            sort: [{ field: 'Nom du Bateau', direction: 'asc' }]
          })
          .all();

        const listings: Listing[] = records.map(record => ({
          id: record.id,
          fields: {
            'Nom du Bateau': record.get('Nom du Bateau') as string,
            'Constructeur': record.get('Constructeur') as string,
            'Longueur (M/pieds)': record.get('Longueur (M/pieds)') as number,
            'Année': record.get('Année') as number,
            'Propriétaire': record.get('Propriétaire') as string,
            'Capitaine': record.get('Capitaine') as string,
            'Broker': record.get('Broker') as string,
            'Localisation': record.get('Localisation') as string,
            'Prix': record.get('Prix') as number | undefined,
            'Prix précédent': record.get('Prix précédent') as number | undefined,
            'Dernier message': record.get('Dernier message') as string | undefined,
            'Commentaire': record.get('Commentaire') as string | undefined
          },
          createdTime: record.get('_createdTime') as string
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: listings, count: listings.length }, null, 2)
            }
          ]
        };
      }

      case 'get_listing': {
        const input = GetListingInputSchema.parse(args);
        const record = await base(config.listingsTableId).find(input.id);

        const listing: Listing = {
          id: record.id,
          fields: {
            'Nom du Bateau': record.get('Nom du Bateau') as string,
            'Constructeur': record.get('Constructeur') as string,
            'Longueur (M/pieds)': record.get('Longueur (M/pieds)') as number,
            'Année': record.get('Année') as number,
            'Propriétaire': record.get('Propriétaire') as string,
            'Capitaine': record.get('Capitaine') as string,
            'Broker': record.get('Broker') as string,
            'Localisation': record.get('Localisation') as string,
            'Prix': record.get('Prix') as number | undefined,
            'Prix précédent': record.get('Prix précédent') as number | undefined,
            'Dernier message': record.get('Dernier message') as string | undefined,
            'Commentaire': record.get('Commentaire') as string | undefined
          },
          createdTime: record.get('_createdTime') as string
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: listing }, null, 2)
            }
          ]
        };
      }

      case 'create_listing': {
        const input = CreateListingInputSchema.parse(args);

        const fieldsToCreate: any = {
          'Nom du Bateau': input.nomBateau,
          'Constructeur': input.constructeur,
          'Longueur (M/pieds)': input.longueur,
          'Année': input.annee,
          'Propriétaire': input.proprietaire,
          'Capitaine': input.capitaine,
          'Broker': input.broker,
          'Localisation': input.localisation
        };

        // Add optional fields if provided
        if (input.prix !== undefined) fieldsToCreate['Prix'] = input.prix;
        if (input.prixPrecedent !== undefined) fieldsToCreate['Prix précédent'] = input.prixPrecedent;
        if (input.dernierMessage !== undefined) fieldsToCreate['Dernier message'] = input.dernierMessage;
        if (input.commentaire !== undefined) fieldsToCreate['Commentaire'] = input.commentaire;

        const createdRecords = await base(config.listingsTableId).create([fieldsToCreate]);
        const record = createdRecords[0];

        const listing: Listing = {
          id: record.id,
          fields: {
            'Nom du Bateau': record.fields['Nom du Bateau'] as string,
            'Constructeur': record.fields['Constructeur'] as string,
            'Longueur (M/pieds)': record.fields['Longueur (M/pieds)'] as number,
            'Année': record.fields['Année'] as number,
            'Propriétaire': record.fields['Propriétaire'] as string,
            'Capitaine': record.fields['Capitaine'] as string,
            'Broker': record.fields['Broker'] as string,
            'Localisation': record.fields['Localisation'] as string,
            'Prix': record.fields['Prix'] as number | undefined,
            'Prix précédent': record.fields['Prix précédent'] as number | undefined,
            'Dernier message': record.fields['Dernier message'] as string | undefined,
            'Commentaire': record.fields['Commentaire'] as string | undefined
          },
          createdTime: record._rawJson.createdTime
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: listing, message: 'Bateau créé avec succès' }, null, 2)
            }
          ]
        };
      }

      case 'update_listing': {
        const input = UpdateListingInputSchema.parse(args);
        const updates: any = {};

        if (input.nomBateau) updates['Nom du Bateau'] = input.nomBateau;
        if (input.constructeur) updates['Constructeur'] = input.constructeur;
        if (input.longueur) updates['Longueur (M/pieds)'] = input.longueur;
        if (input.annee) updates['Année'] = input.annee;
        if (input.proprietaire) updates['Propriétaire'] = input.proprietaire;
        if (input.capitaine) updates['Capitaine'] = input.capitaine;
        if (input.broker) updates['Broker'] = input.broker;
        if (input.localisation) updates['Localisation'] = input.localisation;
        if (input.prix !== undefined) updates['Prix'] = input.prix;
        if (input.prixPrecedent !== undefined) updates['Prix précédent'] = input.prixPrecedent;
        if (input.dernierMessage !== undefined) updates['Dernier message'] = input.dernierMessage;
        if (input.commentaire !== undefined) updates['Commentaire'] = input.commentaire;

        const record = await base(config.listingsTableId).update(input.id, updates);

        const listing: Listing = {
          id: record.id,
          fields: {
            'Nom du Bateau': record.get('Nom du Bateau') as string,
            'Constructeur': record.get('Constructeur') as string,
            'Longueur (M/pieds)': record.get('Longueur (M/pieds)') as number,
            'Année': record.get('Année') as number,
            'Propriétaire': record.get('Propriétaire') as string,
            'Capitaine': record.get('Capitaine') as string,
            'Broker': record.get('Broker') as string,
            'Localisation': record.get('Localisation') as string,
            'Prix': record.get('Prix') as number | undefined,
            'Prix précédent': record.get('Prix précédent') as number | undefined,
            'Dernier message': record.get('Dernier message') as string | undefined,
            'Commentaire': record.get('Commentaire') as string | undefined
          },
          createdTime: record.get('_createdTime') as string
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: listing, message: 'Bateau mis à jour avec succès' }, null, 2)
            }
          ]
        };
      }

      case 'delete_listing': {
        const input = DeleteListingInputSchema.parse(args);
        await base(config.listingsTableId).destroy(input.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Bateau supprimé avec succès' }, null, 2)
            }
          ]
        };
      }

      case 'list_brokers': {
        const records = await base(config.brokerTableId)
          .select({
            sort: [{ field: 'broker', direction: 'asc' }]
          })
          .all();

        const brokers: Broker[] = records.map(record => ({
          id: record.id,
          fields: {
            broker: record.get('broker') as string,
            password: '***', // Don't expose passwords
            'Date de création': record.get('Date de création') as string
          },
          createdTime: record.get('_createdTime') as string
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: brokers, count: brokers.length }, null, 2)
            }
          ]
        };
      }

      case 'authenticate_broker': {
        const input = AuthenticateBrokerInputSchema.parse(args);

        const records = await base(config.brokerTableId)
          .select({
            filterByFormula: `{broker} = '${input.broker}'`
          })
          .all();

        if (records.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: false, error: 'Broker non trouvé' }, null, 2)
              }
            ]
          };
        }

        const broker = records[0];
        const storedPassword = broker.get('password') as string;

        if (storedPassword === input.password) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: {
                    id: broker.id,
                    broker: broker.get('broker') as string,
                    createdAt: broker.get('Date de création') as string
                  },
                  message: 'Authentification réussie'
                }, null, 2)
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: false, error: 'Mot de passe incorrect' }, null, 2)
              }
            ]
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMessage }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Airtable Moana MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
