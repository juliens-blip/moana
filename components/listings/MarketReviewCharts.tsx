'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { MarketSizeBandTable } from '@/lib/types';

interface MarketReviewChartsProps {
  soldVessels: MarketSizeBandTable;
  totalSoldValue: MarketSizeBandTable;
  avgDaysOnMarket: MarketSizeBandTable;
  scrapedAt: string;
}

const BAND_COLORS: Record<string, string> = {
  "39' and Below": '#94a3b8',
  "40' - 79'": '#2a78d6',
  "80' - 119'": '#f59e0b',
  "120' and Above": '#dc2626',
};

function toChartData(table: MarketSizeBandTable, parseValue: (raw: string) => number) {
  const safeTable = table || {};
  const bands = Object.keys(safeTable);
  const years = Array.from(new Set(bands.flatMap((band) => Object.keys(safeTable[band] || {})))).sort();

  return years.map((year) => {
    const point: Record<string, string | number | null> = { year };
    for (const band of bands) {
      const rawValue = safeTable[band]?.[year];
      point[band] = rawValue == null ? null : parseValue(rawValue);
    }
    return point;
  });
}

function parseCount(raw: string): number {
  return parseInt(raw, 10) || 0;
}

function parseCurrency(raw: string): number {
  const normalized = raw.replace(/,/g, '').match(/-?[\d.]+\s*([KMB])?/i);
  if (!normalized) {
    return 0;
  }

  const amount = Number.parseFloat(normalized[0]);
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[normalized[1]?.toUpperCase() || ''] || 1;
  return Number.isFinite(amount) ? amount * multiplier : 0;
}

function ChartBlock({ title, data, bands, valueFormatter }: {
  title: string;
  data: Array<Record<string, string | number | null>>;
  bands: string[];
  valueFormatter?: (v: number) => string;
}) {
  const hasValues = data.some((point) =>
    bands.some((band) => typeof point[band] === 'number' && Number.isFinite(point[band])),
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {!data.length || !bands.length || !hasValues ? (
        <div className="h-56 flex items-center justify-center rounded-lg bg-gray-50 px-4 text-center text-sm text-gray-500">
          Aucune donnée disponible pour ce snapshot.
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={valueFormatter} width={valueFormatter ? 60 : 40} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return valueFormatter ? valueFormatter(value) : value;
                  }

                  return value == null ? '—' : String(value);
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {bands.map((band) => (
                <Line
                  key={band}
                  type="monotone"
                  dataKey={band}
                  stroke={BAND_COLORS[band] || '#2a78d6'}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function MarketReviewCharts({ soldVessels, totalSoldValue, avgDaysOnMarket, scrapedAt }: MarketReviewChartsProps) {
  const soldVesselsData = toChartData(soldVessels, parseCount);
  const totalSoldValueData = toChartData(totalSoldValue, parseCurrency);
  const avgDaysOnMarketData = toChartData(avgDaysOnMarket, parseCount);
  const hasAnyData = soldVesselsData.length > 0 || totalSoldValueData.length > 0 || avgDaysOnMarketData.length > 0;
  const snapshotDate = new Date(scrapedAt);
  const formattedSnapshotDate = Number.isNaN(snapshotDate.getTime())
    ? 'date inconnue'
    : snapshotDate.toLocaleDateString('fr-FR');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="market-review-heading" className="text-lg font-bold text-gray-900">État du marché mondial (YATCO MLS)</h2>
        <span className="text-xs text-gray-400">
          Snapshot du {formattedSnapshotDate}
        </span>
      </div>
      <p className="text-sm text-gray-500">
        Toutes régions confondues, tous brokers — par tranche de taille, 2021 à l&apos;année en cours (YTD).
      </p>
      {!hasAnyData ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Le dernier snapshot ne contient encore aucune donnée exploitable.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartBlock
            title="Bateaux vendus par taille"
            data={soldVesselsData}
            bands={Object.keys(soldVessels || {})}
          />
          <ChartBlock
            title="Valeur totale vendue ($)"
            data={totalSoldValueData}
            bands={Object.keys(totalSoldValue || {})}
            valueFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`}
          />
          <ChartBlock
            title="Jours moyens sur le marché"
            data={avgDaysOnMarketData}
            bands={Object.keys(avgDaysOnMarket || {})}
          />
        </div>
      )}
    </div>
  );
}
