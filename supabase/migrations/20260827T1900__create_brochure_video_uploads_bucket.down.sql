-- Rollback : supprime le bucket. Échoue si des objets y sont encore
-- référencés (contrainte de clé étrangère storage.objects.bucket_id) — la
-- route serveur supprime déjà chaque PDF après transfert (réussi ou échoué),
-- donc le bucket devrait normalement être vide en usage normal. Vider
-- manuellement `storage.objects where bucket_id = 'brochure-video-uploads'`
-- avant ce rollback si des objets orphelins subsistent.

delete from storage.buckets where id = 'brochure-video-uploads';
