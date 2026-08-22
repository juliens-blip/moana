import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLiveYatcoBossListings } from '@/lib/yatco-boss/live';
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

    const filters = validation.data;
    const allListings = await getLiveYatcoBossListings(searchParams.get('refresh') === '1');
    const needle = filters.country?.toLocaleLowerCase();
    const filtered = allListings.filter((listing) => {
      const location = `${listing.city ?? ''} ${listing.country ?? ''}`.toLocaleLowerCase();
      if (needle && !location.includes(needle)) return false;
      if (filters.model_year !== undefined && listing.model_year !== filters.model_year) return false;
      if (filters.length_m !== undefined && (listing.length_m ?? -Infinity) < filters.length_m) return false;
      if (filters.cabins !== undefined && (listing.cabins ?? -Infinity) < filters.cabins) return false;
      const comparablePrice = listing.price_usd ?? listing.price_amount;
      if (filters.price_usd_min !== undefined && (comparablePrice ?? -Infinity) < filters.price_usd_min) return false;
      if (filters.price_usd_max !== undefined && (comparablePrice ?? Infinity) > filters.price_usd_max) return false;
      // Le flux live historique ne doit pas appliquer les anciens seuils par
      // défaut (26 m / 2010) : ils ne s'appliquent que si le client les a
      // explicitement demandés.
      if (searchParams.has('minLengthMeters') && (listing.length_m ?? -Infinity) <= filters.minLengthMeters) return false;
      if (searchParams.has('minYear') && (listing.model_year ?? -Infinity) < filters.minYear) return false;
      return true;
    });
    const sortKey = filters.sortBy ?? 'updated_at';
    filtered.sort((left, right) => {
      const a = (sortKey === 'price_usd' ? left.price_usd ?? left.price_amount : left[sortKey]) as number | string | undefined;
      const b = (sortKey === 'price_usd' ? right.price_usd ?? right.price_amount : right[sortKey]) as number | string | undefined;
      if (a === b) return left.id.localeCompare(right.id);
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      const result = a < b ? -1 : 1;
      return filters.sortDir === 'asc' ? result : -result;
    });
    const page = filters.page ?? 1;
    const limit = 25;
    const total = filtered.length;
    const result = {
      listings: filtered.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
    };

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
