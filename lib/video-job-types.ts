/**
 * Contrat client du job upload → statut → résultat.
 *
 * Reflète workers/job_contract.py (UploadStatusResultJob, JobError) côté
 * navigateur : mêmes phases/statuts stables, résultat jamais dépourvu
 * d'URL vidéo, erreur toujours explicite (jamais un bool ou une string libre).
 */

export type VideoJobBackendPhase = 'upload' | 'status' | 'result';
export type VideoJobBackendStatus = 'pending' | 'processing' | 'done' | 'error';

export interface VideoJobError {
  code: string;
  message: string;
}

export interface VideoJobResult {
  videoUrl: string;
}

/**
 * État discriminé du job côté client, y compris avant tout appel réseau.
 *
 * 'running'/'done'/'failed' reflètent tel quel les valeurs de
 * BrochureVideoStatusResult.status (lib/brochure-video-upload.ts) : aucune
 * traduction d'état n'existe entre la réponse de polling et l'état client.
 */
export type VideoJobStatus =
  | { state: 'idle' }
  | { state: 'uploading' }
  | { state: 'running'; jobId: string }
  | { state: 'done'; jobId: string; result: VideoJobResult }
  | { state: 'failed'; jobId: string | null; error: VideoJobError };

export function isTerminalVideoJobStatus(status: VideoJobStatus): boolean {
  return status.state === 'done' || status.state === 'failed';
}
