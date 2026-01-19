import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLeadById, updateLeadStatus, updateLeadComments } from '@/lib/supabase/leads';
import { leadUpdateSchema } from '@/lib/validations';
import type { ApiResponse, LeadStatus } from '@/lib/types';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/leads/[id]
 * Get a specific lead by ID (for authenticated broker only)
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

    const leadId = params.id;

    if (!leadId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'ID du lead manquant' },
        { status: 400 }
      );
    }

    // Get lead - only if it belongs to the authenticated broker
    const lead = await getLeadById(leadId, session.brokerId);

    if (!lead) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Lead non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: lead,
    });
  } catch (error: any) {
    console.error('Error in GET /api/leads/[id]:', {
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
 * PUT /api/leads/[id]
 * Update lead status and/or comments (broker can only update their own leads)
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

    const leadId = params.id;

    if (!leadId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'ID du lead manquant' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation = leadUpdateSchema.safeParse(body);

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

    const { status, customer_comments, lead_comments } = validation.data;

    // Verify the lead belongs to the broker before updating
    const existingLead = await getLeadById(leadId, session.brokerId);

    if (!existingLead) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Lead non trouvé ou accès refusé' },
        { status: 404 }
      );
    }

    // Update status if provided
    let updatedLead;
    if (status) {
      updatedLead = await updateLeadStatus(leadId, session.brokerId, status as LeadStatus);
    }

    // Update comments if provided
    if (customer_comments !== undefined || lead_comments !== undefined) {
      updatedLead = await updateLeadComments(
        leadId,
        session.brokerId,
        customer_comments,
        lead_comments
      );
    }

    // If only status was updated, fetch the latest lead data
    if (!updatedLead) {
      updatedLead = await getLeadById(leadId, session.brokerId);
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: updatedLead,
        message: 'Lead mis à jour avec succès',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in PUT /api/leads/[id]:', {
      message: error?.message,
      stack: error?.stack,
      error,
    });
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? `Erreur lors de la mise à jour: ${error?.message}`
          : 'Erreur lors de la mise à jour'
      },
      { status: 500 }
    );
  }
}
