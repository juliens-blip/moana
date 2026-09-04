import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { moveListing, MoveListingValidationError } from '@/lib/supabase/move-listing';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/bateaux-a-suivre/[id]/move
 * Move a tracked boat back to the main catalog
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

    const listing = await moveListing('bateaux_a_suivre', 'listings', params.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listing,
      message: 'Bateau déplacé vers le listing principal',
    });
  } catch (error) {
    if (error instanceof MoveListingValidationError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error('Error in POST /api/bateaux-a-suivre/[id]/move:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors du déplacement' },
      { status: 500 }
    );
  }
}
