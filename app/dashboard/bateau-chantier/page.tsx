'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export const dynamic = 'force-dynamic';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { Button, Loading, SkeletonGrid } from '@/components/ui';
import { ListingCard, ListingFilters, DeleteConfirmModal, ListingDetailModal } from '@/components/listings';
import type { Listing } from '@/lib/types';
import { debounce } from '@/lib/utils';

// Bateaux chantier prédéfinis
const BATEAUX_CHANTIER = [
  { nom: 'Mira', annee: null },
  { nom: 'Custom RK18', annee: null },
];

export default function BateauChantierPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [broker, setBroker] = useState('');
  const [brokers, setBrokers] = useState<Array<{ id: string; broker_name: string }>>([]);
  const [localisation, setLocalisation] = useState('');
  const [minLength, setMinLength] = useState('');
  const [maxLength, setMaxLength] = useState('');
  const [minPrix, setMinPrix] = useState('');
  const [maxPrix, setMaxPrix] = useState('');
  const [minCabines, setMinCabines] = useState('');
  const [maxCabines, setMaxCabines] = useState('');
  const [etoileOnly, setEtoileOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'size-asc' | 'size-desc' | ''>('size-desc');
  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  const filtersRef = useRef({
    search: '',
    broker: '',
    localisation: '',
    minLength: '',
    maxLength: '',
    minPrix: '',
    maxPrix: '',
    minCabines: '',
    maxCabines: '',
    etoileOnly: false,
  });

  useEffect(() => {
    filtersRef.current = {
      search,
      broker,
      localisation,
      minLength,
      maxLength,
      minPrix,
      maxPrix,
      minCabines,
      maxCabines,
      etoileOnly,
    };
  }, [search, broker, localisation, minLength, maxLength, minPrix, maxPrix, minCabines, maxCabines, etoileOnly]);

  const parsePrix = useCallback((prixStr: string | undefined | null): number | null => {
    if (!prixStr || typeof prixStr !== 'string') return null;

    try {
      let cleaned = prixStr.trim().toUpperCase();
      const millionMatch = cleaned.match(/(\d+\.?\d*)\s*M/);
      if (millionMatch) {
        const value = parseFloat(millionMatch[1].replace(',', '.'));
        return value * 1000000;
      }

      cleaned = cleaned.replace(/[€$£¥\s]/g, '');
      const hasComma = cleaned.includes(',');
      const hasDot = cleaned.includes('.');

      if (hasComma && hasDot) {
        const lastCommaIndex = cleaned.lastIndexOf(',');
        const lastDotIndex = cleaned.lastIndexOf('.');
        if (lastCommaIndex > lastDotIndex) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (hasComma) {
        const commaCount = (cleaned.match(/,/g) || []).length;
        if (commaCount === 1 && cleaned.indexOf(',') > cleaned.length - 4) {
          cleaned = cleaned.replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (hasDot) {
        const dotCount = (cleaned.match(/\./g) || []).length;
        if (dotCount > 1) {
          cleaned = cleaned.replace(/\./g, '');
        }
      }

      const parsed = parseFloat(cleaned);
      if (isNaN(parsed) || !isFinite(parsed)) {
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Erreur parsing prix:', prixStr, error);
      return null;
    }
  }, []);

  const fetchListings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const filters = filtersRef.current;

      if (filters.search) params.append('search', filters.search);
      if (filters.broker) params.append('broker', filters.broker);
      if (filters.localisation) params.append('localisation', filters.localisation);
      if (filters.minLength) params.append('minLength', filters.minLength);
      if (filters.maxLength) params.append('maxLength', filters.maxLength);
      if (filters.etoileOnly) params.append('etoile', 'true');

      const response = await fetch(`/api/listings?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        let filtered = data.data;

        // Filtrer pour ne garder que les bateaux chantier
        filtered = filtered.filter((listing: Listing) => {
          return BATEAUX_CHANTIER.some(bateau => {
            const nomMatch = listing.nom_bateau?.toLowerCase().includes(bateau.nom.toLowerCase()) ||
                           listing.constructeur?.toLowerCase().includes(bateau.nom.toLowerCase());
            const anneeMatch = !bateau.annee || listing.annee === bateau.annee;
            return nomMatch && anneeMatch;
          });
        });

        // Filtrage côté client pour les prix
        if (filters.minPrix || filters.maxPrix) {
          const minPrixNum = filters.minPrix ? parseFloat(filters.minPrix) : null;
          const maxPrixNum = filters.maxPrix ? parseFloat(filters.maxPrix) : null;

          filtered = filtered.filter((listing: Listing) => {
            const prixStr = listing.prix_actuel;
            const prix = parsePrix(prixStr);
            if (prix === null) return false;
            if (minPrixNum !== null && prix < minPrixNum) return false;
            if (maxPrixNum !== null && prix > maxPrixNum) return false;
            return true;
          });
        }

        // Filtrage côté client pour le nombre de cabines
        if (filters.minCabines || filters.maxCabines) {
          const minCabinesNum = filters.minCabines ? parseInt(filters.minCabines) : null;
          const maxCabinesNum = filters.maxCabines ? parseInt(filters.maxCabines) : null;

          filtered = filtered.filter((listing: Listing) => {
            const cabines = listing.nombre_cabines;
            if (!cabines) return false;
            if (minCabinesNum !== null && cabines < minCabinesNum) return false;
            if (maxCabinesNum !== null && cabines > maxCabinesNum) return false;
            return true;
          });
        }

        // Tri des résultats
        if (sortBy === 'size-desc') {
          filtered = filtered.sort((a: Listing, b: Listing) => b.longueur_m - a.longueur_m);
        } else if (sortBy === 'size-asc') {
          filtered = filtered.sort((a: Listing, b: Listing) => a.longueur_m - b.longueur_m);
        } else if (sortBy === 'price-desc') {
          filtered = filtered.sort((a: Listing, b: Listing) => {
            const prixA = parsePrix(a.prix_actuel) || 0;
            const prixB = parsePrix(b.prix_actuel) || 0;
            return prixB - prixA;
          });
        } else if (sortBy === 'price-asc') {
          filtered = filtered.sort((a: Listing, b: Listing) => {
            const prixA = parsePrix(a.prix_actuel) || 0;
            const prixB = parsePrix(b.prix_actuel) || 0;
            return prixA - prixB;
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
  }, [parsePrix, sortBy]);

  const debouncedFetch = useMemo(
    () =>
      debounce(() => {
        setLoading(true);
        fetchListings();
      }, 300),
    [fetchListings]
  );

  useEffect(() => {
    const fetchBrokers = async () => {
      try {
        const response = await fetch('/api/brokers');
        const data = await response.json();
        if (data.success) {
          setBrokers(data.data);
        }
      } catch (error) {
        console.error('Error fetching brokers:', error);
      }
    };

    fetchBrokers();
    fetchListings();
  }, [fetchListings]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    debouncedFetch();
  };

  const handleBrokerChange = (value: string) => {
    setBroker(value);
    debouncedFetch();
  };

  const handleLocalisationChange = (value: string) => {
    setLocalisation(value);
    debouncedFetch();
  };

  const handleMinLengthChange = (value: string) => {
    setMinLength(value);
    debouncedFetch();
  };

  const handleMaxLengthChange = (value: string) => {
    setMaxLength(value);
    debouncedFetch();
  };

  const handleMinPrixChange = (value: string) => {
    setMinPrix(value);
    debouncedFetch();
  };

  const handleMaxPrixChange = (value: string) => {
    setMaxPrix(value);
    debouncedFetch();
  };

  const handleMinCabinesChange = (value: string) => {
    setMinCabines(value);
    debouncedFetch();
  };

  const handleMaxCabinesChange = (value: string) => {
    setMaxCabines(value);
    debouncedFetch();
  };

  const handleEtoileOnlyChange = (value: boolean) => {
    setEtoileOnly(value);
    debouncedFetch();
  };

  const handleClearFilters = () => {
    setSearch('');
    setBroker('');
    setLocalisation('');
    setMinLength('');
    setMaxLength('');
    setMinPrix('');
    setMaxPrix('');
    setMinCabines('');
    setMaxCabines('');
    setEtoileOnly(false);
    filtersRef.current = {
      search: '',
      broker: '',
      localisation: '',
      minLength: '',
      maxLength: '',
      minPrix: '',
      maxPrix: '',
      minCabines: '',
      maxCabines: '',
      etoileOnly: false,
    };
    setLoading(true);
    fetchListings();
  };

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

  const brokerOptions = useMemo(
    () => [
      { value: '', label: 'Tous les brokers' },
      ...brokers.map((b) => ({ value: b.id, label: b.broker_name })),
    ],
    [brokers]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h1 className="text-3xl font-bold text-gray-900">Bateaux Chantier</h1>
          <p className="text-gray-600 mt-1 transition-smooth">
            {listings.length} bateau{listings.length !== 1 ? 'x' : ''} en chantier
          </p>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-4 animate-slide-down hw-accelerate" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Trier par:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSortBy('size-desc')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-smooth ${
                sortBy === 'size-desc'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Taille ↓
            </button>
            <button
              onClick={() => setSortBy('size-asc')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-smooth ${
                sortBy === 'size-asc'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Taille ↑
            </button>
            <button
              onClick={() => setSortBy('price-desc')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-smooth ${
                sortBy === 'price-desc'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Prix ↓
            </button>
            <button
              onClick={() => setSortBy('price-asc')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-smooth ${
                sortBy === 'price-asc'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Prix ↑
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ListingFilters
        search={search}
        broker={broker}
        brokerOptions={brokerOptions}
        localisation={localisation}
        minLength={minLength}
        maxLength={maxLength}
        minPrix={minPrix}
        maxPrix={maxPrix}
        minCabines={minCabines}
        maxCabines={maxCabines}
        etoileOnly={etoileOnly}
        onSearchChange={handleSearchChange}
        onBrokerChange={handleBrokerChange}
        onLocalisationChange={handleLocalisationChange}
        onMinLengthChange={handleMinLengthChange}
        onMaxLengthChange={handleMaxLengthChange}
        onMinPrixChange={handleMinPrixChange}
        onMaxPrixChange={handleMaxPrixChange}
        onMinCabinesChange={handleMinCabinesChange}
        onMaxCabinesChange={handleMaxCabinesChange}
        onEtoileOnlyChange={handleEtoileOnlyChange}
        onClear={handleClearFilters}
      />

      {/* Listings Grid */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : listings.length === 0 ? (
        <div className="text-center py-12 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <p className="text-gray-500 text-lg">Aucun bateau chantier trouvé</p>
          <p className="text-gray-400 text-sm mt-2">
            {search || localisation
              ? 'Essayez de modifier vos filtres'
              : 'Les bateaux en chantier apparaîtront ici'}
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
