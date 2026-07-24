'use client';

import { useMemo, useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
  useMapContext,
  useZoomPanContext,
} from 'react-simple-maps';
import { Sparkles, CheckCircle2, X, ExternalLink, Plus, Minus, Maximize2 } from 'lucide-react';
import type { MarketMovementLocation, MarketMovementsResult } from '@/lib/types';
import { clusterByProjectedDistance } from '@/lib/geo/screen-cluster';
import geoTopo from '@/lib/geo/atlas/countries-110m.json';

interface MarketMovementsMapProps {
  data: MarketMovementsResult;
  error?: boolean;
}

const NEW_COLOR = '#2a78d6';
const SOLD_COLOR = '#10b981';
// One bubble already represents a whole zone (nearby places are pre-merged
// server-side, see lib/supabase/market-pulse-map.ts), so it's sized to read
// as a single meaningful dot — bigger than a single-vessel marker, capped so
// a busy zone never dominates the map.
const MIN_RADIUS = 6;
const MAX_RADIUS = 20;
// Invisible hit-area floor (~44px diameter, the standard mobile touch target)
// so small/packed bubbles stay tappable without changing their visible size.
const MIN_HIT_RADIUS = 22;

const DEFAULT_CENTER: [number, number] = [10, 20];
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const ZOOM_BUTTON_FACTOR = 1.6;
const CLUSTER_ZOOM_FACTOR = 4;
// Screen-pixel radius under which nearby bubbles are merged into one
// clickable cluster. Recomputed on every pan/zoom (see useZoomPanContext
// below) so clusters split apart the moment there's enough room on screen —
// this is what actually fixes "can't tap a bubble, they're all touching."
const CLUSTER_PIXEL_RADIUS = 26;
// Fallback for points that stay screen-coincident even at MAX_ZOOM (e.g. two
// berths a few hundred meters apart): fan them out around the cluster so
// each becomes its own clickable target.
const SPIDERFY_LEG_PX = 30;

function bubbleRadius(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return MIN_RADIUS;
  const ratio = Math.sqrt(total / maxTotal);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

function bubbleColor(newCount: number, soldCount: number): string {
  return soldCount > newCount ? SOLD_COLOR : NEW_COLOR;
}

interface VesselRowProps {
  vessel: MarketMovementLocation['vessels'][number];
  showLocation: boolean;
}

function VesselRow({ vessel, showLocation }: VesselRowProps) {
  const isNew = vessel.feed_type === 'new';
  const bossUrl = `https://www.yatcoboss.com/search/vesseldetails/viewlisting/?vID=${vessel.vid}`;
  return (
    <li className="border-t border-gray-100 py-2 text-sm first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{vessel.vessel_name}</p>
          <p className="text-xs text-gray-500">
            {vessel.builder || '—'} · {vessel.loa_text || '—'} · {vessel.price_text || '—'}
            {showLocation ? ` · ${vessel.location_label}` : ''}
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
      </div>
      <a
        href={bossUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-900 font-medium"
      >
        Voir l&apos;annonce YATCO
        <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  );
}

interface BubbleProps {
  radius: number;
  hitRadius: number;
  fill: string;
  strokeWidth: number;
  label: string;
  badge?: number;
  badgeFontSize?: number;
  onClick: () => void;
}

// A visible bubble plus a larger, invisible hit-area circle underneath it —
// keeps the current bubble design pixel-for-pixel while guaranteeing a
// touch-friendly click/tap target even when the bubble itself is tiny.
function Bubble({ radius, hitRadius, fill, strokeWidth, label, badge, badgeFontSize, onClick }: BubbleProps) {
  return (
    <g onClick={onClick} role="button" aria-label={label} style={{ cursor: 'pointer' }}>
      <circle r={Math.max(radius, hitRadius)} fill="transparent" />
      <circle r={radius} fill={fill} fillOpacity={0.75} stroke="#fff" strokeWidth={strokeWidth} />
      {badge && badge > 1 && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={badgeFontSize}
          fontWeight={700}
          fill="#fff"
          style={{ pointerEvents: 'none' }}
        >
          {badge}
        </text>
      )}
    </g>
  );
}

interface MapMarkersProps {
  locations: MarketMovementLocation[];
  spiderfiedKey: string | null;
  onSelectLocation: (location: MarketMovementLocation) => void;
  onClusterClick: (cluster: { key: string; lon: number; lat: number }, canZoomFurther: boolean) => void;
}

// Rendered as a child of ZoomableGroup so it can read the map's live
// projection + current pan/zoom transform (react-simple-maps context hooks)
// and re-cluster bubbles by their actual on-screen pixel distance — not a
// fixed geographic radius — every time the user pans or zooms.
function MapMarkers({ locations, spiderfiedKey, onSelectLocation, onClusterClick }: MapMarkersProps) {
  const { projection } = useMapContext();
  const { k: zoomScale } = useZoomPanContext();
  const strokeWidth = Math.max(0.5, 1 / zoomScale);
  const hitRadius = MIN_HIT_RADIUS / zoomScale;
  const thresholdWorld = CLUSTER_PIXEL_RADIUS / zoomScale;

  const clusters = useMemo(
    () =>
      clusterByProjectedDistance(
        locations,
        (location) => projection([location.lon, location.lat]),
        thresholdWorld,
      ),
    [locations, projection, thresholdWorld],
  );

  // Fixed to the full, un-clustered location list (not the current on-screen
  // clusters) so bubble sizes stay stable as you pan/zoom — recomputing this
  // from the transient clustering would make every bubble subtly resize each
  // time a nearby cluster merges or splits.
  const maxTotal = locations.reduce((max, l) => Math.max(max, l.total), 0);

  return (
    <>
      {clusters.map((cluster) => {
        const members = cluster.items;
        const key = members
          .map((m) => m.key)
          .sort()
          .join('|');

        if (members.length === 1) {
          const location = members[0];
          return (
            <Marker key={location.key} coordinates={[location.lon, location.lat]}>
              <Bubble
                radius={Math.max(3, bubbleRadius(location.total, maxTotal) / zoomScale)}
                hitRadius={hitRadius}
                fill={bubbleColor(location.newCount, location.soldCount)}
                strokeWidth={strokeWidth}
                label={`${location.label} — ${location.total} mouvement${location.total > 1 ? 's' : ''}`}
                onClick={() => onSelectLocation(location)}
              />
            </Marker>
          );
        }

        const lon = members.reduce((sum, m) => sum + m.lon, 0) / members.length;
        const lat = members.reduce((sum, m) => sum + m.lat, 0) / members.length;
        const total = members.reduce((sum, m) => sum + m.total, 0);
        const newCount = members.reduce((sum, m) => sum + m.newCount, 0);
        const soldCount = members.reduce((sum, m) => sum + m.soldCount, 0);

        if (spiderfiedKey !== key) {
          return (
            <Marker key={key} coordinates={[lon, lat]}>
              <Bubble
                radius={Math.max(3, bubbleRadius(total, maxTotal) / zoomScale)}
                hitRadius={hitRadius}
                fill={bubbleColor(newCount, soldCount)}
                strokeWidth={strokeWidth}
                label={`Zone groupée — ${members.length} secteurs, ${total} mouvement${total > 1 ? 's' : ''}`}
                badge={members.length}
                badgeFontSize={Math.max(9, 11 / zoomScale)}
                onClick={() => onClusterClick({ key, lon, lat }, zoomScale < MAX_ZOOM)}
              />
            </Marker>
          );
        }

        // Spiderfied: fan the underlying zones out in a small ring so every
        // one gets its own clickable bubble, even though they're still
        // geographically (and therefore visually) coincident at MAX_ZOOM.
        const [cx, cy] = projection([lon, lat]) ?? [0, 0];
        const legPx = SPIDERFY_LEG_PX / zoomScale;
        return (
          <g key={key}>
            {members.map((member, i) => {
              const angle = (2 * Math.PI * i) / members.length;
              const lx = cx + Math.cos(angle) * legPx;
              const ly = cy + Math.sin(angle) * legPx;
              return (
                <g key={member.key}>
                  <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="#9ca3af" strokeWidth={strokeWidth} />
                  <g transform={`translate(${lx} ${ly})`}>
                    <Bubble
                      radius={Math.max(3, bubbleRadius(member.total, maxTotal) / zoomScale)}
                      hitRadius={hitRadius}
                      fill={bubbleColor(member.newCount, member.soldCount)}
                      strokeWidth={strokeWidth}
                      label={`${member.label} — ${member.total} mouvement${member.total > 1 ? 's' : ''}`}
                      onClick={() => onSelectLocation(member)}
                    />
                  </g>
                </g>
              );
            })}
            <g
              transform={`translate(${cx} ${cy})`}
              onClick={() => onClusterClick({ key, lon, lat }, false)}
              role="button"
              aria-label="Refermer la zone dépliée"
              style={{ cursor: 'pointer' }}
            >
              <circle r={Math.max(hitRadius, 8 / zoomScale)} fill="transparent" />
              <circle r={Math.max(4, 8 / zoomScale)} fill="#fff" stroke="#9ca3af" strokeWidth={strokeWidth} />
            </g>
          </g>
        );
      })}
    </>
  );
}

export function MarketMovementsMap({ data, error = false }: MarketMovementsMapProps) {
  const [selected, setSelected] = useState<MarketMovementLocation | null>(null);
  const [spiderfiedKey, setSpiderfiedKey] = useState<string | null>(null);
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({
    center: DEFAULT_CENTER,
    zoom: MIN_ZOOM,
  });
  const hasMultipleSubPlaces = (selected?.vessels.length ?? 0) > 0 &&
    new Set(selected?.vessels.map((v) => v.location_label)).size > 1;

  function handleClusterClick(cluster: { key: string; lon: number; lat: number }, canZoomFurther: boolean) {
    if (!canZoomFurther) {
      // Already at MAX_ZOOM and still one screen cluster — no amount of
      // zooming will separate them (they're genuinely that close), so fall
      // back to spiderfying instead of zooming forever.
      setSpiderfiedKey((current) => (current === cluster.key ? null : cluster.key));
      return;
    }
    setSpiderfiedKey(null);
    setView((current) => ({
      center: [cluster.lon, cluster.lat],
      zoom: Math.min(MAX_ZOOM, current.zoom * CLUSTER_ZOOM_FACTOR),
    }));
  }

  function zoomBy(factor: number) {
    setSpiderfiedKey(null);
    setView((current) => ({
      center: current.center,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor)),
    }));
  }

  function resetView() {
    setSpiderfiedKey(null);
    setSelected(null);
    setView({ center: DEFAULT_CENTER, zoom: MIN_ZOOM });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="market-movements-heading" className="text-lg font-bold text-gray-900">
          Mouvements du marché — {data.windowDays} derniers jours
        </h2>
        {!error && (
          <span className="text-xs text-gray-400">
            {data.totalMovements} mouvement{data.totalMovements > 1 ? 's' : ''} · {data.locatedPlaces} zone
            {data.locatedPlaces > 1 ? 's' : ''}
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
          <div
            className="relative lg:col-span-2 h-[420px] rounded-lg border border-gray-100 bg-gray-50 overflow-hidden"
            style={{ touchAction: 'none' }}
          >
            <ComposableMap projection="geoEqualEarth" width={800} height={420}>
              <ZoomableGroup
                center={view.center}
                zoom={view.zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                onMoveEnd={(position) => setView({ center: position.coordinates, zoom: position.zoom })}
              >
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
                <MapMarkers
                  locations={data.locations}
                  spiderfiedKey={spiderfiedKey}
                  onSelectLocation={setSelected}
                  onClusterClick={handleClusterClick}
                />
              </ZoomableGroup>
            </ComposableMap>

            <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => zoomBy(ZOOM_BUTTON_FACTOR)}
                aria-label="Zoom avant"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:bg-white active:bg-gray-50"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1 / ZOOM_BUTTON_FACTOR)}
                aria-label="Zoom arrière"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:bg-white active:bg-gray-50"
              >
                <Minus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={resetView}
                aria-label="Réinitialiser la vue"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:bg-white active:bg-gray-50"
              >
                <Maximize2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-1">
            {selected ? (
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{selected.label}</h3>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="shrink-0 text-gray-400 hover:text-gray-600"
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
                    <VesselRow
                      key={`${vessel.vid}-${vessel.feed_type}-${i}`}
                      vessel={vessel}
                      showLocation={hasMultipleSubPlaces}
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400">
                Cliquez sur un point de la carte pour voir les bateaux de la zone. Les zones groupées
                (badge chiffré) zooment au clic ; répétez si besoin pour tout séparer.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
