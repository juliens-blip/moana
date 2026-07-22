'use client';

import React, { useMemo, useState } from 'react';
import type { YatcoMarketPulseEntry } from '@/lib/types';
import { MarketPulseCard } from './MarketPulseCard';

interface MarketPulseGridProps {
  entries: YatcoMarketPulseEntry[];
}

const FEED_LABELS: Record<'all' | YatcoMarketPulseEntry['feed_type'], string> = {
  all: 'Tous',
  new: 'Nouveaux',
  modified: 'Modifiés',
  sold: 'Vendus',
};

export function MarketPulseGrid({ entries }: MarketPulseGridProps) {
  const [feedType, setFeedType] = useState<'all' | YatcoMarketPulseEntry['feed_type']>('all');
  const [priceDropOnly, setPriceDropOnly] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (feedType !== 'all' && e.feed_type !== feedType) return false;
      if (priceDropOnly && !e.is_price_drop) return false;
      return true;
    });
  }, [entries, feedType, priceDropOnly]);

  const priceDropCount = useMemo(() => entries.filter((e) => e.is_price_drop).length, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor="feed-filter" className="text-sm text-gray-600">Feed :</label>
          <select
            id="feed-filter"
            value={feedType}
            onChange={(e) => setFeedType(e.target.value as typeof feedType)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(FEED_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={priceDropOnly}
            onChange={(e) => setPriceDropOnly(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Baisses de prix uniquement ({priceDropCount})
        </label>

        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Aucune entrée ne correspond à ces filtres.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((entry, index) => (
            <MarketPulseCard key={entry.id} entry={entry} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
