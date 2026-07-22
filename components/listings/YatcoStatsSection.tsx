'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ApiResponse, YatcoListingStats } from '@/lib/types';

interface YatcoStatsSectionProps {
  listingId: string;
  yatcoVesselId: string;
  apiBasePath?: string;
}

const METRICS = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'detail_views', label: 'Vues détaillées' },
  { key: 'phone_clicks', label: 'Clics téléphone' },
  { key: 'gallery_views', label: 'Vues galerie' },
  { key: 'leads', label: 'Leads' },
] as const;

export function YatcoStatsSection({
  listingId,
  yatcoVesselId,
  apiBasePath = '/api/listings',
}: YatcoStatsSectionProps) {
  const [history, setHistory] = useState<YatcoListingStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${apiBasePath}/${listingId}/yatco-stats`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<YatcoListingStats[]>;
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? 'Impossible de charger les statistiques YATCO.');
        }
        return Array.isArray(json.data) ? json.data : [];
      })
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((fetchError: unknown) => {
        if (cancelled || (fetchError instanceof Error && fetchError.name === 'AbortError')) return;
        console.error('[YatcoStatsSection] fetch failed:', fetchError);
        setHistory([]);
        setError('Les statistiques YATCO sont temporairement indisponibles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [listingId, apiBasePath]);

  if (loading) {
    return <div className="text-sm text-gray-400">Chargement des statistiques YATCO…</div>;
  }

  if (error) {
    return (
      <div className="yatco-stats-viz space-y-3 pt-4 border-t border-gray-200">
        <h3 className="font-semibold text-gray-900 text-lg">Statistiques YATCO BOSS</h3>
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
      </div>
    );
  }

  const hasHistory = history.length >= 2;
  const hasSnapshot = history.length > 0;
  const latest = history[history.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="yatco-stats-viz space-y-3 pt-4 border-t border-gray-200"
    >
      <style>{`
        .yatco-stats-viz {
          --yatco-chart-line: #2a78d6;
        }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .yatco-stats-viz {
            --yatco-chart-line: #3987e5;
          }
        }
        :root[data-theme="dark"] .yatco-stats-viz {
          --yatco-chart-line: #3987e5;
        }
      `}</style>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-lg">Statistiques YATCO BOSS</h3>
        <span className="text-xs text-gray-400">vID {yatcoVesselId}</span>
      </div>

      <p className="text-xs text-gray-400">
        Données rafraîchies manuellement pour les listings actuellement rapprochés à YATCO.
      </p>

      {!hasHistory && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          {hasSnapshot
            ? 'Un seul relevé est disponible — un second relevé est nécessaire pour afficher la courbe.'
            : 'Aucun relevé disponible — les statistiques apparaîtront après un rafraîchissement manuel.'}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold text-gray-900">{latest?.[key] ?? '—'}</p>
            {hasHistory && (
              <div className="h-12 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <Line
                      type="monotone"
                      dataKey={key}
                      stroke="var(--yatco-chart-line)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                    <Tooltip
                      labelFormatter={(label) =>
                        format(parseISO(label as string), 'd MMM yyyy', { locale: fr })
                      }
                      formatter={(value) => [value ?? '—', label]}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasHistory && (
        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer text-primary-600">
            Voir l&apos;historique en tableau
          </summary>
          <table className="w-full mt-2 text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th>Date</th>
                {METRICS.map((m) => (
                  <th key={m.key}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td>{format(parseISO(row.snapshot_date), 'd MMM yyyy', { locale: fr })}</td>
                  {METRICS.map((m) => (
                    <td key={m.key}>{row[m.key] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </motion.div>
  );
}
