import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLeadById } from '@/lib/supabase/leads';
import { getLatestSanctionsReport, screenLeadForSanctions } from '@/lib/supabase/sanctions';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authorizedLead(leadId: string) {
  const session = await getSession();
  if (!session) return { error: 'Non authentifié', status: 401 as const };

  const lead = await getLeadById(leadId, session.brokerId);
  if (!lead) return { error: 'Lead non trouvé', status: 404 as const };
  return { lead };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await authorizedLead(params.id);
    if ('error' in access) {
      return NextResponse.json<ApiResponse>({ success: false, error: access.error }, { status: access.status });
    }

    const sanctions = await getLatestSanctionsReport(access.lead.id);
    return NextResponse.json<ApiResponse>({ success: true, data: sanctions });
  } catch (error) {
    console.error('[Sanctions API] Read failed:', error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Lecture sanctions impossible' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await authorizedLead(params.id);
    if ('error' in access) {
      return NextResponse.json<ApiResponse>({ success: false, error: access.error }, { status: access.status });
    }

    await screenLeadForSanctions(access.lead);
    const sanctions = await getLatestSanctionsReport(access.lead.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: sanctions,
      message: 'Filtrage sanctions relancé',
    }, { status: 200 });
  } catch (error) {
    console.error('[Sanctions API] Recheck failed:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Filtrage sanctions impossible' },
      { status: 500 },
    );
  }
}
