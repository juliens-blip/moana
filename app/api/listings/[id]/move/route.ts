import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { moveListing, MoveListingValidationError } from '@/lib/supabase/move-listing';
import type { ApiResponse } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/listings/[id]/move
 * Move a listing from the main catalog to "Bateaux à suivre"
 */
export async function POST(
  request: NextRequest,
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

    const listing = await moveListing('listings', 'bateaux_a_suivre', params.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listing,
      message: 'Bateau déplacé vers Bateaux à suivre',
    });
  } catch (error) {
    if (error instanceof MoveListingValidationError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error('Error in POST /api/listings/[id]/move:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors du déplacement' },
      { status: 500 }
    );
  }
}
