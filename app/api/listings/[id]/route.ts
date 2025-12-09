import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import {
  getListing,
  updateListing,
  deleteListing,
} from '@/lib/supabase/listings';
import { listingSchema } from '@/lib/validations';
import type { ApiResponse } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/listings/[id]
 * Get a single listing by ID
 */
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

    const listing = await getListing(params.id);

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
    console.error('Error in GET /api/listings/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/listings/[id]
 * Update a listing
 */
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

    // Check if listing exists
    const existing = await getListing(params.id);

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    // All authenticated brokers can update any listing
    const body = await request.json();

    // Validate partial input
    const validation = listingSchema.partial().safeParse(body);

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

    const listing = await updateListing(params.id, validation.data);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listing,
      message: 'Bateau mis à jour avec succès',
    });
  } catch (error) {
    console.error('Error in PUT /api/listings/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/listings/[id]
 * Delete a listing
 */
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

    // Check if listing exists
    const existing = await getListing(params.id);

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouvé' },
        { status: 404 }
      );
    }

    // All authenticated brokers can delete any listing
    await deleteListing(params.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Bateau supprimé avec succès',
    });
  } catch (error) {
    console.error('Error in DELETE /api/listings/[id]:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur lors de la suppression' },
      { status: 500 }
    );
  }
}
