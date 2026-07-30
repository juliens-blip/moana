import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getListing } from '@/lib/supabase/listings';
import { getYatcoStatsHistory } from '@/lib/supabase/yatco-stats';
import type { ApiResponse, YatcoListingStats } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/listings/[id]/yatco-stats
 * Get the YATCO BOSS stats history for a listing (chart data).
 * Returns an empty array (not an error) if the listing isn't linked yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const listing = await getListing(params.id);

    if (!listing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    if (!listing.yatco_vessel_id) {
      return NextResponse.json<ApiResponse<YatcoListingStats[]>>({ success: true, data: [] });
    }

    const history = await getYatcoStatsHistory(listing.id);

    return NextResponse.json<ApiResponse<YatcoListingStats[]>>({ success: true, data: history });
  } catch (error) {
    console.error('Error in GET /api/listings/[id]/yatco-stats:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
