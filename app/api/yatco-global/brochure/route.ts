import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLiveYatcoBossBrochure } from '@/lib/yatco-boss/live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  const vid = request.nextUrl.searchParams.get('vid') ?? '';
  const externalId = request.nextUrl.searchParams.get('externalId') ?? '';
  try {
    const brochure = await getLiveYatcoBossBrochure(vid, externalId);
    // L'URL filestore fournie par BOSS pointe directement vers le PDF généré.
    // La redirection évite le plafond de réponse Vercel (le PDF réel vérifié
    // fait 6,86 Mo) et ne fait plus transiter de base64 par SSH/serverless.
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: brochure.url,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/yatco-global/brochure:', error);
    const message = error instanceof Error && /API Access Error|401|introuvable|session expired/i.test(error.message)
      ? 'YATCO BOSS ne donne pas accès à la brochure de cette annonce pour le broker connecté.'
      : 'La brochure n’a pas pu être générée par YATCO BOSS.';
    return new NextResponse(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Brochure indisponible</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#24324a}</style><h1>Brochure indisponible</h1><p>${message}</p></html>`, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
