import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getListings, createListing } from '@/lib/supabase/listings';
import { listingSchema } from '@/lib/validations';
import type { ApiResponse, ListingFilters } from '@/lib/types';

// Force dynamic rendering - required for cookies() and searchParams
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/listings
 * Get all listings with optional filters
 */
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

    // Build filters from query parameters
    const filters: ListingFilters = {
      search: searchParams.get('search') || undefined,
      broker: searchParams.get('broker') || undefined,
      localisation: searchParams.get('localisation') || undefined,
      minLength: searchParams.get('minLength') ? parseFloat(searchParams.get('minLength')!) : undefined,
      maxLength: searchParams.get('maxLength') ? parseFloat(searchParams.get('maxLength')!) : undefined,
      // Note: minPrix and maxPrix removed - prix field is formatted text, not numeric
    };

    const listings = await getListings(filters);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listings,
    });
  } catch (error: any) {
    console.error('Error in GET /api/listings:', {
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

/**
 * POST /api/listings
 * Create a new listing
 */
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

    // Validate input
    const validation = listingSchema.safeParse(body);

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

    // All authenticated brokers can create listings for any broker
    // If no broker specified, default to current user's brokerId
    const data = {
      ...validation.data,
      broker: validation.data.broker || session.brokerId,
    };

    const listing = await createListing(data);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: listing,
        message: 'Bateau créé avec succès',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/listings:', {
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
