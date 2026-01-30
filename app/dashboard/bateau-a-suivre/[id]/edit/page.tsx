'use client';

import React, { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button, Loading } from '@/components/ui';
import { TrackedListingForm } from '@/components/listings';
import type { Listing } from '@/lib/types';
import type { TrackedListingInput } from '@/lib/validations';

export default function EditTrackedListingPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const response = await fetch(`/api/bateaux-a-suivre/${params?.id}`);
        const data = await response.json();
        if (data.success) {
          setListing(data.data);
        } else {
          toast.error(data.error || 'Erreur lors du chargement');
        }
      } catch (error) {
        console.error('Error fetching tracked listing:', error);
        toast.error('Erreur de connexion');
      } finally {
        setLoading(false);
      }
    };

    if (params?.id) fetchListing();
  }, [params?.id]);

  const handleSubmit = async (data: TrackedListingInput) => {
    if (!listing) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/bateaux-a-suivre/${listing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau mis à jour avec succès!');
        router.push('/dashboard/bateau-a-suivre');
        router.refresh();
      } else {
        toast.error(result.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating tracked listing:', error);
      toast.error('Erreur de connexion');
    } finally {
      setSaving(false);
    }
  };

  const defaultValues = listing
    ? {
        nomBateau: listing.nom_bateau,
        constructeur: listing.constructeur ?? '',
        longueur: listing.longueur_m ?? undefined,
        annee: listing.annee ?? undefined,
        localisation: listing.localisation ?? '',
        broker: (listing as any).brokers?.broker_name ?? '',
        etoile: listing.etoile ?? false,
        commentaire: listing.commentaire ?? '',
      }
    : undefined;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <Link href="/dashboard/bateau-a-suivre" className="inline-block animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">
          Modifier un bateau à suivre
        </h1>
        <p className="text-gray-600 mt-2">
          Modifiez les informations du bateau à suivre
        </p>
      </div>

      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-6 animate-fade-in-up hw-accelerate" style={{ animationDelay: '200ms' }}>
        {loading ? (
          <Loading />
        ) : (
          <TrackedListingForm
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            submitLabel="Mettre à jour"
            loading={saving}
            showEtoile={true}
          />
        )}
      </div>
    </div>
  );
}
