'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Globe2, RefreshCw, Ship } from 'lucide-react';
import { Button, SkeletonGrid } from '@/components/ui';
import { YatcoGlobalCard } from '@/components/yatco-global';
import type { ApiResponse, YatcoGlobalListingsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FRESHNESS_HOURS = 72;

export default function YatcoGlobalPage() {
  const [listings, setListings] = useState<YatcoGlobalListingsResponse['listings']>([]);
  const [pagination, setPagination] = useState<YatcoGlobalListingsResponse['pagination'] | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        freshnessHours: String(FRESHNESS_HOURS),
        page: String(targetPage)
      });
      const response = await fetch(`/api/yatco-global?${params.toString()}`);
      const data: ApiResponse<YatcoGlobalListingsResponse> = await response.json();

      if (data.success && data.data) {
        setListings(data.data.listings);
        setPagination(data.data.pagination);
      } else {
        setError(data.error || 'Erreur lors du chargement des annonces');
        toast.error('Erreur lors du chargement des annonces');
      }
    } catch (err) {
      console.error('Error fetching yatco-global listings:', err);
      setError('Erreur de connexion');
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings(page);
  }, [fetchListings, page]);

  const handlePrevious = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNext = () => {
    if (pagination && page < pagination.totalPages) {
      setPage((prev) => prev + 1);
    }
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-secondary-500 to-primary-600 flex items-center justify-center">
              <Globe2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Yatco Global</h1>
              <p className="text-gray-600 mt-1">
                {pagination ? `${pagination.total} annonce${pagination.total !== 1 ? 's' : ''}` : ''} des dernières {FRESHNESS_HOURS}h
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchListings(page)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : error ? (
        <div className="text-center py-12 animate-fade-in-up">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Ship className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-gray-700 text-lg">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => fetchListings(page)}
          >
            Réessayer
          </Button>
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12 animate-fade-in-up">
          <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Ship className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 text-lg">Aucune annonce trouvée</p>
          <p className="text-gray-400 text-sm mt-2">
            Aucune annonce Yatco Global publiée dans les dernières {FRESHNESS_HOURS}h
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing, index) => (
              <YatcoGlobalCard key={listing.id} listing={listing} index={index} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={page <= 1}
              >
                Précédent
              </Button>
              <span className="text-sm text-gray-600">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={page >= pagination.totalPages}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
