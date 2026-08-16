import React from 'react';
import { motion } from 'framer-motion';
import { Anchor, Calendar, MapPin, ExternalLink } from 'lucide-react';
import type { YatcoGlobalListing } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { PriceDeltaBadge } from './PriceDeltaBadge';

interface YatcoGlobalCardProps {
  listing: YatcoGlobalListing;
  index?: number;
}

export function YatcoGlobalCard({ listing, index = 0 }: YatcoGlobalCardProps) {
  const title = listing.boat_name || [listing.builder, listing.model].filter(Boolean).join(' ') || 'Annonce sans nom';
  const location = [listing.city, listing.country].filter(Boolean).join(', ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -4 }}
      className="bg-white rounded-lg shadow-md hover:shadow-xl overflow-hidden transition-shadow duration-300 group"
    >
      <div className="bg-gradient-to-r from-secondary-600 to-primary-600 px-5 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{title}</h3>
          <p className="text-secondary-100 text-sm mt-0.5 truncate">{listing.source}</p>
        </div>
        <PriceDeltaBadge fluctuation={listing.price_fluctuation} />
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
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
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary-500" />
              {location}
            </span>
          )}
        </div>

        {typeof listing.price_usd === 'number' && (
          <div className="pt-3 border-t border-gray-100">
            <span className="text-lg font-semibold text-primary-600">
              {formatNumber(listing.price_usd)} $
            </span>
          </div>
        )}

        {listing.listing_url && (
          <a
            href={listing.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Voir l'annonce ${title} sur ${listing.source}`}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Voir l&apos;annonce
          </a>
        )}
      </div>
    </motion.div>
  );
}
