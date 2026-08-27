-- ------------------------------------------------------------
-- Correctif production : POST /api/brochure-video renvoyait 413
-- FUNCTION_PAYLOAD_TOO_LARGE dès qu'une brochure réelle dépassait la limite
-- plateforme Vercel de 4,5 Mo par corps de requête de Vercel Function
-- (limite fixe, non configurable, indépendante de Fluid Compute — voir
-- https://vercel.com/docs/functions/limitations#request-body-size). Le code
-- applicatif acceptait jusqu'à 50 Mo (MAX_PDF_BYTES,
-- lib/brochure-video-upload.ts) mais n'atteignait jamais ce contrôle : la
-- plateforme coupait avant.
--
-- Correction : le PDF part désormais du navigateur directement vers ce
-- bucket Supabase Storage privé (URL de dépôt signée, cf.
-- app/api/brochure-video/upload-url/route.ts), sans jamais transiter par le
-- corps d'une requête vers /api/brochure-video — qui ne reçoit plus qu'une
-- référence JSON `{ path }` et télécharge l'objet côté serveur (trafic
-- sortant de la fonction, non soumis à cette limite d'entrée).
--
-- Bucket backend-only : aucune policy anon/authenticated (l'app ne pose pas
-- de session Supabase Auth côté client, seulement un cookie applicatif
-- maison — cf. lib/supabase/auth.ts). Tout accès passe par service_role
-- (createAdminClient) : création d'URL de dépôt signée, téléchargement,
-- suppression après transfert. Même politique « backend-only » que
-- public.bateaux_a_suivre/bateaux_chantier (migration 20260825T2249).
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brochure-video-uploads',
  'brochure-video-uploads',
  false,
  52428800, -- 50 Mo, aligné sur MAX_PDF_BYTES (lib/brochure-video-upload.ts)
  array['application/pdf']
)
on conflict (id) do nothing;
