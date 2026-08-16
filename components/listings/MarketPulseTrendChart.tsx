'use client';

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { YatcoMarketPulseEntry } from '@/lib/types';

interface MarketPulseTrendChartProps {
  entries: YatcoMarketPulseEntry[];
  error?: boolean;
}

export interface MarketPulseTrendPoint {
  day: string;
  new: number;
  modified: number;
  sold: number;
  priceDrops: number;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function aggregateMarketPulseByDay(entries: YatcoMarketPulseEntry[]): MarketPulseTrendPoint[] {
  const byDay = new Map<string, MarketPulseTrendPoint>();

  for (const entry of entries) {
    const day = dayKey(entry.scraped_at);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      continue;
    }

    if (!byDay.has(day)) {
      byDay.set(day, { day, new: 0, modified: 0, sold: 0, priceDrops: 0 });
    }

    const bucket = byDay.get(day)!;
    bucket[entry.feed_type] += 1;
    if (entry.is_price_drop) {
      bucket.priceDrops += 1;
    }
  }

  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export function MarketPulseTrendChart({ entries, error = false }: MarketPulseTrendChartProps) {
  const data = useMemo(() => aggregateMarketPulseByDay(entries || []), [entries]);
  const dayCount = data.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        Événements Market Pulse par jour
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Historique limité — se construit à chaque rafraîchissement du scraper
        <code className="mx-1 bg-gray-100 px-1 rounded">market-pulse-scrape.mjs</code>
        (pas d&apos;historique rétroactif avant aujourd&apos;hui).
      </p>

      {error ? (
        <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-4">
          Impossible de charger la tendance Market Pulse pour le moment. Réessayez plus tard.
        </div>
      ) : dayCount < 3 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
          {dayCount === 0
            ? 'Aucune donnée synchronisée pour le moment.'
            : `${dayCount} jour${dayCount > 1 ? 's' : ''} de données seulement — la courbe s'affichera à partir de 3 relevés.`}
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
              <Tooltip formatter={(value) => (value == null ? '—' : value)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="new" name="Nouveaux" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="modified" name="Modifiés" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="sold" name="Vendus" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="priceDrops" name="Baisses de prix" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
