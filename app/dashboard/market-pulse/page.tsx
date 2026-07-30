import { getMarketPulseFeed } from '@/lib/supabase/market-pulse';
import { MarketPulseGrid } from '@/components/listings';

export const dynamic = 'force-dynamic';

export default async function MarketPulsePage() {
  const entries = await getMarketPulseFeed();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gray-900">Market Pulse</h1>
        <p className="text-gray-500 mt-1">
          Comparables du marché MLS (tous brokers) — nouveaux listings, modifications et ventes
          récentes dans le segment de Moana. {entries.length} entrée{entries.length > 1 ? 's' : ''}.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Synchronisation automatique toutes les 48 heures.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Aucune donnée synchronisée pour le moment.
        </div>
      ) : (
        <MarketPulseGrid entries={entries} />
      )}
    </div>
  );
}
