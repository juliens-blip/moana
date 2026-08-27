import React from 'react';
import { motion } from 'framer-motion';
import { Anchor, Calendar, MapPin, ExternalLink, Heart, History, Clock } from 'lucide-react';
import type { YatcoGlobalListing } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { PriceDeltaBadge } from './PriceDeltaBadge';

interface YatcoGlobalCardProps {
  listing: YatcoGlobalListing;
  index?: number;
  isFavorite?: boolean;
  onFavoriteChange?: (listingId: string, favorite: boolean) => void;
  onShowHistory?: (listing: YatcoGlobalListing) => void;
  onOpenDetails?: (listing: YatcoGlobalListing) => void;
}

export function YatcoGlobalCard({ listing, index = 0, isFavorite = false, onFavoriteChange, onShowHistory, onOpenDetails }: YatcoGlobalCardProps) {
  const title = listing.boat_name || [listing.builder, listing.model].filter(Boolean).join(' ') || 'Annonce sans nom';
  const location = [listing.city, listing.country].filter(Boolean).join(', ');
  const bossObservedAt = typeof listing.raw_payload?.boss_observed_at === 'string'
    ? listing.raw_payload.boss_observed_at
    : undefined;
  const bossFeedType = typeof listing.raw_payload?.boss_feed_type === 'string'
    ? listing.raw_payload.boss_feed_type
    : undefined;
  const bossFeedLabel = bossFeedType === 'new'
    ? 'Nouvelle annonce'
    : bossFeedType === 'modified'
      ? 'Annonce modifiée'
      : bossFeedType === 'sold'
        ? 'Vendue'
        : undefined;
  const sourceDate = bossObservedAt || listing.source_created_at || listing.source_updated_at;
  const sourceDateLabel = bossObservedAt ? 'Repérée dans YATCO BOSS' : 'Date source YATCO';
  const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -4 }}
      className="bg-white rounded-lg shadow-md hover:shadow-xl overflow-hidden transition-shadow duration-300 group"
      onClick={() => onOpenDetails?.(listing)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenDetails?.(listing); }}
      role={onOpenDetails ? 'button' : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
    >
      <div className="bg-gradient-to-r from-secondary-600 to-primary-600 px-5 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{title}</h3>
          <p className="text-secondary-100 text-sm mt-0.5 truncate">{listing.source}</p>
        </div>
        <div className="flex items-center gap-2">
          {onFavoriteChange && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onFavoriteChange(listing.id, !isFavorite); }}
              aria-label={isFavorite ? `Retirer ${title} des favoris` : `Ajouter ${title} aux favoris`}
              className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
            >
              <Heart className={`h-5 w-5 ${isFavorite ? 'fill-amber-300 text-amber-300' : ''}`} />
            </button>
          )}
          <PriceDeltaBadge fluctuation={listing.price_fluctuation} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          {bossFeedLabel && <span className="rounded-full bg-secondary-50 px-2 py-0.5 text-xs font-semibold text-secondary-700">{bossFeedLabel}</span>}
          {listing.model_year && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-primary-500" />
              {listing.model_year}
            </span>
          )}
          {listing.length_m && (
            <span className="flex items-center gap-1">
              <Anchor className="h-3.5 w-3.5 text-primary-500" />
              {formatNumber(listing.length_m, 1)} m
            </span>
          )}
          {listing.cabins && <span>{listing.cabins} cabine{listing.cabins > 1 ? 's' : ''}</span>}
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary-500" />
              {location}
            </span>
          )}
          {sourceDate && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary-500" />{sourceDateLabel} : {formatDate(sourceDate)}</span>}
        </div>

        {typeof (listing.price_usd ?? listing.price_amount) === 'number' && (
          <div className="pt-3 border-t border-gray-100">
            <span className="text-lg font-semibold text-primary-600">
              {formatNumber(listing.price_usd ?? listing.price_amount!)} {listing.price_currency ?? 'USD'}
            </span>
          </div>
        )}

        {sourceDate
          ? <p className="text-xs text-gray-400">{sourceDateLabel} : {formatDate(sourceDate)}</p>
          : <p className="text-xs text-gray-400">Date de publication : non communiquée par YATCO BOSS</p>}

        {(listing.broker_name || listing.broker_company || listing.listing_status) && (
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
            {listing.listing_status && <div>Statut : <span className="font-medium text-gray-700">{listing.listing_status}</span></div>}
            {listing.broker_name && <div>Broker : {listing.broker_name}{listing.broker_company ? ` · ${listing.broker_company}` : ''}</div>}
          </div>
        )}

        <div className="flex items-center gap-4">
          {listing.listing_url && <a onClick={(event) => event.stopPropagation()} href={listing.listing_url} target="_blank" rel="noopener noreferrer" aria-label={`Voir l'annonce ${title} sur ${listing.source}`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 transition-colors"><ExternalLink className="h-3 w-3" />Voir l&apos;annonce</a>}
          {isFavorite && onShowHistory && <button type="button" onClick={(event) => { event.stopPropagation(); onShowHistory(listing); }} className="inline-flex items-center gap-1 text-xs text-secondary-600 hover:text-secondary-800"><History className="h-3 w-3" />Évolution</button>}
        </div>
      </div>
    </motion.div>
  );
}
