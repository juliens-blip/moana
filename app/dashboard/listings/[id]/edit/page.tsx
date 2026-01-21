'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button, Loading } from '@/components/ui';
import { ListingForm } from '@/components/listings';
import type { Listing } from '@/lib/types';
import type { ListingInput } from '@/lib/validations';

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  const listingId = params.id as string;

  // Fetch listing
  useEffect(() => {
    const fetchListing = async () => {
      try {
        const response = await fetch(`/api/listings/${listingId}`);
        const data = await response.json();

        if (data.success) {
          // All authenticated brokers can edit any listing
          setListing(data.data);
        } else {
          toast.error('Bateau non trouvé');
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching listing:', error);
        toast.error('Erreur de connexion');
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [listingId, router]);

  const handleSubmit = async (data: ListingInput) => {
    setSubmitLoading(true);

    try {
      const response = await fetch(`/api/listings/${listingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau mis à jour avec succès!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(result.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating listing:', error);
      toast.error('Erreur de connexion');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return <Loading text="Chargement du bateau..." fullScreen />;
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <Link href="/dashboard" className="inline-block animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">
          Modifier le bateau
        </h1>
        <p className="text-gray-600 mt-2">
          {listing.nom_bateau}
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-6 animate-fade-in-up hw-accelerate" style={{ animationDelay: '200ms' }}>
        <ListingForm
          onSubmit={handleSubmit}
          submitLabel="Mettre à jour"
          loading={submitLoading}
          allowBrokerChange={true}
          defaultValues={{
            nomBateau: listing.nom_bateau,
            constructeur: listing.constructeur,
            longueur: listing.longueur_m,
            annee: listing.annee,
            proprietaire: listing.proprietaire,
            capitaine: listing.capitaine,
            broker: listing.broker_id,
            localisation: listing.localisation,
            etoile: listing.etoile ?? false,
            nombreCabines: listing.nombre_cabines,
            prix: listing.prix_actuel,
            prixPrecedent: listing.prix_precedent,
            dernierMessage: listing.dernier_message,
            commentaire: listing.commentaire,
          }}
        />
      </div>
    </div>
  );
}
