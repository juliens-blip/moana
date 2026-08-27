'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTerminalVideoJobStatus, type VideoJobError, type VideoJobStatus } from '@/lib/video-job-types';

export const BROCHURE_VIDEO_POLL_INTERVAL_MS = 2000;

interface BrochureVideoUploadResponseBody {
  jobId?: unknown;
  statusUrl?: unknown;
  error?: unknown;
}

interface BrochureVideoStatusResponseBody {
  status?: unknown;
  videoUrl?: unknown;
  error?: unknown;
}

interface UploadTicketResponseBody {
  bucket?: unknown;
  path?: unknown;
  token?: unknown;
  error?: unknown;
}

export interface BrochureVideoJobTimer {
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export type UploadPdfResult = { path: string } | { error: VideoJobError };

export interface BrochureVideoJobDeps {
  fetchImpl: typeof fetch;
  timer: BrochureVideoJobTimer;
  /**
   * Dépose `file` directement vers Supabase Storage (URL de dépôt signée
   * obtenue via POST /api/brochure-video/upload-url) et renvoie le chemin de
   * l'objet — le PDF ne transite jamais par le corps de POST
   * /api/brochure-video, qui excéderait sinon le plafond plateforme Vercel de
   * 4,5 Mo par corps de requête de Vercel Function pour toute brochure réelle.
   */
  uploadPdf: (file: File) => Promise<UploadPdfResult>;
}

function jobError(code: string, message: string): VideoJobError {
  return { code, message };
}

/**
 * Rejette avant tout POST un fichier qui n'est pas un PDF nommé .pdf. Le
 * serveur applique la même règle (lib/brochure-video-upload.ts) mais côté
 * client on évite l'aller-retour réseau pour une erreur déjà certaine.
 */
export function validatePdfFile(file: File): VideoJobError | null {
  if (file.type !== 'application/pdf') {
    return jobError('invalid_file', 'Le fichier doit être un PDF (type application/pdf).');
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return jobError('invalid_file', 'Le fichier doit avoir une extension .pdf.');
  }
  return null;
}

/**
 * Cœur testable du hook : ne connaît ni React ni le DOM, tout accès réseau et
 * toute temporisation passent par `deps` injecté par l'appelant — même
 * séparation que handleBrochureVideoUpload/readBrochureVideoStatus côté
 * serveur (lib/brochure-video-upload.ts), pour rester testable sans jsdom.
 */
export class BrochureVideoJobController {
  private readonly deps: BrochureVideoJobDeps;
  private status: VideoJobStatus = { state: 'idle' };
  private readonly listeners = new Set<(status: VideoJobStatus) => void>();
  private disposed = false;
  private pollHandle: unknown = null;
  private pollInFlight = false;

  constructor(deps: BrochureVideoJobDeps) {
    this.deps = deps;
  }

  getStatus(): VideoJobStatus {
    return this.status;
  }

  subscribe(listener: (status: VideoJobStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * React Strict Mode rejoue les effets en développement selon la séquence
   * setup -> cleanup -> setup. Le second setup doit donc pouvoir réactiver le
   * même contrôleur conservé dans useRef ; sinon dispose() rend l'interface
   * définitivement muette avant même le premier clic.
   */
  activate(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollHandle !== null) {
      this.deps.timer.clearTimer(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private setStatus(next: VideoJobStatus): void {
    this.status = next;
    if (this.disposed) return;
    this.listeners.forEach((listener) => listener(next));
  }

  async submit(file: File): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.status.state === 'uploading' || this.status.state === 'running') {
      return;
    }
    const validationError = validatePdfFile(file);
    if (validationError) {
      this.setStatus({ state: 'failed', jobId: null, error: validationError });
      return;
    }

    this.setStatus({ state: 'uploading' });

    const uploadResult = await this.deps.uploadPdf(file);
    if (this.disposed) return;
    if ('error' in uploadResult) {
      this.setStatus({ state: 'failed', jobId: null, error: uploadResult.error });
      return;
    }

    let response: Response;
    try {
      response = await this.deps.fetchImpl('/api/brochure-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: uploadResult.path }),
      });
    } catch {
      if (this.disposed) return;
      this.setStatus({
        state: 'failed',
        jobId: null,
        error: jobError('network_error', "Impossible de contacter le serveur pour l'envoi."),
      });
      return;
    }
    if (this.disposed) return;

    let body: BrochureVideoUploadResponseBody;
    try {
      body = await response.json();
    } catch {
      if (this.disposed) return;
      this.setStatus({ state: 'failed', jobId: null, error: jobError('upload_failed', "Réponse d'envoi illisible.") });
      return;
    }
    if (this.disposed) return;

    if (!response.ok || typeof body.jobId !== 'string' || typeof body.statusUrl !== 'string') {
      const message = typeof body.error === 'string' ? body.error : "Échec de l'envoi du PDF.";
      this.setStatus({ state: 'failed', jobId: null, error: jobError('upload_failed', message) });
      return;
    }

    const { jobId, statusUrl } = body;
    this.setStatus({ state: 'running', jobId });
    this.schedulePoll(jobId, statusUrl);
  }

  private schedulePoll(jobId: string, statusUrl: string): void {
    if (this.disposed) return;
    this.pollHandle = this.deps.timer.setTimer(() => {
      void this.pollOnce(jobId, statusUrl);
    }, BROCHURE_VIDEO_POLL_INTERVAL_MS);
  }

  private async pollOnce(jobId: string, statusUrl: string): Promise<void> {
    if (this.disposed || this.pollInFlight) return;
    this.pollInFlight = true;

    let response: Response;
    try {
      response = await this.deps.fetchImpl(statusUrl);
    } catch {
      this.pollInFlight = false;
      if (this.disposed) return;
      this.setStatus({
        state: 'failed',
        jobId,
        error: jobError('network_error', 'Impossible de contacter le serveur pour le suivi.'),
      });
      return;
    }

    let body: BrochureVideoStatusResponseBody;
    try {
      body = await response.json();
    } catch {
      this.pollInFlight = false;
      if (this.disposed) return;
      this.setStatus({ state: 'failed', jobId, error: jobError('status_failed', 'Réponse de statut illisible.') });
      return;
    }
    this.pollInFlight = false;
    if (this.disposed) return;

    if (body.status === 'running') {
      this.setStatus({ state: 'running', jobId });
      this.schedulePoll(jobId, statusUrl);
      return;
    }
    if (body.status === 'done') {
      if (typeof body.videoUrl !== 'string' || !body.videoUrl) {
        this.setStatus({ state: 'failed', jobId, error: jobError('status_failed', 'Statut du job illisible.') });
        return;
      }
      this.setStatus({ state: 'done', jobId, result: { videoUrl: body.videoUrl } });
      return;
    }

    const message = typeof body.error === 'string' && body.error ? body.error : 'Le job a échoué.';
    this.setStatus({ state: 'failed', jobId, error: jobError('status_failed', message) });
  }
}

function createBrowserTimer(): BrochureVideoJobTimer {
  return {
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

/**
 * Dépose le PDF directement depuis le navigateur vers Supabase Storage : un
 * aller-retour serveur (POST /api/brochure-video/upload-url) obtient un
 * ticket à usage unique, puis le SDK Supabase envoie le fichier lui-même
 * directement à Storage — jamais vers une Vercel Function, qui refuserait
 * tout corps de requête au-delà de 4,5 Mo quel que soit le code applicatif.
 */
function createBrowserPdfUploader(): BrochureVideoJobDeps['uploadPdf'] {
  return async (file: File): Promise<UploadPdfResult> => {
    let ticketBody: UploadTicketResponseBody;
    try {
      const ticketResponse = await fetch('/api/brochure-video/upload-url', { method: 'POST' });
      ticketBody = await ticketResponse.json();
      if (!ticketResponse.ok || typeof ticketBody.bucket !== 'string' || typeof ticketBody.path !== 'string' || typeof ticketBody.token !== 'string') {
        const message = typeof ticketBody.error === 'string' ? ticketBody.error : "Échec de la préparation de l'envoi.";
        return { error: jobError('upload_ticket_failed', message) };
      }
    } catch {
      return { error: jobError('network_error', "Impossible de contacter le serveur pour préparer l'envoi.") };
    }

    const { bucket, path, token } = ticketBody as { bucket: string; path: string; token: string };
    try {
      // Import différé : le SDK Supabase ne doit jamais alourdir le bundle
      // initial d'une page qui n'uploade pas systématiquement une brochure.
      const { createClient } = await import('@/lib/supabase/client');
      const { error } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file);
      if (error) {
        return { error: jobError('upload_failed', "Échec de l'envoi du PDF vers le stockage.") };
      }
    } catch {
      return { error: jobError('upload_failed', "Échec de l'envoi du PDF vers le stockage.") };
    }

    return { path };
  };
}

export function useBrochureVideoJob() {
  const [status, setStatus] = useState<VideoJobStatus>({ state: 'idle' });
  const controllerRef = useRef<BrochureVideoJobController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new BrochureVideoJobController({
      fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
      timer: createBrowserTimer(),
      uploadPdf: createBrowserPdfUploader(),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.activate();
    setStatus(controller.getStatus());
    const unsubscribe = controller.subscribe(setStatus);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, []);

  const submit = useCallback((file: File) => {
    void controllerRef.current?.submit(file);
  }, []);

  return {
    status,
    isTerminal: isTerminalVideoJobStatus(status),
    submit,
  };
}
