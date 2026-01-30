'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trackedListingSchema, type TrackedListingInput } from '@/lib/validations';
import { Button, Input } from '@/components/ui';

interface TrackedListingFormProps {
  defaultValues?: Partial<TrackedListingInput>;
  onSubmit: (data: TrackedListingInput) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  showEtoile?: boolean;
}

export function TrackedListingForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Enregistrer',
  loading = false,
  showEtoile = true,
}: TrackedListingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackedListingInput>({
    resolver: zodResolver(trackedListingSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 animate-fade-in">
      <Input
        label="Nom du bateau"
        placeholder="Ex: Lady Fortuna"
        error={errors.nomBateau?.message}
        required
        {...register('nomBateau')}
      />

      <Input
        label="Modèle / constructeur"
        placeholder="Ex: Sunseeker 76"
        error={errors.constructeur?.message}
        {...register('constructeur')}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Longueur (mètres)"
          type="text"
          inputMode="decimal"
          placeholder="Ex: 23,2"
          error={errors.longueur?.message}
          {...register('longueur')}
        />

        <Input
          label="Année de construction"
          type="number"
          placeholder="Ex: 2020"
          error={errors.annee?.message}
          {...register('annee', { valueAsNumber: true })}
        />
      </div>

      <Input
        label="Localisation"
        placeholder="Ex: Monaco, Saint-Tropez..."
        error={errors.localisation?.message}
        {...register('localisation')}
      />

      <Input
        label="Broker"
        placeholder="Nom du broker (optionnel)"
        error={errors.broker?.message}
        {...register('broker')}
      />

      {showEtoile && (
        <div className="flex items-center gap-3">
          <input
            id="etoile"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...register('etoile')}
          />
          <label htmlFor="etoile" className="text-sm font-medium text-gray-700">
            ⭐ Bateau à pousser
          </label>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Commentaire
        </label>
        <textarea
          placeholder="Commentaire ou remarques (max 2000 caractères)"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          {...register('commentaire')}
        />
        {errors.commentaire && (
          <p className="mt-1 text-sm text-red-600">{errors.commentaire.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button type="submit" loading={loading} disabled={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
