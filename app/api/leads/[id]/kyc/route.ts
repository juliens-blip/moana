import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLeadById } from '@/lib/supabase/leads';
import {
  enqueueKycRecheck,
  getLatestKycReport,
  processLeadKyc,
} from '@/lib/supabase/kyc';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

    const kyc = await getLatestKycReport(access.lead.id);
    return NextResponse.json<ApiResponse>({ success: true, data: kyc });
  } catch (error) {
    console.error('[KYC API] Read failed:', error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Lecture KYC impossible' }, { status: 500 });
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

    const lead = access.lead;
    await enqueueKycRecheck(lead.id, {
      full_name: lead.contact_display_name ?? '',
      email: lead.contact_email ?? '',
      company_name: '',
      country: lead.contact_country ?? '',
      city: '',
    });
    await processLeadKyc(lead.id);
    const kyc = await getLatestKycReport(lead.id);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: kyc,
      message: 'Contrôle KYC terminé',
    });
  } catch (error) {
    console.error('[KYC API] Recheck failed:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Contrôle KYC impossible' },
      { status: 500 },
    );
  }
}
