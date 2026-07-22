import type { ReactNode } from 'react';
import type { YatcoMarketReviewSnapshot } from '@/lib/types';
import { MarketPulseTrendChart, MarketReviewCharts } from '@/components/listings';
import {
  getLatestMarketReview,
  getMarketPulseTrendEntries,
  MARKET_PULSE_TREND_DAYS,
  MARKET_PULSE_TREND_LIMIT,
} from '@/lib/supabase/market-review';

export const dynamic = 'force-dynamic';

function StatusMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div
      role={error ? 'alert' : undefined}
      className={`rounded-lg border px-4 py-10 text-center text-sm ${
        error
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-dashed border-gray-300 bg-white text-gray-500'
      }`}
    >
      {children}
    </div>
  );
}

function getFulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export default async function MarketTrendsPage() {
  const [marketReviewResult, marketPulseResult] = await Promise.allSettled([
    getLatestMarketReview(),
    getMarketPulseTrendEntries({ days: MARKET_PULSE_TREND_DAYS, limit: MARKET_PULSE_TREND_LIMIT }),
  ]);

  const marketReview = getFulfilledValue<YatcoMarketReviewSnapshot | null>(marketReviewResult);
  const marketPulseEntries = getFulfilledValue(marketPulseResult) || [];
  const marketReviewFailed = marketReviewResult.status === 'rejected';
  const marketPulseFailed = marketPulseResult.status === 'rejected';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gray-900">Market Trends</h1>
        <p className="mt-1 max-w-3xl text-gray-500">
          Vue globale du marché yachting : état YATCO MLS par taille et tendance prospective des
          événements Market Pulse.
        </p>
      </div>

      <section aria-labelledby="market-review-heading">
        {marketReviewFailed ? (
          <StatusMessage error>
            Impossible de charger l&apos;état du marché mondial pour le moment. Vérifiez la synchronisation
            du Market Review ou réessayez plus tard.
          </StatusMessage>
        ) : marketReview ? (
          <MarketReviewCharts
            soldVessels={marketReview.size_bands.soldVessels}
            totalSoldValue={marketReview.size_bands.totalSoldValue}
            avgDaysOnMarket={marketReview.size_bands.avgDaysOnMarket}
            scrapedAt={marketReview.scraped_at}
          />
        ) : (
          <div>
            <h2 id="market-review-heading" className="mb-3 text-lg font-bold text-gray-900">
              État du marché mondial
            </h2>
            <StatusMessage>Aucun snapshot Market Review n&apos;a encore été synchronisé.</StatusMessage>
          </div>
        )}
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
