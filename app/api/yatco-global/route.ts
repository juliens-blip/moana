import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getYatcoGlobalListings } from '@/lib/supabase/yatco-global';
import { yatcoGlobalQuerySchema } from '@/lib/validations';
import type { ApiResponse } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/yatco-global
 * List deduplicated YATCO global listings for the authenticated broker,
 * selected by freshness window, minimum length, and minimum year, enriched
 * with price fluctuation.
 *
 * Query params:
 * - freshnessHours=number: Only listings created or updated within this many hours (default 72)
 * - minLengthMeters=number: Minimum length in meters (default 26)
 * - minYear=number: Minimum model year (default 2010)
 * - country=string: Filter by country (case-insensitive)
 * - page=number: Page number (default 1)
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
    const validation = yatcoGlobalQuerySchema.safeParse({
      freshnessHours: searchParams.get('freshnessHours') ?? undefined,
      minLengthMeters: searchParams.get('minLengthMeters') ?? undefined,
      minYear: searchParams.get('minYear') ?? undefined,
      country: searchParams.get('country') ?? undefined,
      page: searchParams.get('page') ?? undefined
    });

    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Paramètres de requête invalides',
          data: validation.error.errors
        },
        { status: 400 }
      );
    }

    const result = await getYatcoGlobalListings(validation.data);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: result
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Error in GET /api/yatco-global:', {
      message,
      stack,
      error,
    });
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? `Erreur serveur: ${message}`
          : 'Erreur serveur'
      },
      { status: 500 }
    );
  }
}
