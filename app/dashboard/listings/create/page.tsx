'use client';

import React, { useState } from 'react';

// Force dynamic rendering to avoid SSR errors
export const dynamic = 'force-dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { ListingForm } from '@/components/listings';
import type { ListingInput } from '@/lib/validations';

export default function CreateListingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: ListingInput) => {
    setLoading(true);

    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau créé avec succès!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(result.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating listing:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

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
          Ajouter un bateau
        </h1>
        <p className="text-gray-600 mt-2">
          Remplissez les informations du nouveau bateau
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-6 animate-fade-in-up hw-accelerate" style={{ animationDelay: '200ms' }}>
        <ListingForm
          onSubmit={handleSubmit}
          submitLabel="Créer le bateau"
          loading={loading}
        />
      </div>
    </div>
  );
}
