'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, type ListingInput } from '@/lib/validations';
import { Button, Input } from '@/components/ui';

interface ListingFormProps {
  defaultValues?: Partial<ListingInput>;
  onSubmit: (data: ListingInput) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  allowBrokerChange?: boolean;
}

export function ListingForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Enregistrer',
  loading = false,
  allowBrokerChange = false,
}: ListingFormProps) {
  const [brokers, setBrokers] = useState<Array<{ id: string; broker_name: string }>>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ListingInput>({
    resolver: zodResolver(listingSchema),
    defaultValues,
  });

  useEffect(() => {
    const fetchBrokers = async () => {
      try {
        const response = await fetch('/api/brokers');
        const data = await response.json();
        if (data.success) {
          setBrokers(data.data || []);
        }
      } catch (error) {
        console.error('Error fetching brokers:', error);
      }
    };

    fetchBrokers();
  }, []);

  const brokerOptions = [
    { value: '', label: 'Sélectionner un broker' },
    ...brokers.map((b) => ({ value: b.id, label: b.broker_name })),
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 animate-fade-in">
      {/* Nom du Bateau */}
      <Input
        label="Nom du Bateau"
        placeholder="Ex: Sunseeker 76"
        error={errors.nomBateau?.message}
        required
        {...register('nomBateau')}
      />

      {/* Constructeur */}
      <Input
        label="Constructeur"
        placeholder="Ex: Sunseeker"
        error={errors.constructeur?.message}
        required
        {...register('constructeur')}
      />

      {/* Grid for Longueur and Année */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Longueur (mètres)"
          type="number"
          step="0.01"
          placeholder="Ex: 23.2"
          error={errors.longueur?.message}
          required
          {...register('longueur', {
            setValueAs: (value) => {
              if (typeof value === 'number') return value;
              if (typeof value !== 'string') return value;
              const normalized = value.replace(',', '.').trim();
              const parsed = parseFloat(normalized);
              return Number.isNaN(parsed) ? undefined : parsed;
            },
          })}
        />

        <Input
          label="Année de construction"
          type="number"
          placeholder="Ex: 2020"
          error={errors.annee?.message}
          required
          {...register('annee', { valueAsNumber: true })}
        />
      </div>

      {/* Nombre de cabines */}
      <Input
        label="Nombre de cabines"
        type="number"
        placeholder="Ex: 4 (optionnel)"
        error={errors.nombreCabines?.message}
        {...register('nombreCabines', { valueAsNumber: true })}
      />

      {/* Prix */}
      <Input
        label="Prix Actuel"
        type="text"
        placeholder="Ex: 1,850,000 € ou $2,500,000 (optionnel)"
        error={errors.prix?.message}
        {...register('prix')}
      />

      {/* Prix Précédent */}
      <Input
        label="Prix Précédent"
        type="text"
        placeholder="Ex: 1,950,000 € (optionnel)"
        error={errors.prixPrecedent?.message}
        {...register('prixPrecedent')}
      />

      {/* Localisation */}
      <Input
        label="Localisation"
        placeholder="Ex: Monaco, Saint-Tropez..."
        error={errors.localisation?.message}
        required
        {...register('localisation')}
      />

      {/* Dernier Message */}
      <Input
        label="Dernier Message"
        placeholder="Note ou dernier message (max 500 caractères)"
        error={errors.dernierMessage?.message}
        {...register('dernierMessage')}
      />

      {/* Commentaire */}
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

      {/* Grid for Propriétaire and Capitaine */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Propriétaire"
          placeholder="Ex: John Smith"
          error={errors.proprietaire?.message}
          required
          {...register('proprietaire')}
        />

        <Input
          label="Capitaine"
          placeholder="Ex: Captain Jack"
          error={errors.capitaine?.message}
          required
          {...register('capitaine')}
        />
      </div>

      {/* Broker */}
      {allowBrokerChange ? (
        <div>
          <Input
            label="Broker"
            placeholder="Commencez à taper un nom..."
            error={errors.broker?.message}
            helperText="Sélectionnez dans la liste ou saisissez un nom"
            list="broker-options"
            {...register('broker')}
          />
          <datalist id="broker-options">
            {brokers.map((b) => (
              <option key={b.id} value={b.broker_name} />
            ))}
          </datalist>
        </div>
      ) : (
        <input type="hidden" {...register('broker')} />
      )}

      {/* Etoile */}
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

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button type="submit" loading={loading} disabled={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
