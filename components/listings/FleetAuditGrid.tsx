'use client';

import React, { useMemo, useState } from 'react';
import type { YatcoFleetListing } from '@/lib/types';
import { FleetAuditCard } from './FleetAuditCard';

interface FleetAuditGridProps {
  listings: YatcoFleetListing[];
}

function isIncomplete(listing: YatcoFleetListing): boolean {
  return (
    listing.photo_count < 3 ||
    !listing.has_description ||
    !listing.has_hull_deck_specs ||
    !listing.has_engine_specs ||
    !listing.has_dimensions ||
    !listing.has_speed_capacity_specs
  );
}

export function FleetAuditGrid({ listings }: FleetAuditGridProps) {
  const statuses = useMemo(
    () => Array.from(new Set(listings.map((l) => l.status).filter(Boolean))) as string[],
    [listings]
  );
  const [status, setStatus] = useState(statuses.includes('Active') ? 'Active' : 'all');
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (status !== 'all' && l.status !== status) return false;
      if (incompleteOnly && !isIncomplete(l)) return false;
      return true;
    });
  }, [listings, status, incompleteOnly]);

  const incompleteCount = useMemo(() => listings.filter(isIncomplete).length, [listings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm text-gray-600">Statut :</label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Tous</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={incompleteOnly}
            onChange={(e) => setIncompleteOnly(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Incomplets uniquement ({incompleteCount})
        </label>

        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} listing{filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Aucun listing ne correspond à ces filtres.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((listing, index) => (
            <FleetAuditCard key={listing.id} listing={listing} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
