import { z } from 'zod';

// Listing Validation Schema
export const listingSchema = z.object({
  nomBateau: z.string().min(1, 'Le nom du bateau est requis').max(100, 'Le nom est trop long'),
  constructeur: z.string().min(1, 'Le constructeur est requis').max(50, 'Le nom du constructeur est trop long'),
  longueur: z.number({
    required_error: 'La longueur est requise',
    invalid_type_error: 'La longueur doit être un nombre'
  }).positive('La longueur doit être positive').max(200, 'Longueur invalide'),
  annee: z.number({
    required_error: 'L\'année est requise',
    invalid_type_error: 'L\'année doit être un nombre'
  }).int('L\'année doit être un nombre entier').min(1900, 'Année invalide').max(new Date().getFullYear() + 2, 'Année invalide'),
  proprietaire: z.string().min(1, 'Le propriétaire est requis').max(100, 'Le nom est trop long'),
  capitaine: z.string().min(1, 'Le capitaine est requis').max(100, 'Le nom est trop long'),
  broker: z.string().optional(),
  localisation: z.string().min(1, 'La localisation est requise'),
  nombreCabines: z.number({
    invalid_type_error: 'Le nombre de cabines doit être un nombre'
  }).int('Le nombre de cabines doit être un nombre entier').positive('Le nombre de cabines doit être positif').optional(),
  prix: z.string().max(100, 'Le prix est trop long').optional().transform(val => val === '' ? undefined : val),
  prixPrecedent: z.string().max(100, 'Le prix précédent est trop long').optional().transform(val => val === '' ? undefined : val),
  dernierMessage: z.string().max(500, 'Le message est trop long').optional().transform(val => val === '' ? undefined : val),
  commentaire: z.string().max(2000, 'Le commentaire est trop long').optional().transform(val => val === '' ? undefined : val)
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
  maxPrix: z.string().optional()
});

// Types inferred from schemas
export type ListingInput = z.infer<typeof listingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PartialListingInput = z.infer<typeof partialListingSchema>;
export type ListingFiltersInput = z.infer<typeof listingFiltersSchema>;
