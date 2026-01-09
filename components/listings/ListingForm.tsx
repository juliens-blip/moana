'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, type ListingInput } from '@/lib/validations';
import { Button, Input } from '@/components/ui';

interface Broker {
  id: string;
  broker_name: string;
  email: string;
}

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
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ListingInput>({
    resolver: zodResolver(listingSchema),
    defaultValues,
  });

  useEffect(() => {
    if (allowBrokerChange) {
      const fetchBrokers = async () => {
        setLoadingBrokers(true);
        try {
          const response = await fetch('/api/brokers');
          const data = await response.json();
          if (data.success) {
            setBrokers(data.data);
          }
        } catch (error) {
          console.error('Error fetching brokers:', error);
        } finally {
          setLoadingBrokers(false);
        }
      };
      fetchBrokers();
    }
  }, [allowBrokerChange]);

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
          step="0.1"
          placeholder="Ex: 23.2"
          error={errors.longueur?.message}
          required
          {...register('longueur', { valueAsNumber: true })}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Broker
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            {...register('broker')}
            disabled={loadingBrokers}
          >
            <option value="">Sélectionner un broker...</option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.broker_name} ({broker.email})
              </option>
            ))}
          </select>
          {errors.broker && (
            <p className="mt-1 text-sm text-red-600">{errors.broker.message}</p>
          )}
        </div>
      ) : (
        <input type="hidden" {...register('broker')} />
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button type="submit" loading={loading} disabled={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
