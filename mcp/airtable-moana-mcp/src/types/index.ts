import { z } from 'zod';

// Airtable Configuration
export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  listingsTableId: string;
  brokerTableId: string;
}

// Listing Types
export const ListingFieldsSchema = z.object({
  'Nom du Bateau': z.string(),
  'Constructeur': z.string(),
  'Longueur (M/pieds)': z.number(),
  'Année': z.number(),
  'Propriétaire': z.string(),
  'Capitaine': z.string(),
  'Broker': z.string(),
  'Localisation': z.string(),
  'Prix': z.number().optional(),
  'Prix précédent': z.number().optional(),
  'Dernier message': z.string().optional(),
  'Commentaire': z.string().optional()
});

export type ListingFields = z.infer<typeof ListingFieldsSchema>;

export interface Listing {
  id: string;
  fields: ListingFields;
  createdTime: string;
}

// Broker Types
export const BrokerFieldsSchema = z.object({
  broker: z.string(),
  password: z.string(),
  'Date de création': z.string().optional()
});

export type BrokerFields = z.infer<typeof BrokerFieldsSchema>;

export interface Broker {
  id: string;
  fields: BrokerFields;
  createdTime: string;
}

// Tool Input Schemas
export const CreateListingInputSchema = z.object({
  nomBateau: z.string().min(1),
  constructeur: z.string().min(1),
  longueur: z.number().positive(),
  annee: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  proprietaire: z.string().min(1),
  capitaine: z.string().min(1),
  broker: z.string().min(1),
  localisation: z.string().min(1),
  prix: z.number().positive().optional(),
  prixPrecedent: z.number().positive().optional(),
  dernierMessage: z.string().max(500).optional(),
  commentaire: z.string().max(2000).optional()
});

export const UpdateListingInputSchema = z.object({
  id: z.string().min(1),
  nomBateau: z.string().min(1).optional(),
  constructeur: z.string().min(1).optional(),
  longueur: z.number().positive().optional(),
  annee: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  proprietaire: z.string().min(1).optional(),
  capitaine: z.string().min(1).optional(),
  broker: z.string().min(1).optional(),
  localisation: z.string().min(1).optional(),
  prix: z.number().positive().optional(),
  prixPrecedent: z.number().positive().optional(),
  dernierMessage: z.string().max(500).optional(),
  commentaire: z.string().max(2000).optional()
});

export const DeleteListingInputSchema = z.object({
  id: z.string().min(1)
});

export const GetListingInputSchema = z.object({
  id: z.string().min(1)
});

export const ListListingsInputSchema = z.object({
  broker: z.string().optional(),
  localisation: z.string().optional(),
  search: z.string().optional()
});

export const AuthenticateBrokerInputSchema = z.object({
  broker: z.string().min(1),
  password: z.string().min(1)
});
