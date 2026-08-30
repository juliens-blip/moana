'use client';

import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useBrochureVideoJob } from '@/lib/hooks/useBrochureVideoJob';
import type { VideoStyle } from '@/lib/brochure-video-contract';

export function BrochureVideoUploader() {
  const { status, submit } = useBrochureVideoJob();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingStyle, setPendingStyle] = useState<VideoStyle | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = status.state === 'uploading' || status.state === 'running';

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleSubmit(videoStyle: VideoStyle) {
    if (!selectedFile) return;
    setPendingStyle(videoStyle);
    submit(selectedFile, videoStyle);
  }

  async function handleDownload(videoUrl: string) {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      // Le fichier vit sur un bucket Supabase distinct de l'origine de l'app :
      // un <a download> direct serait ignoré par le navigateur sur une URL
      // cross-origin. On passe donc par un blob local pour forcer le
      // téléchargement plutôt que l'ouverture dans un nouvel onglet.
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Téléchargement impossible');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'brochure-video.mp4';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError('Le téléchargement a échoué. Réessayez.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        ref={fileInputRef}
        id="brochure-video-pdf"
        type="file"
        accept="application/pdf,.pdf"
        label="Brochure PDF"
        aria-label="Sélectionner la brochure PDF"
        disabled={isBusy}
        onChange={handleFileChange}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          aria-label="Générer la vidéo classique à partir du PDF"
          onClick={() => handleSubmit('classique')}
          disabled={isBusy || !selectedFile}
          loading={status.state === 'uploading' && pendingStyle === 'classique'}
        >
          {status.state === 'running' && pendingStyle === 'classique' ? 'Génération en cours…' : 'Générer classique'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-label="Générer la vidéo focus intérieurs à partir du PDF"
          onClick={() => handleSubmit('focus_interieurs')}
          disabled={isBusy || !selectedFile}
          loading={status.state === 'uploading' && pendingStyle === 'focus_interieurs'}
        >
          {status.state === 'running' && pendingStyle === 'focus_interieurs'
            ? 'Génération en cours…'
            : 'Générer focus intérieurs'}
        </Button>
      </div>

      {(status.state === 'uploading' || status.state === 'running') && (
        <div className="space-y-2" aria-live="polite">
          <div
            role="progressbar"
            aria-label={status.state === 'uploading' ? 'Envoi de la brochure' : 'Génération de la vidéo'}
            aria-valuetext={status.state === 'uploading' ? 'Envoi en cours' : 'Génération en cours'}
            className="h-3 w-full overflow-hidden rounded-full bg-gray-200"
          >
            <div className="h-full w-1/3 animate-[brochure-video-progress_1.4s_ease-in-out_infinite] rounded-full bg-secondary-500" />
          </div>
          <p className="text-sm text-gray-600">
            {status.state === 'uploading'
              ? 'Envoi de la brochure…'
              : 'La vidéo est en cours de génération. Cela peut prendre plusieurs minutes.'}
          </p>
        </div>
      )}

      {status.state === 'running' && (
        <p role="status" className="sr-only">
          Traitement du job {status.jobId} en cours, cela peut prendre plusieurs minutes.
        </p>
      )}

      {status.state === 'failed' && (
        <p role="alert" className="text-sm text-red-600 font-medium">
          {status.error.message}
        </p>
      )}

      {status.state === 'done' && (
        <div className="space-y-2">
          <video
            controls
            src={status.result.videoUrl}
            aria-label="Vidéo promotionnelle générée"
            className="w-full rounded-lg border border-gray-200 mt-4"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Télécharger la vidéo générée"
            onClick={() => handleDownload(status.result.videoUrl)}
            loading={isDownloading}
          >
            <Download className="h-4 w-4" />
            Télécharger la vidéo
          </Button>
          {downloadError && (
            <p role="alert" className="text-sm text-red-600 font-medium">
              {downloadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
