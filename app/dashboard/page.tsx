'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// Force dynamic rendering to avoid SSR errors
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { Button, Loading, SkeletonGrid } from '@/components/ui';
import { ListingCard, ListingFilters, DeleteConfirmModal, ListingDetailModal } from '@/components/listings';
import type { Listing } from '@/lib/types';
import { debounce } from '@/lib/utils';

export default function DashboardPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [broker, setBroker] = useState('');
  const [localisation, setLocalisation] = useState('');
  const [minLength, setMinLength] = useState('');
  const [maxLength, setMaxLength] = useState('');
  const [minPrix, setMinPrix] = useState('');
  const [maxPrix, setMaxPrix] = useState('');
  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Refs pour stocker les valeurs actuelles des filtres
  const filtersRef = useRef({
    search: '',
    broker: '',
    localisation: '',
    minLength: '',
    maxLength: '',
    minPrix: '',
    maxPrix: '',
  });

  // Mettre à jour les refs quand les états changent
  useEffect(() => {
    filtersRef.current = {
      search,
      broker,
      localisation,
      minLength,
      maxLength,
      minPrix,
      maxPrix,
    };
  }, [search, broker, localisation, minLength, maxLength, minPrix, maxPrix]);

  /**
   * Parse le prix depuis une chaîne formatée en nombre
   * Gère les formats: "1,850,000 €", "$2,500,000", "1.5M €", "2M$", "750000"
   * @param prixStr - La chaîne contenant le prix
   * @returns Le prix en nombre ou null si impossible à parser
   */
  const parsePrix = (prixStr: string | undefined | null): number | null => {
    if (!prixStr || typeof prixStr !== 'string') return null;

    try {
      // Nettoyer la chaîne: garder seulement chiffres, points, virgules, et M/m
      let cleaned = prixStr.trim().toUpperCase();

      // Gérer le format Million (1.5M, 2M, etc.)
      const millionMatch = cleaned.match(/(\d+\.?\d*)\s*M/);
      if (millionMatch) {
        const value = parseFloat(millionMatch[1].replace(',', '.'));
        return value * 1000000;
      }

      // Supprimer les symboles monétaires et espaces
      cleaned = cleaned.replace(/[€$£¥\s]/g, '');

      // Remplacer les virgules et points selon le contexte
      // Si on a à la fois virgules et points, garder le dernier comme décimal
      const hasComma = cleaned.includes(',');
      const hasDot = cleaned.includes('.');

      if (hasComma && hasDot) {
        // Format: 1.850.000,50 ou 1,850,000.50
        const lastCommaIndex = cleaned.lastIndexOf(',');
        const lastDotIndex = cleaned.lastIndexOf('.');

        if (lastCommaIndex > lastDotIndex) {
          // Format européen: 1.850.000,50
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          // Format américain: 1,850,000.50
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (hasComma) {
        // Seulement des virgules: vérifier si c'est un séparateur de milliers ou décimal
        const commaCount = (cleaned.match(/,/g) || []).length;
        if (commaCount === 1 && cleaned.indexOf(',') > cleaned.length - 4) {
          // Probablement un séparateur décimal: 1850,50
          cleaned = cleaned.replace(',', '.');
        } else {
          // Séparateurs de milliers: 1,850,000
          cleaned = cleaned.replace(/,/g, '');
        }
      }
      // Si seulement des points, ils sont soit décimaux soit milliers
      // On suppose que si plusieurs points, ce sont des milliers
      else if (hasDot) {
        const dotCount = (cleaned.match(/\./g) || []).length;
        if (dotCount > 1) {
          // Plusieurs points = séparateurs de milliers: 1.850.000
          cleaned = cleaned.replace(/\./g, '');
        }
        // Un seul point = décimal, on garde tel quel
      }

      // Parser le nombre final
      const parsed = parseFloat(cleaned);

      // Vérifier que c'est un nombre valide
      if (isNaN(parsed) || !isFinite(parsed)) {
        return null;
      }

      return parsed;
    } catch (error) {
      console.warn('Erreur parsing prix:', prixStr, error);
      return null;
    }
  };

  // Fonction de fetch stable qui lit les valeurs depuis la ref
  const fetchListings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const filters = filtersRef.current;

      // Show all listings to all brokers with optional filters
      // Ne pas envoyer minPrix et maxPrix au backend (filtrage client-side)
      if (filters.search) params.append('search', filters.search);
      if (filters.broker) params.append('broker', filters.broker);
      if (filters.localisation) params.append('localisation', filters.localisation);
      if (filters.minLength) params.append('minLength', filters.minLength);
      if (filters.maxLength) params.append('maxLength', filters.maxLength);

      const response = await fetch(`/api/listings?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        let filtered = data.data;

        // Filtrage côté client pour les prix (champ texte dans Airtable)
        if (filters.minPrix || filters.maxPrix) {
          const minPrixNum = filters.minPrix ? parseFloat(filters.minPrix) : null;
          const maxPrixNum = filters.maxPrix ? parseFloat(filters.maxPrix) : null;

          filtered = filtered.filter((listing: Listing) => {
            const prixStr = listing.prix_actuel;
            const prix = parsePrix(prixStr);

            // Si le prix ne peut pas être parsé, ne pas l'afficher
            if (prix === null) {
              return false;
            }

            // Vérifier les bornes min et max
            if (minPrixNum !== null && prix < minPrixNum) {
              return false;
            }
            if (maxPrixNum !== null && prix > maxPrixNum) {
              return false;
            }

            return true;
          });
        }

        setListings(filtered);
      } else {
        toast.error('Erreur lors du chargement des bateaux');
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []); // Pas de dépendances !

  // Créer une fonction debounce stable avec useRef
  const debouncedFetchRef = useRef(
    debounce(() => {
      setLoading(true);
      fetchListings();
    }, 300)
  );

  // Initial fetch
  useEffect(() => {
    fetchListings();
  }, []); // Une seule fois au montage

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    debouncedFetchRef.current();
  };

  // Handle broker change
  const handleBrokerChange = (value: string) => {
    setBroker(value);
    debouncedFetchRef.current();
  };

  // Handle localisation change
  const handleLocalisationChange = (value: string) => {
    setLocalisation(value);
    debouncedFetchRef.current();
  };

  // Handle length filters change
  const handleMinLengthChange = (value: string) => {
    setMinLength(value);
    debouncedFetchRef.current();
  };

  const handleMaxLengthChange = (value: string) => {
    setMaxLength(value);
    debouncedFetchRef.current();
  };

  // Handle price filters change
  const handleMinPrixChange = (value: string) => {
    setMinPrix(value);
    debouncedFetchRef.current();
  };

  const handleMaxPrixChange = (value: string) => {
    setMaxPrix(value);
    debouncedFetchRef.current();
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setSearch('');
    setBroker('');
    setLocalisation('');
    setMinLength('');
    setMaxLength('');
    setMinPrix('');
    setMaxPrix('');
    // Mettre à jour les refs immédiatement
    filtersRef.current = {
      search: '',
      broker: '',
      localisation: '',
      minLength: '',
      maxLength: '',
      minPrix: '',
      maxPrix: '',
    };
    // Fetch directement sans debounce pour le clear
    setLoading(true);
    fetchListings();
  };

  // Handle delete
  const handleDelete = async () => {
    if (!listingToDelete) return;

    setDeleteLoading(true);

    try {
      const response = await fetch(`/api/listings/${listingToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Bateau supprimé avec succès');
        setListings((prev) => prev.filter((l) => l.id !== listingToDelete.id));
        setListingToDelete(null);
      } else {
        toast.error(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting listing:', error);
      toast.error('Erreur de connexion');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleListingUpdated = (updated: Listing) => {
    setListings((prev) =>
      prev.map((listing) => (listing.id === updated.id ? updated : listing))
    );
    setSelectedListing(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h1 className="text-3xl font-bold text-gray-900">Catalogue Bateaux</h1>
          <p className="text-gray-600 mt-1 transition-smooth">
            {listings.length} bateau{listings.length !== 1 ? 'x' : ''} disponible{listings.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/dashboard/listings/create" className="animate-fade-in" style={{ animationDelay: '150ms' }}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un bateau
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <ListingFilters
        search={search}
        broker={broker}
        localisation={localisation}
        minLength={minLength}
        maxLength={maxLength}
        minPrix={minPrix}
        maxPrix={maxPrix}
        onSearchChange={handleSearchChange}
        onBrokerChange={handleBrokerChange}
        onLocalisationChange={handleLocalisationChange}
        onMinLengthChange={handleMinLengthChange}
        onMaxLengthChange={handleMaxLengthChange}
        onMinPrixChange={handleMinPrixChange}
        onMaxPrixChange={handleMaxPrixChange}
        onClear={handleClearFilters}
      />

      {/* Listings Grid */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : listings.length === 0 ? (
        <div className="text-center py-12 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <p className="text-gray-500 text-lg">Aucun bateau trouvé</p>
          <p className="text-gray-400 text-sm mt-2">
            {search || localisation
              ? 'Essayez de modifier vos filtres'
              : 'Commencez par ajouter votre premier bateau'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing, index) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onClick={(listing) => setSelectedListing(listing)}
              onDelete={(id) => setListingToDelete(listing)}
              canEdit={true}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <ListingDetailModal
        listing={selectedListing}
        isOpen={!!selectedListing}
        onClose={() => setSelectedListing(null)}
        onListingUpdated={handleListingUpdated}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!listingToDelete}
        onClose={() => setListingToDelete(null)}
        onConfirm={handleDelete}
        listing={listingToDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
