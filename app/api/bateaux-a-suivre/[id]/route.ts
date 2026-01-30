import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getTrackedListing, updateTrackedListing, deleteTrackedListing } from '@/lib/supabase/tracked-listings';
import { trackedListingSchema } from '@/lib/validations';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
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

    const listing = await getTrackedListing('bateaux_a_suivre', params.id);

    if (!listing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listing,
    });
  } catch (error) {
    console.error('Error in GET /api/bateaux-a-suivre/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const existing = await getTrackedListing('bateaux_a_suivre', params.id);

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (typeof body.longueur === 'string') {
      const normalized = body.longueur.replace(',', '.').trim();
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) body.longueur = parsed;
    }
    if (typeof body.annee === 'string') {
      const normalized = body.annee.trim();
      const parsed = Number.parseInt(normalized, 10);
      if (!Number.isNaN(parsed)) body.annee = parsed;
    }

    const validation = trackedListingSchema.partial().safeParse(body);

    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Données invalides',
          data: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const listing = await updateTrackedListing('bateaux_a_suivre', params.id, validation.data);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listing,
      message: 'Bateau mis à jour avec succès',
    });
  } catch (error) {
    console.error('Error in PUT /api/bateaux-a-suivre/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const existing = await getTrackedListing('bateaux_a_suivre', params.id);

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    await deleteTrackedListing('bateaux_a_suivre', params.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Bateau supprimé avec succès',
    });
  } catch (error) {
    console.error('Error in DELETE /api/bateaux-a-suivre/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors de la suppression' },
      { status: 500 }
    );
  }
}
