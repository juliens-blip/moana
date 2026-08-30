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
 * List deduplicated YATCO global listings already collected by the EC2 worker
 * and stored in Supabase. Vercel must never open an SSH session or run the
 * browser scraper synchronously from this request.
 *
 * Query params:
 * - freshnessHours=number: Only listings observed by the collector within this many hours (default 4380 ≈ 6 months)
 * - minLengthMeters=number: Minimum length in meters (default 26)
 * - minYear=number: Minimum model year (default 2010)
 * - country=string: Filter by country (case-insensitive)
 * - model_year=number: Exact model year filter
 * - length_m=number: Exact length in meters filter
 * - cabins=number: Exact cabin count filter
 * - price_usd_min=number: Minimum price in USD
 * - price_usd_max=number: Maximum price in USD
 * - page=number: Page number (default 1)
 * - sortBy=updated_at|source_updated_at|price_usd|model_year|length_m: Sort column (default source_updated_at)
 * - sortDir=asc|desc: Sort direction (default desc)
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
      model_year: searchParams.get('model_year') ?? undefined,
      length_m: searchParams.get('length_m') ?? undefined,
      cabins: searchParams.get('cabins') ?? undefined,
      price_usd_min: searchParams.get('price_usd_min') ?? undefined,
      price_usd_max: searchParams.get('price_usd_max') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortDir: searchParams.get('sortDir') ?? undefined
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

    // The legacy `refresh=1` parameter is intentionally harmless: a refresh
    // now means re-reading the latest worker snapshot from Supabase. Scraping
    // remains an asynchronous EC2 responsibility.
    const result = await getYatcoGlobalListings(validation.data);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: result
    }, { headers: { 'Cache-Control': 'no-store' } });
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
