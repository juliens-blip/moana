'use client';

import React, { useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useBrochureVideoJob } from '@/lib/hooks/useBrochureVideoJob';

export function BrochureVideoUploader() {
  const { status, submit } = useBrochureVideoJob();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = status.state === 'uploading' || status.state === 'running';

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleSubmit() {
    if (!selectedFile) return;
    submit(selectedFile);
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

      <Button
        type="button"
        aria-label="Générer la vidéo à partir du PDF"
        onClick={handleSubmit}
        disabled={isBusy || !selectedFile}
        loading={status.state === 'uploading'}
      >
        {status.state === 'running' ? 'Génération en cours…' : 'Générer la vidéo'}
      </Button>

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
        <video
          controls
          src={status.result.videoUrl}
          aria-label="Vidéo promotionnelle générée"
          className="w-full rounded-lg border border-gray-200 mt-4"
        />
      )}
    </div>
  );
}
