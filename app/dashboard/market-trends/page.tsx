import nextDynamic from 'next/dynamic';
import type { MarketMovementsResult } from '@/lib/types';
import { MarketPulseTrendChart } from '@/components/listings';
import {
  getMarketPulseTrendEntries,
  MARKET_PULSE_TREND_DAYS,
  MARKET_PULSE_TREND_LIMIT,
} from '@/lib/supabase/market-review';
import { getRecentMarketPulseMovements, MARKET_PULSE_MAP_DAYS } from '@/lib/supabase/market-pulse-map';

// Loaded directly from the component file (not the components/listings barrel)
// and with ssr:false so react-simple-maps/d3-geo/the vendored atlas (~141 KB
// gzip) stay code-split to this route instead of landing in the shared
// dashboard chunk every other page pulls in via the barrel import.
const MarketMovementsMap = nextDynamic(
  () => import('@/components/listings/MarketMovementsMap').then((mod) => mod.MarketMovementsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
        Chargement de la carte…
      </div>
    ),
  },
);

export const dynamic = 'force-dynamic';

function getFulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export default async function MarketTrendsPage() {
  const [marketMovementsResult, marketPulseResult] = await Promise.allSettled([
    getRecentMarketPulseMovements({ days: MARKET_PULSE_MAP_DAYS }),
    getMarketPulseTrendEntries({ days: MARKET_PULSE_TREND_DAYS, limit: MARKET_PULSE_TREND_LIMIT }),
  ]);

  const marketMovements = getFulfilledValue<MarketMovementsResult | null>(marketMovementsResult);
  const marketPulseEntries = getFulfilledValue(marketPulseResult) || [];
  const marketMovementsFailed = marketMovementsResult.status === 'rejected';
  const marketPulseFailed = marketPulseResult.status === 'rejected';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gray-900">Market Trends</h1>
        <p className="mt-1 max-w-3xl text-gray-500">
          Vue globale du marché yachting : carte des mouvements récents (MLS, tous brokers) et
          tendance prospective des événements Market Pulse.
        </p>
      </div>

      <section aria-labelledby="market-movements-heading">
        <MarketMovementsMap
          data={
            marketMovements ?? {
              locations: [],
              totalMovements: 0,
              locatedPlaces: 0,
              unlocatedCount: 0,
              windowDays: MARKET_PULSE_MAP_DAYS,
            }
          }
          error={marketMovementsFailed}
        />
      </section>

      <section aria-labelledby="market-pulse-trend-heading">
        <div className="mb-3">
          <h2 id="market-pulse-trend-heading" className="text-lg font-bold text-gray-900">
            Tendance récente
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Courbe prospective sur les {MARKET_PULSE_TREND_DAYS} derniers jours : elle s&apos;enrichit à chaque
            rafraîchissement de <code className="rounded bg-gray-100 px-1">market-pulse-scrape.mjs</code>.
            Il n&apos;existe pas d&apos;historique rétroactif avant les premiers runs.
          </p>
        </div>

        <MarketPulseTrendChart entries={marketPulseEntries} error={marketPulseFailed} />
      </section>
    </div>
  );
}
