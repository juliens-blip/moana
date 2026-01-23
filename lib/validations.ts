import { z } from 'zod';

const parseNumberInput = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.replace(',', '.').trim();
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? value : parsed;
};

const parseIntInput = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? value : parsed;
};

// Listing Validation Schema
export const listingSchema = z.object({
  nomBateau: z.string().min(1, 'Le nom du bateau est requis').max(100, 'Le nom est trop long'),
  constructeur: z.string().min(1, 'Le constructeur est requis').max(50, 'Le nom du constructeur est trop long'),
  longueur: z.preprocess(
    parseNumberInput,
    z.number({
      required_error: 'La longueur est requise',
      invalid_type_error: 'La longueur doit être un nombre'
    }).positive('La longueur doit être positive').max(200, 'Longueur invalide')
  ),
  annee: z.preprocess(
    parseIntInput,
    z.number({
      required_error: 'L\'année est requise',
      invalid_type_error: 'L\'année doit être un nombre'
    }).int('L\'année doit être un nombre entier').min(1900, 'Année invalide').max(new Date().getFullYear() + 2, 'Année invalide')
  ),
  proprietaire: z.string().min(1, 'Le propriétaire est requis').max(100, 'Le nom est trop long'),
  capitaine: z.string().min(1, 'Le capitaine est requis').max(100, 'Le nom est trop long'),
  broker: z.string().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  localisation: z.string().min(1, 'La localisation est requise'),
  etoile: z.boolean().optional().default(false),
  nombreCabines: z.union([
    z.number().int('Le nombre de cabines doit être un nombre entier').positive('Le nombre de cabines doit être positif'),
    z.undefined(),
    z.nan()
  ]).optional().transform(val => (val === undefined || (typeof val === 'number' && isNaN(val))) ? undefined : val),
  prix: z.string().max(100, 'Le prix est trop long').optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  prixPrecedent: z.string().max(100, 'Le prix précédent est trop long').optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  dernierMessage: z.string().max(500, 'Le message est trop long').optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  commentaire: z.string().max(2000, 'Le commentaire est trop long').optional().or(z.literal('')).transform(val => val === '' ? undefined : val)
});

// Login Validation Schema
export const loginSchema = z.object({
  broker: z.string().min(1, 'Le nom d\'utilisateur est requis').max(50, 'Nom d\'utilisateur trop long'),
  password: z.string().min(1, 'Le mot de passe est requis')
});

// Partial Listing Schema for Updates
export const partialListingSchema = listingSchema.partial().extend({
  id: z.string().min(1, 'ID requis')
});

// Search/Filter Schema
export const listingFiltersSchema = z.object({
  search: z.string().optional(),
  broker: z.string().optional(),
  localisation: z.string().optional(),
  minLength: z.number().positive().max(1000).optional(),
  maxLength: z.number().positive().max(1000).optional(),
  minPrix: z.string().optional(),
  maxPrix: z.string().optional(),
  etoile: z.boolean().optional()
});

// Yatco LeadFlow Validation Schema
// Conforme à la documentation LeadFlow: https://www.boatsgroup.com/leadflow
// Note: La plupart des champs sont optionnels selon la doc (page 1: "Most fields are optional")
export const yatcoLeadPayloadSchema = z.object({
  lead: z.object({
    id: z.string().min(1, 'Lead ID is required'),
    // Date peut être ISO 8601 ou format légèrement différent
    date: z.string().optional(),
    source: z.string().min(1, 'Source is required'),
    detailedSource: z.string().optional(),
    detailedSourceSummary: z.string().optional(),
    requestType: z.string().optional()
  }),
  contact: z.object({
    name: z.object({
      // Selon doc LeadFlow page 5: "name": {} peut être vide
      display: z.string().optional(),
      first: z.string().optional(),
      last: z.string().optional()
    }).optional().default({}),
    phone: z.string().optional(),
    // Email peut être vide ou invalide selon les leads
    email: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional()
  }),
  customerComments: z.string().optional(),
  leadComments: z.string().optional(),
  boat: z.object({
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.string().optional(),
    hin: z.string().optional(),
    condition: z.string().optional(),
    classCode: z.string().optional(),
    name: z.string().optional(),
    stockNumber: z.string().optional(),
    imtId: z.string().optional(),
    length: z.object({
      measure: z.string().optional(),
      units: z.string().optional()
    }).optional(),
    location: z.object({
      city: z.string().optional(),
      stateProvince: z.string().optional(),
      country: z.string().optional(),
      postalCode: z.string().optional()
    }).optional(),
    price: z.object({
      amount: z.string().optional(),
      currency: z.string().optional()
    }).optional(),
    url: z.string().optional() // URL peut être malformée, on ne valide pas strictement
  }).optional(),
  recipient: z.object({
    officeName: z.string().min(1, 'Office name is required'),
    officeId: z.string().min(1, 'Office ID is required'),
    // contactName est optionnel selon l'exemple minimal de la doc (page 5-6)
    contactName: z.string().optional()
  }),
  // LeadSmart data (historique des leads du contact)
  leadSmart: z.object({
    leadHistory: z.array(z.object({
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.string().optional(),
      dateOfLead: z.string().optional(),
      portalName: z.string().optional(),
      location: z.object({
        city: z.string().optional(),
        country: z.string().optional(),
        stateProvince: z.string().optional()
      }).optional()
    })).optional()
  }).optional()
});

// Lead Update Schema
export const leadUpdateSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST']).optional(),
  customer_comments: z.string().max(2000).optional(),
  lead_comments: z.string().max(2000).optional()
});

// Types inferred from schemas
export type ListingInput = z.infer<typeof listingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PartialListingInput = z.infer<typeof partialListingSchema>;
export type ListingFiltersInput = z.infer<typeof listingFiltersSchema>;
export type YatcoLeadPayloadInput = z.infer<typeof yatcoLeadPayloadSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
