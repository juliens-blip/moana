import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLeadsByBroker, getLeadStats } from '@/lib/supabase/leads';
import type { ApiResponse, LeadWithBroker } from '@/lib/types';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/leads
 * Get all leads for the authenticated broker with optional filters
 *
 * Query params:
 * - stats=true: Include lead statistics
 * - status=NEW|CONTACTED|QUALIFIED|CONVERTED|LOST: Filter by status
 * - search=string: Search in contact name, email, boat make/model
 * - source=string: Filter by source
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
    const includeStats = searchParams.get('stats') === 'true';

    // Get leads for the authenticated broker only
    const leads = await getLeadsByBroker(session.brokerId);

    // Optionally include stats
    let stats = null;
    if (includeStats) {
      stats = await getLeadStats(session.brokerId);
    }

    // Apply client-side filters
    let filteredLeads: LeadWithBroker[] = leads;

    const status = searchParams.get('status');
    if (status) {
      filteredLeads = filteredLeads.filter(lead => lead.status === status);
    }

    const search = searchParams.get('search');
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLeads = filteredLeads.filter(lead =>
        lead.contact_display_name.toLowerCase().includes(searchLower) ||
        lead.contact_email?.toLowerCase().includes(searchLower) ||
        lead.boat_make?.toLowerCase().includes(searchLower) ||
        lead.boat_model?.toLowerCase().includes(searchLower)
      );
    }

    const source = searchParams.get('source');
    if (source) {
      filteredLeads = filteredLeads.filter(lead =>
        lead.detailed_source_summary === source || lead.source === source
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        leads: filteredLeads,
        stats: stats,
        total: filteredLeads.length
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/leads:', {
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
