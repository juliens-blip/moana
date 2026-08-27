/**
 * Contrat partagé de l'upload direct vers Storage entre le navigateur et les
 * routes serveur — zéro dépendance framework (ni `next/server`, ni le SDK
 * Supabase), importable aussi bien depuis un composant client que depuis
 * lib/brochure-video-upload.ts. Un client et un serveur qui divergent sur ces
 * valeurs ne peuvent plus s'accorder sur où lire/écrire l'objet uploadé.
 *
 * Le PDF part du navigateur directement vers ce bucket privé (URL de dépôt
 * signée obtenue via POST /api/brochure-video/upload-url) : il ne transite
 * plus par le corps de POST /api/brochure-video, qui ne reçoit qu'une
 * référence `{ path }` — évite le plafond plateforme Vercel de 4,5 Mo par
 * corps de requête de Vercel Function (fixe, non contournable côté code,
 * cf. supabase/migrations/20260827T1900__create_brochure_video_uploads_bucket.sql).
 */
export const BROCHURE_UPLOAD_BUCKET = 'brochure-video-uploads';

/** 32 caractères alphanumériques + extension .pdf — généré exclusivement par generateUploadPath(). */
export const BROCHURE_UPLOAD_PATH_RE = /^[A-Za-z0-9]{32}\.pdf$/;
