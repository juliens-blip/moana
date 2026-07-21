'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, ExternalLink, Link2, Camera } from 'lucide-react';
import type { YatcoFleetListing } from '@/lib/types';

interface FleetAuditCardProps {
  listing: YatcoFleetListing;
  index?: number;
}

const SPEC_CHECKS: Array<{ key: keyof YatcoFleetListing; label: string }> = [
  { key: 'has_description', label: 'Description' },
  { key: 'has_broker_message', label: "Message broker" },
  { key: 'has_hull_deck_specs', label: 'Coque / Pont' },
  { key: 'has_engine_specs', label: 'Moteurs' },
  { key: 'has_dimensions', label: 'Dimensions' },
  { key: 'has_speed_capacity_specs', label: 'Vitesse / Capacité' },
];

function photoBadgeClass(count: number) {
  if (count === 0) return 'bg-red-100 text-red-700 border-red-200';
  if (count < 5) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

export function FleetAuditCard({ listing, index = 0 }: FleetAuditCardProps) {
  const bossUrl = `https://www.yatcoboss.com/search/vesseldetails/viewlisting/?vID=${listing.vid}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      className="bg-white rounded-lg shadow-md hover:shadow-xl overflow-hidden transition-shadow duration-300"
    >
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">{listing.vessel_name}</h3>
            <p className="text-primary-100 text-sm mt-1">{listing.builder || '—'} · {listing.model_year || '—'}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white border border-white/30">
              {listing.status || '—'}
            </span>
            {listing.linked_listing_id ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/20 px-2.5 py-1 text-xs font-semibold text-sky-100 border border-sky-200/50">
                <Link2 className="h-3 w-3" />
                Lié
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-400/20 px-2.5 py-1 text-xs font-semibold text-gray-100 border border-gray-200/50">
                Non lié
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {listing.asking_price_text && (
          <div className="text-primary-700 font-semibold text-lg pb-3 border-b border-gray-200">
            {listing.asking_price_text}
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{listing.loa_text || '—'}</span>
          <span>{listing.broker_name || '—'}</span>
        </div>

        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold border ${photoBadgeClass(listing.photo_count)}`}>
          <Camera className="h-3.5 w-3.5" />
          {listing.photo_count} photo{listing.photo_count > 1 ? 's' : ''}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-gray-200">
          {SPEC_CHECKS.map(({ key, label }) => {
            const ok = !!listing[key];
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                )}
                <span className={ok ? 'text-gray-700' : 'text-red-700 font-medium'}>{label}</span>
              </div>
            );
          })}
        </div>

        {typeof listing.days_on_market === 'number' && (
          <div className="text-xs text-gray-500 pt-2">
            {listing.days_on_market} jours sur le marché
          </div>
        )}

        <a
          href={bossUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 pt-3 mt-2 border-t border-gray-200 text-sm text-primary-700 hover:text-primary-900 font-medium"
        >
          Voir sur BOSS
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </motion.div>
  );
}
