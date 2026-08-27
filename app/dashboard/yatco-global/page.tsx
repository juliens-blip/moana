'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Globe2, RefreshCw, Ship } from 'lucide-react';
import { Button, Input, Select, SkeletonGrid, Modal } from '@/components/ui';
import { YatcoGlobalCard } from '@/components/yatco-global';
import type { ApiResponse, YatcoGlobalListingsResponse } from '@/lib/types';
import type { YatcoFavoriteHistoryEntry, YatcoGlobalListing } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FRESHNESS_HOURS = 72;

type YatcoGlobalSortBy = 'updated_at' | 'source_updated_at' | 'price_usd' | 'model_year' | 'length_m';
type YatcoGlobalSortDir = 'asc' | 'desc';

interface YatcoGlobalFilters {
  model_year: string;
  length_m: string;
  cabins: string;
  country: string;
  price_usd_min: string;
  price_usd_max: string;
  sortBy: YatcoGlobalSortBy;
  sortDir: YatcoGlobalSortDir;
}

const DEFAULT_YATCO_GLOBAL_FILTERS: YatcoGlobalFilters = {
  model_year: '',
  length_m: '',
  cabins: '',
  country: '',
  price_usd_min: '',
  price_usd_max: '',
  // La date fiable est celle de détection dans les rapports BOSS
  // new/modified/sold, pas le timestamp technique de réingestion Supabase.
  sortBy: 'source_updated_at',
  sortDir: 'desc'
};

// Mirrors the closed sortBy/sortDir whitelist enforced server-side in
// lib/validations.ts and lib/supabase/yatco-global.ts.
const YATCO_GLOBAL_SORT_OPTIONS: Array<{
  value: string;
  label: string;
  sortBy: YatcoGlobalSortBy;
  sortDir: YatcoGlobalSortDir;
}> = [
  { value: 'source_updated_at_desc', label: 'Plus récent dans YATCO BOSS', sortBy: 'source_updated_at', sortDir: 'desc' },
  { value: 'price_usd_asc', label: 'Prix croissant', sortBy: 'price_usd', sortDir: 'asc' },
  { value: 'price_usd_desc', label: 'Prix décroissant', sortBy: 'price_usd', sortDir: 'desc' },
  { value: 'model_year_desc', label: 'Année récente', sortBy: 'model_year', sortDir: 'desc' },
  { value: 'model_year_asc', label: 'Année ancienne', sortBy: 'model_year', sortDir: 'asc' },
  { value: 'length_m_desc', label: 'Longueur décroissante', sortBy: 'length_m', sortDir: 'desc' },
  { value: 'length_m_asc', label: 'Longueur croissante', sortBy: 'length_m', sortDir: 'asc' }
];

function yatcoGlobalSortOptionValue(sortBy: YatcoGlobalSortBy, sortDir: YatcoGlobalSortDir): string {
  return `${sortBy}_${sortDir}`;
}

/**
 * Query params shared by the browser URL and the /api/yatco-global fetch,
 * omitting empty filter values per the T1 contract.
 */
function buildYatcoGlobalParams(filters: YatcoGlobalFilters, page: number): URLSearchParams {
  const params = new URLSearchParams({
    freshnessHours: String(FRESHNESS_HOURS),
    page: String(page)
  });

  if (filters.model_year.trim() !== '') params.set('model_year', filters.model_year.trim());
  // 0 is how an empty number input can be restored by the browser from an
  // old URL; it means “no minimum”, so never send it to the strict API schema.
  if (filters.length_m.trim() !== '' && Number(filters.length_m) > 0) params.set('length_m', filters.length_m.trim());
  if (filters.cabins.trim() !== '' && Number(filters.cabins) > 0) params.set('cabins', filters.cabins.trim());
  if (filters.country.trim() !== '') params.set('country', filters.country.trim());
  if (filters.price_usd_min.trim() !== '') params.set('price_usd_min', filters.price_usd_min.trim());
  if (filters.price_usd_max.trim() !== '') params.set('price_usd_max', filters.price_usd_max.trim());
  params.set('sortBy', filters.sortBy);
  params.set('sortDir', filters.sortDir);

  return params;
}

// Every key buildYatcoGlobalParams may set. The URL sync effect merges onto
// the pre-existing searchParams instead of replacing them outright, so it
// needs this whitelist to know which keys to overwrite/clear vs. leave alone
// (foreign params like sort/category from another feature must survive).
const YATCO_GLOBAL_PARAM_KEYS = [
  'freshnessHours', 'page', 'model_year', 'length_m', 'cabins', 'country',
  'price_usd_min', 'price_usd_max', 'sortBy', 'sortDir'
] as const;

function YatcoGlobalPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Mirrors the latest searchParams without being a dependency of the URL
  // sync effect below — depending on it directly would re-trigger that
  // effect after every router.replace, even when nothing actually changed.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  // Lazy-init from the URL (read once, on the first render) so shared/bookmarked
  // links hydrate without an extra effect-driven re-fetch on mount.
  const [filters, setFilters] = useState<YatcoGlobalFilters>(() => ({
    model_year: searchParams.get('model_year') ?? '',
    length_m: searchParams.get('length_m') ?? '',
    cabins: searchParams.get('cabins') ?? '',
    country: searchParams.get('country') ?? '',
    price_usd_min: searchParams.get('price_usd_min') ?? '',
    price_usd_max: searchParams.get('price_usd_max') ?? '',
    // `updated_at` was the old technical sort. Migrate bookmarked URLs to the
    // BOSS event date so a database replay cannot look like a new listing.
    sortBy: searchParams.get('sortBy') === 'updated_at'
      ? 'source_updated_at'
      : (searchParams.get('sortBy') as YatcoGlobalSortBy | null) ?? DEFAULT_YATCO_GLOBAL_FILTERS.sortBy,
    sortDir: (searchParams.get('sortDir') as YatcoGlobalSortDir | null) ?? DEFAULT_YATCO_GLOBAL_FILTERS.sortDir
  }));
  const [listings, setListings] = useState<YatcoGlobalListingsResponse['listings']>([]);
  const [pagination, setPagination] = useState<YatcoGlobalListingsResponse['pagination'] | null>(null);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<YatcoFavoriteHistoryEntry[]>([]);
  const [historyListing, setHistoryListing] = useState<YatcoGlobalListing | null>(null);
  const [detailsListing, setDetailsListing] = useState<YatcoGlobalListing | null>(null);
  const initialFiltersRef = useRef(filters);
  const initialPageRef = useRef(page);

  useEffect(() => {
    fetch('/api/yatco-global/favorites')
      .then((response) => response.json())
      .then((data) => { if (data.success) setFavoriteKeys(new Set(data.data.dedupKeys)); })
      .catch(() => undefined);
  }, []);

  const fetchListings = useCallback(async (targetFilters: YatcoGlobalFilters, targetPage: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = buildYatcoGlobalParams(targetFilters, targetPage);
      const response = await fetch(`/api/yatco-global?${params.toString()}`);
      const data: ApiResponse<YatcoGlobalListingsResponse> = await response.json();
      if (requestId !== requestIdRef.current) return;

      if (data.success && data.data) {
        setListings(data.data.listings);
        setPagination(data.data.pagination);
      } else {
        setError(data.error || 'Erreur lors du chargement des annonces');
        toast.error('Erreur lors du chargement des annonces');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching yatco-global listings:', err);
      setError('Erreur de connexion');
      toast.error('Erreur de connexion');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // Load the latest EC2-ingested Supabase snapshot as soon as the page opens.
  // The refs preserve bookmarked URL filters without re-fetching twice when a
  // filter handler updates state and performs its own request.
  useEffect(() => {
    void fetchListings(initialFiltersRef.current, initialPageRef.current);
  }, [fetchListings]);

  useEffect(() => {
    const canonical = buildYatcoGlobalParams(filters, page);
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const key of YATCO_GLOBAL_PARAM_KEYS) {
      if (canonical.has(key)) params.set(key, canonical.get(key) as string);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [filters, page, pathname, router]);

  const updateFilter = <K extends keyof YatcoGlobalFilters>(key: K, value: YatcoGlobalFilters[K]) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setPage(1);
    if (listings.length > 0) fetchListings(nextFilters, 1);
  };

  const handleSortChange = (value: string) => {
    const option = YATCO_GLOBAL_SORT_OPTIONS.find((opt) => opt.value === value) ?? YATCO_GLOBAL_SORT_OPTIONS[0];
    const nextFilters = { ...filters, sortBy: option.sortBy, sortDir: option.sortDir };
    setFilters(nextFilters);
    setPage(1);
    if (listings.length > 0) fetchListings(nextFilters, 1);
  };

  const handleFavoriteChange = async (listingId: string, favorite: boolean) => {
    const listing = listings.find((item) => item.id === listingId);
    if (!listing) return;
    const response = await fetch('/api/yatco-global/favorites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.dedup_key, favorite, snapshot: favorite ? listing : undefined })
    });
    const data = await response.json();
    if (!response.ok || !data.success) { toast.error(data.error || 'Impossible de modifier le favori'); return; }
    setFavoriteKeys((previous) => { const next = new Set(previous); favorite ? next.add(listing.dedup_key) : next.delete(listing.dedup_key); return next; });
    toast.success(favorite ? 'Bateau ajouté aux favoris' : 'Bateau retiré des favoris');
  };

  const showHistory = async (listing: YatcoGlobalListing) => {
    const response = await fetch(`/api/yatco-global/favorites/${encodeURIComponent(listing.dedup_key)}`);
    const data = await response.json();
    if (!response.ok || !data.success) { toast.error(data.error || 'Impossible de charger le suivi'); return; }
    setHistoryListing(listing); setHistory(data.data.history);
  };

  const displayValue = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
  const detailTitle = detailsListing ? detailsListing.boat_name || [detailsListing.builder, detailsListing.model].filter(Boolean).join(' ') || 'Annonce sans nom' : '';

  const handlePrevious = () => {
    const nextPage = Math.max(1, page - 1);
    setPage(nextPage);
    if (pagination && nextPage !== page) fetchListings(filters, nextPage);
  };

  const handleNext = () => {
    if (pagination && page < pagination.totalPages) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchListings(filters, nextPage);
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
            {pagination ? `${pagination.total} annonce${pagination.total !== 1 ? 's' : ''}` : 'Cliquez sur Actualiser pour charger le flux live'}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchListings(filters, page)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser les données
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 animate-fade-in-up"
        style={{ animationDelay: '50ms' }}
      >
        <Input
          label="Année"
          type="number"
          inputMode="numeric"
          value={filters.model_year}
          onChange={(e) => updateFilter('model_year', e.target.value)}
          placeholder="ex. 2020"
        />
        <Input
          label="Longueur min. (m)"
          type="number"
          inputMode="decimal"
          value={filters.length_m}
          onChange={(e) => updateFilter('length_m', e.target.value)}
          placeholder="ex. 30"
        />
        <Input label="Cabines min." type="number" inputMode="numeric" value={filters.cabins} onChange={(e) => updateFilter('cabins', e.target.value)} placeholder="ex. 4" />
        <Input
          label="Zone"
          type="text"
          value={filters.country}
          onChange={(e) => updateFilter('country', e.target.value)}
          placeholder="ex. France"
        />
        <Input
          label="Prix min (USD)"
          type="number"
          inputMode="numeric"
          value={filters.price_usd_min}
          onChange={(e) => updateFilter('price_usd_min', e.target.value)}
          placeholder="ex. 100000"
        />
        <Input
          label="Prix max (USD)"
          type="number"
          inputMode="numeric"
          value={filters.price_usd_max}
          onChange={(e) => updateFilter('price_usd_max', e.target.value)}
          placeholder="ex. 500000"
        />
        <Select
          label="Tri"
          value={yatcoGlobalSortOptionValue(filters.sortBy, filters.sortDir)}
          onChange={(e) => handleSortChange(e.target.value)}
          options={YATCO_GLOBAL_SORT_OPTIONS.map(({ value, label }) => ({ value, label }))}
        />
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
            onClick={() => fetchListings(filters, page)}
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
            Modifiez les filtres ou actualisez les données après le prochain passage du collecteur YATCO.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing, index) => (
              <YatcoGlobalCard key={listing.id} listing={listing} index={index} isFavorite={favoriteKeys.has(listing.dedup_key)} onFavoriteChange={handleFavoriteChange} onShowHistory={showHistory} onOpenDetails={setDetailsListing} />
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
      <Modal isOpen={historyListing !== null} onClose={() => setHistoryListing(null)} title={historyListing ? `Évolution · ${historyListing.boat_name || historyListing.external_id}` : undefined} description="Snapshots enregistrés à chaque mise à jour du scraper." size="lg">
        {history.length === 0 ? <p className="text-sm text-gray-500">Aucun snapshot disponible.</p> : <div className="space-y-3">{history.map((entry) => { const snapshot = entry.listing_snapshot; return <div key={entry.observed_at} className="rounded-lg border border-gray-200 p-3 text-sm"><div className="font-medium text-gray-800">{new Date(entry.observed_at).toLocaleString('fr-FR')}</div><div className="mt-1 grid grid-cols-2 gap-2 text-gray-600"><span>Prix : {String(snapshot.price_usd ?? '—')} USD</span><span>Localisation : {[snapshot.city, snapshot.country].filter(Boolean).join(', ') || '—'}</span><span>Broker : {String(snapshot.broker_name ?? '—')}</span><span>Statut : {String(snapshot.listing_status ?? '—')}</span></div></div>; })}</div>}
      </Modal>
      <Modal isOpen={detailsListing !== null} onClose={() => setDetailsListing(null)} title={detailTitle} description={detailsListing ? `Fiche complète · ${detailsListing.source}` : undefined} size="xl">
        {detailsListing && <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-gray-700">
            <div><span className="text-gray-400">Constructeur</span><br />{displayValue(detailsListing.builder)}</div>
            <div><span className="text-gray-400">Modèle</span><br />{displayValue(detailsListing.model)}</div>
            <div><span className="text-gray-400">Année</span><br />{displayValue(detailsListing.model_year)}</div>
            <div><span className="text-gray-400">Longueur</span><br />{detailsListing.length_m ? `${detailsListing.length_m} m` : '—'}</div>
            <div><span className="text-gray-400">Cabines</span><br />{displayValue(detailsListing.cabins)}</div>
            <div><span className="text-gray-400">Statut</span><br />{displayValue(detailsListing.listing_status)}</div>
            <div><span className="text-gray-400">Prix source</span><br />{detailsListing.price_amount ? `${detailsListing.price_amount} ${detailsListing.price_currency || ''}` : '—'}</div>
            <div><span className="text-gray-400">Prix USD</span><br />{detailsListing.price_usd ? `${detailsListing.price_usd.toLocaleString('fr-FR')} $` : '—'}</div>
            <div><span className="text-gray-400">Localisation</span><br />{[detailsListing.city, detailsListing.country].filter(Boolean).join(', ') || '—'}</div>
          </div>
          <div className="border-t border-gray-200 pt-4 space-y-1 text-gray-700">
            <div><span className="text-gray-400">Broker :</span> {displayValue(detailsListing.broker_name)} {detailsListing.broker_company ? `· ${detailsListing.broker_company}` : ''}</div>
            <div><span className="text-gray-400">Agent :</span> {displayValue(detailsListing.agent_name)} {detailsListing.agent_email ? `· ${detailsListing.agent_email}` : ''}</div>
          </div>
          <div className="flex flex-wrap gap-3">
            {detailsListing.source === 'yatco-boss-live' && typeof (detailsListing.raw_payload?.yatco_boss as { vid?: unknown } | undefined)?.vid === 'string'
              ? <a href={`/api/yatco-global/brochure?vid=${encodeURIComponent(String((detailsListing.raw_payload?.yatco_boss as { vid: string }).vid))}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800">Télécharger la brochure PDF</a>
              : detailsListing.spec_sheet_url && <a href={detailsListing.spec_sheet_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800">Télécharger la brochure PDF</a>}
            {detailsListing.listing_url && <a href={detailsListing.listing_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Ouvrir la fiche source</a>}
          </div>
          {detailsListing.raw_payload && <details className="border-t border-gray-200 pt-4"><summary className="cursor-pointer text-xs font-semibold text-gray-600">Données brutes du scraper</summary><pre className="mt-3 max-h-72 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600">{JSON.stringify(detailsListing.raw_payload, null, 2)}</pre></details>}
        </div>}
      </Modal>
    </div>
  );
}

export default function YatcoGlobalPage() {
  return (
    <React.Suspense fallback={<SkeletonGrid count={6} />}>
      <YatcoGlobalPageInner />
    </React.Suspense>
  );
}
