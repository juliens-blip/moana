import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getTrackedListings, createTrackedListing } from '@/lib/supabase/tracked-listings';
import { trackedListingSchema } from '@/lib/validations';
import type { ApiResponse, ListingFilters } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const etoileParam = searchParams.get('etoile');
    const etoile = etoileParam === 'true' || etoileParam === '1';

    const filters: ListingFilters = {
      search: searchParams.get('search') || undefined,
      broker: searchParams.get('broker') || undefined,
      localisation: searchParams.get('localisation') || undefined,
      minLength: searchParams.get('minLength') ? parseFloat(searchParams.get('minLength')!) : undefined,
      maxLength: searchParams.get('maxLength') ? parseFloat(searchParams.get('maxLength')!) : undefined,
      etoile: etoileParam ? etoile : undefined,
    };

    const listings = await getTrackedListings('bateaux_chantier', filters);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listings,
    });
  } catch (error: any) {
    console.error('Error in GET /api/bateaux-chantier:', {
      message: error?.message,
      stack: error?.stack,
      error,
    });
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? `Erreur serveur: ${error?.message}`
          : 'Erreur serveur'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
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

    const validation = trackedListingSchema.safeParse(body);

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

    const listing = await createTrackedListing('bateaux_chantier', validation.data, session.brokerId);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: listing,
        message: 'Bateau créé avec succès',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/bateaux-chantier:', {
      message: error?.message,
      stack: error?.stack,
      error,
    });
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? `Erreur lors de la création: ${error?.message}`
          : 'Erreur lors de la création'
      },
      { status: 500 }
    );
  }
}
