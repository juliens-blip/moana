import { NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { createProductionUploadTicketDeps, handleCreateUploadTicket } from '@/lib/brochure-video-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ticket d'upload direct vers Supabase Storage : le navigateur dépose le PDF
 * ici, pas dans le corps de POST /api/brochure-video — qui recevrait sinon un
 * fichier soumis au plafond plateforme Vercel de 4,5 Mo par corps de requête
 * de Vercel Function (fixe, non contournable côté code applicatif).
 */
export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  return handleCreateUploadTicket(createProductionUploadTicketDeps());
}
