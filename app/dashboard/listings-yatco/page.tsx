import { getFleetAuditListings } from '@/lib/supabase/yatco-fleet';
import { FleetAuditGrid } from '@/components/listings';

export const dynamic = 'force-dynamic';

export default async function ListingsYatcoPage() {
  const listings = await getFleetAuditListings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gray-900">Listings YATCO</h1>
        <p className="text-gray-500 mt-1">
          Flotte Moana vue depuis YATCO BOSS — audit de contenu (photos, description, specs) pour
          repérer les listings à compléter. {listings.length} bateau{listings.length > 1 ? 'x' : ''} synchronisé{listings.length > 1 ? 's' : ''}.
        </p>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Aucune donnée synchronisée pour le moment.
        </div>
      ) : (
        <FleetAuditGrid listings={listings} />
      )}
    </div>
  );
}
