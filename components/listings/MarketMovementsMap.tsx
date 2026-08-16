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
import { clusterByOverlap } from '@/lib/geo/screen-cluster';
import { MIN_HIT_RADIUS, bubbleRadius, tapRadius, toLocalUnits } from '@/lib/geo/bubble-geometry';
import geoTopo from '@/lib/geo/atlas/countries-110m.json';

interface MarketMovementsMapProps {
  data: MarketMovementsResult;
  error?: boolean;
}

const NEW_COLOR = '#2a78d6';
const SOLD_COLOR = '#10b981';

// UNIT CONVENTION — every pixel constant in this file is a SCREEN pixel.
// Markers live inside ZoomableGroup, which wraps them in
// `<g transform="translate(x y) scale(k)">`, so anything drawn there is in
// LOCAL units and appears k times bigger on screen. Convert exactly once,
// at the point of use, with the toLocal() helper in MapMarkers — never write
// a bare pixel number into a rendered attribute, and never floor a value in
// local units (a `Math.max(3, r / k)` floor is 3*k screen pixels, i.e. it
// grows without bound as you zoom in).
//
// Bubble sizing/tap-target geometry itself lives in lib/geo/bubble-geometry.ts
// (imported above) so it can be unit-tested against the clustering.

const DEFAULT_CENTER: [number, number] = [10, 20];
const MIN_ZOOM = 1;
// High enough that real nearby-but-distinct yacht hubs (e.g. Antibes/Monaco,
// ~24km apart, needs zoom ~75 to clear 50px on this projection) can fully
// separate by zoom alone, not just fall straight to spiderfy. 4^4 = exactly
// 4 cluster-zoom clicks (CLUSTER_ZOOM_FACTOR) from MIN_ZOOM, so it's always
// reachable in a small, predictable number of clicks. Only genuinely
// sub-5km-apart or duplicate points still rely on spiderfy past this point.
const MAX_ZOOM = 256;
const ZOOM_BUTTON_FACTOR = 1.6;
const CLUSTER_ZOOM_FACTOR = 4;
// Extra breathing room (screen px) kept between two bubbles even when their
// radii don't strictly overlap, so adjacent tap targets never sit flush.
const CLUSTER_GAP_PX = 6;
// Fallback for points that stay screen-coincident even at MAX_ZOOM (e.g. two
// berths a few hundred meters apart): fan them out in a spiral around the
// cluster centroid so each becomes its own clickable target. Spiral (not a
// fixed ring) so it keeps working cleanly if more than a couple of zones
// ever end up genuinely coincident.
// Must keep worst-case pairwise spacing across the spiral >= 2*MIN_HIT_RADIUS
// + CLUSTER_GAP_PX (50px) for any realistic cluster size, or two spiderfied
// legs can still overlap. Verified by sweep in _verify-cluster.ts: 34 is the
// bare minimum that clears 50px (54.5px), 38 keeps a real margin (60.9px).
const SPIDERFY_STEP_PX = 38;
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

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
  // Screen pixels -> ZoomableGroup local units. Everything rendered below
  // goes through this exactly once, so a bubble keeps a constant on-screen
  // size at every zoom level instead of inflating with k.
  const toLocal = (screenPx: number) => toLocalUnits(screenPx, zoomScale);
  const strokeWidth = toLocal(1);

  // Fixed to the full, un-clustered location list (not the current on-screen
  // clusters) so bubble sizes stay stable as you pan/zoom — recomputing this
  // from the transient clustering would make every bubble subtly resize each
  // time a nearby cluster merges or splits.
  const maxTotal = locations.reduce((max, l) => Math.max(max, l.total), 0);

  const clusters = useMemo(
    () =>
      clusterByOverlap(locations, {
        project: (location) => {
          const p = projection([location.lon, location.lat]);
          // Bring the raw (pre-zoom-transform) projected position into the
          // same screen-pixel space the radius is expressed in — only the
          // scale matters for relative distances, the pan offset doesn't.
          return p ? [p[0] * zoomScale, p[1] * zoomScale] : null;
        },
        // Screen-pixel radius a location (or a merged group of locations)
        // is actually drawn/tapped at — literally the same tapRadius() the
        // render below uses, so the clustering decision matches reality
        // instead of a blanket pixel radius. This is what makes a big
        // bubble merge with a neighbor further away than a small bubble
        // would, and is what actually keeps every bubble tappable: two
        // groups are only left un-merged once their real circles (visual +
        // touch target) genuinely stop overlapping.
        radius: (members) => tapRadius(members.reduce((sum, m) => sum + m.total, 0), maxTotal),
        gap: CLUSTER_GAP_PX,
      }),
    [locations, projection, zoomScale, maxTotal],
  );

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
                radius={toLocal(bubbleRadius(location.total, maxTotal))}
                hitRadius={toLocal(tapRadius(location.total, maxTotal))}
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
                radius={toLocal(bubbleRadius(total, maxTotal))}
                hitRadius={toLocal(tapRadius(total, maxTotal))}
                fill={bubbleColor(newCount, soldCount)}
                strokeWidth={strokeWidth}
                label={`Zone groupée — ${members.length} secteurs, ${total} mouvement${total > 1 ? 's' : ''}`}
                badge={members.length}
                badgeFontSize={toLocal(11)}
                onClick={() => onClusterClick({ key, lon, lat }, zoomScale < MAX_ZOOM)}
              />
            </Marker>
          );
        }

        // Spiderfied: fan the underlying zones out in a spiral (not a fixed
        // ring, so it keeps every leg clickable even if more than a couple
        // of zones end up genuinely coincident) so every one gets its own
        // clickable bubble, even though they're still geographically (and
        // therefore visually) identical at MAX_ZOOM.
        const [cx, cy] = projection([lon, lat]) ?? [0, 0];
        const stepPx = toLocal(SPIDERFY_STEP_PX);
        return (
          <g key={key}>
            {members.map((member, i) => {
              const legPx = stepPx * Math.sqrt(i + 1);
              const angle = i * GOLDEN_ANGLE_RAD;
              const lx = cx + Math.cos(angle) * legPx;
              const ly = cy + Math.sin(angle) * legPx;
              return (
                <g key={member.key}>
                  <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="#9ca3af" strokeWidth={strokeWidth} />
                  <g transform={`translate(${lx} ${ly})`}>
                    <Bubble
                      radius={toLocal(bubbleRadius(member.total, maxTotal))}
                      hitRadius={toLocal(tapRadius(member.total, maxTotal))}
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
              <circle r={toLocal(MIN_HIT_RADIUS)} fill="transparent" />
              <circle r={toLocal(8)} fill="#fff" stroke="#9ca3af" strokeWidth={strokeWidth} />
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
