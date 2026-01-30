'use client';

import React, { useState } from 'react';

export const dynamic = 'force-dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { TrackedListingForm } from '@/components/listings';
import type { TrackedListingInput } from '@/lib/validations';

export default function CreateTrackedListingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: TrackedListingInput) => {
    setLoading(true);

    try {
      const response = await fetch('/api/bateaux-a-suivre', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau à suivre créé avec succès!');
        router.push('/dashboard/bateau-a-suivre');
        router.refresh();
      } else {
        toast.error(result.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating tracked listing:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

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
          Ajouter un bateau à suivre
        </h1>
        <p className="text-gray-600 mt-2">
          Remplissez les informations du bateau à suivre
        </p>
      </div>

      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-6 animate-fade-in-up hw-accelerate" style={{ animationDelay: '200ms' }}>
        <TrackedListingForm
          onSubmit={handleSubmit}
          submitLabel="Créer le bateau"
          loading={loading}
          showEtoile={true}
        />
      </div>
    </div>
  );
}
