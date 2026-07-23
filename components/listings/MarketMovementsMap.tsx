'use client';

import { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import type { MarketMovementLocation, MarketMovementsResult } from '@/lib/types';
import geoTopo from '@/lib/geo/atlas/countries-110m.json';

interface MarketMovementsMapProps {
  data: MarketMovementsResult;
  error?: boolean;
}

const NEW_COLOR = '#2a78d6';
const SOLD_COLOR = '#10b981';
const MIN_RADIUS = 4;
const MAX_RADIUS = 16;

function bubbleRadius(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return MIN_RADIUS;
  const ratio = Math.sqrt(total / maxTotal);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

function bubbleColor(location: MarketMovementLocation): string {
  return location.soldCount > location.newCount ? SOLD_COLOR : NEW_COLOR;
}

function VesselRow({ vessel }: { vessel: MarketMovementLocation['vessels'][number] }) {
  const isNew = vessel.feed_type === 'new';
  return (
    <li className="flex items-start justify-between gap-3 border-t border-gray-100 py-2 text-sm first:border-t-0">
      <div>
        <p className="font-medium text-gray-900">{vessel.vessel_name}</p>
        <p className="text-xs text-gray-500">
          {vessel.builder || '—'} · {vessel.loa_text || '—'} · {vessel.price_text || '—'}
        </p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
          isNew
            ? 'border-sky-200 bg-sky-100 text-sky-700'
            : 'border-emerald-200 bg-emerald-100 text-emerald-700'
        }`}
      >
        {isNew ? <Sparkles className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {isNew ? 'Nouveau' : 'Vendu'}
      </span>
    </li>
  );
}

export function MarketMovementsMap({ data, error = false }: MarketMovementsMapProps) {
  const [selected, setSelected] = useState<MarketMovementLocation | null>(null);
  const maxTotal = data.locations.reduce((max, l) => Math.max(max, l.total), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="market-movements-heading" className="text-lg font-bold text-gray-900">
          Mouvements du marché — {data.windowDays} derniers jours
        </h2>
        {!error && (
          <span className="text-xs text-gray-400">
            {data.totalMovements} mouvement{data.totalMovements > 1 ? 's' : ''} · {data.locatedPlaces} lieu
            {data.locatedPlaces > 1 ? 'x' : ''}
            {data.unlocatedCount > 0 ? ` · ${data.unlocatedCount} non localisé${data.unlocatedCount > 1 ? 's' : ''}` : ''}
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-gray-500">
        Comparables MLS (tous brokers) — nouveaux listings et ventes récentes, tous segments.
      </p>

      {error ? (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les mouvements du marché pour le moment. Réessayez plus tard.
        </div>
      ) : data.totalMovements === 0 ? (
        <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
          Aucun mouvement sur cette fenêtre pour le moment.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[420px] rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
            <ComposableMap projection="geoEqualEarth" width={800} height={420}>
              <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={8}>
                <Geographies geography={geoTopo}>
                  {({ geographies }) =>
                    geographies.map((geography) => (
                      <Geography
                        key={geography.rsmKey}
                        geography={geography}
                        style={{
                          default: { fill: '#e5e7eb', stroke: '#d1d5db', strokeWidth: 0.5, outline: 'none' },
                          hover: { fill: '#e5e7eb', stroke: '#d1d5db', strokeWidth: 0.5, outline: 'none' },
                          pressed: { fill: '#e5e7eb', stroke: '#d1d5db', strokeWidth: 0.5, outline: 'none' },
                        }}
                      />
                    ))
                  }
                </Geographies>
                {data.locations.map((location) => (
                  <Marker key={location.key} coordinates={[location.lon, location.lat]}>
                    <circle
                      r={bubbleRadius(location.total, maxTotal)}
                      fill={bubbleColor(location)}
                      fillOpacity={0.75}
                      stroke="#fff"
                      strokeWidth={1}
                      onClick={() => setSelected(location)}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      aria-label={`${location.label} — ${location.total} mouvement${location.total > 1 ? 's' : ''}`}
                    />
                  </Marker>
                ))}
              </ZoomableGroup>
            </ComposableMap>
          </div>

          <div className="lg:col-span-1">
            {selected ? (
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{selected.label}</h3>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-2 text-xs text-gray-400">
                  {selected.newCount} nouveau{selected.newCount > 1 ? 'x' : ''} · {selected.soldCount} vendu
                  {selected.soldCount > 1 ? 's' : ''}
                </p>
                <ul>
                  {selected.vessels.map((vessel, i) => (
                    <VesselRow key={`${vessel.vid}-${vessel.feed_type}-${i}`} vessel={vessel} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400">
                Cliquez sur un point de la carte pour voir les bateaux du lieu.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
